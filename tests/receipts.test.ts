import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB } from '../src/db/schema'
import { assign, deleteReceipt, loadAliasMap, openGroups, saveReceipt, topProducts } from '../src/receipts/store'

let n = 0
const dbs: TrackerDB[] = []
const freshDb = () => {
  const db = new TrackerDB(`receipts-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

async function load(db: TrackerDB) {
  return {
    receipts: await db.receipts.toArray(),
    lines: await db.receiptLines.toArray(),
    aliases: await loadAliasMap(db),
    products: await db.products.toArray(),
  }
}

async function seed(db: TrackerDB) {
  await saveReceipt(db, {
    store: 'lidl', date: '2026-11-02', totalCents: 324, source: 'manual',
    lines: [
      { rawText: 'H-VOLLM. 3,5%', quantity: 2, priceCents: 198 },
      { rawText: 'Pfand', quantity: 1, priceCents: 25 },
      { rawText: 'BANANEN', quantity: 1, priceCents: 101 },
    ],
  })
  await saveReceipt(db, {
    store: 'Rewe', date: '2026-11-05', totalCents: 119, source: 'manual',
    lines: [{ rawText: 'Vollmilch 3,5% 1L', quantity: 1, priceCents: 119 }],
  })
  await saveReceipt(db, {
    store: 'Lidl', date: '2026-11-09', totalCents: 99, source: 'manual',
    lines: [{ rawText: 'h-vollm 3,5 %', quantity: 1, priceCents: 99 }],
  })
}

describe('Kassenbons', () => {
  it('gruppiert offene Bontexte je Laden, unabhängig von Schreibweise', async () => {
    const db = freshDb()
    await seed(db)
    const d = await load(db)
    expect(d.receipts.map((r) => r.store)).toEqual(['Lidl', 'Rewe', 'Lidl'])
    const groups = openGroups(d.receipts, d.lines, d.aliases)
    expect(groups[0]).toMatchObject({ store: 'Lidl', count: 2 })
    expect(groups).toHaveLength(4)
  })

  it('führt Artikel ladenübergreifend zusammen und vergleicht Preise', async () => {
    const db = freshDb()
    await seed(db)
    await assign(db, 'Lidl', 'H-VOLLM. 3,5%', { newProductName: 'Vollmilch 3,5 %' })
    const milk = (await db.products.toArray())[0]
    await assign(db, 'Rewe', 'Vollmilch 3,5% 1L', { productId: milk.id! })
    await assign(db, 'Lidl', 'Pfand', { ignore: true })

    const d = await load(db)
    expect(openGroups(d.receipts, d.lines, d.aliases).map((g) => g.rawText)).toEqual(['BANANEN'])

    const top = topProducts(d.receipts, d.lines, d.aliases, d.products)
    expect(top[0]).toMatchObject({ name: 'Vollmilch 3,5 %', assigned: true, count: 4, spendCents: 416 })
    expect(top[0].stores).toEqual([
      { store: 'Lidl', unitCents: 99 },
      { store: 'Rewe', unitCents: 119 },
    ])
    expect(top.some((t) => t.name === 'Pfand')).toBe(false)
    expect(top.find((t) => t.name === 'BANANEN')?.assigned).toBe(false)
  })

  it('legt kein doppeltes Produkt bei gleichem Namen an und überschreibt Zuordnungen', async () => {
    const db = freshDb()
    await seed(db)
    await assign(db, 'Lidl', 'BANANEN', { newProductName: 'Bananen' })
    await assign(db, 'Lidl', 'BANANEN', { newProductName: 'bananen' })
    expect(await db.products.count()).toBe(1)
    expect(await db.aliases.count()).toBe(1)
  })

  it('bearbeitet und löscht Bons samt Zeilen und Foto', async () => {
    const db = freshDb()
    const id = await saveReceipt(db, {
      store: 'Penny', date: '2026-11-01', totalCents: 100, source: 'photo',
      lines: [{ rawText: 'A', quantity: 1, priceCents: 100 }],
      image: { type: 'image/jpeg', data: new ArrayBuffer(4) },
    })
    await saveReceipt(db, {
      id, store: 'Penny', date: '2026-11-01', totalCents: 300, source: 'photo',
      lines: [{ rawText: 'B', quantity: 1, priceCents: 200 }, { rawText: 'C', quantity: 1, priceCents: 100 }, { rawText: ' ', quantity: 1, priceCents: 0 }],
    })
    expect((await db.receiptLines.toArray()).map((l) => l.rawText)).toEqual(['B', 'C'])
    expect(await db.receiptImages.count()).toBe(1)
    await deleteReceipt(db, id)
    expect(await db.receipts.count()).toBe(0)
    expect(await db.receiptLines.count()).toBe(0)
    expect(await db.receiptImages.count()).toBe(0)
  })
})
