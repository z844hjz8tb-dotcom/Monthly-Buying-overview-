import { useRef, useState } from 'react'
import { compressImage } from '../lib/image'
import { parseReceiptText, type ParsedReceipt } from '../receipts/parse'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'

type Photo = { type: string; data: ArrayBuffer }

/**
 * Bon aus einem Bild (z. B. Müller-App) oder einem PDF-eBon (z. B. Penny) einlesen.
 * Beides läuft lokal im Browser.
 */
export function ReceiptTextImport({ onParsed }: { onParsed: (r: ParsedReceipt, photo?: Photo) => void }) {
  const [progress, setProgress] = useState<{ phase: string; pct: number } | null>(null)
  const [info, setInfo] = useState<{ kind: 'ok' | 'error'; text: string; skipped?: string[]; raw?: string } | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const busy = progress !== null

  function apply(text: string, photo?: Photo) {
    const r = parseReceiptText(text)
    if (r.lines.length === 0) {
      setInfo({ kind: 'error', text: 'Keine Artikel mit Preis erkannt. Ist der ganze Bon zu sehen?', skipped: r.skipped, raw: text })
      return
    }
    onParsed(r, photo)
    const parts = [`${r.lines.length} Artikel erkannt`]
    if (r.store) parts.push(r.store)
    if (r.totalCents !== undefined) parts.push('Summe gefunden')
    setInfo({ kind: 'ok', text: parts.join(' · ') + '. Bitte unten prüfen.', skipped: r.skipped, raw: text })
  }

  async function readImage(file: File) {
    setInfo(null)
    setProgress({ phase: 'Starte', pct: 0 })
    try {
      const { imageToText } = await import('../receipts/ocr')
      const [text, photo] = await Promise.all([
        imageToText(file, (p, phase) => setProgress({ phase, pct: Math.round(p * 100) })),
        compressImage(file),
      ])
      apply(text, photo)
    } catch (e) {
      setInfo({ kind: 'error', text: `Bild konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setProgress(null)
      if (imageInput.current) imageInput.current.value = ''
    }
  }

  async function readPdf(file: File) {
    setInfo(null)
    setProgress({ phase: 'Lese PDF', pct: 0 })
    try {
      const { pdfToText } = await import('../receipts/pdf')
      apply(await pdfToText(file))
    } catch (e) {
      setInfo({ kind: 'error', text: `PDF konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setProgress(null)
      if (pdfInput.current) pdfInput.current.value = ''
    }
  }

  return (
    <section className="card">
      <h2>Bon einlesen</h2>
      <p className="muted small">
        Bild (z. B. Müller, Lidl) oder PDF-eBon (z. B. Kaufland, Penny) wählen. Die Erkennung läuft auf
        deinem Gerät – beim ersten Mal werden einmalig ca. 5 MB geladen. <Link to="/hilfe/bons" className="text-link">Anleitung</Link>
      </p>
      <div className="import-tiles">
        <button type="button" className="import-tile" onClick={() => imageInput.current?.click()} disabled={busy}>
          <Icon name="image" size={28} /><span>Bon-Bild</span>
        </button>
        <button type="button" className="import-tile" onClick={() => pdfInput.current?.click()} disabled={busy}>
          <Icon name="file" size={28} /><span>PDF-Bon</span>
        </button>
        <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0])} />
        <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && readPdf(e.target.files[0])} />
      </div>

      {progress && (
        <div className="progress" role="status" aria-live="polite">
          <span>{progress.phase}… {progress.pct > 0 && `${progress.pct} %`}</span>
          <span className="progress-bar"><span style={{ width: `${progress.pct}%` }} /></span>
        </div>
      )}

      {info && (
        <div className={`import-status status-box ${info.kind === 'ok' ? 'ok-text' : 'warn'}`} role="status">
          <Icon name={info.kind === 'ok' ? 'check' : 'alert'} size={18} />
          <div>
          {info.text}
          {info.skipped && info.skipped.length > 0 && (
            <details className="warnings">
              <summary>{info.skipped.length} Zeilen nicht übernommen</summary>
              <ul>{info.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
          {info.raw && (
            <details className="warnings">
              <summary>Erkannten Text anzeigen</summary>
              <pre className="raw-text">{info.raw}</pre>
            </details>
          )}
          </div>
        </div>
      )}
    </section>
  )
}
