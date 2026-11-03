import { useRef, useState } from 'react'
import { parseReceiptText, type ParsedReceipt } from '../receipts/parse'

/**
 * Bon aus Text (iPhone Live Text, kopiert aus einer App) oder aus einem PDF-eBon einlesen.
 */
export function ReceiptTextImport({ onParsed }: { onParsed: (r: ParsedReceipt) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<{ kind: 'ok' | 'error'; text: string; skipped?: string[] } | null>(null)
  const pdfInput = useRef<HTMLInputElement>(null)

  function run(source: string) {
    const r = parseReceiptText(source)
    if (r.lines.length === 0) {
      setInfo({ kind: 'error', text: 'Keine Artikel mit Preis erkannt. Ist der ganze Bon-Text enthalten?', skipped: r.skipped })
      return
    }
    onParsed(r)
    const parts = [`${r.lines.length} Artikel erkannt`]
    if (r.store) parts.push(r.store)
    if (r.totalCents !== undefined) parts.push('Summe gefunden')
    setInfo({ kind: 'ok', text: parts.join(' · ') + '. Bitte unten prüfen.', skipped: r.skipped })
    setOpen(false)
    setText('')
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) return run(t)
      setOpen(true)
    } catch {
      // Zugriff verweigert oder nicht unterstützt -> Textfeld zum manuellen Einfügen
      setOpen(true)
    }
  }

  async function readPdf(file: File) {
    setBusy(true)
    setInfo(null)
    try {
      const { pdfToText } = await import('../receipts/pdf')
      run(await pdfToText(file))
    } catch (e) {
      setInfo({ kind: 'error', text: `PDF konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBusy(false)
      if (pdfInput.current) pdfInput.current.value = ''
    }
  }

  return (
    <section className="card">
      <h2>Bon einlesen</h2>
      <p className="muted small">
        Bon-Text aus einer App oder per Live Text (Foto/Screenshot gedrückt halten → „Alles auswählen“ → „Kopieren“) einfügen, oder einen PDF-eBon wählen.
      </p>
      <div className="button-row compact">
        <button type="button" className="secondary" onClick={pasteFromClipboard} disabled={busy}>📋 Text einfügen</button>
        <button type="button" className="secondary" onClick={() => pdfInput.current?.click()} disabled={busy}>
          {busy ? 'Lese PDF…' : '📄 PDF-Bon'}
        </button>
        <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && readPdf(e.target.files[0])} />
      </div>

      {open && (
        <div className="inline-form">
          <textarea
            className="paste-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Bon-Text hier einfügen…"
            rows={8}
            autoFocus
          />
          <div className="button-row">
            <button type="button" onClick={() => run(text)} disabled={!text.trim()}>Auslesen</button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      {info && (
        <div className={`import-status ${info.kind === 'ok' ? 'ok-text' : 'warn'}`} role="status">
          {info.text}
          {info.skipped && info.skipped.length > 0 && (
            <details className="warnings">
              <summary>{info.skipped.length} Zeilen nicht übernommen</summary>
              <ul>{info.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
