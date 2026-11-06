import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { formatMonth, monthKey, shiftMonth } from '../stats/spending'
import { loadMonthOverview } from '../finance/monthData'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'
import { isSavingsKind } from '../finance/defaults'

const currentMonth = () => monthKey(new Date().toISOString())

/** Startbildschirm: alle Ausgaben des Monats nach Kategorie, über alle Quellen. */
export function HomeView() {
  const { month } = useParams()
  const [fallback] = useState(currentMonth)
  const key = month ?? fallback
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(key)
  const refs = useFinanceRefs()

  const data = useLiveQuery(async () => {
    if (!valid) return null
    const prevKey = shiftMonth(key, -1)
    const load = async (k: string) => (await loadMonthOverview(k)).overview
    const [cur, prev] = await Promise.all([load(key), load(prevKey)])
    return { cur, prev }
  }, [key])

  if (!valid) return <Navigate to="/start" replace />
  if (!data || !refs) return null
  const { cur, prev } = data
  const delta = cur.expenseCents - prev.expenseCents
  const max = Math.max(1, ...cur.byCategory.map((c) => c.cents))
  const empty = cur.byCategory.length === 0

  const sources = [
    ...refs.visibleAccounts.filter((a) => !isSavingsKind(a.kind)).map((a) => ({ id: a.id, name: a.name, icon: accountIcon(a.kind), to: `/konto/${a.id}/${key}` })),
    { id: 'amazon', name: 'Amazon', icon: 'package' as const, to: `/monat/${key}` },
    { id: 'bons', name: 'Kassenbons', icon: 'receipt' as const, to: `/bons/${key}` },
  ]

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/start/${shiftMonth(key, -1)}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(key)}</h2>
          <Link className="round-btn" to={`/start/${shiftMonth(key, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <div className="hero-split">
          <div>
            <p className="hero-label">Ausgaben</p>
            <p className="hero-number">{formatCents(cur.expenseCents)}</p>
          </div>
          {cur.savingCents !== 0 && (
            <Link to={`/gespart/${key}`} className="saved" aria-label="Gespart – Details">
              <p className="hero-label"><Icon name="piggy" size={14} />Gespart</p>
              <p className="saved-number">{formatCents(cur.savingCents)}</p>
            </Link>
          )}
        </div>
        <p className="hero-sub">
          {cur.incomeCents > 0 && <span className="pill"><Icon name="income" size={14} />Einnahmen {formatCents(cur.incomeCents)}</span>}
          {cur.savingCents > 0 && cur.incomeCents > 0 && (
            <span className="pill">Sparquote {Math.round((cur.savingCents / cur.incomeCents) * 100)} %</span>
          )}
          {prev.expenseCents > 0 && (
            <span className="pill">
              <Icon name={delta > 0 ? 'up' : 'down'} size={14} />
              {delta >= 0 ? '+' : '−'}{formatCents(Math.abs(delta))} zum Vormonat
            </span>
          )}
        </p>
        <div className="hero-actions">
          <Link className="button on-hero" to="/buchung/neu"><Icon name="plus" size={18} />Buchung</Link>
          <Link className="button on-hero ghost" to="/bon/neu"><Icon name="receipt" size={18} />Bon</Link>
        </div>
      </section>

      {empty ? (
        <section className="card empty">
          <div className="empty-icon"><Icon name="wallet" size={28} /></div>
          <h2>Noch keine Ausgaben in diesem Monat</h2>
          <p className="muted">Trag eine Buchung ein, erfasse einen Bon oder importiere deine Amazon-Bestellungen. Zum Ausprobieren gibt es unter „Daten“ Beispieldaten.</p>
        </section>
      ) : (
        <section className="card">
          <h2>Nach Kategorie</h2>
          <ul className="rows top-list">
            {cur.byCategory.map((c) => {
              const cat = refs.categoryById.get(c.categoryId)
              return (
                <li key={c.categoryId}>
                  <Link to={`/kategorie/${c.categoryId}/${key}`} className="row-link">
                  <span className="avatar cat" style={{ background: categoryColor(cat) }} aria-hidden="true">
                    <Icon name={categoryIcon(cat)} size={20} />
                  </span>
                  <div className="row-main">
                    <span className="row-title">{cat?.name ?? c.categoryId}</span>
                    <span className="row-sub muted">{c.count} {c.count === 1 ? 'Ausgabe' : 'Ausgaben'} · {Math.round((c.cents / cur.expenseCents) * 100)} %</span>
                  </div>
                  <span className="row-amount">{formatCents(c.cents)}</span>
                  <Icon name="right" size={18} className="chevron" />
                  </Link>
                  <span className="share" style={{ marginLeft: 54 }} aria-hidden="true">
                    <span style={{ width: `${Math.max(3, (c.cents / max) * 100)}%`, background: categoryColor(cat) }} />
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {Object.keys(cur.savingByAccount).length > 0 && (
        <section className="card">
          <Link to={`/gespart/${key}`} className="card-head">
            <h2>Gespart</h2>
            <span className="row-amount">{formatCents(cur.savingCents)} <Icon name="right" size={16} /></span>
          </Link>
          <ul className="rows">
            {Object.entries(cur.savingByAccount).sort((a, b) => b[1] - a[1]).map(([accId, cents]) => {
              const acc = refs.accountById.get(accId)
              return (
                <li key={accId}>
                  <Link to={`/gespart/${key}`} className="row-link">
                    <span className="avatar cat" style={{ background: 'var(--cat-1)' }} aria-hidden="true"><Icon name={acc ? accountIcon(acc.kind) : 'piggy'} size={20} /></span>
                    <div className="row-main">
                      <span className="row-title">{acc?.name ?? 'Ziel noch offen'}</span>
                      <span className="row-sub muted">{cents < 0 ? 'Entnahme' : 'eingezahlt'}</span>
                    </div>
                    <span className="row-amount">{cents < 0 ? '−' : ''}{formatCents(Math.abs(cents))}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Woher</h2>
        <div className="tile-grid">
          {sources.map((s) => (
            <Link key={s.id} to={s.to} className="tile">
              <Icon name={s.icon} size={20} />
              <span className="muted small">{s.name}</span>
              <span className="tile-value">{formatCents(cur.bySource[s.id] ?? 0)}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
