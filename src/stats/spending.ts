import type { Order, OrderItem, Transaction } from '../db/schema'

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

/**
 * Erstattungen je Amazon-Bestellung: Gutschriften auf Konto/Karte mit Bestellnummer im Verwendungszweck.
 * (Die Übersicht verrechnet sie im Monat der Gutschrift; die Amazon-Ansicht bei der Bestellung.)
 */
export function refundsByOrder(transactions: Pick<Transaction, 'linkedOrderId' | 'amountCents' | 'kind'>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of transactions) {
    if (!t.linkedOrderId || t.amountCents <= 0 || t.kind === 'transfer') continue
    out.set(t.linkedOrderId, (out.get(t.linkedOrderId) ?? 0) + t.amountCents)
  }
  return out
}

/** Was eine Bestellung nach Erstattungen gekostet hat (nie unter 0). */
export function netOrderCents(o: Pick<Order, 'orderId' | 'totalCents'>, refunds?: Map<string, number>): number {
  return Math.max(0, o.totalCents - (refunds?.get(o.orderId) ?? 0))
}

/** Komplett erstattet = zurückgesendet, auch wenn die Amazon-Datei es nicht weiß. */
export function isFullyRefunded(o: Pick<Order, 'orderId' | 'totalCents'>, refunds?: Map<string, number>): boolean {
  const r = refunds?.get(o.orderId) ?? 0
  return r > 0 && r >= o.totalCents
}

const MAX_UNITS = 16

/**
 * Welche Artikel wurden zurückgeschickt? Gesucht wird eine Auswahl einzelner Stücke, deren Preise genau
 * die Erstattung ergeben (bevorzugt wenige Stücke). Ergebnis: Artikel-ID → zurückgeschickte Menge;
 * leer, wenn es keine eindeutige Erklärung gibt (z. B. Teilerstattung).
 */
export function returnedUnits(items: OrderItem[], refundCents: number): Map<number, number> {
  const units: { id: number; cents: number }[] = []
  for (const it of items) {
    if (it.id === undefined || !it.unitPriceCents) continue
    for (let q = 0; q < it.quantity; q++) units.push({ id: it.id, cents: it.unitPriceCents })
  }
  const result = new Map<number, number>()
  if (refundCents <= 0 || !units.length || units.length > MAX_UNITS) return result
  let best: number | null = null
  for (let mask = 1; mask < 1 << units.length; mask++) {
    let sum = 0
    for (let i = 0; i < units.length; i++) if (mask & (1 << i)) sum += units[i].cents
    if (sum !== refundCents) continue
    if (best === null || popcount(mask) < popcount(best)) best = mask
  }
  if (best === null) return result
  for (let i = 0; i < units.length; i++) if (best & (1 << i)) result.set(units[i].id, (result.get(units[i].id) ?? 0) + 1)
  return result
}

function popcount(n: number) {
  let c = 0
  for (; n; n &= n - 1) c++
  return c
}

/** 12 Monate eines Jahres, auch leere. Erstattungen werden bei der Bestellung abgezogen. */
export function yearSummary(orders: Order[], year: number, refunds?: Map<string, number>): MonthSummary[] {
  const months: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    totalCents: 0,
    orderCount: 0,
  }))
  for (const o of orders) {
    if (!o.date.startsWith(`${year}-`) || !countsAsSpending(o) || isFullyRefunded(o, refunds)) continue
    const m = months[Number(o.date.slice(5, 7)) - 1]
    m.totalCents += netOrderCents(o, refunds)
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
  /** davon zurückgeschickt (aus Erstattungen abgeleitet) */
  returnedQty: number
  /** Gesamtpreis der Zeile (Menge × Stückpreis) */
  lineCents: number | null
}

export function itemRows(orders: Order[], items: OrderItem[], refunds?: Map<string, number>): ItemRow[] {
  const byId = new Map(orders.map((o) => [o.orderId, o]))
  const returned = new Map<number, number>()
  for (const o of orders) {
    const r = refunds?.get(o.orderId)
    if (!r) continue
    const own = items.filter((i) => i.orderId === o.orderId)
    const units = isFullyRefunded(o, refunds) ? new Map(own.map((i) => [i.id!, i.quantity])) : returnedUnits(own, r)
    for (const [id, q] of units) returned.set(id, q)
  }
  const rows: ItemRow[] = []
  for (const it of items) {
    const o = byId.get(it.orderId)
    if (!o) continue
    rows.push({
      ...it,
      date: o.date,
      status: isFullyRefunded(o, refunds) && countsAsSpending(o) ? 'returned' : o.status,
      returnedQty: returned.get(it.id!) ?? 0,
      lineCents: it.unitPriceCents === null ? null : it.unitPriceCents * it.quantity,
    })
  }
  return rows
}
