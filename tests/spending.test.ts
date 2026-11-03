import { describe, expect, it } from 'vitest'
import type { Order } from '../src/db/schema'
import { formatMonth, shiftMonth, yearSummary, yearsWithData } from '../src/stats/spending'

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
