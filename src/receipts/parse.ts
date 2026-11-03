/**
 * Allgemeiner Leser für Kassenbon-Text (aus PDF-eBons oder per iPhone-Live-Text kopiert).
 *
 * Erkennt:
 *  - Artikelzeilen mit Preis am Ende:   "H-VOLLM. 3,5%      0,99 A"
 *  - Mengenzeilen davor oder danach:     "2 x 0,99"  /  "2 Stk x 0,99   1,98"
 *  - Gewichtszeilen (werden übergangen): "0,524 kg x 2,99 EUR/kg"
 *  - Rabatte, die zum vorherigen Artikel gehören: "Preisvorteil  -0,30"
 *  - Summe, Laden und Datum
 *  - Live-Text-Spalten: erst alle Namen, dann alle Preise (werden der Reihe nach gepaart)
 *
 * Bewusst tolerant: Das Ergebnis wird in der Erfassung angezeigt und vor dem Speichern geprüft.
 */

import { KNOWN_STORES } from './store'

export interface ParsedLine {
  rawText: string
  quantity: number
  priceCents: number
}

export interface ParsedReceipt {
  store?: string
  date?: string
  totalCents?: number
  lines: ParsedLine[]
  /** Zeilen, mit denen der Leser nichts anfangen konnte (zur Kontrolle) */
  skipped: string[]
}

const AMOUNT = String.raw`-?\d{1,5}[.,] ?\d{2}-?`
const toCents = (s: string) => {
  const neg = s.startsWith('-') || s.endsWith('-')
  const v = Math.round(Number(s.replace(/[-\s]/g, '').replace(',', '.')) * 100)
  return neg ? -v : v
}

// Preis am Zeilenende, optional mit Währung, Steuerklasse (A, B, 1, 2, AW …) und Sternchen
const PRICE_END = new RegExp(String.raw`(?:^|\s)(${AMOUNT})\s*(?:€|EUR)?(?:\s*[A-Z0-9]{1,2})?\s*\*?$`, 'i')
// Nur Beträge (eine Spalte oder "Preis Summe" aus Live Text); der letzte zählt
const PRICE_ONLY = new RegExp(String.raw`^(?:${AMOUNT}\s+){0,2}(${AMOUNT})\s*(?:€|EUR)?(?:\s*[A-Z0-9]{1,2}|[a-z])?\s*\*?$`, 'i')
// "2 x 0,99", "2 Stk x 0,99 1,98", "2 St. * 0,99"
const QTY_LINE = new RegExp(
  String.raw`^(\d{1,3})\s*(?:stk\.?|st\.?|stück)?\s*[x×*]\s*(${AMOUNT})\s*(?:€|EUR)?(?:\s*\/\s*\w+)?(?:\s+(${AMOUNT}))?(?:\s*[A-Z0-9]{1,2})?\s*\*?$`,
  'i',
)
// Menge mitten in der Artikelzeile: "Katjes   2 * 1,39   2,78 B"
const INLINE_QTY = new RegExp(
  String.raw`^(.+?)\s+(\d{1,3})\s*[x×*]\s*(${AMOUNT})\s+(${AMOUNT})\s*(?:€|EUR)?(?:\s*[A-Z0-9]{1,2})?\s*\*?$`,
  'i',
)
const WEIGHT_LINE = /^\d+[.,]\d+\s*kg\s*[x×*]/i
// Tabellenzeile mit Menge vorn und mehreren Beträgen hinten (z. B. Müller):
// "1 ABLAGEKORB A4 ROT   2,59          2,59a"  /  "1 X  2,99  0,50  2,49a"
const TABLE_LINE = new RegExp(
  String.raw`^(?:(\d{1,3})\s+)?(.+?)\s+(${AMOUNT})\s+(?:(${AMOUNT})\s+)?(${AMOUNT})\s*(?:€|EUR)?(?:\s*[A-Z0-9]{1,2}|[a-z])?\s*\*?$`,
  'i',
)
const SUBTOTAL = /(zwischensumme|zw\.?-?summe|subtotal)/i
const TOTAL_LINE = /^(summe|gesamt(?:betrag|summe)?|zu (?:be)?zahlen|total|endsumme|betrag)\b/i
const DISCOUNT = /(rabatt|preisvorteil|nachlass|coupon|aktion|ersparnis|sie sparen|lidl plus|vorteil)/i
const END_MARKERS = /^(bar|gegeben|rückgeld|rueckgeld|ec[- ]?karte|kartenzahlung|girocard|visa|mastercard|kreditkarte|paypal|mwst|ust|steuer|netto|brutto|zahlung|bezahlt)/i
const NOISE = [
  /\b\d{5}\b\s+\p{L}/u, // PLZ + Ort
  /(stra(ss|ß)e|str\.)\s*\d{1,4}(\s*[a-e])?(\s|,|$)/i, // Hausnummer, aber nicht "Mangostr. 125g"
  /\b(tel|fax|uid|ust-?id|st-?nr|steuer-?nr|www\.|http|filiale|markt|kasse|bon-?nr|beleg|bediener|öffnungszeiten)\b/i,
  /^\d{1,2}[.:]\d{2}(:\d{2})?$/, // Uhrzeit
  /^(eur|€)$/i,
  /^(preis\s+)?eur$/i,
  /(gespart|treuepunkte|punkte gesammelt|card xtra:)/i,
  /^[A-Z]{2}\d{8,12}$/, // USt-IdNr.
  /^(stk\.?|menge|anz\.?)?\s*(artikel|bezeichnung|beschreibung)\b/i, // Tabellenkopf
  /^(preis|summe|nachlass|betrag)(\s+(preis|summe|nachlass|betrag|eur))*$/i,
  /^[-=*_\s]+$/,
]

/** Laden = der bekannte Name, der im Text zuerst vorkommt (Kopfzeile), als ganzes Wort ("Müllermilch" ≠ Müller). */
function detectStore(text: string): string | undefined {
  const t = text.toLowerCase().replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe')
  let best: { store: string; index: number } | undefined
  for (const store of KNOWN_STORES) {
    const key = store.toLowerCase().replace(/ü/g, 'ue')
    const m = new RegExp(`(^|[^a-z])${key}([^a-z]|$)`).exec(t)
    if (m && (!best || m.index < best.index)) best = { store, index: m.index }
  }
  return best?.store
}

function detectDate(text: string): string | undefined {
  const m = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/)
  if (!m) return undefined
  const [, d, mo, y] = m
  const year = y.length === 2 ? `20${y}` : y
  const day = Number(d)
  const month = Number(mo)
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
/** Typische Erkennungsfehler am Zeilenanfang: "1l HEFT …", "l HEFT …" -> "1 HEFT …" */
const fixOcrRow = (s: string) => s.replace(/^(?:[lI|][1lI|]?|1[lI|])\s+(?=\S)/, '1 ')
const isNoise = (s: string) => NOISE.some((r) => r.test(s)) || detectDate(s) !== undefined

/**
 * Betrag einer Tabellenzeile (Menge, Stückpreis, [Nachlass], Summe).
 * Die Texterkennung verwechselt gern 0 und 9 ("9,75a" statt "0,75a"). Ohne Nachlass
 * müssen Menge × Stückpreis und Summe übereinstimmen; weichen sie nur durch eine
 * 0/9-Verwechslung voneinander ab, ist der kleinere Wert der richtige.
 */
function pickTableAmount(qty: number, unitStr: string, discountStr: string | undefined, totalStr: string): number {
  const total = toCents(totalStr)
  if (discountStr !== undefined) return total
  const unit = toCents(unitStr)
  const expected = unit * qty
  if (expected === total) return total
  const digits = (c: number) => String(Math.abs(c)).replace(/9/g, '0').replace(/^0+/, '')
  if (qty === 1 && digits(unit) === digits(total)) return Math.min(unit, total)
  return total
}

export function parseReceiptText(text: string): ParsedReceipt {
  const result: ParsedReceipt = { store: detectStore(text), date: detectDate(text), lines: [], skipped: [] }
  const rows = text.split(/\r?\n/).map(clean).map(fixOcrRow).filter(Boolean)

  /** Texte ohne Preis, die auf ihren Preis warten (Live-Text-Spalten) */
  const pendingTexts: string[] = []
  let pendingQty: number | null = null
  let last: ParsedLine | null = null
  let lastFromQtyCheck = false

  const pushLine = (rawText: string, priceCents: number) => {
    // Rabatt gehört zum vorherigen Artikel
    if (priceCents < 0 && last && DISCOUNT.test(rawText)) {
      last.priceCents += priceCents
      return
    }
    const line: ParsedLine = { rawText, quantity: 1, priceCents }
    if (pendingQty !== null) {
      line.quantity = pendingQty
      pendingQty = null
    }
    result.lines.push(line)
    last = line
    lastFromQtyCheck = false
  }

  for (const row of rows) {
    if (END_MARKERS.test(row) && result.lines.length > 0) break

    const total = TOTAL_LINE.test(row) ? row.match(new RegExp(`(${AMOUNT})`)) : null
    if (TOTAL_LINE.test(row)) {
      if (total) result.totalCents = toCents(total[1])
      if (result.lines.length > 0 || total) break
      continue
    }

    if (WEIGHT_LINE.test(row) || SUBTOTAL.test(row)) {
      if (SUBTOTAL.test(row)) result.skipped.push(row)
      continue
    }

    const qty = row.match(QTY_LINE)
    if (qty) {
      const n = Number(qty[1])
      const unit = toCents(qty[2])
      const lineTotal = qty[3] ? toCents(qty[3]) : n * unit
      const prev = last as ParsedLine | null
      if (prev && !lastFromQtyCheck && Math.abs(prev.priceCents - lineTotal) <= 1) {
        // Mengenzeile nach dem Artikel (Preis passt)
        prev.quantity = n
        lastFromQtyCheck = true
      } else if (pendingTexts.length > 0) {
        // Text steht direkt davor, Preis kommt nur in der Mengenzeile.
        // Ältere Texte ohne Preis davor waren Kopf- oder Hinweiszeilen.
        const text = pendingTexts.pop()!
        result.skipped.push(...pendingTexts.splice(0))
        pushLine(text, lineTotal)
        last!.quantity = n
        lastFromQtyCheck = true
      } else {
        // Mengenzeile vor dem Artikel
        pendingQty = n
      }
      continue
    }

    const inline = row.match(INLINE_QTY)
    if (inline && !isNoise(inline[1])) {
      pushLine(clean(inline[1]), toCents(inline[4]))
      last!.quantity = Number(inline[2])
      lastFromQtyCheck = true
      continue
    }

    const table = row.match(TABLE_LINE)
    if (table && !isNoise(table[2])) {
      const n = table[1] ? Number(table[1]) : 1
      pushLine(clean(table[2]), pickTableAmount(n, table[3], table[4], table[5]))
      last!.quantity = n
      lastFromQtyCheck = true
      continue
    }

    const priceOnly = row.match(PRICE_ONLY)
    if (priceOnly) {
      const cents = toCents(priceOnly[1])
      if (pendingTexts.length) {
        // Menge vorn im Namen ("1 ABLAGEKORB A4 ROT") abtrennen
        const t = pendingTexts.shift()!
        const lead = t.match(/^(\d{1,3})\s+(\D.*)$/)
        pushLine(lead ? lead[2] : t, cents)
        if (lead) last!.quantity = Number(lead[1])
      }
      else result.skipped.push(row)
      continue
    }

    const priced = row.match(PRICE_END)
    if (priced) {
      const label = clean(row.slice(0, priced.index!).replace(/\s+\d+[.,]\d+\s*kg$/i, ''))
      if (label && !isNoise(label)) {
        pushLine(label, toCents(priced[1]))
        continue
      }
    }

    if (isNoise(row) || (result.lines.length === 0 && detectStore(row)) || row.length < 2) {
      result.skipped.push(row)
      continue
    }
    pendingTexts.push(row)
  }

  // Übrig gebliebene Texte ohne Preis zur Kontrolle melden
  result.skipped.push(...pendingTexts)
  return result
}
