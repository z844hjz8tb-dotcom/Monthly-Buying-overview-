import { AMAZON_EXPORT_FORMAT, type AmazonExport } from './amazon'

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
