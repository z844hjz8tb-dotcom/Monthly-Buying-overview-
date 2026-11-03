import { describe, expect, it } from 'vitest'
import { parseReceiptText } from '../src/receipts/parse'

const lines = (r: ReturnType<typeof parseReceiptText>) => r.lines.map((l) => [l.rawText, l.quantity, l.priceCents])

describe('parseReceiptText', () => {
  it('liest einen Discounter-Bon mit Mengen- und Rabattzeilen', () => {
    const r = parseReceiptText(`
      LIDL
      Musterstraße 12
      12345 Musterstadt
      EUR
      H-Vollm. 3,5%            1,98 A
        2 x 0,99
      Bananen                  1,25 A
        0,840 kg x 1,49 EUR/kg
      Toast Weizen             0,89 A
      Preisvorteil            -0,10
      Pfandrückgabe           -0,75 A
      ---------------------------------
      Summe                    3,27
      Bar                     10,00
      Rückgeld                 6,73
      A 7%    3,05   0,21   3,27
      03.11.26  18:12
    `)
    expect(r.store).toBe('Lidl')
    expect(r.date).toBe('2026-11-03')
    expect(r.totalCents).toBe(327)
    expect(lines(r)).toEqual([
      ['H-Vollm. 3,5%', 2, 198],
      ['Bananen', 1, 125],
      ['Toast Weizen', 1, 79],
      ['Pfandrückgabe', 1, -75],
    ])
    expect(r.lines.reduce((s, l) => s + l.priceCents, 0)).toBe(r.totalCents)
  })

  it('liest einen eBon mit Mengenzeile vor dem Artikel und Euro-Zeichen', () => {
    const r = parseReceiptText(`
      PENNY Markt GmbH
      Datum: 01.11.2026
      2 Stk x 1,05 €
      H-MILCH 3,5% 1L        2,10 € A
      NUDELN SPIRELLI        0,79 € A
      Summe EUR              2,89
    `)
    expect(r.store).toBe('Penny')
    expect(r.date).toBe('2026-11-01')
    expect(lines(r)).toEqual([
      ['H-MILCH 3,5% 1L', 2, 210],
      ['NUDELN SPIRELLI', 1, 79],
    ])
  })

  it('paart Live-Text-Spalten: erst Namen, dann Preise', () => {
    const r = parseReceiptText(`
      Kaufland
      K-Cl. H-Milch 3,5
      Butter Dt.Marken
      Zahnpasta
      1,98 A
      1,89 A
      0,95 B
      Summe 4,82
    `)
    expect(r.store).toBe('Kaufland')
    expect(lines(r)).toEqual([
      ['K-Cl. H-Milch 3,5', 1, 198],
      ['Butter Dt.Marken', 1, 189],
      ['Zahnpasta', 1, 95],
    ])
    expect(r.totalCents).toBe(482)
  })

  it('übernimmt den Preis aus einer Mengenzeile mit Zeilensumme', () => {
    const r = parseReceiptText(`
      Müller Drogerie
      Duschgel Sensitiv
      3 Stk x 0,95   2,85
      Wattepads 0,79
      Gesamtbetrag 3,64
    `)
    expect(r.store).toBe('Müller')
    expect(lines(r)).toEqual([
      ['Duschgel Sensitiv', 3, 285],
      ['Wattepads', 1, 79],
    ])
  })

  it('meldet unbrauchbare Zeilen, statt sie zu raten', () => {
    const r = parseReceiptText('Irgendwas ohne Preis\nNoch ein Text')
    expect(r.lines).toEqual([])
    expect(r.skipped).toEqual(['Irgendwas ohne Preis', 'Noch ein Text'])
  })
})
