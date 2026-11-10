import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { formatDay } from '../stats/spending'
import { decodeBankFile, isIngExport, parseIngCsv } from '../import/ing'
import { isAmexExport, isExcelFile, parseAmexCsv } from '../import/amex'
import { applyBankImport, ingToBankExport, loadOwnNames, ownNamesFromCustomer, planBankImport, saveOwnNames, type BankExport, type ImportResult, type PlannedRow } from '../import/bank'
import { findReceiptLinks } from '../finance/links'
import { linkPaypal } from '../finance/paypal'
import { linkAmazonByAmount } from '../finance/purchases'
import { isPaypalExport, parsePaypalCsv } from '../import/paypal'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'

type State =
  | { step: 'idle' }
  | { step: 'preview'; fileName: string; ex: BankExport; accountId: string; plan: PlannedRow[] }
  | { step: 'done'; result: ImportResult; accountId: string; openTransfers: number; uncategorized: number; receiptsLinked: number; receiptSuggestions: number; paypalLinked: number }
  | { step: 'error'; message: string }

const KIND_LABEL = { expense: 'Ausgaben', income: 'Einnahmen', transfer: 'Umbuchungen', saving: 'Sparen' } as const

/** Import von Bank-Umsätzen (zunächst ING-CSV). */
export function BankImportView() {
  const refs = useFinanceRefs()
  const [state, setState] = useState<State>({ step: 'idle' })
  const [ownNames, setOwnNames] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadOwnNames(db).then((n) => setOwnNames(n.join(', ')))
  }, [])

  async function readFile(file: File) {
    try {
      const buf = await file.arrayBuffer()
      if (isExcelFile(buf)) throw new Error('Das ist eine Excel-Datei. Bitte beim Herunterladen das Format „CSV“ wählen (bei Amex: Umsätze → Herunterladen → CSV).')
      const text = decodeBankFile(buf)
      let ex: BankExport
      if (isIngExport(text)) ex = ingToBankExport(parseIngCsv(text))
      else if (isAmexExport(text)) ex = parseAmexCsv(text)
      else if (isPaypalExport(text)) ex = parsePaypalCsv(text, file.name)
      else throw new Error('Diese Datei erkenne ich nicht. Möglich sind der ING-Export (Umsätze → Export → CSV), der American-Express-Export (Umsätze → Herunterladen → CSV) und der PayPal-Export (Aktivitäten → Kontoauszüge → CSV). Die Datei beginnt mit: „' + text.slice(0, 60).replace(/\s+/g, ' ').trim() + '“')
      // Eigene Namen beim ersten Import aus dem Dateikopf übernehmen
      const known = await loadOwnNames(db)
      if (!known.length && ex.customer) {
        const names = ownNamesFromCustomer(ex.customer)
        await saveOwnNames(db, names)
        setOwnNames(names.join(', '))
      }
      const accounts = await db.accounts.toArray()
      const flatIban = (v?: string) => (v ?? '').replace(/\s+/g, '').toUpperCase()
      const byIban = ex.iban ? accounts.find((a) => a.iban && flatIban(a.iban) === flatIban(ex.iban)) : undefined
      // PayPal: ohne bekannte Konto-ID ein PayPal-Konto nehmen, das noch keiner Datei zugeordnet ist
      const freePaypal = ex.source === 'paypal' && ex.iban ? accounts.find((a) => a.kind === 'paypal' && !a.iban && !a.hidden && !a.demo) : undefined
      // ohne IBAN-Treffer: ein Konto ohne IBAN mit dem Kontonamen aus der Datei (z. B. von Hand angelegtes "Extra-Konto")
      const byName = ex.accountName ? accounts.find((a) => !a.iban && !a.demo && a.name.trim().toLowerCase() === ex.accountName!.trim().toLowerCase()) : undefined
      const accountId = byIban?.id ?? byName?.id ?? freePaypal?.id ?? (accounts.some((a) => a.id === ex.defaultAccountId) ? ex.defaultAccountId : 'ing')
      setState({ step: 'preview', fileName: file.name, ex, accountId, plan: await planBankImport(db, ex, accountId) })
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function changeAccount(accountId: string) {
    if (state.step !== 'preview') return
    setState({ ...state, accountId, plan: await planBankImport(db, state.ex, accountId) })
  }

  async function updateOwnNames() {
    await saveOwnNames(db, ownNames.split(','))
    if (state.step === 'preview') setState({ ...state, plan: await planBankImport(db, state.ex, state.accountId) })
  }

  async function doImport() {
    if (state.step !== 'preview') return
    setBusy(true)
    try {
      const result = await applyBankImport(db, state.ex, state.accountId, state.plan)
      const paypalLinked = await linkPaypal(db)
      await linkAmazonByAmount(db)
      const links = await findReceiptLinks(db)
      const fresh = state.plan.filter((p) => !p.duplicate)
      setState({
        step: 'done',
        result,
        receiptsLinked: links.linked,
        paypalLinked,
        receiptSuggestions: links.suggestions.length,
        accountId: state.accountId,
        openTransfers: fresh.filter((p) => (p.tx.kind === 'transfer' || p.tx.kind === 'saving') && !p.tx.transferAccountId && p.tx.source !== 'paypal').length,
        uncategorized: fresh.filter((p) => p.tx.kind === 'expense' && !p.tx.categoryId).length,
      })
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const summary = useMemo(() => {
    if (state.step !== 'preview') return null
    const fresh = state.plan.filter((p) => !p.duplicate)
    const byKind = new Map<string, { n: number; cents: number }>()
    for (const p of fresh) {
      const s = byKind.get(p.tx.kind) ?? { n: 0, cents: 0 }
      s.n++
      s.cents += p.tx.amountCents
      byKind.set(p.tx.kind, s)
    }
    const dates = fresh.map((p) => p.tx.date).sort()
    return { fresh, byKind, from: dates[0], to: dates[dates.length - 1] }
  }, [state])

  if (!refs) return null

  return (
    <>
      <section className="card">
        <h2>Bank-Umsätze importieren</h2>
        <p className="muted small">
          <strong>ING:</strong> Online-Banking am PC → Konto → Umsätze → Export → CSV.<br />
          <strong>American Express:</strong> Online-Konto am PC → Umsätze → Herunterladen → CSV.<br />
          <strong>PayPal:</strong> paypal.com am PC → Aktivitäten → Kontoauszüge → CSV.<br />
          Die Datei wird nur auf diesem Gerät gelesen. <Link to="/hilfe/ing" className="text-link">Anleitung</Link>{' '}
          Bereits importierte Buchungen werden erkannt und nicht doppelt angelegt.
        </p>
        {state.step !== 'preview' && (
          <div className="button-row">
            <button onClick={() => input.current?.click()}><Icon name="file" size={18} />CSV-Datei wählen</button>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </section>

      {state.step === 'error' && <p className="toast error" role="alert">{state.message}</p>}

      {state.step === 'preview' && summary && (
        <>
          <section className="card">
            <h2>Auf welches Konto?</h2>
            <p className="muted small">{state.ex.label}{state.ex.accountName ? ` · ${state.ex.accountName}` : ''}{state.ex.iban ? ` · ${state.ex.source === 'paypal' ? 'Konto' : 'IBAN'} …${state.ex.iban.slice(-4)}` : ''} · {state.plan.length} Buchungen in der Datei</p>
            <div className="chips">
              {refs.visibleAccounts.filter((a) => a.kind !== 'cash' && (state.ex.source === 'paypal') === (a.kind === 'paypal')).map((a) => (
                <button key={a.id} className={`chip${state.accountId === a.id ? ' active' : ''}`} onClick={() => changeAccount(a.id)}>
                  <Icon name={accountIcon(a.kind)} size={16} />{a.name}
                </button>
              ))}
            </div>
            <OtherAccountHint ex={state.ex} accountId={state.accountId} plan={state.plan} onCreate={changeAccount} />
          </section>

          <section className="card">
            <h2>Vorschau</h2>
            <div className="stat-row">
              <div className="stat"><span className="stat-value">{summary.fresh.length}</span><span className="muted">neu</span></div>
              <div className="stat"><span className="stat-value">{state.plan.length - summary.fresh.length}</span><span className="muted">schon da</span></div>
              <div className="stat"><span className="stat-value">{summary.fresh.filter((p) => p.tx.kind === 'expense' && !p.tx.categoryId).length}</span><span className="muted">ohne Kat.</span></div>
            </div>
            {summary.from && <p className="muted small">Zeitraum der neuen Buchungen: {formatDay(summary.from)} – {formatDay(summary.to)}</p>}
            <ul className="rows">
              {(['expense', 'income', 'saving', 'transfer'] as const).filter((k) => summary.byKind.has(k)).map((k) => {
                const s = summary.byKind.get(k)!
                return (
                  <li key={k}>
                    <span className="avatar" aria-hidden="true"><Icon name={k === 'expense' ? 'cart' : k === 'income' ? 'income' : k === 'saving' ? 'piggy' : 'swap'} /></span>
                    <div className="row-main">
                      <span className="row-title">{KIND_LABEL[k]}</span>
                      <span className="row-sub muted">{s.n} Buchungen{k === 'transfer' ? ' · zählen nicht als Ausgabe' : ''}</span>
                    </div>
                    <span className="row-amount">{formatCents(s.cents)}</span>
                  </li>
                )
              })}
            </ul>
            <details className="preview-list">
              <summary>Einzelne Buchungen ansehen</summary>
              <ul className="rows">
                {summary.fresh.slice(0, 200).map((p) => {
                  const cat = p.tx.categoryId ? refs.categoryById.get(p.tx.categoryId) : undefined
                  const target = p.tx.transferAccountId ? refs.accountById.get(p.tx.transferAccountId) : undefined
                  const move = p.tx.kind === 'transfer' || p.tx.kind === 'saving'
                  return (
                    <li key={p.importKey}>
                      <span className="avatar cat" style={{ background: move ? 'var(--cat-10)' : categoryColor(cat) }} aria-hidden="true">
                        <Icon name={move ? (p.tx.kind === 'saving' ? 'piggy' : 'swap') : p.tx.kind === 'income' ? 'income' : categoryIcon(cat)} size={18} />
                      </span>
                      <div className="row-main">
                        <span className="row-title">{p.tx.counterparty}</span>
                        <span className="row-sub muted">
                          {formatDay(p.tx.date)} · {move ? `${p.tx.kind === 'saving' ? 'Sparen' : 'Umbuchung'} ${target ? `→ ${target.name}` : '(Konto offen)'}` : p.tx.kind === 'income' ? 'Einnahme' : (cat?.name ?? 'ohne Kategorie')}
                        </span>
                      </div>
                      <span className={`row-amount ${p.tx.amountCents > 0 ? 'amount-in' : ''}`}>{formatCents(p.tx.amountCents)}</span>
                    </li>
                  )
                })}
              </ul>
            </details>
          </section>

          <section className="card">
            <h2>Eigene Namen</h2>
            <p className="muted small">Überweisungen an oder von diesen Namen sind Umbuchungen zwischen deinen Konten. Mit Komma trennen.</p>
            <div className="inline-form">
              <input value={ownNames} onChange={(e) => setOwnNames(e.target.value)} onBlur={updateOwnNames} placeholder="z. B. Max Muster, Erika Muster" />
            </div>
          </section>

          <div className="button-row sticky-actions">
            <button onClick={doImport} disabled={busy || summary.fresh.length === 0}>
              <Icon name="check" size={18} />{summary.fresh.length ? `${summary.fresh.length} Buchungen importieren` : 'Nichts Neues'}
            </button>
            <button className="secondary" onClick={() => setState({ step: 'idle' })}>Abbrechen</button>
          </div>
        </>
      )}

      {state.step === 'done' && (
        <section className="card">
          <p className="toast ok" role="status">{state.result.added} Buchungen importiert{state.result.skipped ? `, ${state.result.skipped} waren schon da` : ''}.</p>
          {state.paypalLinked > 0 && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {state.paypalLinked} PayPal-Abbuchungen auf Konto bzw. Karte erkannt – gezählt wird jeweils die PayPal-Zahlung mit Händler, nicht die Abbuchung.
            </p>
          )}
          {(state.receiptsLinked > 0 || state.receiptSuggestions > 0) && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {state.receiptsLinked > 0 && (state.receiptsLinked === 1 ? '1 Kassenbon mit seiner Kartenzahlung verknüpft. ' : `${state.receiptsLinked} Kassenbons mit ihrer Kartenzahlung verknüpft. `)}
              {state.receiptSuggestions > 0 && <>{state.receiptSuggestions} mögliche Zuordnungen warten im <Link to="/bons" className="text-link">Bons-Tab</Link> auf deine Bestätigung.</>}
            </p>
          )}
          {(state.openTransfers > 0 || state.uncategorized > 0) && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {state.openTransfers > 0 && `${state.openTransfers} Umbuchungen ohne Zielkonto. `}
              {state.uncategorized > 0 && `${state.uncategorized} Ausgaben ohne Kategorie. `}
              Öffne eine Buchung, ordne sie zu und tippe „Für alle … merken“ – dann lernt die App das für alle gleichen Buchungen.
            </p>
          )}
          <div className="button-row">
            <Link className="button" to={`/konto/${state.accountId}`}>Zum Konto</Link>
            <Link className="button secondary" to="/start">Zur Übersicht</Link>
          </div>
        </section>
      )}
    </>
  )
}

/** Art eines neu anzulegenden Kontos aus dem Export (ING liefert den Kontonamen im Dateikopf) */
function guessAccountKind(ex: Pick<BankExport, 'source' | 'accountName'>): Account['kind'] {
  if (ex.source === 'paypal') return 'paypal'
  if (ex.source === 'amex') return 'credit'
  const n = (ex.accountName ?? '').toLowerCase()
  if (/depot/.test(n)) return 'depot'
  if (/extra|tagesgeld|spar|direkt|festgeld/.test(n)) return 'savings'
  return 'giro'
}

/**
 * Mehrere Konten derselben Bank (ING Girokonto + Extra-Konten, zwei PayPal-Konten …): warnt, wenn die Datei
 * offenbar zu einem anderen Konto gehört (andere IBAN bzw. PayPal-Konto-ID, oder Zeitraum schon vorhanden ohne
 * eine einzige gleiche Buchung) und legt auf Wunsch ein neues Konto an.
 */
function OtherAccountHint({ ex, accountId, plan, onCreate }: { ex: BankExport; accountId: string; plan: PlannedRow[]; onCreate: (id: string) => void }) {
  const info = useLiveQuery(async () => {
    const acc = await db.accounts.get(accountId)
    const dates = ex.rows.map((r) => r.date).sort()
    const overlap = dates.length
      ? await db.transactions.where('accountId').equals(accountId).filter((t) => t.source === ex.source && t.date >= dates[0] && t.date <= dates[dates.length - 1]).count()
      : 0
    return { acc, overlap }
  }, [accountId, ex])
  if (!info?.acc) return null
  const otherId = !!ex.iban && !!info.acc.iban && info.acc.iban.replace(/\s/g, '') !== ex.iban.replace(/\s/g, '')
  const noDuplicates = info.overlap > 0 && plan.length > 0 && plan.every((p) => !p.duplicate)
  if (!otherId && !noDuplicates) return null
  const kind = guessAccountKind(ex)

  async function create() {
    const id = `k-${Date.now().toString(36)}`
    const same = await db.accounts.filter((a) => a.kind === kind).count()
    const name = ex.accountName?.trim() || (kind === 'paypal' ? `PayPal ${same + 1}` : `Konto ${same + 1}`)
    await db.accounts.add({ id, name, kind, iban: ex.iban, order: 100 + (await db.accounts.count()), ...(kind === 'depot' ? { countsAsSaving: true } : {}) })
    onCreate(id)
  }

  return (
    <div className="status-box warn" style={{ marginTop: 10 }}>
      <Icon name="alert" size={18} />
      <span>
        Diese Datei gehört anscheinend zu einem <strong>anderen Konto</strong> als „{info.acc.name}“{ex.accountName ? ` (laut Datei: ${ex.accountName})` : ''}. Bitte das richtige Konto wählen oder neu anlegen.
        <span className="button-row compact" style={{ marginTop: 8 }}>
          <button onClick={create}><Icon name="plus" size={16} />Neues Konto „{ex.accountName?.trim() || (kind === 'paypal' ? 'PayPal' : 'Konto')}“ anlegen</button>
        </span>
      </span>
    </div>
  )
}
