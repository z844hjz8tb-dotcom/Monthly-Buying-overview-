import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Order, Receipt, Transaction } from '../src/db/schema'
import { TrackerDB } from '../src/db/schema'
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, SAVING_DEFAULTS, ensureDefaults } from '../src/finance/defaults'
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

  it('listet jede gezählte Ausgabe einzeln (für die Kategorie-Seite)', () => {
    const o = monthOverview('2026-11', {
      transactions: [
        tx({ id: 1, date: '2026-11-03', accountId: 'paypal', amountCents: -1999, categoryId: 'online', counterparty: 'Musterhändler' }),
        tx({ id: 2, date: '2026-11-04', accountId: 'ing', amountCents: -1999, categoryId: 'online', viaTransactionId: 1 }), // zählt nicht
        tx({ id: 3, date: '2026-11-05', accountId: 'ing', amountCents: -2500, categoryId: 'online', linkedOrderId: 'A' }),
      ],
      orders: [order('A', '2026-11-02', 2500), order('B', '2026-11-06', 1000)],
      receipts: [receipt(1, 'Lidl', '2026-11-01', 1182)],
    })
    const online = o.entries.filter((e) => e.categoryId === 'online')
    expect(online.map((e) => [e.ref.type, e.ref.id, e.cents])).toEqual([['order', 'B', 1000], ['tx', 3, 2500], ['tx', 1, 1999]])
    expect(online.reduce((s, e) => s + e.cents, 0)).toBe(o.byCategory.find((c) => c.categoryId === 'online')!.cents)
    expect(o.entries.find((e) => e.ref.type === 'receipt')).toMatchObject({ categoryId: 'lebensmittel', title: 'Kassenbon Lidl' })
  })

  it('verrechnet Erstattungen mit der Kategorie', () => {
    const o = monthOverview('2026-11', {
      transactions: [tx({ amountCents: -5000, categoryId: 'online' }), tx({ amountCents: 2000, categoryId: 'online' })],
      orders: [],
      receipts: [],
    })
    expect(o.byCategory).toEqual([{ categoryId: 'online', cents: 3000, count: 2 }])
  })

  it('Amazon-Rücksendung: Erstattung mindert die Bestellung, egal wie bezahlt wurde', () => {
    const orders = [order('A', '2026-11-02', 5000)]
    // bezahlt per Monatsabrechnung (zählt nicht), Erstattung mit Bestellnummer auf dem Girokonto
    const viaInvoice = monthOverview('2026-11', {
      transactions: [tx({ amountCents: -5000, kind: 'transfer' }), tx({ amountCents: 2000, categoryId: 'online', linkedOrderId: 'A' })],
      orders,
      receipts: [],
    })
    expect(viaInvoice.expenseCents).toBe(3000)
    // bezahlt per Lastschrift mit Bestellnummer, Erstattung ebenso
    const viaDebit = monthOverview('2026-11', {
      transactions: [tx({ amountCents: -5000, categoryId: 'online', linkedOrderId: 'A' }), tx({ amountCents: 5000, categoryId: 'online', linkedOrderId: 'A' })],
      orders,
      receipts: [],
    })
    expect(viaDebit.expenseCents).toBe(0)
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
    expect(await db.accounts.count()).toBe(DEFAULT_ACCOUNTS.length + SAVING_DEFAULTS.length)
    expect(await db.categories.count()).toBe(DEFAULT_CATEGORIES.length)
    // Depot und Bausparvertrag kommen nach dem Löschen nicht wieder
    await db.accounts.delete('bauspar')
    await ensureDefaults(db)
    expect(await db.accounts.get('bauspar')).toBeUndefined()

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

describe('Umbuchungen und Sparen', () => {
  const accounts = [
    { id: 'ing', name: 'Giro', kind: 'giro' as const, order: 1 },
    { id: 'extra', name: 'Extra', kind: 'savings' as const, order: 2 },
    { id: 'depot', name: 'Depot', kind: 'depot' as const, order: 3, countsAsSaving: true },
    { id: 'kind', name: 'Kinder', kind: 'savings' as const, order: 4, countsAsSaving: true },
  ]

  it('zählt Umbuchungen gar nicht und Sparen getrennt (nur die Alltags-Seite)', () => {
    const o = monthOverview('2026-11', {
      accounts,
      orders: [],
      receipts: [],
      transactions: [
        tx({ id: 1, accountId: 'ing', amountCents: -50000, kind: 'transfer', transferAccountId: 'extra', pairId: 2 }),
        tx({ id: 2, accountId: 'extra', amountCents: 50000, kind: 'transfer', transferAccountId: 'ing', pairId: 1 }),
        tx({ id: 3, accountId: 'ing', amountCents: -20000, kind: 'saving', transferAccountId: 'depot', pairId: 4 }),
        tx({ id: 4, accountId: 'depot', amountCents: 20000, kind: 'saving', transferAccountId: 'ing', pairId: 3 }),
        tx({ id: 5, accountId: 'extra', amountCents: -5000, kind: 'saving', transferAccountId: 'kind', pairId: 6 }),
        tx({ id: 6, accountId: 'kind', amountCents: 5000, kind: 'saving', transferAccountId: 'extra', pairId: 5 }),
        tx({ id: 7, accountId: 'ing', amountCents: 1234, kind: 'income', counterparty: 'Dividende' }),
        tx({ id: 8, accountId: 'ing', amountCents: -1000, categoryId: 'freizeit' }),
      ],
    })
    expect(o.expenseCents).toBe(1000)
    expect(o.incomeCents).toBe(1234)
    expect(o.savingCents).toBe(25000)
    expect(o.savingByAccount).toEqual({ depot: 20000, kind: 5000 })
    // jede Sparbuchung einzeln mit Herkunft und Ziel (für die Seite "Gespart")
    expect(o.savingEntries.map((e) => [e.fromAccountId, e.toAccountId, e.cents]).sort()).toEqual([['extra', 'kind', 5000], ['ing', 'depot', 20000]])
  })

  it('Geld zurück vom Depot mindert "Gespart" und ist keine Einnahme', () => {
    const o = monthOverview('2026-11', {
      accounts,
      orders: [],
      receipts: [],
      transactions: [
        tx({ id: 1, accountId: 'depot', amountCents: -30000, kind: 'saving', transferAccountId: 'ing', pairId: 2 }),
        tx({ id: 2, accountId: 'ing', amountCents: 30000, kind: 'saving', transferAccountId: 'depot', pairId: 1 }),
      ],
    })
    expect(o.incomeCents).toBe(0)
    expect(o.savingCents).toBe(-30000)
  })
})

describe('Umbuchung speichern', () => {
  it('legt zwei verbundene Buchungen an, aktualisiert und löscht beide', async () => {
    const { saveTransfer, deleteTransaction, transferKind } = await import('../src/finance/store')
    const db = new TrackerDB('transfer-test')
    await ensureDefaults(db)
    await db.accounts.bulkAdd([
      { id: 'extra', name: 'Extra-Konto', kind: 'savings', order: 5 },
      { id: 'depot', name: 'Depot', kind: 'depot', order: 6, countsAsSaving: true },
    ])
    expect(transferKind({}, { countsAsSaving: true })).toBe('saving')
    expect(transferKind({}, {})).toBe('transfer')

    const id = await saveTransfer(db, { fromAccountId: 'ing', toAccountId: 'extra', date: '2026-11-05', cents: 50000, counterparty: '' })
    let rows = await db.transactions.toArray()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.accountId, r.amountCents, r.kind])).toEqual([['ing', -50000, 'transfer'], ['extra', 50000, 'transfer']])
    expect(rows[0].pairId).toBe(rows[1].id)
    expect(rows[1].pairId).toBe(rows[0].id)
    expect(rows[0].counterparty).toBe('Umbuchung ING Girokonto → Extra-Konto')

    await saveTransfer(db, { id, fromAccountId: 'ing', toAccountId: 'depot', date: '2026-11-06', cents: 20000, counterparty: 'ETF-Sparplan' })
    rows = await db.transactions.toArray()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.accountId, r.amountCents, r.kind])).toEqual([['ing', -20000, 'saving'], ['depot', 20000, 'saving']])

    await deleteTransaction(db, rows[1].id!)
    expect(await db.transactions.count()).toBe(0)
    await expect(saveTransfer(db, { fromAccountId: 'ing', toAccountId: 'ing', date: '2026-11-06', cents: 1, counterparty: '' })).rejects.toThrow(/verschiedene/)
    await db.delete()
  })
})
