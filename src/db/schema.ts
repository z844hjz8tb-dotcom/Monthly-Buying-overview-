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
  /** Bar bezahlt: keine Kontobuchung dazu suchen */
  paidCash?: boolean
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

/** Konto: Girokonto, Kreditkarte, PayPal oder Bargeld. id ist ein fester Schlüssel, z. B. "ing". */
export type AccountKind = 'giro' | 'savings' | 'depot' | 'credit' | 'paypal' | 'cash'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  order: number
  /** Für die automatische Erkennung von Umbuchungen beim Import (ab H2) */
  iban?: string
  /** Geld, das auf dieses Konto fließt, zählt als "Gespart" (Standard bei Depots) */
  countsAsSaving?: boolean
  /** Manuell gepflegter Kontostand, z. B. für ein Aktienkonto ohne Buchungen */
  balanceCents?: number
  balanceDate?: string
  /** Empfänger-/Auftraggeber-Namen, an denen Umbuchungen auf dieses Konto erkannt werden, z. B. "Notgroschen" */
  matchNames?: string[]
  hidden?: boolean
  demo?: boolean
}

/** Ausgabenkategorie. id ist ein fester Schlüssel, z. B. "lebensmittel". */
export interface Category {
  id: string
  name: string
  icon: string
  /** Name der Farbvariable, z. B. "cat-1" → var(--cat-1) */
  color: string
  order: number
}

/**
 * Eine Buchung auf einem Konto. Beträge in Cent, negativ = Geld geht raus.
 * kind "transfer" = Umbuchung zwischen eigenen Konten (zählt nicht als Ausgabe).
 */
export interface Transaction {
  id?: number
  accountId: string
  date: string
  amountCents: number
  counterparty: string
  purpose?: string
  categoryId?: string
  /**
   * expense/income: Ausgabe/Einnahme. transfer: Umbuchung zwischen eigenen Konten (zählt nicht).
   * saving: Geld fließt auf ein Spar-Konto (oder zurück) – zählt als "Gespart", nicht als Ausgabe.
   */
  kind: 'expense' | 'income' | 'transfer' | 'saving'
  source: 'manual' | 'ing' | 'amex' | 'paypal'
  /** Schlüssel gegen doppelten Import (nur bei importierten Buchungen) */
  importKey?: string
  /** Verknüpfungen gegen Doppelzählung (ab H4/H5) */
  linkedOrderId?: string
  linkedReceiptId?: number
  /** Diese Buchung ist nur die Abbuchung einer anderen (z. B. PayPal) und zählt nicht selbst */
  viaTransactionId?: number
  /** Bei Umbuchung/Sparen: das andere Konto und die Gegenbuchung dort */
  transferAccountId?: string
  pairId?: number
  /** Aus dem Bank-Export: Buchungstext (z. B. "Lastschrift") und Originalname */
  bookingText?: string
  rawCounterparty?: string
  /** Vom Nutzer nachträglich geändert – wird beim erneuten Einordnen nicht überschrieben */
  edited?: boolean
  createdAt: string
  demo?: boolean
}

/** Regel: Text in Empfänger/Verwendungszweck → Kategorie (ab H2) */
export interface CategoryRule {
  id?: number
  pattern: string
  field: 'counterparty' | 'purpose'
  categoryId: string
}

/** Feste monatliche Kosten, z. B. Kreditrate oder Abo (ab H6) */
export interface Recurring {
  id?: number
  name: string
  amountCents: number
  dayOfMonth: number
  start: string
  end?: string
  categoryId: string
  accountId: string
  matchPattern?: string
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
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  categoryRules!: EntityTable<CategoryRule, 'id'>
  recurring!: EntityTable<Recurring, 'id'>

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
    this.version(3).stores({
      accounts: 'id, order',
      categories: 'id, order',
      transactions: '++id, accountId, date, &importKey, linkedOrderId, linkedReceiptId',
      categoryRules: '++id, categoryId',
      recurring: '++id',
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
  'accounts',
  'categories',
  'transactions',
  'categoryRules',
  'recurring',
] as const

export type TableName = (typeof TABLES)[number]

export const db = new TrackerDB()
