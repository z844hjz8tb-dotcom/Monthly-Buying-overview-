import type { Alias, Product, Receipt, ReceiptLine, TrackerDB } from '../db/schema'
import { normalizeRaw } from '../normalize/match'

export const KNOWN_STORES = ['Lidl', 'Kaufland', 'Penny', 'Müller', 'Rewe', 'Aldi', 'Netto', 'Edeka', 'dm', 'Rossmann']

/** "  lidl " -> "Lidl"; unbekannte Läden bleiben, wie eingegeben. */
export function canonicalStore(input: string): string {
  const s = input.trim().replace(/\s+/g, ' ')
  return KNOWN_STORES.find((k) => k.toLowerCase() === s.toLowerCase()) ?? s
}

export const aliasKey = (store: string, rawText: string) => `${canonicalStore(store)}|${normalizeRaw(rawText)}`

export type LineInput = Pick<ReceiptLine, 'rawText' | 'quantity' | 'priceCents'>

export interface ReceiptInput {
  id?: number
  store: string
  date: string
  totalCents: number
  source: Receipt['source']
  lines: LineInput[]
  /** undefined = Foto unverändert lassen, null = Foto entfernen */
  image?: { type: string; data: ArrayBuffer } | null
  demo?: boolean
}

export async function saveReceipt(db: TrackerDB, input: ReceiptInput): Promise<number> {
  return db.transaction('rw', db.receipts, db.receiptLines, db.receiptImages, async () => {
    const base = {
      store: canonicalStore(input.store),
      date: input.date,
      totalCents: input.totalCents,
      source: input.source,
      ...(input.demo ? { demo: true } : {}),
    }
    let receiptId: number
    if (input.id === undefined) {
      receiptId = (await db.receipts.add({ ...base, createdAt: new Date().toISOString() })) as number
    } else {
      receiptId = input.id
      await db.receipts.update(receiptId, base)
      await db.receiptLines.where('receiptId').equals(receiptId).delete()
    }
    await db.receiptLines.bulkAdd(
      input.lines
        .filter((l) => l.rawText.trim())
        .map((l) => ({ receiptId, rawText: l.rawText.trim(), quantity: l.quantity, priceCents: l.priceCents })),
    )
    if (input.image === null) await db.receiptImages.delete(receiptId)
    else if (input.image) await db.receiptImages.put({ receiptId, ...input.image })
    return receiptId
  })
}

export async function deleteReceipt(db: TrackerDB, id: number): Promise<void> {
  await db.transaction('rw', db.receipts, db.receiptLines, db.receiptImages, async () => {
    await db.receiptLines.where('receiptId').equals(id).delete()
    await db.receiptImages.delete(id)
    await db.receipts.delete(id)
  })
}

export async function loadAliasMap(db: TrackerDB): Promise<Map<string, Alias>> {
  const aliases = await db.aliases.toArray()
  return new Map(aliases.map((a) => [`${a.store}|${a.rawText}`, a]))
}

export type Assignment = { productId: number } | { newProductName: string } | { ignore: true }

/** Ordnet einen Bontext (je Laden) einem Produkt zu. Gilt sofort für alle Bons mit diesem Text. */
export async function assign(db: TrackerDB, store: string, rawText: string, a: Assignment): Promise<void> {
  await db.transaction('rw', db.aliases, db.products, async () => {
    let productId: number | undefined
    if ('newProductName' in a) {
      const name = a.newProductName.trim()
      const existing = await db.products.where('canonicalName').equalsIgnoreCase(name).first()
      productId = existing?.id ?? (await db.products.add({ canonicalName: name }))
    } else if ('productId' in a) {
      productId = a.productId
    }
    const key = { store: canonicalStore(store), rawText: normalizeRaw(rawText) }
    const prev = await db.aliases.where('[store+rawText]').equals([key.store, key.rawText]).first()
    const row: Alias = 'ignore' in a ? { ...key, ignored: true } : { ...key, productId }
    if (prev) await db.aliases.put({ ...row, id: prev.id })
    else await db.aliases.add(row)
  })
}

export async function unassign(db: TrackerDB, aliasId: number): Promise<void> {
  await db.aliases.delete(aliasId)
}

export interface OpenGroup {
  key: string
  store: string
  rawText: string
  count: number
  lastDate: string
}

/** Alle Bontexte ohne Zuordnung, gruppiert nach Laden + Text, häufigste zuerst. */
export function openGroups(receipts: Receipt[], lines: ReceiptLine[], aliases: Map<string, Alias>): OpenGroup[] {
  const byId = new Map(receipts.map((r) => [r.id, r]))
  const groups = new Map<string, OpenGroup>()
  for (const l of lines) {
    const r = byId.get(l.receiptId)
    if (!r) continue
    const key = aliasKey(r.store, l.rawText)
    if (aliases.has(key)) continue
    const g = groups.get(key)
    if (g) {
      g.count++
      if (r.date > g.lastDate) g.lastDate = r.date
    } else {
      groups.set(key, { key, store: r.store, rawText: l.rawText, count: 1, lastDate: r.date })
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
}

export interface TopProduct {
  key: string
  name: string
  assigned: boolean
  /** Anzahl gekaufter Stück */
  count: number
  spendCents: number
  /** Durchschnittlicher Stückpreis je Laden, günstigster zuerst */
  stores: { store: string; unitCents: number }[]
}

export function topProducts(
  receipts: Receipt[],
  lines: ReceiptLine[],
  aliases: Map<string, Alias>,
  products: Product[],
): TopProduct[] {
  const byId = new Map(receipts.map((r) => [r.id, r]))
  const names = new Map(products.map((p) => [p.id, p.canonicalName]))
  const acc = new Map<string, TopProduct & { perStore: Map<string, { cents: number; qty: number }> }>()

  for (const l of lines) {
    const r = byId.get(l.receiptId)
    if (!r || l.priceCents <= 0) continue
    const k = aliasKey(r.store, l.rawText)
    const alias = aliases.get(k)
    if (alias?.ignored) continue
    const assigned = alias?.productId !== undefined
    const key = assigned ? `p${alias!.productId}` : `r${k}`
    let e = acc.get(key)
    if (!e) {
      e = {
        key,
        name: assigned ? (names.get(alias!.productId) ?? l.rawText) : l.rawText,
        assigned,
        count: 0,
        spendCents: 0,
        stores: [],
        perStore: new Map(),
      }
      acc.set(key, e)
    }
    e.count += l.quantity
    e.spendCents += l.priceCents
    const ps = e.perStore.get(r.store) ?? { cents: 0, qty: 0 }
    ps.cents += l.priceCents
    ps.qty += l.quantity
    e.perStore.set(r.store, ps)
  }

  return [...acc.values()]
    .map(({ perStore, ...e }) => ({
      ...e,
      stores: [...perStore.entries()]
        .map(([store, v]) => ({ store, unitCents: Math.round(v.cents / v.qty) }))
        .sort((a, b) => a.unitCents - b.unitCents),
    }))
    .sort((a, b) => b.count - a.count || b.spendCents - a.spendCents)
}
