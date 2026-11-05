import type { Account, Transaction, TrackerDB } from '../db/schema'

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt'> & { id?: number }

/** Betrag passend zur Art speichern: Ausgaben negativ, Einnahmen positiv, sonst wie eingegeben. */
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
    categoryId: input.kind === 'expense' ? input.categoryId : undefined,
  }
  if (input.id !== undefined) {
    await db.transactions.update(input.id, row)
    return input.id
  }
  return (await db.transactions.add({ ...row, createdAt: new Date().toISOString() })) as number
}

/** Löscht eine Buchung samt Gegenbuchung (bei Umbuchungen). */
export async function deleteTransaction(db: TrackerDB, id: number): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const t = await db.transactions.get(id)
    if (t?.pairId !== undefined) await db.transactions.delete(t.pairId)
    await db.transactions.delete(id)
  })
}

/**
 * Art einer Geldbewegung zwischen zwei eigenen Konten:
 * auf ein Spar-Konto (oder zurück) = "saving", sonst reine Umbuchung = "transfer".
 */
export function transferKind(from: Pick<Account, 'countsAsSaving'>, to: Pick<Account, 'countsAsSaving'>): 'saving' | 'transfer' {
  return !!from.countsAsSaving !== !!to.countsAsSaving ? 'saving' : 'transfer'
}

export interface TransferInput {
  /** Id der Buchung auf dem Ausgangskonto, wenn eine bestehende Umbuchung bearbeitet wird */
  id?: number
  fromAccountId: string
  toAccountId: string
  date: string
  /** Betrag positiv in Cent */
  cents: number
  counterparty: string
  purpose?: string
  demo?: boolean
}

/** Legt eine Umbuchung als zwei verbundene Buchungen an (−Betrag beim Ausgang, +Betrag beim Ziel) oder aktualisiert sie. */
export async function saveTransfer(db: TrackerDB, input: TransferInput): Promise<number> {
  if (input.fromAccountId === input.toAccountId) throw new Error('Bitte zwei verschiedene Konten wählen.')
  return db.transaction('rw', db.transactions, db.accounts, async () => {
    const [from, to] = await Promise.all([db.accounts.get(input.fromAccountId), db.accounts.get(input.toAccountId)])
    if (!from || !to) throw new Error('Konto nicht gefunden.')
    const kind = transferKind(from, to)
    const cents = Math.abs(input.cents)
    const base = {
      date: input.date,
      counterparty: input.counterparty.trim() || `Umbuchung ${from.name} → ${to.name}`,
      purpose: input.purpose?.trim() || undefined,
      kind,
      source: 'manual' as const,
      categoryId: undefined,
      ...(input.demo ? { demo: true } : {}),
    }
    const outRow = { ...base, accountId: from.id, amountCents: -cents, transferAccountId: to.id }
    const inRow = { ...base, accountId: to.id, amountCents: cents, transferAccountId: from.id }

    if (input.id !== undefined) {
      const existing = await db.transactions.get(input.id)
      if (!existing) throw new Error('Buchung nicht gefunden.')
      // bestehende Seite = Ausgang, Gegenbuchung = Ziel (Richtung kann sich durch die Bearbeitung ändern)
      await db.transactions.update(input.id, outRow)
      if (existing.pairId !== undefined && (await db.transactions.get(existing.pairId))) {
        await db.transactions.update(existing.pairId, inRow)
      } else {
        const pairId = (await db.transactions.add({ ...inRow, pairId: input.id, createdAt: new Date().toISOString() })) as number
        await db.transactions.update(input.id, { pairId })
      }
      return input.id
    }
    const now = new Date().toISOString()
    const outId = (await db.transactions.add({ ...outRow, createdAt: now })) as number
    const inId = (await db.transactions.add({ ...inRow, pairId: outId, createdAt: now })) as number
    await db.transactions.update(outId, { pairId: inId })
    return outId
  })
}
