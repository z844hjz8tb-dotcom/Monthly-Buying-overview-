import type { Account, TrackerDB } from '../db/schema'
import { ACCOUNT_KINDS } from './defaults'

/**
 * Konten per Link einrichten: /#/einrichten?k=<base64url(JSON)>. Die Kontodaten stehen nur im Link
 * (Teil nach "#", geht nicht an den Server) – so lassen sich mehrere Konten mit einem Tipp anlegen.
 */
export interface SetupAccount {
  name: string
  kind: Account['kind']
  matchNames?: string[]
  countsAsSaving?: boolean
  iban?: string
}

const KINDS = new Set(ACCOUNT_KINDS.map((k) => k.id))
const normIban = (s?: string) => (s ?? '').replace(/\s+/g, '').toUpperCase()

export function encodeSetup(list: SetupAccount[]): string {
  const json = JSON.stringify(list.map((a) => ({ n: a.name, k: a.kind, m: a.matchNames, s: a.countsAsSaving ? 1 : undefined, i: a.iban ? normIban(a.iban) : undefined })))
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Liest den Link; wirft bei kaputten Daten. Unbekannte Felder und Arten werden verworfen. */
export function decodeSetup(code: string): SetupAccount[] {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  const raw = JSON.parse(json) as { n?: unknown; k?: unknown; m?: unknown; s?: unknown; i?: unknown }[]
  if (!Array.isArray(raw)) throw new Error('Ungültiger Einrichtungs-Link')
  return raw.flatMap((r) => {
    const name = typeof r.n === 'string' ? r.n.trim().slice(0, 80) : ''
    const kind = typeof r.k === 'string' && KINDS.has(r.k as Account['kind']) ? (r.k as Account['kind']) : undefined
    if (!name || !kind) return []
    const matchNames = Array.isArray(r.m) ? r.m.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 80)) : undefined
    return [{ name, kind, matchNames: matchNames?.length ? matchNames : undefined, countsAsSaving: r.s === 1 || r.s === true, iban: typeof r.i === 'string' && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(normIban(r.i)) ? normIban(r.i) : undefined }]
  })
}

/** Was passiert beim Anlegen: neu, oder schon vorhanden (gleiche IBAN oder gleicher Name) → ergänzen */
export function planSetup(list: SetupAccount[], existing: Account[]): { item: SetupAccount; existing?: Account }[] {
  return list.map((item) => ({
    item,
    existing: existing.find((a) => !a.demo && ((item.iban && normIban(a.iban) === normIban(item.iban)) || a.name.trim().toLowerCase() === item.name.toLowerCase())),
  }))
}

/** Legt fehlende Konten an, ergänzt bei vorhandenen "Erkennen an" und IBAN. Gibt [neu, ergänzt] zurück. */
export async function applySetup(db: TrackerDB, list: SetupAccount[]): Promise<[number, number]> {
  const plan = planSetup(list, await db.accounts.toArray())
  let added = 0
  let updated = 0
  let order = 100 + (await db.accounts.count())
  for (const [i, { item, existing }] of plan.entries()) {
    if (existing) {
      const matchNames = [...new Set([...(existing.matchNames ?? []), ...(item.matchNames ?? [])])]
      await db.accounts.update(existing.id, { matchNames: matchNames.length ? matchNames : undefined, iban: existing.iban ?? (item.iban ? normIban(item.iban) : undefined) })
      updated++
    } else {
      await db.accounts.add({
        id: `k-${Date.now().toString(36)}-${i}`,
        name: item.name,
        kind: item.kind,
        order: order++,
        ...(item.matchNames ? { matchNames: item.matchNames } : {}),
        ...(item.countsAsSaving ? { countsAsSaving: true } : {}),
        ...(item.iban ? { iban: normIban(item.iban) } : {}),
      })
      added++
    }
  }
  return [added, updated]
}
