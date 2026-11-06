import type { BankExport } from './bank'
import { parseCsv } from './amex'

/**
 * PayPal-Aktivitätsexport (CSV, „Alle Transaktionen“), z. B.
 *
 *   "Datum","Uhrzeit","Zeitzone","Beschreibung","Währung","Brutto","Entgelt","Netto","Guthaben","Transaktionscode",
 *   "Absender E-Mail-Adresse","Name",…,"Rechnungsnummer","Zugehöriger Transaktionscode"
 *
 * Eine Zahlung besteht oft aus zwei Zeilen: der Zahlung (negativ) und der Finanzierung (positiv,
 * „Bankgutschrift auf PayPal-Konto“, „Zahlung per PayPal-Käuferkredit“, „… Gutschrift auf Kreditkarte“),
 * die über den „Zugehörigen Transaktionscode“ auf die Zahlung zeigt. Gezählt wird nur die Zahlung;
 * die Finanzierung wird gemerkt, damit die passende Abbuchung auf Girokonto/Karte nicht doppelt zählt.
 */

const FUNDING: [RegExp, 'bank' | 'card' | 'credit'][] = [
  [/bankgutschrift auf paypal|gutschrift vom bankkonto|einzahlung vom bankkonto/i, 'bank'],
  [/k(ä|ae)uferkredit|später bezahlen|ratenzahlung/i, 'credit'],
  [/gutschrift auf kreditkarte|kreditkarte|debitkarte/i, 'card'],
]

export function isPaypalExport(text: string): boolean {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  return /transaktionscode/i.test(first) && /brutto/i.test(first) && /beschreibung/i.test(first)
}

const cents = (s: string | undefined) => {
  const v = Number((s ?? '').trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) ? Math.round(v * 100) : 0
}
const iso = (d: string) => {
  const m = d.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export function parsePaypalCsv(text: string): BankExport {
  if (!isPaypalExport(text)) throw new Error('Das ist kein PayPal-Export (CSV mit den Spalten Datum, Beschreibung, Brutto, Transaktionscode).')
  const records = parseCsv(text.replace(/^﻿/, ''), ',')
  const head = records[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => head.indexOf(name)
  const [iDate, iDesc, iCur, iNet, iBal, iCode, iMail, iName, iInvoice, iRel] = [
    'datum', 'beschreibung', 'währung', 'netto', 'guthaben', 'transaktionscode', 'absender e-mail-adresse', 'name', 'rechnungsnummer', 'zugehöriger transaktionscode',
  ].map(col)

  type Raw = { date: string; desc: string; net: number; balance: number; code: string; name: string; invoice: string; related: string }
  const raws: Raw[] = []
  for (const c of records.slice(1)) {
    const date = iso(c[iDate] ?? '')
    if (!date) continue
    // andere Währungen (mit Umrechnungszeilen) lässt der erste Wurf aus
    if (iCur >= 0 && (c[iCur] ?? '').trim() && (c[iCur] ?? '').trim() !== 'EUR') continue
    raws.push({
      date,
      desc: (c[iDesc] ?? '').trim(),
      net: cents(c[iNet]),
      balance: cents(c[iBal]),
      code: (c[iCode] ?? '').trim(),
      name: ((c[iName] ?? '').trim() || (c[iMail] ?? '').trim()),
      invoice: (c[iInvoice] ?? '').trim(),
      related: (c[iRel] ?? '').trim(),
    })
  }

  const codes = new Set(raws.map((r) => r.code))
  const fundingOf = (r: Raw) => (r.net > 0 && r.related && codes.has(r.related) ? FUNDING.find(([re]) => re.test(r.desc))?.[1] : undefined)
  const funding = new Map<string, { via: 'bank' | 'card' | 'credit'; cents: number }[]>()
  for (const r of raws) {
    const via = fundingOf(r)
    if (via) funding.set(r.related, [...(funding.get(r.related) ?? []), { via, cents: r.net }])
  }

  const rows: BankExport['rows'] = raws
    .filter((r) => !fundingOf(r) && r.net !== 0)
    .map((r) => ({
      date: r.date,
      amountCents: r.net,
      counterparty: r.name,
      bookingText: r.desc,
      purpose: r.invoice,
      importKey: `paypal|${r.code}`,
      funding: funding.get(r.code),
    }))
  const last = raws[raws.length - 1]
  return { source: 'paypal', label: 'PayPal-Export', defaultAccountId: 'paypal', rows, saldoCents: last?.balance, saldoDate: last?.date }
}
