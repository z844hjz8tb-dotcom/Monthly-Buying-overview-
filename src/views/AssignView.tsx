import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { Icon } from '../components/Icon'
import { suggestName, suggestProducts, type Candidate } from '../normalize/match'
import { assign, loadAliasMap, openGroups, type OpenGroup } from '../receipts/store'
import { formatDay } from '../stats/spending'

export function AssignView() {
  const data = useLiveQuery(async () => {
    const [receipts, lines, aliases, products] = await Promise.all([
      db.receipts.toArray(),
      db.receiptLines.toArray(),
      loadAliasMap(db),
      db.products.orderBy('canonicalName').toArray(),
    ])
    const byProduct = new Map<number, string[]>()
    for (const a of aliases.values()) {
      if (a.productId === undefined) continue
      byProduct.set(a.productId, [...(byProduct.get(a.productId) ?? []), a.rawText])
    }
    const candidates: Candidate[] = products.map((p) => ({ productId: p.id!, name: p.canonicalName, aliases: byProduct.get(p.id!) ?? [] }))
    return { groups: openGroups(receipts, lines, aliases), candidates }
  })

  if (!data) return null

  return (
    <>
      <section className="card">
        <h2>Artikel zuordnen</h2>
        <p className="muted">
          Ordne Bontexte einem Produkt zu, damit gleiche Artikel aus verschiedenen Läden zusammen
          gezählt werden. Die App merkt sich jede Zuordnung für künftige Bons.
        </p>
        <Link to="/produkte" className="text-link">Produkte verwalten<Icon name="right" size={16} /></Link>
      </section>

      {data.groups.length === 0 ? (
        <section className="card empty">
          <div className="empty-icon"><Icon name="check" size={28} /></div>
          <p>Alles zugeordnet.</p>
          <Link className="button secondary" to="/bons">Zu den Bons</Link>
        </section>
      ) : (
        data.groups.map((g) => <AssignCard key={g.key} group={g} candidates={data.candidates} />)
      )}
    </>
  )
}

function AssignCard({ group, candidates }: { group: OpenGroup; candidates: Candidate[] }) {
  const [mode, setMode] = useState<'choose' | 'new' | 'pick'>('choose')
  const [name, setName] = useState(() => suggestName(group.rawText))
  const [picked, setPicked] = useState('')
  const suggestions = suggestProducts(group.rawText, candidates)

  const run = (a: Parameters<typeof assign>[3]) => assign(db, group.store, group.rawText, a)

  return (
    <section className="card assign-card">
      <div className="assign-head">
        <span className="row-title raw">{group.rawText}</span>
        <span className="muted small">
          {group.store} · {group.count}× · zuletzt {formatDay(group.lastDate)}
        </span>
      </div>

      {mode === 'choose' && (
        <>
          {suggestions.length > 0 && (
            <div className="chips">
              {suggestions.map((s) => (
                <button key={s.productId} className="chip suggestion" onClick={() => run({ productId: s.productId })}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="button-row compact">
            <button className="secondary" onClick={() => setMode('new')}><Icon name="plus" size={16} />Neu</button>
            {candidates.length > 0 && <button className="secondary" onClick={() => setMode('pick')}>Vorhandenes…</button>}
            <button className="secondary muted-btn" onClick={() => run({ ignore: true })} title="z. B. Pfand, Tüte, Rabatt">
              Ignorieren
            </button>
          </div>
        </>
      )}

      {mode === 'new' && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run({ newProductName: name }) }}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Produktname" autoFocus />
          <div className="button-row">
            <button type="submit" disabled={!name.trim()}>Anlegen</button>
            <button type="button" className="secondary" onClick={() => setMode('choose')}>Zurück</button>
          </div>
        </form>
      )}

      {mode === 'pick' && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (picked) run({ productId: Number(picked) }) }}>
          <select value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Produkt wählen">
            <option value="">Produkt wählen…</option>
            {candidates.map((c) => <option key={c.productId} value={c.productId}>{c.name}</option>)}
          </select>
          <div className="button-row">
            <button type="submit" disabled={!picked}>Zuordnen</button>
            <button type="button" className="secondary" onClick={() => setMode('choose')}>Zurück</button>
          </div>
        </form>
      )}
    </section>
  )
}
