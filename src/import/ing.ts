/**
 * ING-Umsatzexport (CSV, "Umsatzanzeige"), z. B.
 *
 *   Umsatzanzeige;Datei erstellt am: 01.01.2026 12:00
 *   IBAN;DE00 0000 …
 *   Kontoname;Girokonto
 *   Saldo;1.234,56;EUR
 *   Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Referenz;Saldo;Währung;Betrag;Währung
 *   06.11.2026;06.11.2026;Max Muster;Gutschrift;…;;1.234,56;EUR;200,00;EUR
 *
 * Kodierung ISO-8859-1, Trennzeichen Semikolon, Beträge "1.234,56".
 */

export interface IngRow {
  date: string
  valueDate: string
  counterparty: string
  bookingText: string
  purpose: string
  reference: string
  saldoCents: number
  amountCents: number
}

export interface IngExport {
  iban?: string
  accountName?: string
  /** "Kunde" aus dem Dateikopf – Namen der Kontoinhaber */
  customer?: string
  /** Kontostand laut Dateikopf und Datum der neuesten Buchung */
  saldoCents?: number
  saldoDate?: string
  rows: IngRow[]
}

export const isIngExport = (text: string) => /^﻿?Umsatzanzeige;/.test(text) && text.includes('Buchung;Wertstellungsdatum;')

/** ING liefert ISO-8859-1; falls die Datei doch UTF-8 ist (z. B. nach dem Bearbeiten), wird das erkannt. */
export function decodeBankFile(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

const toCents = (s: string) => {
  const v = Number(s.trim().replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(v)) throw new Error(`Ungültiger Betrag: "${s}"`)
  return Math.round(v * 100)
}
const toIso = (d: string) => {
  const m = d.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) throw new Error(`Ungültiges Datum: "${d}"`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Einfacher CSV-Leser für Semikolon-Dateien mit optionalen Anführungszeichen. */
function splitLine(line: string): string[] {
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
    else if (c === ';') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

export function parseIngCsv(text: string): IngExport {
  if (!isIngExport(text)) throw new Error('Das ist kein ING-Umsatzexport (CSV aus „Umsätze → Export“).')
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const meta = new Map<string, string[]>()
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    if (cells[0] === 'Buchung' && cells[1] === 'Wertstellungsdatum') { headerIdx = i; break }
    if (cells.length > 1) meta.set(cells[0], cells.slice(1))
  }
  if (headerIdx < 0) throw new Error('Spaltenüberschriften nicht gefunden.')
  const header = splitLine(lines[headerIdx])
  const col = (name: string) => header.indexOf(name)
  const iDate = col('Buchung'), iValue = col('Wertstellungsdatum'), iCp = col('Auftraggeber/Empfänger'), iText = col('Buchungstext')
  const iPurpose = col('Verwendungszweck'), iRef = col('Referenz'), iSaldo = col('Saldo'), iAmount = col('Betrag')
  if ([iDate, iCp, iText, iPurpose, iAmount].some((i) => i < 0)) throw new Error('Unerwartete Spalten im ING-Export.')

  const rows: IngRow[] = []
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue
    const c = splitLine(line)
    if (c.length < header.length - 1) continue
    rows.push({
      date: toIso(c[iDate]),
      valueDate: iValue >= 0 && c[iValue] ? toIso(c[iValue]) : toIso(c[iDate]),
      counterparty: c[iCp].trim(),
      bookingText: c[iText].trim(),
      purpose: c[iPurpose].trim(),
      reference: iRef >= 0 ? c[iRef].trim() : '',
      saldoCents: iSaldo >= 0 && c[iSaldo] ? toCents(c[iSaldo]) : 0,
      amountCents: toCents(c[iAmount]),
    })
  }
  const saldo = meta.get('Saldo')?.[0]
  return {
    iban: meta.get('IBAN')?.[0]?.replace(/\s+/g, ''),
    accountName: meta.get('Kontoname')?.[0],
    customer: meta.get('Kunde')?.[0],
    saldoCents: saldo ? toCents(saldo) : undefined,
    saldoDate: rows.reduce<string | undefined>((max, r) => (!max || r.date > max ? r.date : max), undefined),
    rows,
  }
}

/** Eindeutiger Schlüssel je Zeile: Datum + Betrag + laufender Saldo sind innerhalb eines Kontos eindeutig. */
export const ingImportKey = (iban: string | undefined, r: IngRow) => `ing|${iban ?? ''}|${r.date}|${r.amountCents}|${r.saldoCents}|${r.counterparty}`
