import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { formatCents } from '../lib/money'
import { loadAliasMap, openGroups, topProducts, type TopProduct } from '../receipts/store'
import { formatDay, formatMonth, monthKey, shiftMonth } from '../stats/spending'

type Rank = 'count' | 'spend'
const TOP_N = 10

const currentMonth = () => monthKey(new Date().toISOString())

export function ReceiptsView() {
  const { month } = useParams()
  const [fallbackMonth] = useState(currentMonth)
  const key = month ?? fallbackMonth
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(key)
  const [rank, setRank] = useState<Rank>('count')
  const [showAll, setShowAll] = useState(false)

  const data = useLiveQuery(async () => {
    if (!valid) return null
    const [monthReceipts, allReceipts, aliases, products] = await Promise.all([
      db.receipts.where('date').startsWith(key).toArray(),
      db.receipts.toArray(),
      loadAliasMap(db),
      db.products.toArray(),
    ])
    const ids = new Set(monthReceipts.map((r) => r.id!))
    const allLines = await db.receiptLines.toArray()
    const monthLines = allLines.filter((l) => ids.has(l.receiptId))
    const lineCount = new Map<number, number>()
    for (const l of monthLines) lineCount.set(l.receiptId, (lineCount.get(l.receiptId) ?? 0) + 1)
    return {
      receipts: monthReceipts.sort((a, b) => b.date.localeCompare(a.date) || b.id! - a.id!),
      lineCount,
      top: topProducts(monthReceipts, monthLines, aliases, products),
      openCount: openGroups(allReceipts, allLines, aliases).length,
    }
  }, [key])

  if (!valid) return <Navigate to="/bons" replace />
  if (!data) return null

  const total = data.receipts.reduce((s, r) => s + r.totalCents, 0)
  const sorted = rank === 'count' ? data.top : [...data.top].sort((a, b) => b.spendCents - a.spendCents)
  const shown = showAll ? sorted : sorted.slice(0, TOP_N)

  return (
    <>
      <nav className="month-nav" aria-label="Monat wechseln">
        <Link to={`/bons/${shiftMonth(key, -1)}`} aria-label="Vormonat">‹</Link>
        <h2>{formatMonth(key)}</h2>
        <Link to={`/bons/${shiftMonth(key, 1)}`} aria-label="Folgemonat">›</Link>
      </nav>

      <section className="card">
        <p className="big-number">{formatCents(total)}</p>
        <p className="muted">{data.receipts.length} Kassenbons</p>
        <div className="button-row">
          <Link className="button" to="/bon/neu">+ Bon erfassen</Link>
        </div>
      </section>

      {data.openCount > 0 && (
        <Link to="/zuordnen" className="card reminder">
          <strong>{data.openCount} Artikel noch nicht zugeordnet</strong>
          <span className="muted">Zuordnen, damit gleiche Artikel aus verschiedenen Läden zusammen zählen.</span>
        </Link>
      )}

      {data.top.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Top-Artikel</h2>
            <div className="segmented" role="group" aria-label="Sortierung">
              <button className={rank === 'count' ? 'active' : ''} aria-pressed={rank === 'count'} onClick={() => setRank('count')}>Häufigkeit</button>
              <button className={rank === 'spend' ? 'active' : ''} aria-pressed={rank === 'spend'} onClick={() => setRank('spend')}>Ausgaben</button>
            </div>
          </div>
          <ol className="rows top-list">
            {shown.map((t, i) => <TopLine key={t.key} rank={i + 1} item={t} />)}
          </ol>
          {sorted.length > TOP_N && (
            <button className="secondary full" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Weniger anzeigen' : `Alle ${sorted.length} anzeigen`}
            </button>
          )}
        </section>
      )}

      <section className="card">
        <h2>Bons</h2>
        {data.receipts.length === 0 ? (
          <p className="muted empty-hint">In diesem Monat noch keine Bons.</p>
        ) : (
          <ul className="rows">
            {data.receipts.map((r) => (
              <li key={r.id}>
                <Link to={`/bon/${r.id}`} className="row-link">
                  <div className="row-main">
                    <span className="row-title">{r.store}{r.source === 'photo' && ' 📷'}</span>
                    <span className="row-sub muted">{formatDay(r.date)} · {data.lineCount.get(r.id!) ?? 0} Artikel</span>
                  </div>
                  <span className="row-amount">{formatCents(r.totalCents)}</span>
                  <span className="chevron" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function TopLine({ rank, item }: { rank: number; item: TopProduct }) {
  const cheapest = item.stores[0]
  const multiStore = item.stores.length > 1
  return (
    <li>
      <span className="rank" aria-hidden="true">{rank}</span>
      <div className="row-main">
        <span className={`row-title${item.assigned ? '' : ' raw'}`}>{item.name}</span>
        <span className="row-sub muted">
          {item.count}× gekauft
          {multiStore
            ? ` · am günstigsten bei ${cheapest.store} (${formatCents(cheapest.unitCents)})`
            : ` · ${cheapest.store}, ${formatCents(cheapest.unitCents)}/Stk`}
          {!item.assigned && ' · nicht zugeordnet'}
        </span>
      </div>
      <span className="row-amount">{formatCents(item.spendCents)}</span>
    </li>
  )
}
