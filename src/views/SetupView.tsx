import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { ACCOUNT_KINDS } from '../finance/defaults'
import { accountIcon } from '../finance/useFinance'
import { applySetup, decodeSetup, planSetup, type SetupAccount } from '../finance/setupLink'
import { reclassifyImported } from '../import/bank'

/** Konten aus einem Einrichtungs-Link anlegen (Vorschau, dann ein Tipp). */
export function SetupView() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  let list: SetupAccount[] = []
  let error: string | null = null
  try {
    list = decodeSetup(search.get('k') ?? '')
    if (!list.length) error = 'Der Link enthält keine Konten.'
  } catch {
    error = 'Der Einrichtungs-Link ist unvollständig oder beschädigt.'
  }
  const plan = useLiveQuery(async () => planSetup(list, await db.accounts.toArray()), [search.get('k')])

  async function run() {
    setBusy(true)
    try {
      await applySetup(db, list)
      await reclassifyImported(db)
      navigate('/konten', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <section className="card">
        <p className="status-box warn"><Icon name="alert" size={18} /><span>{error}</span></p>
        <Link className="button secondary" to="/konten">Zu den Konten</Link>
      </section>
    )
  }
  if (!plan) return null
  const fresh = plan.filter((p) => !p.existing).length

  return (
    <>
      <section className="card">
        <h2>Konten einrichten</h2>
        <p className="muted small">
          Diese Konten werden angelegt. Vorhandene Konten (gleicher Name oder IBAN) werden nur um „Erkennen an“ ergänzt.
          Danach ordnet die App deine importierten Buchungen neu ein.
        </p>
        <ul className="rows">
          {plan.map(({ item, existing }, i) => (
            <li key={i}>
              <span className="avatar cat" style={{ background: item.countsAsSaving ? 'var(--cat-1)' : 'var(--cat-10)' }} aria-hidden="true">
                <Icon name={accountIcon(item.kind)} size={20} />
              </span>
              <div className="row-main">
                <span className="row-title">{item.name}</span>
                <span className="row-sub muted">
                  {ACCOUNT_KINDS.find((k) => k.id === item.kind)?.name} · {item.countsAsSaving ? 'zählt als Sparen' : 'nur Umbuchung'}
                  {item.matchNames?.length ? ` · erkennt „${item.matchNames.join('“, „')}“` : ''}
                </span>
              </div>
              <span className="badge">{existing ? 'ergänzen' : 'neu'}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="button-row sticky-actions">
        <button onClick={run} disabled={busy}><Icon name="check" size={18} />{fresh ? `${fresh} Konten anlegen` : 'Übernehmen'}</button>
        <Link className="button secondary" to="/konten">Abbrechen</Link>
      </div>
    </>
  )
}
