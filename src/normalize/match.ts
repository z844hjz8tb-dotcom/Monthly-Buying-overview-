/**
 * Ladenübergreifendes Zusammenführen von Bontexten.
 *
 * Läden kürzen unterschiedlich ab ("H-VOLLM. 3,5%", "Vollmilch 3.5 % 1L").
 * Wir vergleichen daher normalisierte Wörter und lassen Abkürzungen als
 * Wortanfang gelten ("vollm" passt zu "vollmilch").
 */

/** Einheitliche Form für Alias-Schlüssel: klein, ohne Satzzeichen, Dezimalkomma -> Punkt. */
export function normalizeRaw(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.%]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ %/g, '%')
    .replace(/(\d) (g|kg|l|ml|stk|st)\b/g, '$1$2')
    .trim()
}

/** Wörter für den Vergleich; Zahlen und Einheiten bleiben erhalten ("3.5", "%"). */
export function tokens(raw: string): string[] {
  return normalizeRaw(raw)
    .replace(/(\d)(%|[a-z]+)/g, '$1 $2')
    .split(' ')
    .filter((t) => t.length > 0)
}

function tokenScore(a: string, b: string): number {
  if (a === b) return 1
  const isNum = /^\d/.test(a) || /^\d/.test(b)
  if (isNum) return 0
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  // Abkürzung: Wortanfang ("vollm" -> "vollmilch"), mindestens 3 Zeichen
  if (short.length >= 3 && long.startsWith(short)) return 0.6 + 0.4 * (short.length / long.length)
  // Wortteil: "vollmilch" in "hvollmilch"
  if (short.length >= 4 && long.includes(short)) return 0.6
  return 0
}

/**
 * Ähnlichkeit zweier Bontexte zwischen 0 und 1.
 * Für jedes Wort des kürzeren Textes wird das beste Gegenstück gesucht.
 */
export function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return 0
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  let sum = 0
  for (const t of small) sum += Math.max(...big.map((u) => tokenScore(t, u)))
  const coverage = sum / small.length
  // leichte Strafe, wenn der längere Text viele zusätzliche Wörter hat
  const lengthPenalty = small.length / big.length
  return coverage * (0.8 + 0.2 * lengthPenalty)
}

export interface Candidate {
  productId: number
  name: string
  /** weitere bekannte Schreibweisen dieses Produkts (normalisierte Bontexte) */
  aliases: string[]
}

export interface Suggestion {
  productId: number
  name: string
  score: number
}

export function suggestProducts(raw: string, candidates: Candidate[], limit = 3, minScore = 0.45): Suggestion[] {
  return candidates
    .map((c) => ({
      productId: c.productId,
      name: c.name,
      score: Math.max(similarity(raw, c.name), ...c.aliases.map((a) => similarity(raw, a))),
    }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Vorschlag für einen Produktnamen aus einem Bontext: "H-VOLLM. 3,5%" -> "H-Vollm. 3,5%" */
export function suggestName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}
