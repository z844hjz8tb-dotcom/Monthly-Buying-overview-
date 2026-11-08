import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { formatDay, formatMonth, shiftMonth } from '../stats/spending'
import { loadMonthOverview } from '../finance/monthData'
import { itemSummary, loadItemSummaries } from '../finance/purchases'
import { categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'
import type { OverviewEntry } from '../stats/overview'

/** Alle gezählten Ausgaben einer Kategorie in einem Monat (aus der Übersicht angetippt). */
export function CategoryView() {
  const { id = '', month = '' } = useParams()
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const refs = useFinanceRefs()

  const data = useLiveQuery(async () => {
    if (!valid) return null
    const { overview, transactions } = await loadMonthOverview(month)
    const entries = overview.entries.filter((e) => e.categoryId === id)
    // Zusatzzeile je Eintrag: was gekauft wurde
    const txIds = new Set(entries.flatMap((e) => (e.ref.type === 'tx' ? [e.ref.id] : [])))
    const txItems = await loadItemSummaries(db, transactions.filter((t) => txIds.has(t.id!)))
    const orderIds = entries.flatMap((e) => (e.ref.type === 'order' ? [e.ref.id] : []))
    const orderItems = orderIds.length ? await db.orderItems.where('orderId').anyOf(orderIds).toArray() : []
    const receiptIds = entries.flatMap((e) => (e.ref.type === 'receipt' ? [e.ref.id] : []))
    const lines = receiptIds.length ? await db.receiptLines.where('receiptId').anyOf(receiptIds).toArray() : []
    const detail = (e: OverviewEntry) =>
      e.ref.type === 'tx' ? txItems.get(e.ref.id)
        : e.ref.type === 'order' ? itemSummary(orderItems.filter((i) => i.orderId === (e.ref as { id: string }).id).map((i) => i.title))
          : itemSummary(lines.filter((l) => l.receiptId === (e.ref as { id: number }).id && l.priceCents > 0).map((l) => l.rawText))
    return { entries: entries.map((e) => ({ ...e, detail: detail(e) })), total: entries.reduce((s, e) => s + e.cents, 0) }
  }, [id, month])

  if (!valid) return <Navigate to="/start" replace />
  if (!data || !refs) return null
  const cat = refs.categoryById.get(id)
  const sourceName = (s: string) => (s === 'amazon' ? 'Amazon' : s === 'bons' ? 'Kassenbon' : refs.accountById.get(s)?.name ?? s)
  const linkTo = (e: OverviewEntry) =>
    e.ref.type === 'tx' ? `/buchung/${e.ref.id}` : e.ref.type === 'order' ? `/monat/${e.date.slice(0, 7)}` : `/bon/${e.ref.id}`

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/kategorie/${id}/${shiftMonth(month, -1)}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(month)}</h2>
          <Link className="round-btn" to={`/kategorie/${id}/${shiftMonth(month, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <p className="hero-label">{cat?.name ?? id}</p>
        <p className="hero-number">{formatCents(data.total)}</p>
        <p className="hero-sub">
          <span className="pill">{data.entries.length} {data.entries.length === 1 ? 'Ausgabe' : 'Ausgaben'}</span>
        </p>
        <div className="hero-actions">
          <Link className="button on-hero ghost" to={`/start/${month}`}><Icon name="left" size={18} />Übersicht</Link>
        </div>
      </section>

      <section className="card">
        <h2>Gezählte Zahlungen</h2>
        {data.entries.length === 0 ? (
          <p className="muted empty-hint">In diesem Monat nichts in dieser Kategorie.</p>
        ) : (
          <ul className="rows">
            {data.entries.map((e) => (
              <li key={`${e.ref.type}-${e.ref.id}`}>
                <Link to={linkTo(e)} className="row-link">
                  <span className="avatar cat" style={{ background: categoryColor(cat) }} aria-hidden="true">
                    <Icon name={e.ref.type === 'order' ? 'package' : e.ref.type === 'receipt' ? 'receipt' : categoryIcon(cat)} size={20} />
                  </span>
                  <div className="row-main">
                    <span className="row-title">{e.title || '—'}</span>
                    <span className="row-sub muted">{formatDay(e.date)} · {sourceName(e.source)}{e.cents < 0 && ' · Erstattung'}</span>
                    {e.detail && <span className="row-sub muted row-items"><Icon name="package" size={12} /><span>{e.detail}</span></span>}
                  </div>
                  <span className={`row-amount ${e.cents < 0 ? 'amount-in' : ''}`}>{e.cents < 0 ? '+' : ''}{formatCents(Math.abs(e.cents))}</span>
                  <Icon name="right" size={18} className="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          Gezählt wird jede Zahlung einmal: Abbuchungen für PayPal, verknüpfte Bons und Amazon-Bestellungen erscheinen nur einmal. Kategorie ändern: Zahlung antippen.
        </p>
      </section>
    </>
  )
}
