import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB, type Receipt, type Transaction } from '../src/db/schema'
import { ensureDefaults } from '../src/finance/defaults'
import { findReceiptLinks, linkReceipt, purchaseDate, rejectLink, storeMatches, unlinkReceipt } from '../src/finance/links'
import { monthOverview } from '../src/stats/overview'

const dbs: TrackerDB[] = []
let n = 0
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const tx = (over: Partial<Transaction>): Omit<Transaction, 'id'> => ({
  accountId: 'ing', date: '2026-11-05', amountCents: -1000, counterparty: 'X', kind: 'expense', source: 'ing', createdAt: '', ...over,
})
const bon = (store: string, date: string, totalCents: number, over: Partial<Receipt> = {}): Omit<Receipt, 'id'> => ({
  store, date, totalCents, source: 'manual', createdAt: '', ...over,
})

async function setup() {
  const db = new TrackerDB(`links-${n++}`)
  dbs.push(db)
  await ensureDefaults(db)
  return db
}

describe('Hilfsfunktionen', () => {
  it('erkennt den Laden in der Buchung', () => {
    expect(storeMatches('Lidl', { counterparty: 'LIDL SAGT DANKE', rawCounterparty: 'VISA LIDL SAGT DANKE' })).toBe(true)
    expect(storeMatches('Müller', { counterparty: 'MH Muller Handels GmbH' })).toBe(true)
    expect(storeMatches('Müller', { counterparty: 'MUELLER MUSTERSTADT' })).toBe(true)
    expect(storeMatches('Penny', { counterparty: 'PayPal: Netflix.com' })).toBe(false)
  })

  it('liest das echte Kaufdatum aus dem Verwendungszweck', () => {
    expect(purchaseDate({ date: '2026-11-05', purpose: 'NR XXXX 1234 MUSTERSTADT DE KAUFUMSATZ 03.11 12.34 134556' })).toBe('2026-11-03')
    expect(purchaseDate({ date: '2026-01-02', purpose: 'KAUFUMSATZ 30.12 5.00' })).toBe('2025-12-30')
    expect(purchaseDate({ date: '2026-11-05', purpose: 'MUSTER GMBH//MUSTERSTADT/DE 2026-11-03T12 :57:51 Folgenr.001' })).toBe('2026-11-03')
    expect(purchaseDate({ date: '2026-11-05', purpose: 'Rechnung 1' })).toBe('2026-11-05')
  })
})

describe('Bons mit Kontobuchungen verknüpfen', () => {
  it('verknüpft eindeutige Treffer und schlägt unsichere vor', async () => {
    const db = await setup()
    const [lidl, kaufland, mueller, penny, bar] = (await Promise.all([
      db.receipts.add(bon('Lidl', '2026-11-03', 1234)),
      db.receipts.add(bon('Kaufland', '2026-11-02', 5000)),
      db.receipts.add(bon('Müller', '2026-10-31', 3922)),
      db.receipts.add(bon('Penny', '2026-11-01', 2000)),
      db.receipts.add(bon('Lidl', '2026-11-03', 777, { paidCash: true })),
    ])) as number[]
    const ids = (await Promise.all([
      db.transactions.add(tx({ counterparty: 'LIDL SAGT DANKE', rawCounterparty: 'VISA LIDL SAGT DANKE', amountCents: -1234, purpose: 'NR XXXX 1234 MUSTERSTADT DE KAUFUMSATZ 03.11 12.34' })),
      db.transactions.add(tx({ counterparty: 'KAUFLAND MUSTERSTADT', amountCents: -4950, date: '2026-11-04', purpose: 'KAUFLAND//MUSTERSTADT/DE 2026-11-02T16:28:00 Folgenr.001' })),
      db.transactions.add(tx({ counterparty: 'MH Muller Handels GmbH', amountCents: -3922, date: '2026-11-03', purpose: 'Lastschrift' })),
      db.transactions.add(tx({ counterparty: 'PayPal', accountId: 'paypal', amountCents: -2000, date: '2026-11-01' })),
      db.transactions.add(tx({ counterparty: 'LIDL SAGT DANKE', amountCents: -777, purpose: 'KAUFUMSATZ 03.11 7.77' })),
      db.transactions.add(tx({ counterparty: 'LIDL SAGT DANKE', amountCents: -1234, date: '2026-10-01', purpose: 'KAUFUMSATZ 29.09 12.34' })), // falscher Monat
    ])) as number[]

    const res = await findReceiptLinks(db)
    expect(res.linked).toBe(2)
    expect((await db.transactions.get(ids[0]))?.linkedReceiptId).toBe(lidl)
    expect((await db.transactions.get(ids[2]))?.linkedReceiptId).toBe(mueller)
    expect(res.suggestions.map((s) => [s.receipt.id, s.tx.id, s.amountDiffCents]).sort()).toEqual([[kaufland, ids[1], 50], [penny, ids[3], 0]].sort())
    expect((await db.transactions.get(ids[4]))?.linkedReceiptId).toBeUndefined() // Bon bar bezahlt
    expect(bar).toBeGreaterThan(0)

    // Vorschlag annehmen bzw. ablehnen
    await linkReceipt(db, kaufland, ids[1])
    await rejectLink(db, penny, ids[3])
    expect((await findReceiptLinks(db)).suggestions).toEqual([])

    // Lösen merkt sich die Ablehnung
    await unlinkReceipt(db, mueller)
    expect((await db.transactions.get(ids[2]))?.linkedReceiptId).toBeUndefined()
    expect((await findReceiptLinks(db)).linked).toBe(0)
  })

  it('nimmt bei zwei gleichen Bons nichts automatisch', async () => {
    const db = await setup()
    await db.receipts.add(bon('Lidl', '2026-11-03', 500))
    await db.receipts.add(bon('Lidl', '2026-11-03', 500))
    await db.transactions.add(tx({ counterparty: 'LIDL SAGT DANKE', amountCents: -500, purpose: 'KAUFUMSATZ 03.11 5.00' }))
    await db.transactions.add(tx({ counterparty: 'LIDL SAGT DANKE', amountCents: -500, purpose: 'KAUFUMSATZ 03.11 5.00' }))
    const res = await findReceiptLinks(db)
    expect(res.linked + res.suggestions.length).toBe(2)
  })

  it('zählt einen verknüpften Einkauf in der Übersicht nur einmal', async () => {
    const db = await setup()
    const r = (await db.receipts.add(bon('Lidl', '2026-11-03', 1234))) as number
    await db.transactions.add(tx({ counterparty: 'LIDL SAGT DANKE', amountCents: -1234, categoryId: 'lebensmittel', purpose: 'KAUFUMSATZ 03.11 12.34' }))
    const before = monthOverview('2026-11', { transactions: await db.transactions.toArray(), receipts: await db.receipts.toArray(), orders: [] })
    expect(before.expenseCents).toBe(2468) // doppelt
    await findReceiptLinks(db)
    const after = monthOverview('2026-11', { transactions: await db.transactions.toArray(), receipts: await db.receipts.toArray(), orders: [] })
    expect(after.expenseCents).toBe(1234)
    expect(r).toBeGreaterThan(0)
  })
})
