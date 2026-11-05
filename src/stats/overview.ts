import type { Order, Receipt, Transaction } from '../db/schema'
import { DRUGSTORES, FALLBACK_CATEGORY } from '../finance/defaults'
import { countsAsSpending } from './spending'

/**
 * Monatsübersicht über alle Quellen. Grundregel: Geld zählt einmal.
 *  - Umbuchungen (kind "transfer") zählen nicht.
 *  - Buchungen mit viaTransactionId sind nur die Abbuchung einer anderen Buchung (z. B. PayPal) → zählen nicht.
 *  - Amazon-Bestellungen und Bons zählen selbst nur, wenn keine Buchung mit ihnen verknüpft ist
 *    (sonst zählt die Buchung, und Bestellung/Bon liefern nur die Details).
 */

export interface OverviewInput {
  transactions: Transaction[]
  orders: Order[]
  receipts: Receipt[]
}

export interface CategoryTotal {
  categoryId: string
  cents: number
  count: number
}

export interface MonthOverview {
  key: string
  expenseCents: number
  incomeCents: number
  byCategory: CategoryTotal[]
  /** Ausgaben je Quelle, z. B. { ing: 12345, amazon: 6789, bons: 4321 } */
  bySource: Record<string, number>
}

export function receiptCategory(store: string): string {
  return DRUGSTORES.includes(store) ? 'drogerie' : 'lebensmittel'
}

export function monthOverview(key: string, { transactions, orders, receipts }: OverviewInput): MonthOverview {
  const cats = new Map<string, CategoryTotal>()
  const bySource: Record<string, number> = {}
  let expense = 0
  let income = 0

  const add = (categoryId: string, cents: number, source: string) => {
    const c = cats.get(categoryId) ?? { categoryId, cents: 0, count: 0 }
    c.cents += cents
    c.count++
    cats.set(categoryId, c)
    bySource[source] = (bySource[source] ?? 0) + cents
    expense += cents
  }

  const linkedOrders = new Set<string>()
  const linkedReceipts = new Set<number>()
  for (const t of transactions) {
    if (t.linkedOrderId) linkedOrders.add(t.linkedOrderId)
    if (t.linkedReceiptId !== undefined) linkedReceipts.add(t.linkedReceiptId)
  }

  for (const t of transactions) {
    if (!t.date.startsWith(key) || t.kind === 'transfer' || t.viaTransactionId !== undefined) continue
    if (t.kind === 'income') {
      income += t.amountCents
      continue
    }
    // Ausgaben sind negativ gespeichert; eine positive "Ausgabe" ist eine Erstattung und mindert die Kategorie
    add(t.categoryId ?? FALLBACK_CATEGORY, -t.amountCents, t.accountId)
  }
  for (const o of orders) {
    if (!o.date.startsWith(key) || !countsAsSpending(o) || linkedOrders.has(o.orderId)) continue
    add('online', o.totalCents, 'amazon')
  }
  for (const r of receipts) {
    if (!r.date.startsWith(key) || linkedReceipts.has(r.id!)) continue
    add(receiptCategory(r.store), r.totalCents, 'bons')
  }

  return {
    key,
    expenseCents: expense,
    incomeCents: income,
    byCategory: [...cats.values()].filter((c) => c.cents !== 0).sort((a, b) => b.cents - a.cents),
    bySource,
  }
}
