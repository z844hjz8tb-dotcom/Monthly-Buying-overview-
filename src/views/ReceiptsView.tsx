import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { ReceiptLinkSuggestions } from '../components/ReceiptLinks'
import { storeColor } from '../lib/look'
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
    const paidWith = new Map<number, string>()
    for (const t of await db.transactions.where('linkedReceiptId').anyOf([...ids]).toArray()) paidWith.set(t.linkedReceiptId!, t.accountId)
    return {
      paidWith,
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
  const stores = new Set(data.receipts.map((r) => r.store)).size
  const maxValue = Math.max(1, ...sorted.map((t) => (rank === 'count' ? t.count : t.spendCents)))

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/bons/${shiftMonth(key, -1)}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(key)}</h2>
          <Link className="round-btn" to={`/bons/${shiftMonth(key, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <p className="hero-label">Einkäufe im Laden</p>
        <p className="hero-number">{formatCents(total)}</p>
        <p className="hero-sub">
          <span className="pill">{data.receipts.length} Bons</span>
          {stores > 0 && <span className="pill">{stores} {stores === 1 ? 'Laden' : 'Läden'}</span>}
        </p>
        <div className="hero-actions">
          <Link className="button on-hero" to="/bon/neu"><Icon name="plus" size={18} />Bon erfassen</Link>
        </div>
      </section>

      <ReceiptLinkSuggestions />

      {data.openCount > 0 && (
        <Link to="/zuordnen" className="card reminder">
          <span className="reminder-icon"><Icon name="link" /></span>
          <span className="reminder-text">
            <strong>{data.openCount} Artikel zuordnen</strong>
            <span className="muted small">Damit gleiche Artikel aus verschiedenen Läden zusammen zählen.</span>
          </span>
          <Icon name="right" className="chevron" />
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
            {shown.map((t, i) => (
              <TopLine key={t.key} rank={i + 1} item={t} share={(rank === 'count' ? t.count : t.spendCents) / maxValue} />
            ))}
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
          <div className="empty-hint">
            <div className="empty-icon"><Icon name="receipt" size={28} /></div>
            <p className="muted">In diesem Monat noch keine Bons.</p>
          </div>
        ) : (
          <ul className="rows">
            {data.receipts.map((r) => (
              <li key={r.id}>
                <Link to={`/bon/${r.id}`} className="row-link">
                  <span className="avatar store" style={{ background: storeColor(r.store) }} aria-hidden="true">{r.store.slice(0, 1).toUpperCase()}</span>
                  <div className="row-main">
                    <span className="row-title">
                      {r.store}
                      {data.paidWith.has(r.id!) && <span className="badge open" title="mit Kontobuchung verknüpft"><Icon name="link" size={12} /> Konto</span>}
                      {r.paidCash && <span className="badge">bar</span>}
                    </span>
                    <span className="row-sub muted">{formatDay(r.date)} · {data.lineCount.get(r.id!) ?? 0} Artikel</span>
                  </div>
                  <span className="row-amount">{formatCents(r.totalCents)}</span>
                  <Icon name="right" size={18} className="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function TopLine({ rank, item, share }: { rank: number; item: TopProduct; share: number }) {
  const cheapest = item.stores[0]
  const multiStore = item.stores.length > 1
  return (
    <li>
      <span className="rank" aria-hidden="true">{rank}</span>
      <div className="row-main">
        <span className="row-title">{item.name}</span>
        <span className="row-sub muted">
          {item.count}× gekauft
          {multiStore
            ? ` · am günstigsten bei ${cheapest.store} (${formatCents(cheapest.unitCents)})`
            : ` · ${cheapest.store}, ${formatCents(cheapest.unitCents)}/Stk`}
        </span>
        {!item.assigned && <span><span className="badge open">nicht zugeordnet</span></span>}
      </div>
      <span className="row-amount">{formatCents(item.spendCents)}</span>
      <span className="share" aria-hidden="true"><span style={{ width: `${Math.max(4, share * 100)}%` }} /></span>
    </li>
  )
}
