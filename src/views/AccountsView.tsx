import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Transaction } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { formatDay, formatMonth, monthKey, shiftMonth } from '../stats/spending'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'

const currentMonth = () => monthKey(new Date().toISOString())

/** Liste der Konten mit Summen des aktuellen Monats. */
export function AccountsView() {
  const [key] = useState(currentMonth)
  const refs = useFinanceRefs()
  const sums = useLiveQuery(async () => {
    const rows = await db.transactions.where('date').startsWith(key).toArray()
    const out = new Map<string, { outCents: number; inCents: number; count: number }>()
    for (const t of rows) {
      const s = out.get(t.accountId) ?? { outCents: 0, inCents: 0, count: 0 }
      if (t.amountCents < 0) s.outCents += -t.amountCents
      else s.inCents += t.amountCents
      s.count++
      out.set(t.accountId, s)
    }
    return out
  }, [key])
  if (!refs || !sums) return null

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Konten</h2>
          <span className="muted small">{formatMonth(key)}</span>
        </div>
        <ul className="rows">
          {refs.accounts.map((a) => {
            const s = sums.get(a.id)
            return (
              <li key={a.id}>
                <Link to={`/konto/${a.id}/${key}`} className="row-link">
                  <span className="avatar" aria-hidden="true"><Icon name={accountIcon(a.kind)} /></span>
                  <div className="row-main">
                    <span className="row-title">{a.name}</span>
                    <span className="row-sub muted">{s ? `${s.count} Buchungen` : 'Noch keine Buchungen'}{s?.inCents ? ` · +${formatCents(s.inCents)}` : ''}</span>
                  </div>
                  <span className="row-amount">{s ? `−${formatCents(s.outCents)}` : ''}</span>
                  <Icon name="right" size={18} className="chevron" />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
      <section className="card">
        <h2>Umsätze importieren</h2>
        <p className="muted small">Der Import von ING-, Amex- und PayPal-Umsätzen folgt in den nächsten Schritten. Bis dahin kannst du Buchungen von Hand eintragen.</p>
        <div className="button-row">
          <Link className="button" to="/buchung/neu"><Icon name="plus" size={18} />Buchung eintragen</Link>
        </div>
      </section>
    </>
  )
}

/** Buchungen eines Kontos in einem Monat. */
export function AccountView() {
  const { id = '', month } = useParams()
  const [fallback] = useState(currentMonth)
  const key = month ?? fallback
  const refs = useFinanceRefs()
  const rows = useLiveQuery(
    async () => (await db.transactions.where('date').startsWith(key).filter((t) => t.accountId === id).toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.id! - a.id!),
    [id, key],
  )
  if (!refs || !rows) return null
  const account = refs.accountById.get(id)
  if (!account) return <Navigate to="/konten" replace />
  const outCents = rows.filter((t) => t.amountCents < 0 && t.kind !== 'transfer').reduce((s, t) => s - t.amountCents, 0)

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/konto/${id}/${shiftMonth(key, -1)}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(key)}</h2>
          <Link className="round-btn" to={`/konto/${id}/${shiftMonth(key, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <p className="hero-label">{account.name}</p>
        <p className="hero-number">{formatCents(outCents)}</p>
        <p className="hero-sub"><span className="pill">{rows.length} Buchungen</span></p>
        <div className="hero-actions">
          <Link className="button on-hero" to={`/buchung/neu?konto=${id}`}><Icon name="plus" size={18} />Buchung</Link>
        </div>
      </section>
      <section className="card">
        <h2>Buchungen</h2>
        {rows.length === 0 ? (
          <p className="muted empty-hint">In diesem Monat keine Buchungen.</p>
        ) : (
          <ul className="rows">{rows.map((t) => <TransactionRow key={t.id} t={t} refs={refs} />)}</ul>
        )}
      </section>
    </>
  )
}

function TransactionRow({ t, refs }: { t: Transaction; refs: NonNullable<ReturnType<typeof useFinanceRefs>> }) {
  const cat = t.categoryId ? refs.categoryById.get(t.categoryId) : undefined
  const isTransfer = t.kind === 'transfer'
  return (
    <li>
      <Link to={`/buchung/${t.id}`} className="row-link">
        <span className="avatar cat" style={{ background: isTransfer ? 'var(--cat-10)' : categoryColor(cat) }} aria-hidden="true">
          <Icon name={isTransfer ? 'swap' : t.kind === 'income' ? 'income' : categoryIcon(cat)} size={20} />
        </span>
        <div className="row-main">
          <span className="row-title">{t.counterparty || '—'}</span>
          <span className="row-sub muted">{formatDay(t.date)} · {isTransfer ? 'Umbuchung' : t.kind === 'income' ? 'Einnahme' : cat?.name ?? 'Ohne Kategorie'}</span>
        </div>
        <span className={`row-amount ${isTransfer ? 'amount-transfer' : t.amountCents > 0 ? 'amount-in' : 'amount-out'}`}>
          {t.amountCents > 0 ? '+' : '−'}{formatCents(Math.abs(t.amountCents))}
        </span>
      </Link>
    </li>
  )
}
