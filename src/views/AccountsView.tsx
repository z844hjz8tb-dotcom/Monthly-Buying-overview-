import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account, type Transaction } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents, parseEuroToCents } from '../lib/money'
import { formatDay, formatMonth, monthKey, shiftMonth } from '../stats/spending'
import { ACCOUNT_KINDS, isSavingsKind } from '../finance/defaults'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'
import { reclassifyImported } from '../import/bank'
import { loadItemSummaries } from '../finance/purchases'

const currentMonth = () => monthKey(new Date().toISOString())
type Refs = NonNullable<ReturnType<typeof useFinanceRefs>>

/** Liste der Konten: Alltag (Zahlungskonten) und Sparen & Anlagen. */
export function AccountsView() {
  const [key] = useState(currentMonth)
  const refs = useFinanceRefs()
  const sums = useLiveQuery(async () => {
    const rows = await db.transactions.where('date').startsWith(key).toArray()
    const out = new Map<string, { outCents: number; inCents: number; count: number }>()
    for (const t of rows) {
      const s = out.get(t.accountId) ?? { outCents: 0, inCents: 0, count: 0 }
      // nur echte Ausgaben/Einnahmen; Umbuchungen und Sparen zählen hier nicht
      if (t.kind === 'expense') s.outCents += -t.amountCents
      else if (t.kind === 'income') s.inCents += t.amountCents
      s.count++
      out.set(t.accountId, s)
    }
    return out
  }, [key])
  if (!refs || !sums) return null

  const daily = refs.visibleAccounts.filter((a) => !isSavingsKind(a.kind))
  const savings = refs.visibleAccounts.filter((a) => isSavingsKind(a.kind))
  const savingsTotal = savings.reduce((s, a) => s + (a.balanceCents ?? 0), 0)
  const hidden = refs.accounts.filter((a) => a.hidden)

  const row = (a: Account) => {
    const s = sums.get(a.id)
    const sub = [
      isSavingsKind(a.kind) && a.balanceCents !== undefined ? `Stand ${formatCents(a.balanceCents)}${a.balanceDate ? ` (${formatDay(a.balanceDate)})` : ''}` : null,
      s ? `${s.count} ${s.count === 1 ? 'Buchung' : 'Buchungen'} im ${formatMonth(key).split(' ')[0]}` : null,
      a.countsAsSaving ? 'zählt als Sparen' : null,
    ].filter(Boolean)
    return (
      <li key={a.id}>
        <Link to={`/konto/${a.id}/${key}`} className="row-link">
          <span className="avatar" aria-hidden="true"><Icon name={accountIcon(a.kind)} /></span>
          <div className="row-main">
            <span className="row-title">{a.name}</span>
            <span className="row-sub muted">{sub.join(' · ') || ACCOUNT_KINDS.find((k) => k.id === a.kind)?.name}</span>
          </div>
          {!isSavingsKind(a.kind) && s?.outCents ? <span className="row-amount">−{formatCents(s.outCents)}</span> : null}
          <Icon name="right" size={18} className="chevron" />
        </Link>
      </li>
    )
  }

  return (
    <>
      <section className="card">
        <h2>Alltag</h2>
        <ul className="rows">{daily.map(row)}</ul>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Sparen & Anlagen</h2>
          {savingsTotal > 0 && <span className="row-amount">{formatCents(savingsTotal)}</span>}
        </div>
        {savings.length ? <ul className="rows">{savings.map(row)}</ul> : <p className="muted small">Noch keine Spar- oder Depotkonten. Lege z. B. dein Extra-Konto, Depot oder Kinderkonto an.</p>}
      </section>
      <div className="button-row">
        <Link className="button" to="/konto-neu"><Icon name="plus" size={18} />Konto hinzufügen</Link>
        <Link className="button secondary" to="/buchung/neu?art=umbuchung"><Icon name="swap" size={18} />Umbuchung</Link>
        <Link className="button secondary" to="/import/bank"><Icon name="download" size={18} />Umsätze importieren</Link>
      </div>
      {hidden.length > 0 && (
        <details className="card">
          <summary>{hidden.length} ausgeblendete {hidden.length === 1 ? 'Konto' : 'Konten'}</summary>
          <ul className="rows">{hidden.map(row)}</ul>
        </details>
      )}
    </>
  )
}

/** Buchungen eines Kontos in einem Monat. */
export function AccountView() {
  const { id = '', month } = useParams()
  const [fallback] = useState(currentMonth)
  const key = month ?? fallback
  const refs = useFinanceRefs()
  const data = useLiveQuery(async () => {
    const rows = (await db.transactions.where('date').startsWith(key).filter((t) => t.accountId === id).toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.id! - a.id!)
    return { rows, items: await loadItemSummaries(db, rows) }
  }, [id, key])
  if (!refs || !data) return null
  const { rows, items } = data
  const account = refs.accountById.get(id)
  if (!account) return <Navigate to="/konten" replace />
  const savingsAccount = isSavingsKind(account.kind)
  const outCents = rows.filter((t) => t.kind === 'expense').reduce((s, t) => s - t.amountCents, 0)
  const inCents = rows.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0)

  return (
    <>
      <section className="hero">
        <nav className="month-switch" aria-label="Monat wechseln">
          <Link className="round-btn" to={`/konto/${id}/${shiftMonth(key, -1)}`} aria-label="Vormonat"><Icon name="left" /></Link>
          <h2>{formatMonth(key)}</h2>
          <Link className="round-btn" to={`/konto/${id}/${shiftMonth(key, 1)}`} aria-label="Folgemonat"><Icon name="right" /></Link>
        </nav>
        <p className="hero-label">{account.name}</p>
        {savingsAccount && account.balanceCents !== undefined ? (
          <>
            <p className="hero-number">{formatCents(account.balanceCents)}</p>
            <p className="hero-sub">
              <span className="pill">Stand{account.balanceDate ? ` ${formatDay(account.balanceDate)}` : ''}</span>
              {inCents > 0 && <span className="pill">+{formatCents(inCents)} im Monat</span>}
            </p>
          </>
        ) : (
          <>
            <p className="hero-number">{formatCents(savingsAccount ? inCents : outCents)}</p>
            <p className="hero-sub"><span className="pill">{savingsAccount ? 'Eingang im Monat' : `${rows.length} ${rows.length === 1 ? 'Buchung' : 'Buchungen'}`}</span></p>
          </>
        )}
        <div className="hero-actions">
          <Link className="button on-hero" to={`/buchung/neu?konto=${id}`}><Icon name="plus" size={18} />Buchung</Link>
          <Link className="button on-hero ghost" to={`/buchung/neu?art=umbuchung&konto=${id}`}><Icon name="swap" size={18} />Umbuchung</Link>
          <Link className="button on-hero ghost" to={`/konto/${id}/bearbeiten`} aria-label="Konto bearbeiten"><Icon name="pencil" size={18} /></Link>
        </div>
      </section>
      <section className="card">
        <h2>Buchungen</h2>
        {rows.length === 0 ? (
          <p className="muted empty-hint">In diesem Monat keine Buchungen.</p>
        ) : (
          <ul className="rows">{rows.map((t) => <TransactionRow key={t.id} t={t} refs={refs} items={items.get(t.id!)} />)}</ul>
        )}
      </section>
    </>
  )
}

function TransactionRow({ t, refs, items }: { t: Transaction; refs: Refs; items?: string }) {
  const cat = t.categoryId ? refs.categoryById.get(t.categoryId) : undefined
  const isMove = t.kind === 'transfer' || t.kind === 'saving'
  const other = t.transferAccountId ? refs.accountById.get(t.transferAccountId) : undefined
  const label = isMove
    ? `${t.kind === 'saving' ? 'Sparen' : 'Umbuchung'} ${t.amountCents < 0 ? '→' : '←'} ${other?.name ?? 'anderes Konto'}`
    : t.kind === 'income' ? 'Einnahme' : (cat?.name ?? 'Ohne Kategorie')
  return (
    <li>
      <Link to={`/buchung/${t.id}`} className="row-link">
        <span className="avatar cat" style={{ background: isMove ? (t.kind === 'saving' ? 'var(--cat-1)' : 'var(--cat-10)') : categoryColor(cat) }} aria-hidden="true">
          <Icon name={isMove ? (t.kind === 'saving' ? 'piggy' : 'swap') : t.kind === 'income' ? 'income' : categoryIcon(cat)} size={20} />
        </span>
        <div className="row-main">
          <span className="row-title">{t.counterparty || '—'}</span>
          <span className="row-sub muted">{formatDay(t.date)} · {label}{t.viaTransactionId !== undefined && ' · über PayPal'}</span>
          {items && <span className="row-sub muted row-items"><Icon name="package" size={12} /><span>{items}</span></span>}
        </div>
        <span className={`row-amount ${isMove ? 'amount-transfer' : t.amountCents > 0 ? 'amount-in' : 'amount-out'}`}>
          {t.amountCents > 0 ? '+' : '−'}{formatCents(Math.abs(t.amountCents))}
        </span>
      </Link>
    </li>
  )
}

const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',')
const today = () => new Date().toISOString().slice(0, 10)

/** Konto anlegen oder bearbeiten. */
export function AccountEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === undefined
  const [loaded, setLoaded] = useState(isNew)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Account['kind']>('savings')
  const [iban, setIban] = useState('')
  const [matchNames, setMatchNames] = useState('')
  const [countsAsSaving, setCountsAsSaving] = useState(false)
  const [savingTouched, setSavingTouched] = useState(false)
  const [balance, setBalance] = useState('')
  const [balanceDate, setBalanceDate] = useState(today)
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usage = useLiveQuery(async () => (id ? db.transactions.where('accountId').equals(id).count() : 0), [id])

  useEffect(() => {
    if (isNew) return
    db.accounts.get(id!).then((a) => {
      if (!a) return navigate('/konten', { replace: true })
      setName(a.name)
      setKind(a.kind)
      setIban(a.iban ?? '')
      setMatchNames((a.matchNames ?? []).join(', '))
      setCountsAsSaving(!!a.countsAsSaving)
      setSavingTouched(true)
      setBalance(a.balanceCents !== undefined ? centsToInput(a.balanceCents) : '')
      setBalanceDate(a.balanceDate ?? today())
      setHidden(!!a.hidden)
      setLoaded(true)
    })
  }, [id, isNew, navigate])

  if (!loaded) return null

  function pickKind(k: Account['kind']) {
    setKind(k)
    // Standard: Depot zählt als Sparen, sonst nicht – solange der Nutzer den Schalter nicht selbst gesetzt hat
    if (!savingTouched) setCountsAsSaving(k === 'depot')
  }

  async function save() {
    setError(null)
    if (!name.trim()) return setError('Bitte einen Namen angeben.')
    const cents = balance.trim() ? parseEuroToCents(balance) : null
    if (balance.trim() && cents === null) return setError('Der Stand ist kein gültiger Betrag.')
    const row: Account = {
      id: id ?? `k-${Date.now().toString(36)}`,
      name: name.trim(),
      kind,
      order: isNew ? 100 + (await db.accounts.count()) : (await db.accounts.get(id!))!.order,
      iban: iban.replace(/\s+/g, '').toUpperCase() || undefined,
      matchNames: matchNames.split(',').map((m) => m.trim()).filter(Boolean),
      countsAsSaving: countsAsSaving || undefined,
      balanceCents: cents ?? undefined,
      balanceDate: cents !== null ? balanceDate : undefined,
      hidden: hidden || undefined,
    }
    if (!row.matchNames?.length) delete row.matchNames
    await db.accounts.put(row)
    // geänderte Erkennung gleich auf bereits importierte Buchungen anwenden
    await reclassifyImported(db)
    if (isNew) navigate(`/konto/${row.id}`, { replace: true })
    else navigate(-1)
  }

  async function remove() {
    if (!id) return
    if (usage) return setError(`Das Konto hat ${usage} Buchungen und kann nicht gelöscht werden. Du kannst es stattdessen ausblenden.`)
    if (!confirm('Dieses Konto löschen?')) return
    await db.accounts.delete(id)
    navigate('/konten', { replace: true })
  }

  return (
    <>
      <section className="card">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. ING Extra-Konto, Depot Kinder, Uptevia" autoFocus={isNew} />
        </label>
        <div className="field">
          <span>Art</span>
          <div className="chips">
            {ACCOUNT_KINDS.map((k) => (
              <button key={k.id} type="button" className={`chip${kind === k.id ? ' active' : ''}`} onClick={() => pickKind(k.id)}>
                <Icon name={accountIcon(k.id)} size={16} />{k.name}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>IBAN (optional, für die automatische Erkennung von Umbuchungen)</span>
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE…" autoCapitalize="characters" />
        </label>
        <label className="field">
          <span>Erkennen an (Empfänger-Namen bei Überweisungen, mit Komma getrennt)</span>
          <input value={matchNames} onChange={(e) => setMatchNames(e.target.value)} placeholder="z. B. Notgroschen, Kleingeld Plus, Lena Muster" />
        </label>
      </section>

      <section className="card">
        <label className="toggle-row">
          <span>
            <strong>Geld hierhin zählt als Sparen</strong>
            <span className="muted small">Erscheint in der Übersicht als „Gespart“ statt als Umbuchung. Sinnvoll für Depots und z. B. Kinderkonten.</span>
          </span>
          <input type="checkbox" role="switch" checked={countsAsSaving} onChange={(e) => { setCountsAsSaving(e.target.checked); setSavingTouched(true) }} />
        </label>
      </section>

      <section className="card">
        <h2>Stand (optional)</h2>
        <p className="muted small">Für Konten ohne Buchungen, z. B. ein Aktienkonto wie Uptevia. Wird in „Sparen & Anlagen“ zusammengezählt.</p>
        <div className="field-row">
          <label className="field">
            <span>Betrag</span>
            <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
          </label>
          <label className="field">
            <span>Stand vom</span>
            <input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} />
          </label>
        </div>
      </section>

      {!isNew && (
        <section className="card">
          <label className="toggle-row">
            <span>
              <strong>Ausblenden</strong>
              <span className="muted small">Taucht nicht mehr in Listen und Auswahl auf, Buchungen bleiben erhalten.</span>
            </span>
            <input type="checkbox" role="switch" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          </label>
        </section>
      )}

      {error && <p className="toast error" role="alert">{error}</p>}
      <div className="button-row sticky-actions">
        <button onClick={save}><Icon name="check" size={18} />Speichern</button>
        <button className="secondary" onClick={() => navigate(-1)}>Abbrechen</button>
        {!isNew && <button className="danger" onClick={remove} aria-label="Konto löschen"><Icon name="trash" size={18} /></button>}
      </div>
    </>
  )
}
