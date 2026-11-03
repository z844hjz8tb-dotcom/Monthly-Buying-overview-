import { describe, expect, it } from 'vitest'
import { parseEuroToCents } from '../src/lib/money'

describe('parseEuroToCents', () => {
  it.each([
    ['12,99 €', 1299],
    ['EUR 1.234,56', 123456],
    ['12.99', 1299],
    ['1,234.56', 123456],
    ['5', 500],
    ['1.234', 123400],
    ['-3,10', -310],
  ])('%s -> %i', (input, cents) => {
    expect(parseEuroToCents(input)).toBe(cents)
  })

  it('gibt null für leere Eingaben zurück', () => {
    expect(parseEuroToCents('kostenlos')).toBeNull()
  })
})
