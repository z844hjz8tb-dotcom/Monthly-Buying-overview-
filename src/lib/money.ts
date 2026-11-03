// Beträge werden überall als ganze Cent (number) gespeichert, um Rundungsfehler zu vermeiden.

const formatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

/** Parst deutsche und englische Preisangaben ("1.234,56 €", "12,99", "12.99") in Cent. */
export function parseEuroToCents(input: string): number | null {
  let s = input.replace(/[^\d,.-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma && lastComma !== -1) {
    s = s.replace(/,/g, '')
  } else if (lastDot !== -1 && s.length - lastDot - 1 === 3 && lastComma === -1) {
    // "1.234" -> Tausenderpunkt
    s = s.replace(/\./g, '')
  }
  const value = Number(s)
  return Number.isFinite(value) ? Math.round(value * 100) : null
}
