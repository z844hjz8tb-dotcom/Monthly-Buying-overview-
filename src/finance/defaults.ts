import type { Account, Category, TrackerDB } from '../db/schema'

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'ing', name: 'ING Girokonto', kind: 'giro', order: 1 },
  { id: 'amex', name: 'American Express', kind: 'credit', order: 2 },
  { id: 'paypal', name: 'PayPal', kind: 'paypal', order: 3 },
  { id: 'bar', name: 'Bargeld', kind: 'cash', order: 4 },
]

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'lebensmittel', name: 'Lebensmittel', icon: 'cart', color: 'cat-1', order: 1 },
  { id: 'drogerie', name: 'Drogerie', icon: 'droplet', color: 'cat-2', order: 2 },
  { id: 'gesundheit', name: 'Gesundheit', icon: 'heart', color: 'cat-12', order: 2.5 },
  { id: 'online', name: 'Online-Shopping', icon: 'package', color: 'cat-3', order: 3 },
  { id: 'wohnen', name: 'Wohnen', icon: 'home', color: 'cat-4', order: 4 },
  { id: 'hausbau', name: 'Hausbau', icon: 'hammer', color: 'cat-11', order: 4.5 },
  { id: 'kredite', name: 'Kredite', icon: 'percent', color: 'cat-5', order: 5 },
  { id: 'versicherungen', name: 'Versicherungen', icon: 'shield', color: 'cat-6', order: 6 },
  { id: 'abos', name: 'Abos', icon: 'repeat', color: 'cat-7', order: 7 },
  { id: 'mobilitaet', name: 'Mobilität', icon: 'car', color: 'cat-8', order: 8 },
  { id: 'freizeit', name: 'Freizeit', icon: 'ticket', color: 'cat-9', order: 9 },
  { id: 'schule', name: 'Schule & Kita', icon: 'school', color: 'cat-14', order: 9.3 },
  { id: 'haustier', name: 'Haustier', icon: 'paw', color: 'cat-13', order: 9.6 },
  { id: 'sonstiges', name: 'Sonstiges', icon: 'tag', color: 'cat-10', order: 10 },
]

export const FALLBACK_CATEGORY = 'sonstiges'
/** Drogerien: Bons dieser Läden zählen als "Drogerie", alle anderen als "Lebensmittel" */
export const DRUGSTORES = ['Müller', 'dm', 'Rossmann']

export const ACCOUNT_KINDS: { id: Account['kind']; name: string }[] = [
  { id: 'giro', name: 'Girokonto' },
  { id: 'savings', name: 'Tagesgeld' },
  { id: 'depot', name: 'Depot' },
  { id: 'credit', name: 'Kreditkarte' },
  { id: 'paypal', name: 'PayPal' },
  { id: 'cash', name: 'Bargeld' },
]

/** Zahlungskonten (Alltag) vs. Spar- und Anlagekonten */
export const isSavingsKind = (kind: Account['kind']) => kind === 'savings' || kind === 'depot'

/** Legt fehlende Standardkonten und -kategorien an; bestehende (ggf. umbenannte) bleiben unverändert. */
export async function ensureDefaults(db: TrackerDB): Promise<void> {
  await db.transaction('rw', db.accounts, db.categories, async () => {
    const [accounts, categories] = await Promise.all([db.accounts.toCollection().primaryKeys(), db.categories.toCollection().primaryKeys()])
    const missingA = DEFAULT_ACCOUNTS.filter((a) => !accounts.includes(a.id))
    const missingC = DEFAULT_CATEGORIES.filter((c) => !categories.includes(c.id))
    if (missingA.length) await db.accounts.bulkAdd(missingA)
    if (missingC.length) await db.categories.bulkAdd(missingC)
  })
}
