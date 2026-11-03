import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { countsAsSpending, formatDay, formatMonth, itemRows, shiftMonth, type ItemRow } from '../stats/spending'

type Sort = 'date' | 'price'

const STATUS_LABEL = { cancelled: 'storniert', returned: 'zurückgesendet' } as const

async function loadMonth(key: string) {
  const orders = await db.orders.where('date').startsWith(key).toArray()
  const items = await db.orderItems.where('orderId').anyOf(orders.map((o) => o.orderId)).toArray()
  return { orders, items }
}

export function MonthView() {
  const { key = '' } = useParams()
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(key)
  const prevKey = valid ? shiftMonth(key, -1) : ''

  const data = useLiveQuery(async () => {
    if (!valid) return null
    const [cur, prev] = await Promise.all([loadMonth(key), loadMonth(prevKey)])
    return { ...cur, prevTotal: prev.orders.filter(countsAsSpending).reduce((s, o) => s + o.totalCents, 0) }
  }, [key])

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('date')

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const all = itemRows(data.orders, data.items).filter((r) => !q || r.title.toLowerCase().includes(q))
    return all.sort((a, b) =>
      sort === 'price'
        ? (b.lineCents ?? -1) - (a.lineCents ?? -1)
        : b.date.localeCompare(a.date) || a.orderId.localeCompare(b.orderId),
    )
  }, [data, query, sort])

  if (!valid) return <Navigate to="/uebersicht" replace />
  if (!data) return null

  const spending = data.orders.filter(countsAsSpending)
  const total = spending.reduce((s, o) => s + o.totalCents, 0)
  const delta = total - data.prevTotal

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/monat/${prevKey}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(key)}</h2>
          <Link className="round-btn" to={`/monat/${shiftMonth(key, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <p className="hero-label">Amazon-Ausgaben</p>
        <p className="hero-number">{formatCents(total)}</p>
        <p className="hero-sub">
          <span className="pill">{spending.length} Bestellungen</span>
          {data.prevTotal > 0 && (
            <span className="pill">
              <Icon name={delta > 0 ? 'up' : 'down'} size={14} />
              {delta >= 0 ? '+' : '−'}{formatCents(Math.abs(delta))} zum Vormonat
            </span>
          )}
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Artikel ({rows.length})</h2>
          <select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="date">Neueste zuerst</option>
            <option value="price">Teuerste zuerst</option>
          </select>
        </div>
        <div className="search-wrap">
          <Icon name="search" size={18} />
          <input
            type="search"
            className="search"
            placeholder="Artikel suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {rows.length === 0 ? (
          <p className="muted empty-hint">{query ? 'Keine Treffer.' : 'In diesem Monat gibt es keine Bestellungen.'}</p>
        ) : (
          <ul className="rows">{rows.map((r) => <ItemLine key={r.id} row={r} />)}</ul>
        )}
      </section>
    </>
  )
}

function ItemLine({ row }: { row: ItemRow }) {
  const inactive = row.status === 'cancelled' || row.status === 'returned'
  return (
    <li className={inactive ? 'inactive' : ''}>
      <div className="row-main">
        <span className="row-title">{row.title}</span>
        <span className="row-sub muted">
          {formatDay(row.date)}
          {row.quantity > 1 && ` · ${row.quantity} × ${row.unitPriceCents !== null ? formatCents(row.unitPriceCents) : '–'}`}
          {inactive && <span className="badge">{STATUS_LABEL[row.status as keyof typeof STATUS_LABEL]}</span>}
        </span>
      </div>
      <span className="row-amount">{row.lineCents !== null ? formatCents(row.lineCents) : '–'}</span>
    </li>
  )
}
