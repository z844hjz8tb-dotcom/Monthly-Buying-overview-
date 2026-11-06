import { describe, expect, it } from 'vitest'
import type { Order, OrderItem } from '../src/db/schema'
import { formatMonth, isFullyRefunded, itemRows, netOrderCents, refundsByOrder, returnedUnits, shiftMonth, yearSummary, yearsWithData } from '../src/stats/spending'

const o = (orderId: string, date: string, totalCents: number, status?: Order['status']): Order => ({
  orderId, date, totalCents, status, source: 'amazon', importedAt: '', updatedAt: '',
})

describe('Auswertung', () => {
  const orders = [
    o('a', '2026-11-02', 1000),
    o('b', '2026-11-20', 500),
    o('c', '2026-11-21', 9999, 'cancelled'),
    o('d', '2026-12-01', 250),
    o('e', '2025-12-31', 100),
  ]

  it('summiert pro Monat und ignoriert Stornos', () => {
    const months = yearSummary(orders, 2026)
    expect(months).toHaveLength(12)
    expect(months[10]).toEqual({ key: '2026-11', totalCents: 1500, orderCount: 2 })
    expect(months[11].totalCents).toBe(250)
    expect(months[0].totalCents).toBe(0)
  })

  it('listet Jahre absteigend', () => {
    expect(yearsWithData(orders)).toEqual([2026, 2025])
  })

  it('rechnet Monate über Jahresgrenzen', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(formatMonth('2026-11')).toBe('November 2026')
  })
})

describe('Erstattungen bei Amazon-Bestellungen', () => {
  const o = (orderId: string, date: string, totalCents: number): Order => ({ orderId, date, totalCents, source: 'amazon', status: 'ok', importedAt: '', updatedAt: '' })
  const it2 = (id: number, orderId: string, unitPriceCents: number, quantity = 1): OrderItem => ({ id, orderId, title: `Artikel ${id}`, quantity, unitPriceCents })
  const refunds = refundsByOrder([
    { linkedOrderId: 'A', amountCents: 1990, kind: 'expense' },
    { linkedOrderId: 'A', amountCents: 309, kind: 'expense' }, // in zwei Teilen erstattet
    { linkedOrderId: 'A', amountCents: -6000, kind: 'expense' }, // die Zahlung selbst
    { linkedOrderId: 'B', amountCents: 1500, kind: 'expense' },
  ])

  it('summiert Gutschriften je Bestellung und zieht sie ab', () => {
    expect(refunds.get('A')).toBe(2299)
    expect(netOrderCents(o('A', '2026-10-07', 6000), refunds)).toBe(3701)
    expect(isFullyRefunded(o('B', '2026-10-08', 1500), refunds)).toBe(true)
    const months = yearSummary([o('A', '2026-10-07', 6000), o('B', '2026-10-08', 1500), o('C', '2026-10-09', 1000)], 2026, refunds)
    expect(months[9]).toMatchObject({ totalCents: 3701 + 1000, orderCount: 2 })
  })

  it('findet den zurückgeschickten Artikel über den Betrag', () => {
    const items = [it2(1, 'A', 885), it2(2, 'A', 2299), it2(3, 'A', 999), it2(4, 'A', 1190)]
    expect([...returnedUnits(items, 2299)]).toEqual([[2, 1]])
    expect([...returnedUnits(items, 885 + 999)].sort()).toEqual([[1, 1], [3, 1]])
    expect(returnedUnits(items, 500).size).toBe(0) // Teilerstattung: keinem Artikel zuzuordnen
    expect([...returnedUnits([it2(5, 'X', 759, 2)], 759)]).toEqual([[5, 1]]) // 1 von 2 Stück
  })

  it('markiert Artikel in der Liste', () => {
    const orders = [o('A', '2026-10-07', 6000), o('B', '2026-10-08', 1500)]
    const rows = itemRows(orders, [it2(1, 'A', 2299), it2(2, 'A', 3701), it2(3, 'B', 1500)], refunds)
    expect(rows.map((r) => [r.id, r.returnedQty, r.status])).toEqual([[1, 1, 'ok'], [2, 0, 'ok'], [3, 1, 'returned']])
  })
})
