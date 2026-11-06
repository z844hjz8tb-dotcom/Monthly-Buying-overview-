import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { formatCents } from '../lib/money'
import { formatDay } from '../stats/spending'
import { findReceiptLinks, linkReceipt, rejectLink, unlinkReceipt, type LinkCandidate } from '../finance/links'
import { useFinanceRefs } from '../finance/useFinance'
import { Icon } from './Icon'

/** Karte im Bons-Tab: unsichere Zuordnungen Bon ↔ Kartenzahlung zum Bestätigen. */
export function ReceiptLinkSuggestions() {
  const refs = useFinanceRefs()
  const [busy, setBusy] = useState(false)
  const suggestions = useLiveQuery(async () => (await findReceiptLinks(db, false)).suggestions.filter((s) => !s.sure), [])
  if (!refs || !suggestions?.length) return null

  const act = async (c: LinkCandidate, yes: boolean) => {
    setBusy(true)
    try {
      if (yes) await linkReceipt(db, c.receipt.id!, c.tx.id!)
      else await rejectLink(db, c.receipt.id!, c.tx.id!)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Zahlungen zuordnen</h2>
      <p className="muted small">
        Gehören diese Bons zu diesen Kontobuchungen? Dann zählt der Einkauf nur einmal.
      </p>
      <ul className="rows">
        {suggestions.map((c) => (
          <li key={`${c.receipt.id}-${c.tx.id}`} className="link-suggestion">
            <div className="row-main">
              <span className="row-title">{c.receipt.store} · {formatDay(c.receipt.date)} · {formatCents(c.receipt.totalCents)}</span>
              <span className="row-sub muted">
                ↔ {c.tx.counterparty} ({refs.accountById.get(c.tx.accountId)?.name ?? c.tx.accountId}) · {formatDay(c.tx.date)} · {formatCents(-c.tx.amountCents)}
                {c.amountDiffCents > 0 && ` · ${formatCents(c.amountDiffCents)} weniger bezahlt (Coupon?)`}
                {!c.storeMatch && ' · Laden nicht erkennbar'}
              </span>
            </div>
            <div className="button-row compact">
              <button onClick={() => act(c, true)} disabled={busy}><Icon name="link" size={16} />Gehört zusammen</button>
              <button className="secondary" onClick={() => act(c, false)} disabled={busy}><Icon name="x" size={16} />Nein</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Abschnitt im Bon: mit welcher Kontobuchung bezahlt, oder bar. */
export function ReceiptPaymentCard({ receiptId }: { receiptId: number }) {
  const refs = useFinanceRefs()
  const data = useLiveQuery(async () => {
    const [receipt, linked] = await Promise.all([db.receipts.get(receiptId), db.transactions.where('linkedReceiptId').equals(receiptId).first()])
    const suggestion = linked ? undefined : (await findReceiptLinks(db, false)).suggestions.find((s) => s.receipt.id === receiptId)
    return { receipt, linked, suggestion }
  }, [receiptId])
  if (!refs || !data?.receipt) return null
  const { receipt, linked, suggestion } = data

  return (
    <section className="card">
      <h2>Bezahlung</h2>
      {linked ? (
        <>
          <p className="status-box ok-text">
            <Icon name="link" size={18} />
            <span>
              Bezahlt mit {refs.accountById.get(linked.accountId)?.name ?? linked.accountId}: {linked.counterparty}, {formatDay(linked.date)}, {formatCents(-linked.amountCents)}.
              Gezählt wird die Kontobuchung, der Bon liefert die Artikel.
            </span>
          </p>
          <div className="button-row">
            <Link className="button secondary" to={`/buchung/${linked.id}`}>Buchung ansehen</Link>
            <button className="secondary" onClick={() => unlinkReceipt(db, receiptId)}>Verknüpfung lösen</button>
          </div>
        </>
      ) : (
        <>
          {suggestion && !receipt.paidCash && (
            <div className="status-box" style={{ background: 'var(--surface-2)' }}>
              <Icon name="link" size={18} />
              <span>
                Passt vielleicht zu: {suggestion.tx.counterparty}, {formatDay(suggestion.tx.date)}, {formatCents(-suggestion.tx.amountCents)}
                <span className="button-row compact" style={{ marginTop: 8 }}>
                  <button onClick={() => linkReceipt(db, receiptId, suggestion.tx.id!)}>Verknüpfen</button>
                  <button className="secondary" onClick={() => rejectLink(db, receiptId, suggestion.tx.id!)}>Nein</button>
                </span>
              </span>
            </div>
          )}
          {!suggestion && !receipt.paidCash && (
            <p className="muted small">Noch keine passende Kontobuchung gefunden. Sie wird nach dem nächsten Bank-Import automatisch zugeordnet.</p>
          )}
          <label className="toggle-row" style={{ marginTop: 10 }}>
            <span>
              <strong>Bar bezahlt</strong>
              <span className="muted small">Dann wird keine Kontobuchung gesucht, und der Bon zählt selbst.</span>
            </span>
            <input type="checkbox" role="switch" checked={!!receipt.paidCash} onChange={(e) => db.receipts.update(receiptId, { paidCash: e.target.checked || undefined })} />
          </label>
        </>
      )}
    </section>
  )
}
