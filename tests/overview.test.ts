import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Order, Receipt, Transaction } from '../src/db/schema'
import { TrackerDB } from '../src/db/schema'
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, ensureDefaults } from '../src/finance/defaults'
import { saveTransaction, signedAmount } from '../src/finance/store'
import { monthOverview } from '../src/stats/overview'

const tx = (over: Partial<Transaction>): Transaction => ({
  accountId: 'ing', date: '2026-11-03', amountCents: -1000, counterparty: 'X', kind: 'expense', source: 'manual', createdAt: '', ...over,
})
const order = (orderId: string, date: string, totalCents: number, status?: Order['status']): Order => ({
  orderId, date, totalCents, status, source: 'amazon', importedAt: '', updatedAt: '',
})
const receipt = (id: number, store: string, date: string, totalCents: number): Receipt => ({
  id, store, date, totalCents, source: 'manual', createdAt: '',
})

describe('monthOverview', () => {
  it('zählt Buchungen, Amazon und Bons je Kategorie und ignoriert Umbuchungen', () => {
    const o = monthOverview('2026-11', {
      transactions: [
        tx({ amountCents: -80000, categoryId: 'wohnen' }),
        tx({ amountCents: -1299, categoryId: 'abos', accountId: 'amex' }),
        tx({ amountCents: -500 }), // ohne Kategorie → Sonstiges
        tx({ amountCents: 250000, kind: 'income' }),
        tx({ amountCents: -45000, kind: 'transfer' }), // Amex-Abrechnung
        tx({ amountCents: -999, date: '2026-10-30', categoryId: 'abos' }), // anderer Monat
      ],
      orders: [order('A', '2026-11-02', 2500), order('B', '2026-11-05', 9999, 'cancelled')],
      receipts: [receipt(1, 'Lidl', '2026-11-01', 1182), receipt(2, 'Müller', '2026-11-02', 3922)],
    })
    expect(o.expenseCents).toBe(80000 + 1299 + 500 + 2500 + 1182 + 3922)
    expect(o.incomeCents).toBe(250000)
    expect(o.byCategory.map((c) => c.categoryId)).toEqual(['wohnen', 'drogerie', 'online', 'abos', 'lebensmittel', 'sonstiges'])
    expect(o.bySource).toEqual({ ing: 80500, amex: 1299, amazon: 2500, bons: 5104 })
  })

  it('zählt verknüpfte Bestellungen, Bons und Abbuchungen nur einmal', () => {
    const o = monthOverview('2026-11', {
      transactions: [
        tx({ id: 1, accountId: 'amex', amountCents: -2500, categoryId: 'online', linkedOrderId: 'A' }),
        tx({ id: 2, accountId: 'ing', amountCents: -1182, categoryId: 'lebensmittel', linkedReceiptId: 1 }),
        tx({ id: 3, accountId: 'paypal', amountCents: -4999, categoryId: 'freizeit' }),
        tx({ id: 4, accountId: 'ing', amountCents: -4999, viaTransactionId: 3 }), // PayPal-Abbuchung
      ],
      orders: [order('A', '2026-11-02', 2500)],
      receipts: [receipt(1, 'Lidl', '2026-11-01', 1182)],
    })
    expect(o.expenseCents).toBe(2500 + 1182 + 4999)
    expect(o.bySource).toEqual({ amex: 2500, ing: 1182, paypal: 4999 })
  })

  it('verrechnet Erstattungen mit der Kategorie', () => {
    const o = monthOverview('2026-11', {
      transactions: [tx({ amountCents: -5000, categoryId: 'online' }), tx({ amountCents: 2000, categoryId: 'online' })],
      orders: [],
      receipts: [],
    })
    expect(o.byCategory).toEqual([{ categoryId: 'online', cents: 3000, count: 2 }])
  })
})

describe('Buchungen speichern', () => {
  it('setzt das Vorzeichen passend zur Art', () => {
    expect(signedAmount('expense', 1299)).toBe(-1299)
    expect(signedAmount('expense', -1299)).toBe(-1299)
    expect(signedAmount('income', -500)).toBe(500)
  })
})

describe('Datenbank-Version 3', () => {
  const names: string[] = []
  afterEach(async () => {
    for (const n of names.splice(0)) await Dexie.delete(n)
  })

  it('behält vorhandene Daten aus Version 2 und legt Standardkonten und -kategorien an', async () => {
    const name = 'upgrade-test'
    names.push(name)
    const old = new Dexie(name)
    old.version(2).stores({ orders: 'orderId, date', receipts: '++id, date, store', meta: 'key' })
    await old.table('orders').add({ orderId: 'X', date: '2026-10-01', totalCents: 100, source: 'amazon', importedAt: '', updatedAt: '' })
    old.close()

    const db = new TrackerDB(name)
    await ensureDefaults(db)
    await ensureDefaults(db) // zweimal: keine Duplikate
    expect(await db.orders.count()).toBe(1)
    expect(await db.accounts.count()).toBe(DEFAULT_ACCOUNTS.length)
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length)

    await db.accounts.update('ing', { name: 'Mein Giro' })
    await ensureDefaults(db)
    expect((await db.accounts.get('ing'))?.name).toBe('Mein Giro')

    const id = await saveTransaction(db, { accountId: 'bar', date: '2026-11-04', amountCents: -350, counterparty: ' Bäcker ', kind: 'expense', source: 'manual', categoryId: 'lebensmittel' })
    expect((await db.transactions.get(id))?.counterparty).toBe('Bäcker')
    db.close()
  })
})

it('Konten und Kategorien lassen sich nach Reihenfolge sortieren', async () => {
  const db = new TrackerDB('order-test')
  await ensureDefaults(db)
  expect((await db.accounts.orderBy('order').first())?.id).toBe('ing')
  expect((await db.categories.orderBy('order').last())?.id).toBe('sonstiges')
  await db.delete()
})
