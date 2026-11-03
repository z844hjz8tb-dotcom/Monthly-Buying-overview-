import type { Order, OrderItem, TrackerDB } from '../db/schema'

/**
 * Austauschformat zwischen Konsolen-Skript (amazon-script/) und App.
 * Beträge in Cent, Datum als ISO "YYYY-MM-DD".
 */
export const AMAZON_EXPORT_FORMAT = 'ausgaben-tracker-amazon'

export interface AmazonExportItem {
  title: string
  quantity?: number
  unitPriceCents: number | null
  asin?: string
}

export interface AmazonExportOrder {
  orderId: string
  date: string
  totalCents: number
  status?: Order['status']
  items: AmazonExportItem[]
}

export interface AmazonExport {
  format: typeof AMAZON_EXPORT_FORMAT
  version: 1
  exportedAt?: string
  orders: AmazonExportOrder[]
}

export interface ParsedOrder {
  order: Omit<Order, 'importedAt' | 'updatedAt'>
  items: Omit<OrderItem, 'id'>[]
}

const STATUSES = ['ok', 'cancelled', 'returned'] as const

export function parseAmazonExport(json: string): { orders: ParsedOrder[]; warnings: string[] } {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.')
  }
  const d = data as Partial<AmazonExport>
  if (d?.format !== AMAZON_EXPORT_FORMAT) {
    throw new Error('Die Datei stammt nicht aus dem Amazon-Export-Skript dieser App.')
  }
  if (d.version !== 1) throw new Error(`Unbekannte Export-Version: ${String(d.version)}`)
  if (!Array.isArray(d.orders)) throw new Error('Die Datei enthält keine Bestellungen.')

  const warnings: string[] = []
  const byId = new Map<string, ParsedOrder>()

  d.orders.forEach((raw, i) => {
    const o = raw as Partial<AmazonExportOrder>
    const label = typeof o?.orderId === 'string' && o.orderId ? o.orderId : `Eintrag ${i + 1}`
    if (typeof o?.orderId !== 'string' || !o.orderId.trim()) {
      warnings.push(`${label}: Bestellnummer fehlt – übersprungen.`)
      return
    }
    if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) {
      warnings.push(`${label}: ungültiges Datum – übersprungen.`)
      return
    }
    if (typeof o.totalCents !== 'number' || !Number.isInteger(o.totalCents)) {
      warnings.push(`${label}: Bestellsumme fehlt – übersprungen.`)
      return
    }
    const status = STATUSES.includes(o.status as (typeof STATUSES)[number]) ? o.status : 'ok'
    const orderId = o.orderId.trim()
    const items: ParsedOrder['items'] = []
    for (const it of Array.isArray(o.items) ? o.items : []) {
      if (typeof it?.title !== 'string' || !it.title.trim()) continue
      const price = typeof it.unitPriceCents === 'number' && Number.isInteger(it.unitPriceCents) ? it.unitPriceCents : null
      items.push({
        orderId,
        title: it.title.trim().replace(/\s+/g, ' '),
        quantity: typeof it.quantity === 'number' && it.quantity > 0 ? Math.round(it.quantity) : 1,
        unitPriceCents: price,
        ...(typeof it.asin === 'string' && it.asin ? { asin: it.asin } : {}),
      })
    }
    if (items.length === 0) warnings.push(`${orderId}: keine Artikel gefunden.`)
    const missing = items.filter((it) => it.unitPriceCents === null).length
    if (missing) warnings.push(`${orderId}: ${missing} Artikel ohne Preis.`)
    if (byId.has(orderId)) warnings.push(`${orderId}: doppelt in der Datei – letzter Eintrag zählt.`)
    byId.set(orderId, { order: { orderId, date: o.date, totalCents: o.totalCents, source: 'amazon', status }, items })
  })

  return { orders: [...byId.values()], warnings }
}

export interface ImportPlan {
  added: ParsedOrder[]
  updated: ParsedOrder[]
  unchanged: ParsedOrder[]
}

function fingerprint(order: Pick<Order, 'date' | 'totalCents' | 'status'>, items: Omit<OrderItem, 'id'>[]): string {
  return JSON.stringify([
    order.date,
    order.totalCents,
    order.status ?? 'ok',
    items.map((i) => [i.title, i.quantity, i.unitPriceCents, i.asin ?? null]),
  ])
}

/** Vergleicht die Datei mit der Datenbank, ohne etwas zu schreiben. */
export async function planImport(db: TrackerDB, orders: ParsedOrder[]): Promise<ImportPlan> {
  const plan: ImportPlan = { added: [], updated: [], unchanged: [] }
  const existing = await db.orders.bulkGet(orders.map((o) => o.order.orderId))
  for (let i = 0; i < orders.length; i++) {
    const incoming = orders[i]
    const current = existing[i]
    if (!current) {
      plan.added.push(incoming)
      continue
    }
    const currentItems = await db.orderItems.where('orderId').equals(current.orderId).sortBy('id')
    const same = fingerprint(current, currentItems) === fingerprint(incoming.order, incoming.items)
    ;(same ? plan.unchanged : plan.updated).push(incoming)
  }
  return plan
}

/** Schreibt neue und geänderte Bestellungen. Bestellnummer = Schlüssel, daher keine Duplikate. */
export async function applyImport(db: TrackerDB, plan: ImportPlan, now = new Date()): Promise<void> {
  const ts = now.toISOString()
  await db.transaction('rw', db.orders, db.orderItems, db.meta, async () => {
    for (const { order, items } of [...plan.added, ...plan.updated]) {
      const prev = await db.orders.get(order.orderId)
      await db.orders.put({ ...order, importedAt: prev?.importedAt ?? ts, updatedAt: ts })
      await db.orderItems.where('orderId').equals(order.orderId).delete()
      await db.orderItems.bulkAdd(items.map((it) => ({ ...it })))
    }
    await db.meta.put({ key: 'lastImportAt', value: ts })
  })
}
