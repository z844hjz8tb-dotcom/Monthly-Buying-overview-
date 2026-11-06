import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, TABLES } from '../db/schema'
import { backupFileName, createBackup, parseBackup, restoreBackup } from '../db/backup'
import { downloadJson } from '../lib/download'
import { getLook, LOOKS, setLook, type LookId } from '../lib/look'
import { Icon } from '../components/Icon'
import { applyImport, parseAmazonExport, planImport } from '../import/amazon'
import { buildDemoExport, buildDemoReceipts, buildDemoRefund, buildDemoTransactions, buildDemoTransfers, DEMO_ACCOUNTS, DEMO_PREFIX } from '../import/demo'
import { saveTransaction, saveTransfer } from '../finance/store'
import { Link } from 'react-router-dom'
import { deleteReceipt, saveReceipt } from '../receipts/store'

type Message = { kind: 'ok' | 'error'; text: string } | null

export function SettingsView() {
  const [message, setMessage] = useState<Message>(null)
  const [look, setLookState] = useState<LookId>(getLook)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackupAt'))
  const demoCount = useLiveQuery(async () =>
    (await db.orders.where('orderId').startsWith(DEMO_PREFIX).count()) +
    (await db.receipts.filter((r) => !!r.demo).count()) +
    (await db.transactions.filter((t) => !!t.demo).count()))

  async function loadDemo() {
    const demoExport = buildDemoExport()
    const { orders } = parseAmazonExport(JSON.stringify(demoExport))
    await applyImport(db, await planImport(db, orders))
    const receipts = buildDemoReceipts()
    if (!(await db.receipts.filter((r) => !!r.demo).count())) {
      for (const r of receipts) await saveReceipt(db, r)
    }
    const refund = buildDemoRefund(demoExport)
    const transactions = [...buildDemoTransactions(), ...(refund ? [refund] : [])]
    if (!(await db.transactions.filter((t) => !!t.demo).count())) {
      await db.accounts.bulkPut(DEMO_ACCOUNTS)
      for (const t of transactions) await saveTransaction(db, t)
      for (const t of buildDemoTransfers()) await saveTransfer(db, t)
    }
    setMessage({ kind: 'ok', text: `${orders.length} Amazon-Bestellungen, ${receipts.length} Kassenbons und ${transactions.length} Buchungen geladen.` })
  }

  async function removeDemo() {
    await db.transaction('rw', db.orders, db.orderItems, async () => {
      await db.orders.where('orderId').startsWith(DEMO_PREFIX).delete()
      await db.orderItems.where('orderId').startsWith(DEMO_PREFIX).delete()
    })
    for (const r of await db.receipts.filter((r) => !!r.demo).toArray()) await deleteReceipt(db, r.id!)
    await db.transactions.filter((t) => !!t.demo).delete()
    await db.accounts.filter((a) => !!a.demo).delete()
    setMessage({ kind: 'ok', text: 'Beispieldaten entfernt.' })
  }

  async function deleteAll() {
    if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Das lässt sich nur mit einem Backup rückgängig machen.')) return
    await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
      for (const t of TABLES) await db.table(t).clear()
    })
    setMessage({ kind: 'ok', text: 'Alle Daten wurden gelöscht.' })
  }

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  async function requestPersist() {
    const ok = (await navigator.storage?.persist?.()) ?? false
    setPersisted(ok)
    setMessage(
      ok
        ? { kind: 'ok', text: 'Der Browser hält deine Daten jetzt dauerhaft vor.' }
        : { kind: 'error', text: 'Der Browser hat abgelehnt. Tipp: App zum Startbildschirm hinzufügen und erneut versuchen.' },
    )
  }

  async function exportBackup() {
    const backup = await createBackup(db)
    downloadJson(backupFileName(), backup)
    await db.meta.put({ key: 'lastBackupAt', value: backup.exportedAt })
    setMessage({ kind: 'ok', text: 'Backup wurde heruntergeladen.' })
  }

  async function importBackup(file: File) {
    try {
      const backup = parseBackup(await file.text())
      const count = backup.tables.orders?.length ?? 0
      if (!confirm(`Backup vom ${new Date(backup.exportedAt).toLocaleString('de-DE')} mit ${count} Bestellungen einspielen? Die aktuellen Daten werden ersetzt.`)) return
      await restoreBackup(db, backup)
      setMessage({ kind: 'ok', text: 'Backup wurde wiederhergestellt.' })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      {message && <p className={`toast ${message.kind}`} role="status">{message.text}</p>}
      <Link to="/hilfe" className="card reminder">
        <span className="reminder-icon"><Icon name="help" /></span>
        <span className="reminder-text">
          <strong>Hilfe &amp; Anleitung</strong>
          <span className="muted small">Monatsroutine, Importe, Bons, Konten, Backup</span>
        </span>
        <Icon name="right" className="chevron" />
      </Link>

      <section className="card">
        <h2>Design</h2>
        <p className="muted small">Gilt nur auf diesem Gerät.</p>
        <div className="look-grid" role="radiogroup" aria-label="Farbwelt">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={look === l.id}
              className={`look-option${look === l.id ? ' active' : ''}`}
              onClick={() => { setLook(l.id); setLookState(l.id) }}
            >
              <span className="look-swatch" style={{ background: `linear-gradient(145deg, ${l.swatch[0]}, ${l.swatch[1]} 55%, ${l.swatch[2]} 130%)` }} />
              {l.name}
              <small>{l.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Importe</h2>
        <ul className="rows">
          <li>
            <Link to="/import" className="row-link">
              <span className="avatar" aria-hidden="true"><Icon name="package" /></span>
              <div className="row-main"><span className="row-title">Amazon-Bestellungen</span><span className="row-sub muted">Datei aus dem Amazon-Skript</span></div>
              <Icon name="right" size={18} className="chevron" />
            </Link>
          </li>
          <li>
            <Link to="/bon/neu" className="row-link">
              <span className="avatar" aria-hidden="true"><Icon name="receipt" /></span>
              <div className="row-main"><span className="row-title">Kassenbon</span><span className="row-sub muted">Bild oder PDF-eBon</span></div>
              <Icon name="right" size={18} className="chevron" />
            </Link>
          </li>
          <li>
            <Link to="/import/bank" className="row-link">
              <span className="avatar" aria-hidden="true"><Icon name="wallet" /></span>
              <div className="row-main"><span className="row-title">Bank-Umsätze</span><span className="row-sub muted">ING-CSV · Amex und PayPal folgen</span></div>
              <Icon name="right" size={18} className="chevron" />
            </Link>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted">
          Deine Daten liegen nur auf diesem Gerät. Lade regelmäßig ein Backup herunter, z. B. nach
          jedem Monatsimport.
        </p>
        <p className="muted">
          Letztes Backup:{' '}
          {lastBackup ? new Date(lastBackup.value).toLocaleString('de-DE') : 'noch keins'}
        </p>
        <div className="button-row">
          <button onClick={exportBackup}><Icon name="save" size={18} />Backup herunterladen</button>
          <button className="secondary" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={18} />
            Backup einspielen
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])}
          />
        </div>
      </section>

      <section className="card">
        <h2>Speicher</h2>
        <p className="muted">
          {persisted === true && 'Dauerhafter Speicher ist aktiv.'}
          {persisted === false && 'Der Browser darf deine Daten bei Speichermangel löschen.'}
          {persisted === null && 'Speicherstatus unbekannt.'}
        </p>
        {persisted === false && (
          <button className="secondary" onClick={requestPersist}>
            Dauerhaften Speicher anfordern
          </button>
        )}
      </section>

      <section className="card">
        <h2>Beispieldaten</h2>
        <p className="muted">
          Erfundene Amazon-Bestellungen, Kassenbons und Buchungen zum Ausprobieren. Sie lassen sich jederzeit wieder entfernen,
          ohne echte Daten anzufassen.
        </p>
        <div className="button-row">
          <button className="secondary" onClick={loadDemo}><Icon name="sparkles" size={18} />Beispieldaten laden</button>
          {!!demoCount && (
            <button className="secondary" onClick={removeDemo}>Beispieldaten entfernen ({demoCount})</button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Alles löschen</h2>
        <button className="danger" onClick={deleteAll}><Icon name="trash" size={18} />Alle Daten löschen</button>
      </section>

    </>
  )
}
