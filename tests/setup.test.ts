import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackerDB } from '../src/db/schema'
import { ensureDefaults } from '../src/finance/defaults'
import { applySetup, decodeSetup, encodeSetup, type SetupAccount } from '../src/finance/setupLink'

const dbs: TrackerDB[] = []
let n = 0
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const list: SetupAccount[] = [
  { name: 'Depot Lena', kind: 'depot', matchNames: ['Sparplan Lena'], countsAsSaving: true },
  { name: 'Urlaub', kind: 'savings', matchNames: ['Urlaub'], iban: 'DE00 0000 0000 0000 0000 11' },
  { name: 'ING Depot', kind: 'depot', matchNames: ['Wertpapier'] }, // gibt es schon → nur ergänzen
]

describe('Konten per Link einrichten', () => {
  it('Link hin und zurück, auch mit Umlauten', () => {
    const code = encodeSetup([...list, { name: 'Rücklage Weihnachten', kind: 'savings' }])
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = decodeSetup(code)
    expect(back[0]).toEqual({ name: 'Depot Lena', kind: 'depot', matchNames: ['Sparplan Lena'], countsAsSaving: true, iban: undefined })
    expect(back[1].iban).toBe('DE00000000000000000011')
    expect(back[3].name).toBe('Rücklage Weihnachten')
  })

  it('verwirft unbekannte Arten und kaputte Links', () => {
    const bad = btoa(JSON.stringify([{ n: 'X', k: 'hack' }, { n: '', k: 'giro' }, { n: 'Ok', k: 'giro', i: 'kein iban' }])).replace(/=+$/, '')
    expect(decodeSetup(bad)).toEqual([{ name: 'Ok', kind: 'giro', matchNames: undefined, countsAsSaving: false, iban: undefined }])
    expect(() => decodeSetup('%%%')).toThrow()
  })

  it('legt fehlende Konten an, ergänzt vorhandene, zweimal ohne Duplikate', async () => {
    const db = new TrackerDB(`setup-${n++}`)
    dbs.push(db)
    await ensureDefaults(db)
    const before = await db.accounts.count()
    expect(await applySetup(db, list)).toEqual([2, 1])
    expect(await applySetup(db, list)).toEqual([0, 3])
    expect(await db.accounts.count()).toBe(before + 2)
    expect((await db.accounts.get('ing-depot'))?.matchNames).toEqual(['Wertpapier'])
    const urlaub = (await db.accounts.toArray()).find((a) => a.name === 'Urlaub')!
    expect(urlaub).toMatchObject({ kind: 'savings', iban: 'DE00000000000000000011', matchNames: ['Urlaub'] })
    expect(urlaub.countsAsSaving).toBeUndefined()
  })
})
