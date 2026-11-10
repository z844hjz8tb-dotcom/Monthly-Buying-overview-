import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB } from '../src/db/schema'
import { ensureDefaults } from '../src/finance/defaults'
import { classify, displayCounterparty, hasPattern } from '../src/finance/classify'
import { decodeBankFile, parseIngCsv } from '../src/import/ing'
import { applyIngImport, ownNamesFromCustomer, planIngImport, reclassifyImported, saveOwnNames } from '../src/import/bank'
import { monthOverview } from '../src/stats/overview'

/** Erfundene Datei im Format des echten ING-Exports (ISO-8859-1, eingeschobene Leerzeichen) */
const raw = readFileSync(new URL('./fixtures/ing-beispiel.csv', import.meta.url))
const text = decodeBankFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length))

const dbs: TrackerDB[] = []
let n = 0
async function setup() {
  const db = new TrackerDB(`ing-${n++}`)
  dbs.push(db)
  await ensureDefaults(db)
  await db.accounts.bulkAdd([
    { id: 'notgroschen', name: 'Notgroschen', kind: 'savings', order: 10 },
    { id: 'depot', name: 'ING Depot', kind: 'depot', order: 11, countsAsSaving: true },
    { id: 'lena', name: 'Depot Lena', kind: 'depot', order: 12, countsAsSaving: true, matchNames: ['Lena Muster'] },
  ])
  await saveOwnNames(db, ownNamesFromCustomer('Max Muster, Erika Muster'))
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

describe('ING-Export lesen', () => {
  it('liest Kopf und Zeilen inkl. Umlauten aus ISO-8859-1', () => {
    const ex = parseIngCsv(text)
    expect(ex.iban).toBe('DE00000000000000000000')
    expect(ex.customer).toBe('Max Muster, Erika Muster')
    expect(ex.saldoCents).toBe(1234567)
    expect(ex.saldoDate).toBe('2026-11-06')
    expect(ex.rows).toHaveLength(23)
    expect(ex.rows[10]).toMatchObject({ counterparty: 'Kleingeld Plus - Sparen', bookingText: 'Überweisung', amountCents: -37 })
    expect(ex.rows[0]).toMatchObject({ date: '2026-11-06', amountCents: 1000000 })
  })

  it('lehnt andere Dateien ab', () => {
    expect(() => parseIngCsv('Datum;Betrag\n')).toThrow(/kein ING-Umsatzexport/)
  })

  it('leitet eigene Namen aus dem Dateikopf ab', () => {
    expect(ownNamesFromCustomer('Max Muster, Erika Muster')).toEqual(['Max Muster', 'Erika Muster', 'Max und Erika Muster', 'Max Muster und Erika Muster'])
  })
})

describe('Einordnung', () => {
  it('Muster gelten ab Wortanfang und vertragen eingeschobene Leerzeichen', () => {
    expect(hasPattern('kindergartenver. st. muster', 'garten')).toBe(false)
    expect(hasPattern('baldur-garten gmbh', 'garten')).toBe(true)
    expect(hasPattern('mobility hub', 'obi ')).toBe(false)
    expect(hasPattern('paypal: ope nai ireland', 'openai')).toBe(true)
    expect(hasPattern('haustierversicherung ag', '*versicherung')).toBe(true)
  })

  it('macht Händlernamen lesbar', () => {
    const r = (counterparty: string, purpose = '', bookingText = 'Lastschrift') => ({ date: '', amountCents: -1, counterparty, purpose, bookingText })
    expect(displayCounterparty(r('VISA LIDL SAGT DANKE'))).toBe('LIDL SAGT DANKE')
    expect(displayCounterparty(r('PayPal Europe', '1/PP.1.PP/. Apple Services, Ihr Einkauf bei Apple Servi ces'))).toBe('PayPal: Apple Services')
    expect(displayCounterparty(r('', 'WP-ABRECHNUNG 1 Kauf ISIN DE0005933931 ISHS CORE DAX UC.ET', 'Wertpapierkauf'))).toBe('Wertpapierkauf: ISHS CORE DAX UC.ET')
  })

  it('ordnet jede Zeile der Beispieldatei richtig ein', async () => {
    const db = await setup()
    const plan = await planIngImport(db, parseIngCsv(text), 'ing')
    const got = plan.map((p) => [p.tx.counterparty, p.tx.kind, p.tx.categoryId ?? p.tx.transferAccountId ?? null])
    expect(got).toEqual([
      ['Darlehensauszahlung', 'transfer', null],
      ['LIDL SAGT DANKE', 'expense', 'lebensmittel'],
      ['PayPal: Netflix.com', 'expense', 'abos'],
      ['PayPal: Apple Services', 'expense', 'abos'],
      ['AMAZON PAYMENTS EUROPE S.C.A.', 'expense', 'online'],
      ['AMAZON PAYMENTS EUROPE S.C.A.', 'expense', 'online'], // Erstattung (positiv)
      ['AMAZON DIGITAL GERMANY GMBH', 'expense', 'abos'],
      ['Max Muster', 'transfer', null],
      ['IHRE VOLKSBANK', 'transfer', 'bar'],
      ['Bargeldauszahlung VISA Card MUSTERBANK EG', 'transfer', 'bar'],
      ['Kleingeld Plus - Sparen', 'transfer', null],
      ['Notgroschen', 'transfer', 'notgroschen'],
      ['Lena Muster', 'saving', 'lena'],
      ['Darlehensrate', 'expense', 'kredite'],
      ['Bausparkasse: Zinsen', 'expense', 'kredite'],
      ['ING', 'expense', null],
      ['GC RE OCTOPUS ENERGY GERMANY GMBH', 'expense', 'wohnen'],
      ['Musterfirma GmbH', 'income', null],
      ['AMERICAN EXPRESS EUROPE S.A. (Germany branch)', 'transfer', 'amex'],
      ['Wertpapierkauf: ISHS CORE DAX UC.ET', 'saving', 'depot'],
      ['Bundesagentur fur Arbeit - Familienkasse', 'income', null],
      ['Kindergartenver. St. Muster e.V.', 'expense', 'schule'],
      ['Abschluss', 'expense', null],
    ])
    expect(plan[4].tx.linkedOrderId).toBe('306-1234567-7654321')
    expect(plan[5].tx.linkedOrderId).toBe('304-7654321-1234567')
  })
})

describe('Import', () => {
  it('importiert, erkennt Duplikate, setzt IBAN und Kontostand', async () => {
    const db = await setup()
    const ex = parseIngCsv(text)
    const first = await applyIngImport(db, ex, 'ing', await planIngImport(db, ex, 'ing'))
    expect(first).toEqual({ added: 23, skipped: 0 })
    const again = await planIngImport(db, ex, 'ing')
    expect(again.every((p) => p.duplicate)).toBe(true)
    expect(await applyIngImport(db, ex, 'ing', again)).toEqual({ added: 0, skipped: 23 })
    const acc = await db.accounts.get('ing')
    expect(acc).toMatchObject({ iban: 'DE00000000000000000000', balanceCents: 1234567, balanceDate: '2026-11-06' })
  })

  it('zählt in der Übersicht nur echte Ausgaben; Sparen getrennt; Amazon-Bestellung nicht doppelt', async () => {
    const db = await setup()
    const ex = parseIngCsv(text)
    await applyIngImport(db, ex, 'ing', await planIngImport(db, ex, 'ing'))
    const o = monthOverview('2026-11', {
      transactions: await db.transactions.toArray(),
      orders: [{ orderId: '306-1234567-7654321', date: '2026-11-04', totalCents: 2499, source: 'amazon', importedAt: '', updatedAt: '' }],
      receipts: [],
      accounts: await db.accounts.toArray(),
    })
    // Ausgaben Nov: Lidl 12,34 + Netflix 9,99 + Apple 2,99 + Amazon 24,99 − Erstattung 6,49 + Prime 9,99
    //               + Darlehensrate 800 + Bausparkasse 98,76 + Entgelt 1,49 + Octopus 61
    expect(o.expenseCents).toBe(1234 + 999 + 299 + 2499 - 649 + 999 + 80000 + 9876 + 149 + 6100)
    expect(o.savingCents).toBe(4000) // Sparplan Lena (Wertpapierkauf war im Oktober)
    expect(o.incomeCents).toBe(0) // Darlehensauszahlung und eigene Gutschrift sind keine Einnahmen
    expect(o.bySource.amazon).toBeUndefined() // Bestellung über die ING-Buchung gezählt
  })

  it('ordnet nach gelernten Regeln neu ein, ohne von Hand geänderte Buchungen anzufassen', async () => {
    const db = await setup()
    const ex = parseIngCsv(text)
    await applyIngImport(db, ex, 'ing', await planIngImport(db, ex, 'ing'))
    const all = await db.transactions.toArray()
    const k = all.find((t) => t.counterparty.startsWith('Kindergarten'))!
    const kleingeld = all.find((t) => t.counterparty.startsWith('Kleingeld'))!
    await db.transactions.update(kleingeld.id!, { edited: true, kind: 'expense', categoryId: 'sonstiges' })
    await db.categoryRules.add({ pattern: 'Kindergartenver', field: 'counterparty', categoryId: 'freizeit' }) // eigene Regel schlägt eingebaute
    await db.accounts.update('notgroschen', { matchNames: ['Kleingeld Plus'] })
    expect(await reclassifyImported(db)).toBeGreaterThan(0)
    expect((await db.transactions.get(k.id!))?.categoryId).toBe('freizeit')
    expect((await db.transactions.get(kleingeld.id!))?.kind).toBe('expense') // von Hand geändert → bleibt
  })
})

it('erkennt eigenes Konto auch nach dem Neu-Einordnen über "Erkennen an"', () => {
  const ctx = { accountId: 'ing', ownNames: [], rules: [], accounts: [{ id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 }, { id: 'x', name: 'Extra', kind: 'savings' as const, order: 2, matchNames: ['Kleingeld Plus'] }] }
  expect(classify({ date: '', amountCents: -41, counterparty: 'Kleingeld Plus - Sparen', bookingText: 'Überweisung', purpose: '' }, ctx)).toMatchObject({ kind: 'transfer', transferAccountId: 'x' })
})

it('neue Kategorien: Hausbau, Gesundheit, Haustier, Schule', () => {
  const ctx = { accountId: 'ing', ownNames: [], rules: [], accounts: [{ id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 }] }
  const cat = (counterparty: string, purpose = '') => classify({ date: '', amountCents: -100, counterparty, bookingText: 'Lastschrift', purpose }, ctx).categoryId
  expect(cat('Max Architekt', 'Entwurf und Genehmigungsplanung')).toBe('hausbau')
  expect(cat('Dr. A. Muster Notare', 'Rechnung 1')).toBe('hausbau')
  expect(cat('Energieberatung Muster GmbH')).toBe('hausbau')
  expect(cat('VISA MUSTER-APOTHEKE')).toBe('gesundheit')
  expect(cat('Zahnarztpraxis Dr. Muster')).toBe('gesundheit')
  expect(cat('Tierarztpraxis Muster')).toBe('haustier')
  expect(cat('VISA MUSTER TIERFACHMARKT')).toBe('haustier')
  expect(cat('AGILA Haustierversicherung AG')).toBe('haustier')
  expect(cat('Kindergartenver. St. Muster e.V.')).toBe('schule')
  expect(cat('Grundschule Musterstadt')).toBe('schule')
  expect(cat('HUK-Coburg Versicherung')).toBe('versicherungen')
  expect(cat('Rossmann 1234')).toBe('drogerie')
})

it('Vorausdarlehen: Ansparung "U.A." ist Sparen, Zinsen sind Kredite', () => {
  const accounts = [
    { id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 },
    { id: 'bsv', name: 'Bausparvertrag', kind: 'savings' as const, order: 2, countsAsSaving: true },
  ]
  const ctx = { accountId: 'ing', ownNames: [], rules: [], accounts }
  const row = (purpose: string, amountCents: number) => ({ date: '', amountCents, counterparty: 'Bausparkasse Muster AG', bookingText: 'Lastschrift', purpose })
  expect(classify(row('00000000U01 U.A. 11.2026', -50000), ctx)).toMatchObject({ kind: 'saving', transferAccountId: 'bsv', counterparty: 'Bausparvertrag (Ansparung)' })
  expect(classify(row('00000000U02 Zins 98,76/ 00000000U0 1 Zins 201,24/ 11.2026', -30000), ctx)).toMatchObject({ kind: 'expense', categoryId: 'kredite' })
  // ohne Bausparvertrag-Konto: trotzdem "Gespart", Zielkonto offen
  expect(classify(row('00000000U01 U.A. 11.2026', -50000), { ...ctx, accounts: [accounts[0]] })).toMatchObject({ kind: 'saving', transferAccountId: undefined })
})

it('Amazon-Monatsabrechnung ist eine Umbuchung (die Bestellungen zählen einzeln)', () => {
  const ctx = { accountId: 'ing', ownNames: [], rules: [], accounts: [{ id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 }] }
  const c = classify({ date: '', amountCents: -12345, counterparty: 'AMAZON PAYMENTS EUROPE S.C.A.', bookingText: 'Lastschrift', purpose: '000000000000000 Amazon Monatsabrechnung 09/2026' }, ctx)
  expect(c).toMatchObject({ kind: 'transfer', counterparty: 'Amazon Monatsabrechnung' })
  expect(c.linkedOrderId).toBeUndefined()
})

it('Amazon-Monatsabrechnung über einen Zahlungsdienst, Wort vom Export umgebrochen', () => {
  const ctx = { accountId: 'ing', ownNames: [], rules: [], accounts: [{ id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 }] }
  const c = classify({ date: '', amountCents: -4321, counterparty: 'Muster Zahlungsdienst S.A.', bookingText: 'Lastschrift', purpose: '000000000000000 Amazon Monatsabrech nung Juli 2026' }, ctx)
  expect(c).toMatchObject({ kind: 'transfer', counterparty: 'Amazon Monatsabrechnung' })
})

it('Kreditbuchungen bekommen lesbare Namen (Zinsen, Tilgung, Rate)', () => {
  const ctx = { accountId: 'ing', ownNames: ['Max Muster'], rules: [], accounts: [{ id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 }] }
  const c = (counterparty: string, purpose: string) => classify({ date: '', amountCents: -10000, counterparty, bookingText: 'Lastschrift', purpose }, ctx)
  expect(c('Bausparkasse Muster AG', '000001 Zins 12,34/ 000002 Zins 56,78/ 11.2026')).toMatchObject({ kind: 'expense', categoryId: 'kredite', counterparty: 'Bausparkasse: Zinsen' })
  expect(c('Muster', 'Rahmenkredit 10/2026 Zinsen 12,34 EUR')).toMatchObject({ categoryId: 'kredite', counterparty: 'Rahmenkredit: Zinsen' })
  expect(c('Muster', 'Rahmenkredit 10/2026 Tilgung 100,00 EUR')).toMatchObject({ categoryId: 'kredite', counterparty: 'Rahmenkredit: Tilgung' })
  expect(c('Max Muster', 'Darlehensrate')).toMatchObject({ categoryId: 'kredite', counterparty: 'Darlehensrate' })
  // Ansparung bleibt Sparen
  expect(c('Bausparkasse Muster AG', '000001 U.A. 11.2026')).toMatchObject({ kind: 'saving' })
})

it('Kinderkonten: Familie mit gleichem Nachnamen ist Sparen, Verwendungszweck entscheidet über das Konto', () => {
  const accounts = [
    { id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 },
    { id: 'lena-depot', name: 'Depot Lena', kind: 'depot' as const, order: 2, countsAsSaving: true, matchNames: ['Sparplan Lena'] },
    { id: 'lena-spar', name: 'Sparkonto Lena', kind: 'savings' as const, order: 3, countsAsSaving: true, matchNames: ['Lena Muster'] },
  ]
  const ctx = { accountId: 'ing', ownNames: ['Max Muster', 'Erika Muster'], rules: [], accounts }
  const c = (counterparty: string, purpose: string, amountCents = -5000, bookingText = 'Lastschrift') => classify({ date: '', amountCents, counterparty, bookingText, purpose }, ctx)
  // Dauerauftrag "Sparplan Lena" → Depot, Lastschrift ohne Zweck → Sparkonto
  expect(c('Lena Muster', 'Sparplan Lena', -7500, 'Dauerauftrag / Terminueberweisung')).toMatchObject({ kind: 'saving', transferAccountId: 'lena-depot' })
  expect(c('Lena Muster', '')).toMatchObject({ kind: 'saving', transferAccountId: 'lena-spar' })
  // ohne passendes Konto: trotzdem Sparen (Ziel offen), keine Ausgabe
  expect(c('Tim Muster', '')).toMatchObject({ kind: 'saving' })
  expect(c('Tim Muster', '').transferAccountId).toBeUndefined()
  // Geld von dort zurück: Umbuchung, keine Einnahme
  expect(c('Tim Muster', '', 2000, 'Gutschrift')).toMatchObject({ kind: 'transfer' })
  // eigener Name bleibt Umbuchung, Nachname allein ist keine Familie, Fremde bleiben Ausgabe
  expect(c('Max Muster', 'Sparen, Urlaub')).toMatchObject({ kind: 'transfer' })
  expect(c('Muster', 'Irgendwas')).not.toMatchObject({ kind: 'saving' })
  expect(c('Anna Beispiel', 'Miete')).toMatchObject({ kind: 'expense' })
})
