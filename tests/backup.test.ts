import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB } from '../src/db/schema'
import { createBackup, parseBackup, restoreBackup } from '../src/db/backup'

let n = 0
const dbs: TrackerDB[] = []
function freshDb() {
  const db = new TrackerDB(`test-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

describe('Backup', () => {
  it('überträgt alle Daten verlustfrei in eine neue Datenbank', async () => {
    const a = freshDb()
    const now = new Date().toISOString()
    await a.orders.add({ orderId: '302-1', date: '2026-11-02', totalCents: 1999, source: 'amazon', importedAt: now, updatedAt: now })
    await a.orderItems.add({ orderId: '302-1', title: 'USB-Kabel', quantity: 1, unitPriceCents: 1999 })
    await a.products.add({ canonicalName: 'Vollmilch 3,5 %' })

    const json = JSON.stringify(await createBackup(a))
    const b = freshDb()
    await b.orders.add({ orderId: 'alt', date: '2026-01-01', totalCents: 1, source: 'amazon', importedAt: now, updatedAt: now })
    await restoreBackup(b, parseBackup(json))

    expect(await b.orders.toArray()).toEqual(await a.orders.toArray())
    expect(await b.orderItems.toArray()).toEqual(await a.orderItems.toArray())
    expect(await b.products.count()).toBe(1)
    expect(await b.orders.get('alt')).toBeUndefined()
  })

  it('lehnt fremde Dateien ab', () => {
    expect(() => parseBackup('kein json')).toThrow(/kein gültiges JSON/)
    expect(() => parseBackup('{"foo":1}')).toThrow(/kein Backup/)
  })
})
