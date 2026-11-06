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

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

const HEADER = /^﻿?"?Datum"?,/

export function isAmexExport(text: string): boolean {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  if (!HEADER.test(first)) return false
  const cols = splitCsv(first.replace(/^﻿/, '')).map((c) => c.trim().toLowerCase())
  return cols.includes('beschreibung') && cols.includes('betrag')
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
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const header = splitCsv(lines[0]).map((c) => c.trim().toLowerCase())
  const iDate = header.indexOf('datum')
  const iDesc = header.indexOf('beschreibung')
  const iAmount = header.indexOf('betrag')
  const seen = new Map<string, number>()
  const rows: BankExport['rows'] = []
  for (const line of lines.slice(1)) {
    const c = splitCsv(line)
    const m = (c[iDate] ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) continue
    const date = `${m[3]}-${m[2]}-${m[1]}`
    const charge = Math.round(Number((c[iAmount] ?? '').trim().replace(/\./g, '').replace(',', '.')) * 100)
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
