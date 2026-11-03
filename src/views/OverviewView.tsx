import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { formatCents } from '../lib/money'

export function OverviewView() {
  const stats = useLiveQuery(async () => {
    const orders = await db.orders.toArray()
    return {
      count: orders.length,
      total: orders.reduce((s, o) => s + o.totalCents, 0),
    }
  })

  if (!stats) return null

  if (stats.count === 0) {
    return (
      <section className="card empty">
        <h2>Noch keine Daten</h2>
        <p>
          Importiere deine erste Amazon-Bestellübersicht unter <strong>Import</strong>. Die Jahres-
          und Monatsansicht folgt in Meilenstein M4.
        </p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Gesamt</h2>
      <p className="big-number">{formatCents(stats.total)}</p>
      <p className="muted">{stats.count} Bestellungen</p>
    </section>
  )
}
