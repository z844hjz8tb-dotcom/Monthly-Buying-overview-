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
}

export interface ReceiptLine {
  id?: number
  receiptId: number
  rawText: string
  quantity: number
  priceCents: number
  productId?: number
}

/** Normalisiertes Produkt, z. B. "Vollmilch 3,5 %" */
export interface Product {
  id?: number
  canonicalName: string
  category?: string
}

/** Zuordnung Laden + Bontext -> Produkt */
export interface Alias {
  id?: number
  store: string
  rawText: string
  productId: number
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
  }
}

export const TABLES = [
  'orders',
  'orderItems',
  'receipts',
  'receiptLines',
  'products',
  'aliases',
  'meta',
] as const

export type TableName = (typeof TABLES)[number]

export const db = new TrackerDB()
