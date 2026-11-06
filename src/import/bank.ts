import type { Transaction, TrackerDB } from '../db/schema'
import { classify, type BankRow, type ClassifyContext } from '../finance/classify'
import { ingImportKey, type IngExport } from './ing'

export const OWN_NAMES_KEY = 'ownNames'

export async function loadOwnNames(db: TrackerDB): Promise<string[]> {
  const v = (await db.meta.get(OWN_NAMES_KEY))?.value
  return v ? (JSON.parse(v) as string[]) : []
}

export async function saveOwnNames(db: TrackerDB, names: string[]): Promise<void> {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  await db.meta.put({ key: OWN_NAMES_KEY, value: JSON.stringify(clean) })
}

/** Aus "Kunde;Max Muster, Erika Muster" → ["Max Muster", "Erika Muster", "Max und Erika Muster", "Max Muster und Erika Muster"] */
export function ownNamesFromCustomer(customer: string | undefined): string[] {
  if (!customer) return []
  const names = customer.split(/,|\bund\b/).map((s) => s.trim()).filter(Boolean)
  const out = [...names]
  if (names.length === 2) {
    const [a, b] = names.map((n) => n.split(/\s+/))
    if (a.length >= 2 && b.length >= 2 && a[a.length - 1] === b[b.length - 1]) out.push(`${a.slice(0, -1).join(' ')} und ${b.join(' ')}`)
    out.push(`${names[0]} und ${names[1]}`)
  }
  return out
}

export async function buildContext(db: TrackerDB, accountId: string): Promise<ClassifyContext> {
  const [accounts, ownNames, rules] = await Promise.all([db.accounts.toArray(), loadOwnNames(db), db.categoryRules.toArray()])
  return { accountId, accounts, ownNames, rules }
}

export interface PlannedRow {
  row: BankRow & { valueDate?: string }
  importKey: string
  duplicate: boolean
  tx: Omit<Transaction, 'id' | 'createdAt'>
}

/** Vorschau: jede Zeile eingeordnet, Duplikate (schon importiert) markiert. Schreibt nichts. */
export async function planIngImport(db: TrackerDB, ex: IngExport, accountId: string): Promise<PlannedRow[]> {
  const ctx = await buildContext(db, accountId)
  const keys = ex.rows.map((r) => ingImportKey(ex.iban, r))
  const existing = new Set((await db.transactions.where('importKey').anyOf(keys).toArray()).map((t) => t.importKey))
  return ex.rows.map((row, i) => {
    const c = classify(row, ctx)
    return {
      row,
      importKey: keys[i],
      duplicate: existing.has(keys[i]),
      tx: {
        accountId,
        date: row.date,
        amountCents: row.amountCents,
        counterparty: c.counterparty,
        rawCounterparty: row.counterparty,
        purpose: row.purpose || undefined,
        bookingText: row.bookingText,
        kind: c.kind,
        categoryId: c.categoryId,
        transferAccountId: c.transferAccountId,
        linkedOrderId: c.linkedOrderId,
        source: 'ing',
        importKey: keys[i],
      },
    }
  })
}

export interface ImportResult {
  added: number
  skipped: number
}

/** Schreibt neue Buchungen, merkt sich IBAN und Kontostand. */
export async function applyIngImport(db: TrackerDB, ex: IngExport, accountId: string, plan: PlannedRow[]): Promise<ImportResult> {
  const fresh = plan.filter((p) => !p.duplicate)
  const now = new Date().toISOString()
  await db.transaction('rw', db.transactions, db.accounts, db.meta, async () => {
    if (fresh.length) await db.transactions.bulkAdd(fresh.map((p) => ({ ...p.tx, createdAt: now })))
    const acc = await db.accounts.get(accountId)
    if (acc) {
      const patch: Partial<typeof acc> = {}
      if (ex.iban && !acc.iban) patch.iban = ex.iban
      if (ex.saldoCents !== undefined && ex.saldoDate && (!acc.balanceDate || ex.saldoDate >= acc.balanceDate)) {
        patch.balanceCents = ex.saldoCents
        patch.balanceDate = ex.saldoDate
      }
      if (Object.keys(patch).length) await db.accounts.update(accountId, patch)
    }
    await db.meta.put({ key: `lastImport:${accountId}`, value: now })
  })
  return { added: fresh.length, skipped: plan.length - fresh.length }
}

/**
 * Ordnet alle importierten, nicht von Hand geänderten Buchungen neu ein – z. B. nachdem
 * eine Regel gelernt oder bei einem Konto "Erkennen an" ergänzt wurde.
 */
export async function reclassifyImported(db: TrackerDB): Promise<number> {
  const rows = await db.transactions.filter((t) => t.source !== 'manual' && !t.edited && !!t.bookingText).toArray()
  const contexts = new Map<string, ClassifyContext>()
  let changed = 0
  for (const t of rows) {
    if (!contexts.has(t.accountId)) contexts.set(t.accountId, await buildContext(db, t.accountId))
    const c = classify(
      { date: t.date, amountCents: t.amountCents, counterparty: t.rawCounterparty ?? t.counterparty, bookingText: t.bookingText ?? '', purpose: t.purpose ?? '' },
      contexts.get(t.accountId)!,
    )
    if (c.kind !== t.kind || c.categoryId !== t.categoryId || c.transferAccountId !== t.transferAccountId) {
      await db.transactions.update(t.id!, { kind: c.kind, categoryId: c.categoryId, transferAccountId: c.transferAccountId })
      changed++
    }
  }
  return changed
}
