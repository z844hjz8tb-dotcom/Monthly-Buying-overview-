import { describe, expect, it } from 'vitest'
import { normalizeRaw, similarity, suggestName, suggestProducts, type Candidate } from '../src/normalize/match'

describe('normalizeRaw', () => {
  it('vereinheitlicht Schreibweisen', () => {
    expect(normalizeRaw('  H-VOLLM. 3,5% ')).toBe('h vollm 3.5%')
    expect(normalizeRaw('Käse Gouda  jung')).toBe('kaese gouda jung')
    expect(normalizeRaw('h-vollm 3,5 %')).toBe(normalizeRaw('H-VOLLM. 3,5%'))
    expect(normalizeRaw('Mehl 1 kg')).toBe('mehl 1kg')
  })
})

describe('similarity', () => {
  it('erkennt Abkürzungen als ähnlich', () => {
    expect(similarity('H-VOLLM. 3,5%', 'Vollmilch 3,5 %')).toBeGreaterThan(0.6)
    expect(similarity('BIO BANANEN', 'Bananen')).toBeGreaterThan(0.7)
  })

  it('unterscheidet verschiedene Produkte', () => {
    expect(similarity('H-VOLLM. 3,5%', 'Butter')).toBe(0)
    expect(similarity('Vollmilch 3,5 %', 'Vollmilch 1,5 %')).toBeLessThan(similarity('Vollmilch 3,5 %', 'Vollmilch 3.5%'))
  })
})

describe('suggestProducts', () => {
  const candidates: Candidate[] = [
    { productId: 1, name: 'Vollmilch 3,5 %', aliases: ['milsani h milch 3.5%'] },
    { productId: 2, name: 'Bananen', aliases: [] },
    { productId: 3, name: 'Butter', aliases: ['dt markenbutter'] },
  ]

  it('schlägt das passende Produkt zuerst vor', () => {
    expect(suggestProducts('H-VOLLMILCH 3,5', candidates)[0]?.productId).toBe(1)
    expect(suggestProducts('Markenbutter 250g', candidates)[0]?.productId).toBe(3)
  })

  it('macht keine Vorschläge bei fehlender Ähnlichkeit', () => {
    expect(suggestProducts('Zahnpasta', candidates)).toEqual([])
  })
})

it('suggestName macht Großbuchstaben lesbar', () => {
  expect(suggestName('H-VOLLM. 3,5%')).toBe('H-Vollm. 3,5%')
})
