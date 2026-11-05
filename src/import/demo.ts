import { AMAZON_EXPORT_FORMAT, type AmazonExport } from './amazon'
import type { ReceiptInput } from '../receipts/store'
import type { Transaction } from '../db/schema'

/** Erfundene Beispieldaten zum Ausprobieren. Bestellnummern beginnen mit "DEMO-". */
export const DEMO_PREFIX = 'DEMO-'

const products: [string, number][] = [
  ['USB-C Ladekabel 2 m, geflochten', 999],
  ['Zahnbürstenköpfe, 8 Stück', 1899],
  ['Kaffeebohnen Crema, 1 kg', 1449],
  ['Batterien AA, 24er-Pack', 1299],
  ['Taschenbuch: Gartenjahr', 1400],
  ['LED-Lampe E27, 3er-Set', 1099],
  ['Spülmaschinentabs, 90 Stück', 1749],
  ['Druckerpapier A4, 500 Blatt', 649],
  ['Handyhülle, transparent', 1199],
  ['Müllbeutel 35 l, 100 Stück', 899],
  ['Kopfhörer Bluetooth', 3999],
  ['Vitamin D3 Tropfen', 1595],
]

export function buildDemoExport(year = 2026, months = [7, 8, 9, 10, 11]): AmazonExport {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const orders: AmazonExport['orders'] = []
  let n = 1
  for (const m of months) {
    const count = 2 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(rand() * 27)
      const itemCount = 1 + Math.floor(rand() * 3)
      const items = Array.from({ length: itemCount }, () => {
        const [title, price] = products[Math.floor(rand() * products.length)]
        const quantity = rand() < 0.2 ? 2 : 1
        return { title, quantity, unitPriceCents: price }
      })
      const total = items.reduce((s, it) => s + it.quantity * it.unitPriceCents, 0)
      orders.push({
        orderId: `${DEMO_PREFIX}${String(n++).padStart(3, '0')}`,
        date: `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        totalCents: total,
        status: rand() < 0.08 ? 'cancelled' : 'ok',
        items,
      })
    }
  }
  return { format: AMAZON_EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), orders }
}

/** Erfundene Kassenbons mit typischen Abkürzungen der Läden. */
export function buildDemoReceipts(year = 2026): ReceiptInput[] {
  const r = (store: string, date: string, lines: [string, number, number][]): ReceiptInput => ({
    store,
    date: `${year}-${date}`,
    source: 'manual',
    demo: true,
    totalCents: lines.reduce((s, [, , p]) => s + p, 0),
    lines: lines.map(([rawText, quantity, priceCents]) => ({ rawText, quantity, priceCents })),
  })
  return [
    r('Lidl', '10-04', [['H-VOLLM. 3,5%', 2, 198], ['BANANEN', 1, 129], ['TOAST WEIZEN', 1, 89], ['PFAND', 1, -75]]),
    r('Rewe', '10-11', [['Vollmilch 3,5% 1L', 1, 119], ['Bio Bananen', 1, 189], ['Ja! Butter', 1, 229], ['Tragetasche', 1, 25]]),
    r('Penny', '10-19', [['H-MILCH 3,5% 1L', 2, 210], ['DT. MARKENBUTTER', 1, 199], ['NUDELN SPIRELLI', 2, 158]]),
    r('Lidl', '10-27', [['H-VOLLM. 3,5%', 3, 297], ['BANANEN', 1, 119], ['MILSANI BUTTER', 1, 199]]),
    r('Lidl', '11-01', [['H-VOLLM. 3,5%', 2, 198], ['BANANEN', 1, 125], ['TOAST WEIZEN', 1, 89], ['TOMATEN RISPE', 1, 179]]),
    r('Kaufland', '11-02', [['K-CL. H-MILCH 3,5', 2, 198], ['BUTTER DT.MARKEN', 1, 189], ['SPIRELLI 500G', 1, 79], ['ZAHNPASTA', 1, 95]]),
    r('Rewe', '11-03', [['Vollmilch 3,5% 1L', 1, 119], ['Bio Bananen', 1, 199], ['Tomaten Rispe', 1, 249], ['Tragetasche', 1, 25]]),
  ]
}


/** Erfundene Buchungen (Konto, feste Kosten, Abos) für Oktober und November. */
export function buildDemoTransactions(year = 2026): Omit<Transaction, 'id' | 'createdAt'>[] {
  const t = (accountId: string, date: string, amountCents: number, counterparty: string, kind: Transaction['kind'], categoryId?: string) =>
    ({ accountId, date: `${year}-${date}`, amountCents, counterparty, kind, categoryId, source: 'manual' as const, demo: true })
  return [
    t('ing', '10-01', 250000, 'Gehalt Musterfirma', 'income'),
    t('ing', '10-01', -85000, 'Miete Wohnung', 'expense', 'wohnen'),
    t('ing', '10-02', -25000, 'Autokredit Musterbank', 'expense', 'kredite'),
    t('ing', '10-05', -650, 'Haftpflichtversicherung', 'expense', 'versicherungen'),
    t('amex', '10-08', -1399, 'Netflix', 'expense', 'abos'),
    t('amex', '10-14', -6512, 'Tankstelle', 'expense', 'mobilitaet'),
    t('paypal', '10-20', -2400, 'Kino', 'expense', 'freizeit'),
    t('ing', '10-28', -7911, 'American Express Abrechnung', 'transfer'),
    t('ing', '11-01', 250000, 'Gehalt Musterfirma', 'income'),
    t('ing', '11-01', -85000, 'Miete Wohnung', 'expense', 'wohnen'),
    t('ing', '11-02', -25000, 'Autokredit Musterbank', 'expense', 'kredite'),
    t('amex', '11-03', -1399, 'Netflix', 'expense', 'abos'),
    t('bar', '11-03', -420, 'Bäckerei', 'expense', 'lebensmittel'),
    t('amex', '11-04', -5890, 'Tankstelle', 'expense', 'mobilitaet'),
    t('ing', '11-04', 1234, 'Dividende ETF', 'income'),
  ]
}

/** Erfundene Spar- und Depotkonten (werden mit den Beispieldaten angelegt und wieder entfernt). */
export const DEMO_ACCOUNTS = [
  { id: 'demo-extra', name: 'Extra-Konto (Beispiel)', kind: 'savings' as const, order: 90, demo: true },
  { id: 'demo-depot', name: 'Depot (Beispiel)', kind: 'depot' as const, order: 91, countsAsSaving: true, demo: true },
  { id: 'demo-aktien', name: 'Aktienkonto (Beispiel)', kind: 'depot' as const, order: 92, countsAsSaving: true, balanceCents: 412050, balanceDate: '2026-11-01', demo: true },
]

/** Erfundene Umbuchungen: Rücklage aufs Extra-Konto (zählt nicht) und ETF-Sparplan (zählt als Gespart). */
export function buildDemoTransfers(year = 2026) {
  return [
    { fromAccountId: 'ing', toAccountId: 'demo-depot', date: `${year}-10-02`, cents: 20000, counterparty: 'ETF-Sparplan', demo: true },
    { fromAccountId: 'ing', toAccountId: 'demo-depot', date: `${year}-11-02`, cents: 20000, counterparty: 'ETF-Sparplan', demo: true },
    { fromAccountId: 'ing', toAccountId: 'demo-extra', date: `${year}-11-03`, cents: 50000, counterparty: 'Rücklage', demo: true },
  ]
}
