import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db, type Transaction } from '../db/schema'
import { Icon } from '../components/Icon'
import { parseEuroToCents } from '../lib/money'
import { deleteTransaction, saveTransaction, signedAmount } from '../finance/store'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'

type Kind = Transaction['kind']
const KINDS: { id: Kind; label: string }[] = [
  { id: 'expense', label: 'Ausgabe' },
  { id: 'income', label: 'Einnahme' },
  { id: 'transfer', label: 'Umbuchung' },
]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const centsToInput = (c: number) => (Math.abs(c) / 100).toFixed(2).replace('.', ',')

/** Buchung von Hand anlegen oder bearbeiten. */
export function TransactionEditor() {
  const { id: idParam } = useParams()
  const id = idParam ? Number(idParam) : undefined
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const refs = useFinanceRefs()

  const [loaded, setLoaded] = useState(id === undefined)
  const [existing, setExisting] = useState<Transaction | null>(null)
  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(search.get('konto') ?? 'bar')
  const [date, setDate] = useState(today)
  const [counterparty, setCounterparty] = useState('')
  const [purpose, setPurpose] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id === undefined) return
    db.transactions.get(id).then((t) => {
      if (!t) return navigate('/konten', { replace: true })
      setExisting(t)
      setKind(t.kind)
      setAmount(centsToInput(t.amountCents))
      setAccountId(t.accountId)
      setDate(t.date)
      setCounterparty(t.counterparty)
      setPurpose(t.purpose ?? '')
      setCategoryId(t.categoryId)
      setLoaded(true)
    })
  }, [id, navigate])

  if (!refs || !loaded) return null
  const imported = existing && existing.source !== 'manual'

  async function save() {
    setError(null)
    const cents = parseEuroToCents(amount)
    if (cents === null || cents === 0) return setError('Bitte einen Betrag eingeben.')
    if (!counterparty.trim()) return setError(kind === 'income' ? 'Bitte angeben, von wem das Geld kommt.' : 'Bitte angeben, wofür bzw. an wen.')
    if (kind === 'expense' && !categoryId) return setError('Bitte eine Kategorie wählen.')
    // Bei Umbuchungen gilt die Richtung aus Sicht des gewählten Kontos: raus = negativ
    const signed = kind === 'transfer' ? -Math.abs(cents) : signedAmount(kind, cents)
    await saveTransaction(db, {
      ...(existing ?? {}),
      id,
      kind,
      amountCents: imported ? existing!.amountCents : signed,
      accountId,
      date,
      counterparty,
      purpose,
      categoryId: kind === 'expense' ? categoryId : undefined,
      source: existing?.source ?? 'manual',
    })
    navigate(-1)
  }

  async function remove() {
    if (id === undefined || !confirm('Diese Buchung löschen?')) return
    await deleteTransaction(db, id)
    navigate(-1)
  }

  return (
    <>
      <section className="card">
        <div className="segmented full-width" role="group" aria-label="Art der Buchung">
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? 'active' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)} disabled={!!imported}>
              {k.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Betrag</span>
          <div className="amount-field">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" aria-label="Betrag in Euro" disabled={!!imported} autoFocus={id === undefined} />
            <span>€</span>
          </div>
        </label>
        <label className="field">
          <span>{kind === 'income' ? 'Von' : kind === 'transfer' ? 'Wohin' : 'Wofür / an wen'}</span>
          <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={kind === 'income' ? 'z. B. Arbeitgeber' : kind === 'transfer' ? 'z. B. Amex-Abrechnung' : 'z. B. Bäckerei, Netflix'} />
        </label>
        <label className="field">
          <span>Notiz (optional)</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </label>
        <label className="field">
          <span>Datum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </section>

      <section className="card">
        <h2>Konto</h2>
        <div className="chips">
          {refs.accounts.map((a) => (
            <button key={a.id} type="button" className={`chip${accountId === a.id ? ' active' : ''}`} onClick={() => setAccountId(a.id)} disabled={!!imported}>
              <Icon name={accountIcon(a.kind)} size={16} />{a.name}
            </button>
          ))}
        </div>
      </section>

      {kind === 'expense' && (
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

      {error && <p className="toast error" role="alert">{error}</p>}

      <div className="button-row sticky-actions">
        <button onClick={save}><Icon name="check" size={18} />Speichern</button>
        <button className="secondary" onClick={() => navigate(-1)}>Abbrechen</button>
        {id !== undefined && <button className="danger" onClick={remove} aria-label="Löschen"><Icon name="trash" size={18} /></button>}
      </div>
    </>
  )
}
