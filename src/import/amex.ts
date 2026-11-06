import type { BankExport } from './bank'

/**
 * American-Express-Export (CSV aus dem Online-Konto), z. B.
 *
 *   Datum,Beschreibung,Betrag
 *   29/10/2026,ZAHLUNG/ÜBERWEISUNG ERHALTEN BESTEN DANK,"-412,50"
 *   03/10/2026,WINSTUB MUSTER          MUSTERSTADT,"135,00"
 *
 * Komma als Trennzeichen, Datum TT/MM/JJJJ, Betrag mit Dezimalkomma in Anführungszeichen.
 * Vorzeichen umgekehrt zur Bank: positiv = Belastung (Ausgabe), negativ = Gutschrift/Zahlung.
 * Beschreibung: die ersten 23 Zeichen sind der Händler, danach der Ort.
 * Manche Exporte haben zusätzliche Spalten (Karteninhaber, Konto #, …) – Spalten werden nach Namen gesucht.
 */

/** CSV in Datensätze zerlegen; Felder in Anführungszeichen dürfen Trennzeichen und Zeilenumbrüche enthalten. */
export function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

const clean = (text: string) => text.replace(/^\uFEFF/, '')
const firstLine = (text: string) => clean(text).split(/\r?\n/, 1)[0] ?? ''
/** Trennzeichen aus der Kopfzeile: Komma (Standard) oder Semikolon (z. B. nach Öffnen in Excel). */
const separator = (text: string) => (/^"?Datum"?;/i.test(firstLine(text)) ? ';' : ',')
const headerCols = (text: string) => (parseCsv(firstLine(text), separator(text))[0] ?? []).map((c) => c.trim().toLowerCase())

export function isAmexExport(text: string): boolean {
  if (!/^"?Datum"?[,;]/i.test(firstLine(text))) return false
  const cols = headerCols(text)
  return cols.includes('beschreibung') && cols.includes('betrag')
}

/** Excel-Datei (xlsx/xls) statt CSV – kommt vor, wenn bei Amex das falsche Format gewählt wurde. */
export function isExcelFile(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 4))
  return (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf)
}

/** Händler aus der Beschreibung: "PENNY MUSTERSTADT   MUSTERSTADT" → "PENNY MUSTERSTADT" */
export function amexMerchant(description: string): string {
  const d = description.replace(/\s+$/, '')
  const gap = d.search(/\s{2,}/)
  if (gap > 0) return d.slice(0, gap).trim()
  // ohne doppeltes Leerzeichen: feste Breite von 23 Zeichen, wenn danach ein Ort folgt
  if (d.length > 24 && d[23] === ' ') return d.slice(0, 23).trim()
  return d.trim()
}

export function parseAmexCsv(text: string): BankExport {
  if (!isAmexExport(text)) throw new Error('Das ist kein American-Express-Export (CSV mit den Spalten Datum, Beschreibung, Betrag).')
  const records = parseCsv(clean(text), separator(text))
  const header = records[0].map((c) => c.trim().toLowerCase())
  const iDate = header.indexOf('datum')
  const iDesc = header.indexOf('beschreibung')
  const iAmount = header.indexOf('betrag')
  const seen = new Map<string, number>()
  const rows: BankExport['rows'] = []
  for (const c of records.slice(1)) {
    const m = (c[iDate] ?? '').trim().match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/)
    if (!m) continue
    const date = `${m[3]}-${m[2]}-${m[1]}`
    const charge = Math.round(Number((c[iAmount] ?? '').trim().replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')) * 100)
    if (!Number.isFinite(charge)) throw new Error(`Ungültiger Betrag: "${c[iAmount]}"`)
    const description = (c[iDesc] ?? '').trim()
    // gleiche Zeilen am selben Tag (z. B. zweimal 15,00 an derselben Tankstelle) bekommen eine laufende Nummer
    const base = `amex|${date}|${charge}|${description.replace(/\s+/g, ' ')}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    rows.push({
      date,
      amountCents: -charge,
      counterparty: amexMerchant(description),
      bookingText: 'Kreditkarte',
      purpose: description.replace(/\s+/g, ' '),
      importKey: `${base}|${n}`,
    })
  }
  return { source: 'amex', label: 'American-Express-Export', defaultAccountId: 'amex', rows }
}
