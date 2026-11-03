import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { backupFileName, createBackup, parseBackup, restoreBackup } from '../db/backup'
import { downloadJson } from '../lib/download'

type Message = { kind: 'ok' | 'error'; text: string } | null

export function SettingsView() {
  const [message, setMessage] = useState<Message>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackupAt'))

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
          <button onClick={exportBackup}>Backup herunterladen</button>
          <button className="secondary" onClick={() => fileInput.current?.click()}>
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

      {message && <p className={`toast ${message.kind}`} role="status">{message.text}</p>}
    </>
  )
}
