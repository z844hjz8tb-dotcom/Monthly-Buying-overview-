import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Alias, type Product } from '../db/schema'
import { unassign } from '../receipts/store'

export function ProductsView() {
  const data = useLiveQuery(async () => {
    const [products, aliases] = await Promise.all([db.products.orderBy('canonicalName').toArray(), db.aliases.toArray()])
    return { products, aliases }
  })
  if (!data) return null

  const ignored = data.aliases.filter((a) => a.ignored)

  return (
    <>
      <section className="card">
        <h2>Produkte ({data.products.length})</h2>
        <p className="muted">
          Tippe auf einen Namen, um ihn zu ändern. Entfernte Schreibweisen tauchen wieder unter
          „Zuordnen“ auf.
        </p>
      </section>
      {data.products.map((p) => (
        <ProductCard key={p.id} product={p} aliases={data.aliases.filter((a) => a.productId === p.id)} />
      ))}
      {ignored.length > 0 && (
        <section className="card">
          <h2>Ignoriert</h2>
          <AliasList aliases={ignored} />
        </section>
      )}
    </>
  )
}

function ProductCard({ product, aliases }: { product: Product; aliases: Alias[] }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.canonicalName)

  async function save() {
    const n = name.trim()
    if (n) await db.products.update(product.id!, { canonicalName: n })
    setEditing(false)
  }

  async function remove() {
    if (!confirm(`Produkt „${product.canonicalName}“ löschen? Die Bontexte müssen danach neu zugeordnet werden.`)) return
    await db.transaction('rw', db.products, db.aliases, async () => {
      await db.aliases.where('productId').equals(product.id!).delete()
      await db.products.delete(product.id!)
    })
  }

  return (
    <section className="card">
      {editing ? (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Produktname" autoFocus />
          <div className="button-row">
            <button type="submit">Speichern</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Abbrechen</button>
            <button type="button" className="danger" onClick={remove}>Löschen</button>
          </div>
        </form>
      ) : (
        <button className="plain-title" onClick={() => setEditing(true)}>{product.canonicalName} ✎</button>
      )}
      <AliasList aliases={aliases} />
    </section>
  )
}

function AliasList({ aliases }: { aliases: Alias[] }) {
  if (!aliases.length) return <p className="muted small">Keine Schreibweisen.</p>
  return (
    <ul className="alias-list">
      {aliases.map((a) => (
        <li key={a.id}>
          <span><span className="muted small">{a.store}:</span> {a.rawText}</span>
          <button className="line-remove" aria-label={`${a.rawText} entfernen`} onClick={() => unassign(db, a.id!)}>✕</button>
        </li>
      ))}
    </ul>
  )
}
