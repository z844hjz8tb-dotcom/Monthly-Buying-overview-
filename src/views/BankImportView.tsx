import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { formatCents } from '../lib/money'
import { formatDay } from '../stats/spending'
import { decodeBankFile, isIngExport, parseIngCsv } from '../import/ing'
import { isAmexExport, parseAmexCsv } from '../import/amex'
import { applyBankImport, ingToBankExport, loadOwnNames, ownNamesFromCustomer, planBankImport, saveOwnNames, type BankExport, type ImportResult, type PlannedRow } from '../import/bank'
import { accountIcon, categoryColor, categoryIcon, useFinanceRefs } from '../finance/useFinance'

type State =
  | { step: 'idle' }
  | { step: 'preview'; fileName: string; ex: BankExport; accountId: string; plan: PlannedRow[] }
  | { step: 'done'; result: ImportResult; accountId: string; openTransfers: number; uncategorized: number }
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
      const text = decodeBankFile(await file.arrayBuffer())
      let ex: BankExport
      if (isIngExport(text)) ex = ingToBankExport(parseIngCsv(text))
      else if (isAmexExport(text)) ex = parseAmexCsv(text)
      else throw new Error('Diese Datei erkenne ich nicht. Möglich sind der ING-Export (Umsätze → Export → CSV) und der American-Express-Export (Umsätze → Herunterladen → CSV).')
      // Eigene Namen beim ersten Import aus dem Dateikopf übernehmen
      const known = await loadOwnNames(db)
      if (!known.length && ex.customer) {
        const names = ownNamesFromCustomer(ex.customer)
        await saveOwnNames(db, names)
        setOwnNames(names.join(', '))
      }
      const accounts = await db.accounts.toArray()
      const byIban = ex.iban ? accounts.find((a) => a.iban === ex.iban) : undefined
      const accountId = byIban?.id ?? (accounts.some((a) => a.id === ex.defaultAccountId) ? ex.defaultAccountId : 'ing')
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
      const fresh = state.plan.filter((p) => !p.duplicate)
      setState({
        step: 'done',
        result,
        accountId: state.accountId,
        openTransfers: fresh.filter((p) => (p.tx.kind === 'transfer' || p.tx.kind === 'saving') && !p.tx.transferAccountId).length,
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
          Die Datei wird nur auf diesem Gerät gelesen.
          Bereits importierte Buchungen werden erkannt und nicht doppelt angelegt.
        </p>
        {state.step !== 'preview' && (
          <div className="button-row">
            <button onClick={() => input.current?.click()}><Icon name="file" size={18} />CSV-Datei wählen</button>
          </div>
        )}
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </section>

      {state.step === 'error' && <p className="toast error" role="alert">{state.message}</p>}

      {state.step === 'preview' && summary && (
        <>
          <section className="card">
            <h2>Auf welches Konto?</h2>
            <p className="muted small">{state.ex.label}{state.ex.accountName ? ` · ${state.ex.accountName}` : ''}{state.ex.iban ? ` · IBAN …${state.ex.iban.slice(-4)}` : ''} · {state.plan.length} Buchungen in der Datei</p>
            <div className="chips">
              {refs.visibleAccounts.filter((a) => a.kind !== 'cash' && a.kind !== 'paypal').map((a) => (
                <button key={a.id} className={`chip${state.accountId === a.id ? ' active' : ''}`} onClick={() => changeAccount(a.id)}>
                  <Icon name={accountIcon(a.kind)} size={16} />{a.name}
                </button>
              ))}
            </div>
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
