import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB, type Order, type Transaction } from '../src/db/schema'
import { ensureDefaults } from '../src/finance/defaults'
import { itemSummary, linkAmazonByAmount, loadItemSummaries, loadPurchaseDetails, matchAmazonByAmount } from '../src/finance/purchases'
import { monthOverview } from '../src/stats/overview'

const dbs: TrackerDB[] = []
let n = 0
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})
async function setup() {
  const db = new TrackerDB(`purchases-${n++}`)
  dbs.push(db)
  await ensureDefaults(db)
  return db
}
const order = (orderId: string, date: string, totalCents: number): Order => ({ orderId, date, totalCents, source: 'amazon', status: 'ok', importedAt: '', updatedAt: '' })
let id = 1
const tx = (over: Partial<Transaction>): Transaction => ({
  id: id++, accountId: 'amex', date: '2026-10-05', amountCents: -2599, counterparty: 'AMAZON.DE', rawCounterparty: 'AMAZON.DE', kind: 'expense', categoryId: 'online', source: 'amex', createdAt: '', ...over,
})

describe('Was wurde gekauft?', () => {
  it('kürzt lange Artikelnamen und zählt weitere', () => {
    expect(itemSummary([])).toBeUndefined()
    expect(itemSummary(['Kabel'])).toBe('Kabel')
    expect(itemSummary(['Ein sehr langer Artikelname mit vielen Wörtern drin', 'B', 'C'])).toBe('Ein sehr langer Artikelname mit v… + 2 weitere')
  })

  it('findet die Artikel auch über eine PayPal-Zahlung', async () => {
    const db = await setup()
    await db.orders.add(order('302-0000000-0000001', '2026-10-01', 3998))
    await db.orderItems.bulkAdd([
      { orderId: '302-0000000-0000001', title: 'Musterlampe', quantity: 2, unitPriceCents: 1999 },
    ])
    const paypalId = await db.transactions.add({ ...tx({ accountId: 'paypal', source: 'paypal', amountCents: -3998, linkedOrderId: '302-0000000-0000001' }), id: undefined })
    const bankId = await db.transactions.add({ ...tx({ accountId: 'ing', source: 'ing', amountCents: -3998, counterparty: 'PayPal', viaTransactionId: paypalId as number }), id: undefined })
    const bank = (await db.transactions.get(bankId))!
    const d = await loadPurchaseDetails(db, bank)
    expect(d.via?.id).toBe(paypalId)
    expect(d.orderItems.map((i) => i.title)).toEqual(['Musterlampe'])
    expect((await loadItemSummaries(db, [bank])).get(bank.id!)).toBe('Musterlampe')
  })
})

describe('Amazon-Zahlung ohne Bestellnummer', () => {
  it('verknüpft bei eindeutigem Betrag und Datum', () => {
    const orders = [order('A', '2026-10-01', 2599), order('B', '2026-10-01', 1000), order('C', '2026-09-01', 4444)]
    const txs = [
      tx({ id: 101, date: '2026-10-03', amountCents: -2599 }), // passt zu A
      tx({ id: 102, date: '2026-10-03', amountCents: -4444 }), // C ist zu alt
      tx({ id: 103, date: '2026-10-03', amountCents: -1000, counterparty: 'Prime Video', rawCounterparty: 'AMAZON PRIME VIDEO' }), // Abo, keine Bestellung
      tx({ id: 104, date: '2026-10-03', amountCents: -1000, counterparty: 'Bäcker', rawCounterparty: 'BAECKER' }), // nicht Amazon
    ]
    expect(matchAmazonByAmount(txs, orders)).toEqual([{ txId: 101, orderId: 'A' }])
  })

  it('verknüpft nicht, wenn es zwei gleiche Bestellungen oder Zahlungen gibt', () => {
    expect(matchAmazonByAmount([tx({ id: 201, date: '2026-10-03' })], [order('A', '2026-10-01', 2599), order('B', '2026-10-02', 2599)])).toEqual([])
    expect(matchAmazonByAmount([tx({ id: 202, date: '2026-10-03' }), tx({ id: 203, date: '2026-10-04' })], [order('A', '2026-10-01', 2599)])).toEqual([])
  })

  it('danach zählt das Geld einmal', async () => {
    const db = await setup()
    await db.orders.add(order('A', '2026-10-01', 2599))
    await db.transactions.add({ ...tx({ date: '2026-10-03' }), id: undefined })
    expect(await linkAmazonByAmount(db)).toBe(1)
    expect(await linkAmazonByAmount(db)).toBe(0)
    const o = monthOverview('2026-10', { transactions: await db.transactions.toArray(), orders: await db.orders.toArray(), receipts: [] })
    expect(o.expenseCents).toBe(2599)
  })
})
