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

describe('Müller', () => {
  it('liest Tabellenzeilen mit Menge, Preis, Nachlass und Summe', () => {
    const r = parseReceiptText(`
      MH Müller Handels GmbH, Albstraße 92, 89081 Ulm
      Stk Artikel             Preis Nachlass  Summe
        1 MAY MASCARA LASH SE  12,99           12,99a
        1 LOREAL REVITALIFT F   5,95            5,95a
        1 YEAUTY EYE PAD MASK   0,95            0,95a
        1 YEAUTY EYE PAD MASK   0,95            0,95a
        1 KOPFBEDECKUNG-10205  12,99           12,99a
        1 CATTIER HANDCREME H   4,00            4,00a
        1 KATJES SAUER GRUEN    1,39            1,39b
        7 Zwischensumme                 0,00    39,22
       ZU BEZAHLEN     39,22
         Kartenzahlung              EUR       39,22
      Datum:                     31.10.2026
      Uhrzeit:                 09:23:33 Uhr
      MwSt %        Netto  MwSt.Betr.     Brutto
      b: 7,00        1,30       0,09       1,39
    `)
    expect(r.store).toBe('Müller')
    expect(r.date).toBe('2026-10-31')
    expect(r.totalCents).toBe(3922)
    expect(r.lines).toHaveLength(7)
    expect(r.lines[0]).toEqual({ rawText: 'MAY MASCARA LASH SE', quantity: 1, priceCents: 1299 })
    expect(r.lines[6]).toEqual({ rawText: 'KATJES SAUER GRUEN', quantity: 1, priceCents: 139 })
    expect(r.lines.reduce((s, l) => s + l.priceCents, 0)).toBe(3922)
  })

  it('zählt Zwischensummen nicht mit und rechnet Nachlass ein', () => {
    const r = parseReceiptText(`
      Müller
        1 ABLAGEKORB A4 ROT     2,59            2,59a
        1 VERPACKUNG:PAPIERT*   0,35            0,35a
        2 HEFT A5 16BL LIN.07   0,19            0,38a
       11 Zwischensumme                 0,00    3,32
        1 BUCHSCHONER TRANSPA   1,39    0,40    0,99a
        1 MALBLOCK  A3 PELIKA   3,89            3,89a
       46 Zwischensumme                 0,40    8,20
       ZU BEZAHLEN     8,20
    `)
    expect(r.lines.map((l) => [l.rawText, l.quantity, l.priceCents])).toEqual([
      ['ABLAGEKORB A4 ROT', 1, 259],
      ['VERPACKUNG:PAPIERT*', 1, 35],
      ['HEFT A5 16BL LIN.07', 2, 38],
      ['BUCHSCHONER TRANSPA', 1, 99],
      ['MALBLOCK A3 PELIKA', 1, 389],
    ])
    expect(r.totalCents).toBe(820)
  })
})

it('liest den kompletten Müller-Bon mit 46 Artikeln (abgetippt)', async () => {
  const { readFileSync } = await import('node:fs')
  const r = parseReceiptText(readFileSync(new URL('./fixtures/mueller-2026-08-18.txt', import.meta.url), 'utf8'))
  expect(r.store).toBe('Müller')
  expect(r.date).toBe('2026-08-18')
  expect(r.totalCents).toBe(6194)
  expect(r.lines).toHaveLength(46)
  expect(r.lines.reduce((s, l) => s + l.priceCents, 0)).toBe(6194)
  expect(r.lines.filter((l) => l.rawText === 'PLASTIK-SCHNELLHEFT')).toHaveLength(8)
})

it('paart Müller-Zeilen auch, wenn Live Text die Spalten trennt', () => {
  const r = parseReceiptText(`
    Müller
    Stk Artikel
    1 MAY MASCARA LASH SE
    1 LOREAL REVITALIFT F
    1 KATJES SAUER GRUEN
    12,99 12,99a
    5,95 5,95a
    1,39 1,39b
    ZU BEZAHLEN 20,33
  `)
  expect(r.lines.map((l) => [l.rawText, l.quantity, l.priceCents])).toEqual([
    ['MAY MASCARA LASH SE', 1, 1299],
    ['LOREAL REVITALIFT F', 1, 595],
    ['KATJES SAUER GRUEN', 1, 139],
  ])
})

describe('Texterkennung (echte Ausgabe von tesseract.js für Müller-Bilder)', () => {
  it.each([
    ['mueller-ocr-2026-08-18.txt', '2026-08-18', 46, 6194],
    ['mueller-ocr-2026-10-31.txt', '2026-10-31', 7, 3922],
    ['mueller-ocr-browser-2026-08-18.txt', '2026-08-18', 46, 6194],
    ['mueller-ocr-browser-2026-10-31.txt', '2026-10-31', 7, 3922],
  ])('%s', async (file, date, count, total) => {
    const { readFileSync } = await import('node:fs')
    const r = parseReceiptText(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'))
    expect(r.store).toBe('Müller')
    expect(r.date).toBe(date)
    expect(r.totalCents).toBe(total)
    expect(r.lines).toHaveLength(count)
    expect(r.lines.reduce((s, l) => s + l.priceCents, 0)).toBe(total)
    expect(r.lines.every((l) => /^[A-ZÄÖÜ]/.test(l.rawText))).toBe(true)
  })
})

it('korrigiert 0/9-Verwechslungen über die Preis-Spalte', () => {
  const r = parseReceiptText(`
    1 LINEAL 16CM KUNSTST   9,75            0,75a
    1 HEFT A5 16BL LIN.01   0,75            9,75a
    1 ZEICHENMAPPE A3 EIN   4,99            4,99a
    1 TEURES TEIL           9,75            9,75a
    1 RABATT ARTIKEL        2,00    0,50    1,50a
    ll BORSTENPINSEL GR8     1,39            1,39a
  `)
  expect(r.lines.map((l) => [l.rawText, l.priceCents])).toEqual([
    ['LINEAL 16CM KUNSTST', 75],
    ['HEFT A5 16BL LIN.01', 75],
    ['ZEICHENMAPPE A3 EIN', 499],
    ['TEURES TEIL', 975],
    ['RABATT ARTIKEL', 150],
    ['BORSTENPINSEL GR8', 139],
  ])
})

describe('PDF-eBons (echter Text aus pdf.js, ohne Adresse/Zahlungsdaten)', () => {
  it.each([
    ['kaufland-pdf-2026-10-21.txt', 'Kaufland', '2026-10-21', 93, 17129],
    ['penny-pdf-2026-10-06.txt', 'Penny', '2026-10-06', 74, 14599],
  ])('%s', async (file, store, date, count, total) => {
    const { readFileSync } = await import('node:fs')
    const r = parseReceiptText(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'))
    expect(r.store).toBe(store)
    expect(r.date).toBe(date)
    expect(r.totalCents).toBe(total)
    expect(r.lines).toHaveLength(count)
    expect(r.lines.reduce((s, l) => s + l.priceCents, 0)).toBe(total)
  })

  it('Kaufland: Menge in der Zeile, Mengenzeile danach, Card-Rabatt, Gewicht', async () => {
    const { readFileSync } = await import('node:fs')
    const r = parseReceiptText(readFileSync(new URL('./fixtures/kaufland-pdf-2026-10-21.txt', import.meta.url), 'utf8'))
    const find = (t: string) => r.lines.find((l) => l.rawText === t)
    expect(find('Katjes')).toEqual({ rawText: 'Katjes', quantity: 2, priceCents: 278 })
    expect(find('Cordon bleu gef.')).toEqual({ rawText: 'Cordon bleu gef.', quantity: 2, priceCents: 958 })
    expect(find('Corny free Banane')?.priceCents).toBe(159) // 1,79 − 0,20 Rabatt
    expect(find('Bananen kg')?.priceCents).toBe(65)
    expect(find('KLC Mangostr. 125g')?.priceCents).toBe(167)
    expect(r.lines.some((l) => /Treuepunkte|gespart|DE\d+/.test(l.rawText))).toBe(false)
  })
})

it('erkennt den Laden an der Kopfzeile, nicht an Produktnamen', () => {
  expect(parseReceiptText('Kaufland\nMüllermilch 1,49 B\nSumme 1,49').store).toBe('Kaufland')
})

it('Lidl (echte Bilderkennung): Lidl-Plus-Rabatte werden mit dem Artikel verrechnet', async () => {
  const { readFileSync } = await import('node:fs')
  const r = parseReceiptText(readFileSync(new URL('./fixtures/lidl-bild-2026-11-02.txt', import.meta.url), 'utf8'))
  expect(r.store).toBe('Lidl')
  expect(r.date).toBe('2026-11-02')
  expect(r.totalCents).toBe(1182)
  expect(r.lines).toHaveLength(12)
  expect(r.lines.reduce((s, l) => s + l.priceCents, 0)).toBe(1182)
  expect(r.lines[0]).toEqual({ rawText: 'Biol. Apfel rot 600g', quantity: 1, priceCents: 149 })
  expect(r.lines.filter((l) => l.rawText.startsWith('Pfand'))).toHaveLength(2)
})
