import type { Order, OrderItem, Receipt, ReceiptLine, Transaction, TrackerDB } from '../db/schema'
import { countsAsSpending } from '../stats/spending'

/**
 * "Was wurde gekauft?" zu einer Buchung: Artikel der verknüpften Amazon-Bestellung bzw. des Kassenbons.
 * Ist die Buchung nur die Abbuchung einer PayPal-Zahlung (viaTransactionId), zählt deren Verknüpfung.
 */
export interface PurchaseDetails {
  /** PayPal-Zahlung, über die bezahlt wurde (bei Abbuchungen auf Konto/Karte) */
  via?: Transaction
  order?: Order
  orderItems: OrderItem[]
  receipt?: Receipt
  receiptLines: ReceiptLine[]
}

export async function loadPurchaseDetails(db: TrackerDB, tx: Transaction): Promise<PurchaseDetails> {
  const via = tx.viaTransactionId !== undefined ? await db.transactions.get(tx.viaTransactionId) : undefined
  const src = via ?? tx
  const [order, orderItems, receipt, receiptLines] = await Promise.all([
    src.linkedOrderId ? db.orders.get(src.linkedOrderId) : undefined,
    src.linkedOrderId ? db.orderItems.where('orderId').equals(src.linkedOrderId).toArray() : [],
    src.linkedReceiptId !== undefined ? db.receipts.get(src.linkedReceiptId) : undefined,
    src.linkedReceiptId !== undefined ? db.receiptLines.where('receiptId').equals(src.linkedReceiptId).toArray() : [],
  ])
  return { via, order, orderItems, receipt, receiptLines: receiptLines.filter((l) => l.priceCents > 0) }
}

const short = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Kurzer Text für Listen: "Nuki Smart Lock Pro … + 1 weiterer Artikel" */
export function itemSummary(titles: string[]): string | undefined {
  if (!titles.length) return undefined
  const rest = titles.length - 1
  return rest ? `${short(titles[0], 34)} + ${rest} ${rest === 1 ? 'weiterer' : 'weitere'}` : short(titles[0])
}

/** Kurztexte für viele Buchungen auf einmal (Kontoliste). */
export async function loadItemSummaries(db: TrackerDB, txs: Transaction[]): Promise<Map<number, string>> {
  const viaIds = txs.map((t) => t.viaTransactionId).filter((v): v is number => v !== undefined)
  const viaTxs = new Map((await db.transactions.bulkGet(viaIds)).filter((t): t is Transaction => !!t).map((t) => [t.id!, t]))
  const srcOf = (t: Transaction) => (t.viaTransactionId !== undefined ? viaTxs.get(t.viaTransactionId) : undefined) ?? t
  const orderIds = [...new Set(txs.map((t) => srcOf(t).linkedOrderId).filter((v): v is string => !!v))]
  const receiptIds = [...new Set(txs.map((t) => srcOf(t).linkedReceiptId).filter((v): v is number => v !== undefined))]
  const [items, lines] = await Promise.all([
    orderIds.length ? db.orderItems.where('orderId').anyOf(orderIds).toArray() : [],
    receiptIds.length ? db.receiptLines.where('receiptId').anyOf(receiptIds).toArray() : [],
  ])
  const out = new Map<number, string>()
  for (const t of txs) {
    const s = srcOf(t)
    const titles = s.linkedOrderId
      ? items.filter((i) => i.orderId === s.linkedOrderId).map((i) => i.title)
      : s.linkedReceiptId !== undefined
        ? lines.filter((l) => l.receiptId === s.linkedReceiptId && l.priceCents > 0).map((l) => l.rawText)
        : []
    const text = itemSummary(titles)
    if (text) out.set(t.id!, text)
  }
  return out
}

const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000

/**
 * Amazon-Zahlungen ohne Bestellnummer (z. B. "AMAZON.DE" auf der Kreditkarte, PayPal ohne Rechnungsnummer):
 * gleicher Betrag wie eine Bestellung, 0–10 Tage nach dem Bestelldatum, eindeutig → verknüpfen.
 * Dann zählt die Zahlung, die Bestellung liefert die Artikel (wie bei Bestellnummer im Verwendungszweck).
 */
export function matchAmazonByAmount(txs: Transaction[], orders: Order[]): { txId: number; orderId: string }[] {
  const taken = new Set(txs.filter((t) => t.linkedOrderId && t.amountCents < 0).map((t) => t.linkedOrderId!))
  const open = txs.filter((t) =>
    t.kind === 'expense' && t.amountCents < 0 && !t.linkedOrderId && t.viaTransactionId === undefined &&
    /amazon|amzn/i.test(`${t.rawCounterparty ?? t.counterparty} ${t.purpose ?? ''}`) && !/prime|kindle|audible|digital|video|music/i.test(`${t.rawCounterparty ?? t.counterparty} ${t.purpose ?? ''}`))
  const candidatesFor = (t: Transaction) =>
    orders.filter((o) => countsAsSpending(o) && !taken.has(o.orderId) && o.totalCents === -t.amountCents && days(o.date, t.date) >= 0 && days(o.date, t.date) <= 10)
  const out: { txId: number; orderId: string }[] = []
  for (const t of open.sort((a, b) => a.date.localeCompare(b.date))) {
    const c = candidatesFor(t)
    // eindeutig in beide Richtungen: genau eine Bestellung, und keine andere offene Zahlung passt zu ihr
    if (c.length !== 1) continue
    const rivals = open.filter((o) => o !== t && !out.some((x) => x.txId === o.id) && candidatesFor(o).some((x) => x.orderId === c[0].orderId))
    if (rivals.length) continue
    taken.add(c[0].orderId)
    out.push({ txId: t.id!, orderId: c[0].orderId })
  }
  return out
}

export async function linkAmazonByAmount(db: TrackerDB): Promise<number> {
  const [txs, orders] = await Promise.all([db.transactions.toArray(), db.orders.toArray()])
  const links = matchAmazonByAmount(txs, orders)
  for (const l of links) await db.transactions.update(l.txId, { linkedOrderId: l.orderId })
  return links.length
}
