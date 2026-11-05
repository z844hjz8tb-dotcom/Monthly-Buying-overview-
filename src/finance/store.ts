import type { Transaction, TrackerDB } from '../db/schema'

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt'> & { id?: number }

/** Betrag passend zur Art speichern: Ausgaben negativ, Einnahmen positiv, Umbuchung wie eingegeben. */
export function signedAmount(kind: Transaction['kind'], cents: number): number {
  const abs = Math.abs(cents)
  if (kind === 'expense') return -abs
  if (kind === 'income') return abs
  return cents
}

export async function saveTransaction(db: TrackerDB, input: TransactionInput): Promise<number> {
  const row = {
    ...input,
    counterparty: input.counterparty.trim(),
    purpose: input.purpose?.trim() || undefined,
    categoryId: input.kind === 'transfer' ? undefined : input.categoryId,
  }
  if (input.id !== undefined) {
    await db.transactions.update(input.id, row)
    return input.id
  }
  return (await db.transactions.add({ ...row, createdAt: new Date().toISOString() })) as number
}

export async function deleteTransaction(db: TrackerDB, id: number): Promise<void> {
  await db.transactions.delete(id)
}
