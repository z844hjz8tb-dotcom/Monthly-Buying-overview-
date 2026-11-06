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

/** Einheitliche Form eines Bank-Exports, egal von welcher Bank */
export interface BankExport {
  source: Transaction['source']
  /** Name für die Anzeige, z. B. "ING-Umsatzexport" */
  label: string
  iban?: string
  accountName?: string
  customer?: string
  saldoCents?: number
  saldoDate?: string
  /** Vorschlag, auf welches Konto importiert wird (z. B. "amex"), falls die IBAN nicht passt */
  defaultAccountId: string
  rows: (BankRow & { importKey: string; valueDate?: string; funding?: Transaction['funding'] })[]
}

export function ingToBankExport(ex: IngExport): BankExport {
  return {
    source: 'ing',
    label: 'ING-Umsatzexport',
    iban: ex.iban,
    accountName: ex.accountName,
    customer: ex.customer,
    saldoCents: ex.saldoCents,
    saldoDate: ex.saldoDate,
    defaultAccountId: 'ing',
    rows: ex.rows.map((r) => ({ ...r, importKey: ingImportKey(ex.iban, r) })),
  }
}

export interface PlannedRow {
  row: BankRow & { valueDate?: string; funding?: Transaction['funding'] }
  importKey: string
  duplicate: boolean
  tx: Omit<Transaction, 'id' | 'createdAt'>
}

/** Vorschau: jede Zeile eingeordnet, Duplikate (schon importiert) markiert. Schreibt nichts. */
export async function planBankImport(db: TrackerDB, ex: BankExport, accountId: string): Promise<PlannedRow[]> {
  const ctx = await buildContext(db, accountId)
  const keys = ex.rows.map((r) => r.importKey)
  const existing = new Set((await db.transactions.where('importKey').anyOf(keys).toArray()).map((t) => t.importKey))
  return ex.rows.map((row) => {
    const c = classify(row, ctx)
    return {
      row,
      importKey: row.importKey,
      duplicate: existing.has(row.importKey),
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
        funding: row.funding,
        source: ex.source,
        importKey: row.importKey,
      },
    }
  })
}

export interface ImportResult {
  added: number
  skipped: number
}

/** Schreibt neue Buchungen, merkt sich IBAN und Kontostand (falls die Datei sie hat). */
export async function applyBankImport(db: TrackerDB, ex: BankExport, accountId: string, plan: PlannedRow[]): Promise<ImportResult> {
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

/** Kurzformen für den ING-Export */
export const planIngImport = (db: TrackerDB, ex: IngExport, accountId: string) => planBankImport(db, ingToBankExport(ex), accountId)
export const applyIngImport = (db: TrackerDB, ex: IngExport, accountId: string, plan: PlannedRow[]) =>
  applyBankImport(db, ingToBankExport(ex), accountId, plan)

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
