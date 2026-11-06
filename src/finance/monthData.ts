import { db } from '../db/schema'
import { monthOverview } from '../stats/overview'

/** Lädt alles für einen Monat und berechnet die Übersicht (Startseite, Kategorie-Seite). */
export async function loadMonthOverview(key: string) {
  const [from, to] = [`${key}-01`, `${key}-31`]
  const [transactions, orders, receipts, accounts] = await Promise.all([
    db.transactions.where('date').between(from, to, true, true).toArray(),
    db.orders.where('date').between(from, to, true, true).toArray(),
    db.receipts.where('date').between(from, to, true, true).toArray(),
    db.accounts.toArray(),
  ])
  return { overview: monthOverview(key, { transactions, orders, receipts, accounts }), transactions }
}
