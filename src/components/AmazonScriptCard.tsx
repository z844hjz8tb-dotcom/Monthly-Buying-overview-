import { useState } from 'react'
import script from '../../amazon-script/amazon-export.js?raw'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'

/** Schritt 1 des Amazon-Imports: Konsolen-Skript kopieren (am PC). */
export function AmazonScriptCard() {
  const [from, setFrom] = useState('')
  const [copied, setCopied] = useState<'ok' | 'error' | null>(null)
  const configured = from ? script.replace("fromDate: '',", `fromDate: '${from}',`) : script

  async function copy() {
    try {
      await navigator.clipboard.writeText(configured)
      setCopied('ok')
    } catch {
      setCopied('error')
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([configured], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'amazon-export.txt' })
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <section className="card">
      <h2>Schritt 1: Bestellungen bei Amazon holen</h2>
      <p className="muted small">Am PC im Browser (Chrome, Edge oder Firefox) – auf dem iPhone geht das nicht. <Link to="/hilfe/amazon" className="text-link">Anleitung</Link></p>
      <ol className="steps">
        <li>Auf amazon.de <strong>Meine Bestellungen</strong> öffnen und oben das ganze Jahr wählen (z. B. „2026“) – nicht „letzte 3 Monate“.</li>
        <li><strong>F12</strong> drücken → Reiter <strong>Konsole</strong>.</li>
        <li>Skript hier kopieren, in der Konsole einfügen und <strong>Enter</strong> drücken. Chrome verlangt beim ersten Mal, dass du „Einfügen zulassen“ eintippst.</li>
        <li>Warten, bis „Fertig“ erscheint – die Datei <em>amazon-…json</em> liegt dann in den Downloads.</li>
      </ol>
      <label className="field">
        <span>Nur Bestellungen ab (optional)</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <div className="button-row">
        <button onClick={copy}><Icon name="file" size={18} />Skript kopieren</button>
        <button className="secondary" onClick={download}><Icon name="download" size={18} />Als Textdatei (.txt)</button>
      </div>
      {copied === 'ok' && <p className="status-box ok-text"><Icon name="check" size={18} />Kopiert – jetzt in der Konsole auf amazon.de einfügen.</p>}
      {copied === 'error' && <p className="status-box warn"><Icon name="alert" size={18} />Kopieren ging nicht – nimm „Als Textdatei“, öffne sie mit dem Editor und kopiere den Inhalt.</p>}
      <details className="warnings">
        <summary>Was macht das Skript?</summary>
        <p className="muted small">
          Es liest auf amazon.de deine Bestellnummern, ruft für jede die Bestelldetails ab (Datum, Artikel, Preise, Summe, storniert ja/nein)
          und speichert alles als Datei. Es läuft nur in deinem Browser und schickt nichts woandershin. Digitale Käufe (Prime Video, Kindle)
          werden ausgelassen, weil sie als Abo über das Konto erfasst werden.
        </p>
      </details>
    </section>
  )
}
