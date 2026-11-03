import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB } from '../src/db/schema'
import { AMAZON_EXPORT_FORMAT, applyImport, parseAmazonExport, planImport } from '../src/import/amazon'
import { buildDemoExport } from '../src/import/demo'

let n = 0
const dbs: TrackerDB[] = []
const freshDb = () => {
  const db = new TrackerDB(`import-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const file = (orders: unknown[]) => JSON.stringify({ format: AMAZON_EXPORT_FORMAT, version: 1, orders })
const order = (over: Record<string, unknown> = {}) => ({
  orderId: '302-1234567-1234567',
  date: '2026-11-02',
  totalCents: 2498,
  items: [
    { title: 'USB-Kabel', quantity: 2, unitPriceCents: 999 },
    { title: 'Batterien', unitPriceCents: 500 },
  ],
  ...over,
})

async function importJson(db: TrackerDB, json: string) {
  const { orders } = parseAmazonExport(json)
  const plan = await planImport(db, orders)
  await applyImport(db, plan)
  return plan
}

describe('parseAmazonExport', () => {
  it('liest gültige Bestellungen und setzt Standardwerte', () => {
    const { orders, warnings } = parseAmazonExport(file([order()]))
    expect(warnings).toEqual([])
    expect(orders[0].order.status).toBe('ok')
    expect(orders[0].items[1].quantity).toBe(1)
  })

  it('überspringt kaputte Einträge mit Warnung', () => {
    const { orders, warnings } = parseAmazonExport(
      file([order({ orderId: '' }), order({ date: '02.11.2026' }), order({ orderId: 'B', items: [{ title: 'X', unitPriceCents: null }] })]),
    )
    expect(orders.map((o) => o.order.orderId)).toEqual(['B'])
    expect(warnings).toHaveLength(3)
    expect(warnings[2]).toMatch(/ohne Preis/)
  })

  it('lehnt fremde Dateien ab', () => {
    expect(() => parseAmazonExport('{"orders":[]}')).toThrow(/nicht aus dem Amazon-Export/)
  })
})

describe('Import mit Duplikat-Erkennung', () => {
  it('legt beim zweiten Import derselben Datei nichts doppelt an', async () => {
    const db = freshDb()
    const json = JSON.stringify(buildDemoExport())
    const first = await importJson(db, json)
    const orderCount = await db.orders.count()
    const itemCount = await db.orderItems.count()

    const second = await importJson(db, json)
    expect(first.added.length).toBe(orderCount)
    expect(second.added).toHaveLength(0)
    expect(second.updated).toHaveLength(0)
    expect(second.unchanged).toHaveLength(orderCount)
    expect(await db.orders.count()).toBe(orderCount)
    expect(await db.orderItems.count()).toBe(itemCount)
  })

  it('aktualisiert geänderte Bestellungen und ersetzt deren Artikel', async () => {
    const db = freshDb()
    await importJson(db, file([order()]))
    const before = await db.orders.get('302-1234567-1234567')

    const plan = await importJson(db, file([order({ status: 'cancelled', items: [{ title: 'USB-Kabel', quantity: 2, unitPriceCents: 999 }] })]))
    expect(plan.updated).toHaveLength(1)
    const after = await db.orders.get('302-1234567-1234567')
    expect(after?.status).toBe('cancelled')
    expect(after?.importedAt).toBe(before?.importedAt)
    expect(await db.orderItems.count()).toBe(1)
    expect(await db.meta.get('lastImportAt')).toBeDefined()
  })
})
