import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { compressImage } from '../lib/image'
import { formatCents, parseEuroToCents } from '../lib/money'
import { ReceiptTextImport } from '../components/ReceiptTextImport'
import type { ParsedReceipt } from '../receipts/parse'
import { aliasKey, deleteReceipt, KNOWN_STORES, loadAliasMap, saveReceipt, type ReceiptInput } from '../receipts/store'

interface LineDraft {
  key: number
  rawText: string
  qty: string
  price: string
}

let nextKey = 1
const emptyLine = (): LineDraft => ({ key: nextKey++, rawText: '', qty: '1', price: '' })
const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Image = ReceiptInput['image']

export function ReceiptEditor() {
  const { id: idParam } = useParams()
  const id = idParam ? Number(idParam) : undefined
  const navigate = useNavigate()

  const [loaded, setLoaded] = useState(id === undefined)
  const [store, setStore] = useState('')
  const [date, setDate] = useState(today)
  const [total, setTotal] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [image, setImage] = useState<Image>(undefined)
  const [existingImage, setExistingImage] = useState<{ type: string; data: ArrayBuffer } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [source, setSource] = useState<ReceiptInput['source']>('manual')
  const photoInput = useRef<HTMLInputElement>(null)
  const lastLineInput = useRef<HTMLInputElement>(null)

  const aliases = useLiveQuery(() => loadAliasMap(db))
  const productNames = useLiveQuery(async () => new Map((await db.products.toArray()).map((p) => [p.id, p.canonicalName])))

  useEffect(() => {
    if (id === undefined) return
    ;(async () => {
      const r = await db.receipts.get(id)
      if (!r) return navigate('/bons', { replace: true })
      const ls = await db.receiptLines.where('receiptId').equals(id).sortBy('id')
      setStore(r.store)
      setSource(r.source)
      setDate(r.date)
      setTotal(centsToInput(r.totalCents))
      setLines([
        ...ls.map((l) => ({ key: nextKey++, rawText: l.rawText, qty: String(l.quantity), price: centsToInput(l.priceCents) })),
        emptyLine(),
      ])
      setExistingImage((await db.receiptImages.get(id)) ?? null)
      setLoaded(true)
    })()
  }, [id, navigate])

  const shownImage = image === undefined ? existingImage : image
  const imageUrl = useMemo(
    () => (shownImage ? URL.createObjectURL(new Blob([shownImage.data], { type: shownImage.type })) : null),
    [shownImage],
  )
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  const parsed = lines
    .filter((l) => l.rawText.trim())
    .map((l) => ({
      rawText: l.rawText,
      quantity: Math.max(1, Math.round(Number(l.qty.replace(',', '.')) || 1)),
      priceCents: parseEuroToCents(l.price),
    }))
  const invalidPrices = parsed.filter((l) => l.priceCents === null).length
  const linesSum = parsed.reduce((s, l) => s + (l.priceCents ?? 0), 0)
  const totalCents = parseEuroToCents(total)
  const diff = totalCents === null ? null : totalCents - linesSum

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((ls) => {
      const next = ls.map((l) => (l.key === key ? { ...l, ...patch } : l))
      // Immer eine leere Zeile am Ende, damit man direkt weitertippen kann
      if (next[next.length - 1].rawText.trim()) next.push(emptyLine())
      return next
    })
  }

  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls))
  }

  function applyParsed(r: ParsedReceipt) {
    if (r.store && !store.trim()) setStore(r.store)
    if (r.date) setDate(r.date)
    if (r.totalCents !== undefined) setTotal(centsToInput(r.totalCents))
    const imported = r.lines.map((l) => ({
      key: nextKey++,
      rawText: l.rawText,
      qty: String(l.quantity),
      price: centsToInput(l.priceCents),
    }))
    setLines((ls) => [...ls.filter((l) => l.rawText.trim()), ...imported, emptyLine()])
    setSource('app')
  }

  async function pickPhoto(file: File) {
    try {
      setImage(await compressImage(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  async function save() {
    setError(null)
    if (!store.trim()) return setError('Bitte einen Laden angeben.')
    if (!date) return setError('Bitte ein Datum angeben.')
    if (parsed.length === 0) return setError('Bitte mindestens einen Artikel eintragen.')
    if (invalidPrices) return setError(`${invalidPrices} Artikel ohne gültigen Preis.`)
    setBusy(true)
    try {
      await saveReceipt(db, {
        id,
        store,
        date,
        totalCents: totalCents ?? linesSum,
        source: source === 'app' ? 'app' : shownImage ? 'photo' : 'manual',
        lines: parsed.map((l) => ({ ...l, priceCents: l.priceCents! })),
        image,
      })
      navigate(`/bons/${date.slice(0, 7)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (id === undefined || !confirm('Diesen Bon löschen?')) return
    await deleteReceipt(db, id)
    navigate(`/bons/${date.slice(0, 7)}`)
  }

  if (!loaded) return null

  return (
    <>
      {id === undefined && <ReceiptTextImport onParsed={applyParsed} />}

      <section className="card">
        <h2>{id === undefined ? 'Neuer Bon' : 'Bon bearbeiten'}</h2>
        <label className="field">
          <span>Laden</span>
          <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="z. B. Lidl" list="stores" autoCapitalize="words" />
          <datalist id="stores">{KNOWN_STORES.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <div className="chips">
          {KNOWN_STORES.slice(0, 6).map((s) => (
            <button key={s} type="button" className={`chip${store === s ? ' active' : ''}`} onClick={() => setStore(s)}>{s}</button>
          ))}
        </div>
        <label className="field">
          <span>Datum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="photo-row">
          {imageUrl ? (
            <>
              <button type="button" className="thumb" onClick={() => setZoom(true)} aria-label="Foto vergrößern">
                <img src={imageUrl} alt="Foto des Bons" />
              </button>
              <div className="button-row">
                <button type="button" className="secondary" onClick={() => photoInput.current?.click()}>Neues Foto</button>
                <button type="button" className="secondary" onClick={() => setImage(null)}>Foto entfernen</button>
              </div>
            </>
          ) : (
            <button type="button" className="secondary" onClick={() => photoInput.current?.click()}>📷 Foto vom Bon</button>
          )}
          <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
        </div>
      </section>

      <section className="card">
        <h2>Artikel</h2>
        <p className="muted small">Text wie auf dem Bon, Preis für die ganze Zeile. Rabatte mit Minus, z. B. „-0,50“.</p>
        <ul className="line-editor">
          {lines.map((l, i) => {
            const alias = aliases?.get(aliasKey(store, l.rawText))
            const isLast = i === lines.length - 1
            return (
              <li key={l.key}>
                <input
                  ref={isLast ? lastLineInput : undefined}
                  className="line-text"
                  value={l.rawText}
                  placeholder={isLast ? 'Artikel hinzufügen…' : ''}
                  aria-label="Artikeltext"
                  onChange={(e) => updateLine(l.key, { rawText: e.target.value })}
                />
                <input
                  className="line-qty"
                  inputMode="numeric"
                  value={l.qty}
                  aria-label="Menge"
                  onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                />
                <span className="line-x" aria-hidden="true">×</span>
                <input
                  className="line-price"
                  inputMode="decimal"
                  value={l.price}
                  placeholder="0,00"
                  aria-label="Zeilenpreis"
                  onChange={(e) => updateLine(l.key, { price: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') lastLineInput.current?.focus()
                  }}
                />
                {!isLast && (
                  <button type="button" className="line-remove" aria-label="Zeile entfernen" onClick={() => removeLine(l.key)}>✕</button>
                )}
                {alias && l.rawText.trim() && (
                  <span className="line-product">
                    {alias.ignored ? 'wird ignoriert' : `→ ${productNames?.get(alias.productId) ?? ''}`}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <label className="field">
          <span>Summe laut Bon</span>
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={centsToInput(linesSum)} />
        </label>
        <p className="muted">Summe der Artikel: <strong>{formatCents(linesSum)}</strong></p>
        {diff !== null && diff !== 0 && (
          <p className="warn">
            Abweichung: {formatCents(diff)}. Fehlt ein Artikel oder ist ein Preis vertippt?
          </p>
        )}
        {diff === 0 && parsed.length > 0 && <p className="ok-text">✓ Summe stimmt</p>}
      </section>

      {error && <p className="toast error" role="alert">{error}</p>}

      <div className="button-row sticky-actions">
        <button onClick={save} disabled={busy}>Speichern</button>
        <button className="secondary" onClick={() => navigate(-1)}>Abbrechen</button>
        {id !== undefined && <button className="danger" onClick={remove}>Löschen</button>}
      </div>

      {zoom && imageUrl && (
        <div className="lightbox" role="dialog" aria-label="Foto" onClick={() => setZoom(false)}>
          <img src={imageUrl} alt="Foto des Bons" />
        </div>
      )}
    </>
  )
}
