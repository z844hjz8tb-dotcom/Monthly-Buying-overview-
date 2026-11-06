import { describe, expect, it } from 'vitest'
import { HELP_TOPICS, helpTopicFor } from '../src/help/topics'

describe('Hilfe', () => {
  it('hat eindeutige Themen', () => {
    const ids = HELP_TOPICS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('führt von jeder Seite zu einem existierenden Thema', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id))
    for (const path of ['/start', '/konten', '/konto/ing', '/buchung/neu', '/uebersicht', '/monat/2026-11', '/import', '/import/bank', '/bons', '/bon/neu', '/zuordnen', '/produkte', '/einstellungen', '/unbekannt']) {
      expect(ids.has(helpTopicFor(path)), path).toBe(true)
    }
    expect(helpTopicFor('/import/bank')).toBe('ing')
    expect(helpTopicFor('/import')).toBe('amazon')
    expect(helpTopicFor('/bon/neu')).toBe('bons')
  })
})
