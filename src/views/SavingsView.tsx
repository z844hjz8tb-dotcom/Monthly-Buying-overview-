import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { formatDay, formatMonth, shiftMonth } from '../stats/spending'
import { loadMonthOverview } from '../finance/monthData'
import { accountIcon, useFinanceRefs } from '../finance/useFinance'

/** "Gespart" im Monat: jede Sparbuchung mit Herkunftskonto und Ziel, gruppiert nach Ziel. */
export function SavingsView() {
  const { month = '' } = useParams()
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const refs = useFinanceRefs()
  const data = useLiveQuery(async () => (valid ? (await loadMonthOverview(month)).overview : null), [month])

  if (!valid) return <Navigate to="/start" replace />
  if (!data || !refs) return null
  const name = (id?: string) => (id ? refs.accountById.get(id)?.name ?? id : undefined)
  const groups = new Map<string, typeof data.savingEntries>()
  for (const e of data.savingEntries) groups.set(e.toAccountId ?? '', [...(groups.get(e.toAccountId ?? '') ?? []), e])
  const sorted = [...groups.entries()].sort((a, b) => sum(b[1]) - sum(a[1]))
  const open = groups.get('')?.length ?? 0

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/gespart/${shiftMonth(month, -1)}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(month)}</h2>
          <Link className="round-btn" to={`/gespart/${shiftMonth(month, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <p className="hero-label">Gespart</p>
        <p className="hero-number">{formatCents(data.savingCents)}</p>
        <p className="hero-sub">
          <span className="pill">{data.savingEntries.length} {data.savingEntries.length === 1 ? 'Sparbuchung' : 'Sparbuchungen'}</span>
          {data.incomeCents > 0 && data.savingCents > 0 && <span className="pill">Sparquote {Math.round((data.savingCents / data.incomeCents) * 100)} %</span>}
        </p>
        <div className="hero-actions">
          <Link className="button on-hero ghost" to={`/start/${month}`}><Icon name="left" size={18} />Übersicht</Link>
        </div>
      </section>

      {data.savingEntries.length === 0 && (
        <section className="card"><p className="muted empty-hint">In diesem Monat nichts gespart.</p></section>
      )}

      {sorted.map(([to, list]) => {
        const acc = to ? refs.accountById.get(to) : undefined
        return (
          <section className="card" key={to || 'offen'}>
            <div className="card-head">
              <h2>{to ? `→ ${name(to)}` : 'Ziel noch offen'}</h2>
              <span className="row-amount">{formatCents(sum(list))}</span>
            </div>
            <ul className="rows">
              {list.map((e) => (
                <li key={e.txId}>
                  <Link to={`/buchung/${e.txId}`} className="row-link">
                    <span className="avatar cat" style={{ background: 'var(--cat-1)' }} aria-hidden="true">
                      <Icon name={acc ? accountIcon(acc.kind) : 'piggy'} size={20} />
                    </span>
                    <div className="row-main">
                      <span className="row-title">{e.title || '—'}</span>
                      <span className="row-sub muted">{formatDay(e.date)} · von {name(e.fromAccountId)}{e.cents < 0 && ' · Entnahme'}</span>
                    </div>
                    <span className={`row-amount ${e.cents < 0 ? 'amount-in' : ''}`}>{e.cents < 0 ? '−' : ''}{formatCents(Math.abs(e.cents))}</span>
                    <Icon name="right" size={18} className="chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {open > 0 && (
        <section className="card">
          <p className="muted small">
            Bei „Ziel noch offen“ weiß die App noch nicht, auf welches deiner Konten das Geld ging. Buchung antippen, Zielkonto wählen und
            „Für alle … merken“ – dann ordnet die App gleiche Buchungen künftig selbst zu. Fehlt das Konto noch, lege es unter Konten an.
          </p>
        </section>
      )}
    </>
  )
}

const sum = (list: { cents: number }[]) => list.reduce((s, e) => s + e.cents, 0)
