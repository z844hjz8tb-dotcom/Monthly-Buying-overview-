import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB } from '../src/db/schema'
import { ensureDefaults } from '../src/finance/defaults'
import { amexMerchant, isAmexExport, parseAmexCsv } from '../src/import/amex'
import { applyBankImport, planBankImport } from '../src/import/bank'
import { monthOverview } from '../src/stats/overview'

/** Erfundene Datei im Format des echten Amex-Exports */
const text = readFileSync(new URL('./fixtures/amex-beispiel.csv', import.meta.url), 'utf8')
const dbs: TrackerDB[] = []
let n = 0
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})
async function setup() {
  const db = new TrackerDB(`amex-${n++}`)
  dbs.push(db)
  await ensureDefaults(db)
  return db
}

describe('Amex-Export lesen', () => {
  it('erkennt das Format und dreht das Vorzeichen (Belastung = Ausgabe)', () => {
    expect(isAmexExport(text)).toBe(true)
    expect(isAmexExport('Buchung;Betrag')).toBe(false)
    const ex = parseAmexCsv(text)
    expect(ex.rows).toHaveLength(14)
    expect(ex.rows[0]).toMatchObject({ date: '2026-10-29', amountCents: 41250, bookingText: 'Kreditkarte' })
    expect(ex.rows[5]).toMatchObject({ amountCents: -140774, counterparty: 'IKEA DT. NL MUSTERSTADT' })
  })

  it('trennt Händler und Ort', () => {
    expect(amexMerchant('PENNY MUSTERSTADT       MUSTERSTADT')).toBe('PENNY MUSTERSTADT')
    expect(amexMerchant('IKEA DT. NL MUSTERSTADT MUSTERSTADT')).toBe('IKEA DT. NL MUSTERSTADT')
    expect(amexMerchant('GUTSCHRIFT FUER KARTENMISSBRAUCH')).toBe('GUTSCHRIFT FUER KARTENMISSBRAUCH')
  })

  it('gibt gleichen Zeilen am selben Tag unterschiedliche Schlüssel', () => {
    const keys = parseAmexCsv(text).rows.map((r) => r.importKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('Amex importieren', () => {
  it('ordnet ein, erkennt Duplikate und zählt Ausgleich und Erstattung richtig', async () => {
    const db = await setup()
    const ex = parseAmexCsv(text)
    const plan = await planBankImport(db, ex, 'amex')
    const byName = (name: string) => plan.find((p) => p.tx.counterparty === name)!.tx
    expect(byName('ZAHLUNG/ÜBERWEISUNG ERHALTEN BESTEN DANK')).toMatchObject({ kind: 'transfer', transferAccountId: 'ing' })
    expect(byName('PayPal: FRISEURMUSTER')).toMatchObject({ kind: 'expense' })
    expect(byName('ANTHROPIC* CLAUDE SUB')).toMatchObject({ categoryId: 'abos' })
    expect(byName('TESLA_DE')).toMatchObject({ categoryId: 'mobilitaet' })
    expect(byName('KOELLE-ZOO MUSTERST. 54')).toMatchObject({ categoryId: 'haustier' })
    expect(byName('APPLE.COM/BILL')).toMatchObject({ categoryId: 'abos' })
    expect(byName('GUTSCHRIFT FUER KARTENMISSBRAUCH')).toMatchObject({ kind: 'expense', amountCents: 210 }) // Erstattung, keine Einnahme

    expect(await applyBankImport(db, ex, 'amex', plan)).toEqual({ added: 14, skipped: 0 })
    expect((await planBankImport(db, ex, 'amex')).every((p) => p.duplicate)).toBe(true)

    const o = monthOverview('2026-10', { transactions: await db.transactions.toArray(), orders: [], receipts: [], accounts: await db.accounts.toArray() })
    expect(o.incomeCents).toBe(0)
    expect(o.expenseCents).toBe(18000 + 3900 + 2380 + 8800) // Ausgleich vom Girokonto zählt nicht
    const aug = monthOverview('2026-08', { transactions: await db.transactions.toArray(), orders: [], receipts: [], accounts: await db.accounts.toArray() })
    expect(aug.expenseCents).toBe(0) // Kartenmissbrauch + Erstattung heben sich auf
  })
})
