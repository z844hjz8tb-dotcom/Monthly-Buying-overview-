import type { Order, OrderItem } from '../db/schema'

/** Stornierte und zurückgesendete Bestellungen zählen nicht zu den Ausgaben. */
export function countsAsSpending(o: Pick<Order, 'status'>): boolean {
  return !o.status || o.status === 'ok'
}

export const monthKey = (isoDate: string) => isoDate.slice(0, 7) // "2026-11"

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthShortFmt = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' })
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

const toDate = (key: string) => new Date(`${key.length === 7 ? key + '-01' : key}T00:00:00Z`)
export const formatMonth = (key: string) => monthFmt.format(toDate(key))
export const formatMonthShort = (key: string) => monthShortFmt.format(toDate(key)).replace('.', '')
export const formatDay = (iso: string) => dateFmt.format(toDate(iso))

export interface MonthSummary {
  key: string
  totalCents: number
  orderCount: number
}

/** 12 Monate eines Jahres, auch leere. */
export function yearSummary(orders: Order[], year: number): MonthSummary[] {
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    totalCents: 0,
    orderCount: 0,
  }))
  for (const o of orders) {
    if (!o.date.startsWith(`${year}-`) || !countsAsSpending(o)) continue
    const m = months[Number(o.date.slice(5, 7)) - 1]
    m.totalCents += o.totalCents
    m.orderCount++
  }
  return months
}

export function yearsWithData(orders: Order[]): number[] {
  return [...new Set(orders.map((o) => Number(o.date.slice(0, 4))))].sort((a, b) => b - a)
}

export interface ItemRow extends OrderItem {
  date: string
  status: Order['status']
  /** Gesamtpreis der Zeile (Menge × Stückpreis) */
  lineCents: number | null
}

export function itemRows(orders: Order[], items: OrderItem[]): ItemRow[] {
  const byId = new Map(orders.map((o) => [o.orderId, o]))
  const rows: ItemRow[] = []
  for (const it of items) {
    const o = byId.get(it.orderId)
    if (!o) continue
    rows.push({
      ...it,
      date: o.date,
      status: o.status,
      lineCents: it.unitPriceCents === null ? null : it.unitPriceCents * it.quantity,
    })
  }
  return rows
}
