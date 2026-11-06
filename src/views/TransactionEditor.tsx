import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db, type Account, type Transaction } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents, parseEuroToCents } from '../lib/money'
import { deleteTransaction, saveTransaction, saveTransfer, signedAmount, transferKind } from '../finance/store'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'
import { reclassifyImported } from '../import/bank'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { formatDay, itemRows, refundsByOrder } from '../stats/spending'
import { loadPurchaseDetails } from '../finance/purchases'

type Mode = 'expense' | 'income' | 'transfer'
const MODES: { id: Mode; label: string }[] = [
  { id: 'expense', label: 'Ausgabe' },
  { id: 'income', label: 'Einnahme' },
  { id: 'transfer', label: 'Umbuchung' },
]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const centsToInput = (c: number) => (Math.abs(c) / 100).toFixed(2).replace('.', ',')
const isTransferKind = (k: Transaction['kind']) => k === 'transfer' || k === 'saving'

/** Buchung von Hand anlegen oder bearbeiten – Ausgabe, Einnahme oder Umbuchung zwischen eigenen Konten. */
export function TransactionEditor() {
  const { id: idParam } = useParams()
  const routeId = idParam ? Number(idParam) : undefined
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const refs = useFinanceRefs()

  const [loaded, setLoaded] = useState(routeId === undefined)
  const [existing, setExisting] = useState<Transaction | null>(null)
  /** Bei Umbuchungen: Id der Ausgangsbuchung (die bearbeitet wird) */
  const [editId, setEditId] = useState<number | undefined>(routeId)
  const [mode, setMode] = useState<Mode>(search.get('art') === 'umbuchung' ? 'transfer' : 'expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(search.get('konto') ?? 'bar')
  const [toAccountId, setToAccountId] = useState<string | undefined>(search.get('nach') ?? undefined)
  const [date, setDate] = useState(today)
  const [counterparty, setCounterparty] = useState('')
  const [purpose, setPurpose] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [learn, setLearn] = useState(true)
  const linked = useLiveQuery(async () => {
    if (routeId === undefined) return null
    const t = await db.transactions.get(routeId)
    if (!t) return null
    const d = await loadPurchaseDetails(db, t)
    const refunds = d.order ? refundsByOrder(await db.transactions.where('linkedOrderId').equals(d.order.orderId).toArray()) : undefined
    const rows = d.order ? itemRows([d.order], d.orderItems, refunds) : []
    return { ...d, rows, refunded: d.order ? refunds?.get(d.order.orderId) ?? 0 : 0 }
  }, [routeId])

  useEffect(() => {
    if (routeId === undefined) return
    ;(async () => {
      const t = await db.transactions.get(routeId)
      if (!t) return navigate('/konten', { replace: true })
      setExisting(t)
      setAmount(centsToInput(t.amountCents))
      setDate(t.date)
      setCounterparty(t.counterparty)
      setPurpose(t.purpose ?? '')
      if (isTransferKind(t.kind)) {
        setMode('transfer')
        // immer über die Ausgangsseite bearbeiten
        const outgoing = t.amountCents < 0
        setAccountId(outgoing ? t.accountId : (t.transferAccountId ?? ''))
        setToAccountId(outgoing ? t.transferAccountId : t.accountId)
        setEditId(outgoing || t.pairId === undefined ? t.id : t.pairId)
      } else {
        setMode(t.kind === 'income' ? 'income' : 'expense')
        setAccountId(t.accountId)
        setCategoryId(t.categoryId)
      }
      setLoaded(true)
    })()
  }, [routeId, navigate])

  if (!refs || !loaded) return null
  const imported = !!existing && existing.source !== 'manual'
  /** Bei importierten Buchungen steht das Bank-Konto fest; bei Umbuchungen wählt man nur die andere Seite */
  const importOutgoing = imported && existing!.amountCents < 0
  const accounts = refs.visibleAccounts
  const from = refs.accountById.get(accountId)
  const to = toAccountId ? refs.accountById.get(toAccountId) : undefined
  const transferType = from && to ? transferKind(from, to) : undefined

  async function save() {
    setError(null)
    const cents = parseEuroToCents(amount)
    if (cents === null || cents === 0) return setError('Bitte einen Betrag eingeben.')
    try {
      if (imported) {
        await saveImported()
      } else if (mode === 'transfer') {
        if (!toAccountId) return setError('Bitte das Zielkonto wählen.')
        await saveTransfer(db, { id: editId, fromAccountId: accountId, toAccountId, date, cents, counterparty, purpose })
      } else {
        if (!counterparty.trim()) return setError(mode === 'income' ? 'Bitte angeben, von wem das Geld kommt.' : 'Bitte angeben, wofür bzw. an wen.')
        if (mode === 'expense' && !categoryId) return setError('Bitte eine Kategorie wählen.')
        await saveTransaction(db, {
          ...(existing ?? {}),
          id: editId,
          kind: mode,
          amountCents: imported ? existing!.amountCents : signedAmount(mode, cents),
          accountId,
          date,
          counterparty,
          purpose,
          categoryId,
          source: existing?.source ?? 'manual',
        })
      }
      navigate(-1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Importierte Buchung einordnen (Betrag/Konto bleiben) und auf Wunsch für alle gleichen Buchungen lernen. */
  async function saveImported() {
    const t = existing!
    const other = mode === 'transfer' ? (importOutgoing ? toAccountId : accountId) : undefined
    if (mode === 'transfer' && !other) throw new Error(importOutgoing ? 'Bitte das Zielkonto wählen.' : 'Bitte das Konto wählen, von dem das Geld kommt.')
    if (mode === 'expense' && !categoryId) throw new Error('Bitte eine Kategorie wählen.')
    const self = refs!.accountById.get(t.accountId)!
    const otherAcc = other ? refs!.accountById.get(other) : undefined
    const kind = mode === 'transfer' ? (otherAcc ? transferKind(self, otherAcc) : 'transfer') : mode
    await saveTransaction(db, {
      ...t,
      kind,
      categoryId: mode === 'expense' ? categoryId : undefined,
      transferAccountId: mode === 'transfer' ? other : undefined,
      counterparty: counterparty.trim() || t.counterparty,
      purpose,
      date,
      edited: true,
    })
    if (learn) {
      const name = t.rawCounterparty || t.counterparty
      if (mode === 'expense' && categoryId) {
        await db.categoryRules.add({ pattern: t.counterparty, field: 'counterparty', categoryId })
      } else if (mode === 'transfer' && otherAcc && name) {
        await db.accounts.update(otherAcc.id, { matchNames: [...new Set([...(otherAcc.matchNames ?? []), name])] })
      }
      await reclassifyImported(db)
    }
  }

  async function remove() {
    if (editId === undefined) return
    const msg = mode === 'transfer' ? 'Diese Umbuchung löschen? Beide Seiten werden entfernt.' : 'Diese Buchung löschen?'
    if (!confirm(msg)) return
    await deleteTransaction(db, editId)
    navigate(-1)
  }

  function pickMode(m: Mode) {
    setMode(m)
    if (!imported) return
    // Bank-Konto steht fest: bei Abgang ist es "Von", bei Eingang "Nach"
    if (m === 'transfer' && !importOutgoing) { setToAccountId(existing!.accountId); setAccountId(existing!.transferAccountId ?? '') }
    else { setAccountId(existing!.accountId); if (m === 'transfer') setToAccountId(existing!.transferAccountId) }
  }

  const accountChips = (selected: string | undefined, onPick: (id: string) => void, exclude?: string, locked = false) => (
    <div className="chips">
      {accounts.filter((a) => a.id !== exclude).map((a: Account) => (
        <button key={a.id} type="button" className={`chip${selected === a.id ? ' active' : ''}`} onClick={() => onPick(a.id)} disabled={locked}>
          <Icon name={accountIcon(a.kind)} size={16} />{a.name}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {linked && (linked.via || linked.order || linked.receipt) && (
        <section className="card">
          <h2>Was wurde gekauft?</h2>
          {linked.via && (
            <Link to={`/buchung/${linked.via.id}`} className="row-link">
              <span className="avatar" aria-hidden="true"><Icon name="card" /></span>
              <div className="row-main">
                <span className="row-title">Über PayPal: {linked.via.counterparty}</span>
                <span className="row-sub muted">{formatDay(linked.via.date)} · {formatCents(Math.abs(linked.via.amountCents))} · gezählt wird die PayPal-Zahlung</span>
              </div>
              <Icon name="right" size={18} className="chevron" />
            </Link>
          )}
          {linked.order && (
            <>
              <ul className="rows">
                {linked.rows.map((r) => {
                  const back = r.status === 'returned' || r.returnedQty >= r.quantity
                  return (
                    <li key={r.id} className={back ? 'inactive' : ''}>
                      <div className="row-main">
                        <span className="row-title">{r.title}</span>
                        <span className="row-sub muted">
                          {r.quantity > 1 && `${r.quantity} × ${r.unitPriceCents !== null ? formatCents(r.unitPriceCents) : '–'} `}
                          {r.returnedQty > 0 && <span className="badge">{r.returnedQty < r.quantity ? `${r.returnedQty} × ` : ''}zurückgeschickt</span>}
                        </span>
                      </div>
                      <span className="row-amount">{r.lineCents !== null ? formatCents(r.lineCents) : '–'}</span>
                    </li>
                  )
                })}
              </ul>
              <Link to={`/monat/${linked.order.date.slice(0, 7)}`} className="row-link">
                <span className="avatar" aria-hidden="true"><Icon name="package" /></span>
                <div className="row-main">
                  <span className="row-title">Amazon-Bestellung vom {formatDay(linked.order.date)}</span>
                  <span className="row-sub muted">{linked.order.orderId} · {formatCents(linked.order.totalCents)}{linked.refunded > 0 && ` · ${formatCents(linked.refunded)} erstattet`}</span>
                </div>
                <Icon name="right" size={18} className="chevron" />
              </Link>
            </>
          )}
          {linked.receipt && (
            <>
              <ul className="rows">
                {linked.receiptLines.slice(0, 12).map((l) => (
                  <li key={l.id}>
                    <div className="row-main">
                      <span className="row-title">{l.rawText}</span>
                      {l.quantity > 1 && <span className="row-sub muted">{l.quantity} Stück</span>}
                    </div>
                    <span className="row-amount">{formatCents(l.priceCents)}</span>
                  </li>
                ))}
              </ul>
              <Link to={`/bon/${linked.receipt.id}`} className="row-link">
                <span className="avatar" aria-hidden="true"><Icon name="receipt" /></span>
                <div className="row-main">
                  <span className="row-title">Kassenbon {linked.receipt.store}</span>
                  <span className="row-sub muted">{formatDay(linked.receipt.date)} · {formatCents(linked.receipt.totalCents)}{linked.receiptLines.length > 12 ? ` · alle ${linked.receiptLines.length} Artikel` : ''}</span>
                </div>
                <Icon name="right" size={18} className="chevron" />
              </Link>
            </>
          )}
        </section>
      )}

      <section className="card">
        <div className="segmented full-width" role="group" aria-label="Art der Buchung">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'active' : ''} aria-pressed={mode === m.id} onClick={() => pickMode(m.id)} disabled={!imported && routeId !== undefined && (m.id === 'transfer') !== (mode === 'transfer')}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Betrag</span>
          <div className="amount-field">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-label="Betrag in Euro" disabled={imported} autoFocus={routeId === undefined} />
            <span>€</span>
          </div>
        </label>
        {mode !== 'transfer' && (
          <label className="field">
            <span>{mode === 'income' ? 'Von' : 'Wofür / an wen'}</span>
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={mode === 'income' ? 'z. B. Arbeitgeber, Dividende' : 'z. B. Bäckerei, Netflix'} />
          </label>
        )}
        <label className="field">
          <span>{mode === 'transfer' ? 'Bezeichnung (optional)' : 'Notiz (optional)'}</span>
          <input
            value={mode === 'transfer' ? counterparty : purpose}
            onChange={(e) => (mode === 'transfer' ? setCounterparty(e.target.value) : setPurpose(e.target.value))}
            placeholder={mode === 'transfer' ? 'z. B. ETF-Sparplan, Rücklage' : ''}
          />
        </label>
        <label className="field">
          <span>Datum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </section>

      <section className="card">
        <h2>{mode === 'transfer' ? 'Von Konto' : 'Konto'}</h2>
        {accountChips(accountId, (id) => { setAccountId(id); if (id === toAccountId) setToAccountId(undefined) }, undefined, imported && (mode !== 'transfer' || importOutgoing))}
        {mode === 'transfer' && (
          <>
            <h2 style={{ marginTop: 12 }}>Nach Konto</h2>
            {accountChips(toAccountId, setToAccountId, accountId, imported && !importOutgoing)}
            {transferType && (
              <p className={`status-box ${transferType === 'saving' ? 'ok-text' : ''}`} style={transferType === 'transfer' ? { background: 'var(--surface-2)' } : undefined}>
                <Icon name={transferType === 'saving' ? 'piggy' : 'swap'} size={18} />
                {transferType === 'saving'
                  ? (to?.countsAsSaving ? `Zählt als „Gespart“ (${to.name}).` : `Geld zurück vom Spar-Konto – mindert „Gespart“.`)
                  : 'Reine Umbuchung zwischen deinen Konten – zählt weder als Ausgabe noch als Einnahme.'}
              </p>
            )}
          </>
        )}
      </section>

      {mode === 'expense' && (
        <section className="card">
          <h2>Kategorie</h2>
          <div className="cat-grid" role="radiogroup" aria-label="Kategorie">
            {refs.categories.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={categoryId === c.id} className={`cat-option${categoryId === c.id ? ' active' : ''}`} onClick={() => setCategoryId(c.id)}>
                <span className="cat-dot" style={{ background: categoryColor(c) }}><Icon name={categoryIcon(c)} size={18} /></span>
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {imported && (
        <section className="card">
          <p className="muted small">
            Aus dem Bank-Import ({existing!.bookingText}, {formatCents(existing!.amountCents)}). Betrag und Bank-Konto lassen sich nicht ändern.
            {existing!.purpose && <><br />Verwendungszweck: {existing!.purpose}</>}
          </p>
          {mode !== 'income' && (
            <label className="toggle-row" style={{ marginTop: 10 }}>
              <span>
                <strong>Für alle Buchungen von „{existing!.counterparty}“ merken</strong>
                <span className="muted small">{mode === 'expense' ? 'Gleiche Buchungen bekommen künftig diese Kategorie.' : 'Gleiche Buchungen werden künftig als Umbuchung mit diesem Konto erkannt.'}</span>
              </span>
              <input type="checkbox" role="switch" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
            </label>
          )}
        </section>
      )}
      {error && <p className="toast error" role="alert">{error}</p>}

      <div className="button-row sticky-actions">
        <button onClick={save}><Icon name="check" size={18} />Speichern</button>
        <button className="secondary" onClick={() => navigate(-1)}>Abbrechen</button>
        {editId !== undefined && <button className="danger" onClick={remove} aria-label="Löschen"><Icon name="trash" size={18} /></button>}
      </div>
    </>
  )
}
