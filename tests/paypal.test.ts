import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB, type Transaction } from '../src/db/schema'
import { ensureDefaults } from '../src/finance/defaults'
import { linkPaypal } from '../src/finance/paypal'
import { applyBankImport, planBankImport } from '../src/import/bank'
import { isPaypalExport, parsePaypalCsv } from '../src/import/paypal'
import { monthOverview } from '../src/stats/overview'

/** Erfundene Datei im Format des echten PayPal-Exports */
const text = readFileSync(new URL('./fixtures/paypal-beispiel.csv', import.meta.url), 'utf8')
const dbs: TrackerDB[] = []
let n = 0
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})
async function setup() {
  const db = new TrackerDB(`paypal-${n++}`)
  dbs.push(db)
  await ensureDefaults(db)
  return db
}

describe('PayPal-Export lesen', () => {
  it('nimmt nur die Zahlungen, die Finanzierung wird an die Zahlung gehängt', () => {
    expect(isPaypalExport(text)).toBe(true)
    const ex = parsePaypalCsv(text)
    expect(ex.rows.map((r) => [r.date, r.amountCents, r.counterparty])).toEqual([
      ['2026-10-02', -1249, 'Musterstream AB'],
      ['2026-10-05', -11111, 'Amazon'],
      ['2026-10-07', -4200, 'Erika Beispiel'], // inkl. 2,00 € Gebühr
      ['2026-10-10', 2500, 'Fritz Freund'],
      ['2026-10-10', -2000, ''],
      ['2026-10-12', -499, 'Musterfilm GmbH'], // vom Guthaben
      ['2026-11-03', -11111, 'PayPal (Europe) S.à r.l. et Cie, SCA'],
    ])
    expect(ex.rows[0].funding).toEqual([{ via: 'bank', cents: 1249 }])
    expect(ex.rows[1].funding).toEqual([{ via: 'credit', cents: 11111 }])
    expect(ex.rows[2].funding).toEqual([{ via: 'card', cents: 4200 }])
    expect(ex.rows[5].funding).toBeUndefined()
    expect(ex).toMatchObject({ defaultAccountId: 'paypal', saldoCents: 1, saldoDate: '2026-11-03' })
  })
})

describe('PayPal importieren und verknüpfen', () => {
  const bankRow = (accountId: string, date: string, amountCents: number, purpose: string, source: Transaction['source']): Omit<Transaction, 'id'> => ({
    accountId, date, amountCents, counterparty: 'PayPal', rawCounterparty: 'PayPal Europe S.a.r.l. et Cie S.C.A', purpose, bookingText: 'Lastschrift',
    kind: amountCents < 0 ? 'expense' : 'income', categoryId: amountCents < 0 ? 'abos' : undefined, source, importKey: `${accountId}|${date}|${amountCents}|${purpose}`, createdAt: '',
  })

  it('ordnet ein: Rückzahlung und Auszahlung sind Umbuchungen, Amazon-Bestellung wird verknüpft', async () => {
    const db = await setup()
    const ex = parsePaypalCsv(text)
    const plan = await planBankImport(db, ex, 'paypal')
    const kinds = plan.map((p) => [p.tx.kind, p.tx.transferAccountId ?? null, p.tx.linkedOrderId ?? null])
    expect(kinds).toEqual([
      ['expense', null, null],
      ['expense', null, '302-1234567-7654321'],
      ['expense', null, null],
      ['income', null, null],
      ['transfer', 'ing', null],
      ['expense', null, null],
      ['transfer', null, null],
    ])
    expect(plan[6].tx.counterparty).toBe('PayPal-Rückzahlung (Später bezahlen)')
    expect(await applyBankImport(db, ex, 'paypal', plan)).toEqual({ added: 7, skipped: 0 })
    expect((await planBankImport(db, ex, 'paypal')).every((p) => p.duplicate)).toBe(true)
  })

  it('verknüpft die Abbuchungen auf Girokonto und Karte, Geld zählt einmal', async () => {
    const db = await setup()
    const ex = parsePaypalCsv(text)
    await applyBankImport(db, ex, 'paypal', await planBankImport(db, ex, 'paypal'))
    await db.transactions.bulkAdd([
      bankRow('ing', '2026-10-05', -1249, '1000000000001/PP.1111.PP/. Musterstream AB, Ihr Einkauf bei Musterstream AB', 'ing'),
      bankRow('ing', '2026-10-05', -1249, '1000000000002/PP.1111.PP/. Anderer Laden, Ihr Einkauf bei Anderer Laden', 'ing'),
      bankRow('amex', '2026-10-08', -4200, 'PAYPAL *ERIKABEISP', 'amex'),
      bankRow('ing', '2026-10-12', 2000, 'PayPal Auszahlung', 'ing'),
      bankRow('ing', '2026-11-05', -11111, 'PayPal (Europe), Ihr Einkauf bei PayPal (Europe)', 'ing'),
    ] as Transaction[])
    expect(await linkPaypal(db)).toBe(4)
    const all = await db.transactions.toArray()
    const via = all.filter((t) => t.viaTransactionId !== undefined).map((t) => t.purpose?.slice(0, 16))
    expect(via).toEqual(['1000000000001/PP', 'PAYPAL *ERIKABEI', 'PayPal Auszahlun', 'PayPal (Europe),'])
    expect(await linkPaypal(db)).toBe(0) // nichts doppelt

    const okt = monthOverview('2026-10', { transactions: all, orders: [], receipts: [] })
    // 12,49 Abo + 111,11 Amazon + 42,00 an Erika + 4,99 Film + 12,49 nicht verknüpfte Abbuchung (anderer Laden)
    expect(okt.expenseCents).toBe(1249 + 11111 + 4200 + 499 + 1249)
    expect(okt.incomeCents).toBe(2500)
    const nov = monthOverview('2026-11', { transactions: all, orders: [], receipts: [] })
    expect(nov.expenseCents).toBe(0) // Rückzahlung an PayPal zählt nicht noch einmal
  })
})
