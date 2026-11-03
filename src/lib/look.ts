/** Farbwelten der App. Die Wahl gilt pro Gerät (localStorage), Standard ist "frisch". */
export const LOOKS = [
  { id: 'frisch', name: 'Frisch', hint: 'Petrol & Limette', swatch: ['#0f766e', '#14b8a6', '#a3e635'] },
  { id: 'sonne', name: 'Sonne', hint: 'Koralle & Gold', swatch: ['#c2410c', '#f97316', '#fbbf24'] },
  { id: 'abend', name: 'Abend', hint: 'Dunkel mit Violett', swatch: ['#1e1b4b', '#7c3aed', '#db2777'] },
] as const

export type LookId = (typeof LOOKS)[number]['id']
const KEY = 'ausgaben-look'

export function getLook(): LookId {
  try {
    const v = localStorage.getItem(KEY)
    if (LOOKS.some((l) => l.id === v)) return v as LookId
  } catch {
    // privater Modus o. ä.
  }
  return 'frisch'
}

export function applyLook(id: LookId = getLook()): void {
  document.documentElement.dataset.look = id
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (meta && bg) meta.setAttribute('content', bg)
}

export function setLook(id: LookId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // ignorieren
  }
  applyLook(id)
}

/** Feste Farbe je Laden (gleicher Laden = gleiche Farbe), aus einer kleinen, gut unterscheidbaren Palette. */
const STORE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f', '#9333ea', '#0f766e']
const KNOWN: Record<string, number> = { Lidl: 0, Kaufland: 1, Penny: 6, Müller: 3, Rewe: 2, Aldi: 5, Netto: 4, Edeka: 7, dm: 8, Rossmann: 9 }

export function storeColor(store: string): string {
  if (store in KNOWN) return STORE_COLORS[KNOWN[store]]
  let h = 0
  for (const c of store) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return STORE_COLORS[h % STORE_COLORS.length]
}
