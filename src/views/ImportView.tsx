import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { applyImport, parseAmazonExport, planImport, type ImportPlan } from '../import/amazon'
import { formatCents } from '../lib/money'
import { formatDay } from '../stats/spending'

type State =
  | { step: 'idle' }
  | { step: 'preview'; fileName: string; plan: ImportPlan; warnings: string[] }
  | { step: 'done'; added: number; updated: number }
  | { step: 'error'; message: string }

export function ImportView() {
  const [state, setState] = useState<State>({ step: 'idle' })
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function readFile(file: File) {
    try {
      const { orders, warnings } = parseAmazonExport(await file.text())
      const plan = await planImport(db, orders)
      setState({ step: 'preview', fileName: file.name, plan, warnings })
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function confirmImport(plan: ImportPlan) {
    setBusy(true)
    try {
      await applyImport(db, plan)
      setState({ step: 'done', added: plan.added.length, updated: plan.updated.length })
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const picker = (
    <>
      <button onClick={() => input.current?.click()}><Icon name="file" size={18} />Datei auswählen</button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />
    </>
  )

  return (
    <>
      <section className="card">
        <h2>Amazon-Import</h2>
        <p className="muted">
          Wähle die JSON-Datei aus dem Amazon-Konsolen-Skript. Bestellungen, die schon da sind, werden
          anhand der Bestellnummer erkannt und nicht doppelt angelegt.
        </p>
        {state.step !== 'preview' && <div className="button-row">{picker}</div>}
      </section>

      {state.step === 'error' && <p className="toast error" role="alert">{state.message}</p>}

      {state.step === 'done' && (
        <section className="card">
          <p className="toast ok" role="status">
            Import abgeschlossen: {state.added} neu, {state.updated} aktualisiert.
          </p>
          <div className="button-row">
            <Link className="button" to="/uebersicht">Zu Amazon</Link>
            <Link className="button secondary" to="/einstellungen">Backup machen</Link>
          </div>
        </section>
      )}

      {state.step === 'preview' && (
        <section className="card">
          <h2>Vorschau</h2>
          <p className="muted">{state.fileName}</p>
          <div className="stat-row">
            <Stat label="neu" value={state.plan.added.length} />
            <Stat label="aktualisiert" value={state.plan.updated.length} />
            <Stat label="unverändert" value={state.plan.unchanged.length} />
          </div>

          {state.warnings.length > 0 && (
            <details className="warnings">
              <summary>{state.warnings.length} Hinweise</summary>
              <ul>{state.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}

          <OrderPreview title="Neue Bestellungen" orders={state.plan.added} />
          <OrderPreview title="Geänderte Bestellungen" orders={state.plan.updated} />

          <div className="button-row">
            <button
              disabled={busy || state.plan.added.length + state.plan.updated.length === 0}
              onClick={() => confirmImport(state.plan)}
            >
              {state.plan.added.length + state.plan.updated.length === 0 ? 'Nichts Neues' : 'Importieren'}
            </button>
            <button className="secondary" onClick={() => setState({ step: 'idle' })}>Abbrechen</button>
          </div>
        </section>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="muted">{label}</span>
    </div>
  )
}

function OrderPreview({ title, orders }: { title: string; orders: ImportPlan['added'] }) {
  if (orders.length === 0) return null
  return (
    <details className="preview-list">
      <summary>{title} ({orders.length})</summary>
      <ul className="rows">
        {orders.map(({ order, items }) => (
          <li key={order.orderId}>
            <div className="row-main">
              <span className="row-title">{items[0]?.title ?? 'Ohne Artikel'}{items.length > 1 && ` +${items.length - 1}`}</span>
              <span className="row-sub muted">{formatDay(order.date)} · {order.orderId}</span>
            </div>
            <span className="row-amount">{formatCents(order.totalCents)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
