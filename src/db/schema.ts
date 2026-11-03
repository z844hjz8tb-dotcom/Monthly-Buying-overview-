import Dexie, { type EntityTable } from 'dexie'

/** Eine Amazon-Bestellung. Primärschlüssel ist die Bestellnummer (Duplikat-Erkennung). */
export interface Order {
  orderId: string
  /** ISO-Datum, z. B. "2026-11-03" */
  date: string
  totalCents: number
  source: 'amazon'
  status?: 'ok' | 'cancelled' | 'returned'
  importedAt: string
  updatedAt: string
}

export interface OrderItem {
  id?: number
  orderId: string
  title: string
  quantity: number
  /** Preis pro Stück in Cent; null, wenn das Skript keinen Preis finden konnte */
  unitPriceCents: number | null
  asin?: string
}

/** Phase 2: ein Kassenbon */
export interface Receipt {
  id?: number
  store: string
  date: string
  totalCents: number
  source: 'photo' | 'app' | 'manual'
  createdAt: string
  /** erfundene Beispieldaten */
  demo?: boolean
}

export interface ReceiptLine {
  id?: number
  receiptId: number
  /** Text wie auf dem Bon, z. B. "H-VOLLM. 3,5%" */
  rawText: string
  quantity: number
  /** Zeilenbetrag in Cent (Menge × Stückpreis); negativ für Rabatte */
  priceCents: number
}

/** Foto eines Bons, verkleinert als JPEG */
export interface ReceiptImage {
  receiptId: number
  type: string
  data: ArrayBuffer
}

/** Normalisiertes Produkt, z. B. "Vollmilch 3,5 %" */
export interface Product {
  id?: number
  canonicalName: string
  category?: string
}

/**
 * Zuordnung Laden + Bontext -> Produkt. Einzige Quelle der Wahrheit:
 * Bonzeilen werden beim Lesen über diese Tabelle einem Produkt zugeordnet.
 * rawText ist normalisiert (siehe normalizeRaw).
 */
export interface Alias {
  id?: number
  store: string
  rawText: string
  /** fehlt, wenn ignored = true */
  productId?: number
  /** z. B. Pfand, Rabatt, Tüte – zählt nicht in den Top-Artikeln */
  ignored?: boolean
}

export interface Meta {
  key: string
  value: string
}

export class TrackerDB extends Dexie {
  orders!: EntityTable<Order, 'orderId'>
  orderItems!: EntityTable<OrderItem, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  receiptLines!: EntityTable<ReceiptLine, 'id'>
  receiptImages!: EntityTable<ReceiptImage, 'receiptId'>
  products!: EntityTable<Product, 'id'>
  aliases!: EntityTable<Alias, 'id'>
  meta!: EntityTable<Meta, 'key'>

  constructor(name = 'ausgaben-tracker') {
    super(name)
    this.version(1).stores({
      orders: 'orderId, date',
      orderItems: '++id, orderId',
      receipts: '++id, date, store',
      receiptLines: '++id, receiptId, productId',
      products: '++id, canonicalName',
      aliases: '++id, &[store+rawText], productId',
      meta: 'key',
    })
    this.version(2).stores({
      receiptLines: '++id, receiptId',
      receiptImages: 'receiptId',
    })
  }
}

export const TABLES = [
  'orders',
  'orderItems',
  'receipts',
  'receiptLines',
  'receiptImages',
  'products',
  'aliases',
  'meta',
] as const

export type TableName = (typeof TABLES)[number]

export const db = new TrackerDB()
