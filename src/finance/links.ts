import type { Receipt, Transaction, TrackerDB } from '../db/schema'

/**
 * Verknüpft Kassenbons mit der passenden Kartenzahlung auf einem Konto, damit ein Einkauf nur einmal zählt.
 * Gezählt wird dann die Kontobuchung; der Bon liefert die Artikel (siehe stats/overview.ts).
 *
 * Passt, wenn
 *   - der Laden im Empfänger/Verwendungszweck der Buchung vorkommt,
 *   - der Betrag gleich ist (bei Coupons an der Kasse bis 2 € weniger),
 *   - das Kaufdatum ±1 Tag stimmt (ING-Visa: Kaufdatum aus "KAUFUMSATZ TT.MM", Buchung oft Tage später).
 * Eindeutige Treffer werden automatisch verknüpft, unsichere als Vorschlag gezeigt.
 */

export const REJECTED_KEY = 'receiptLinkRejected'
const COUPON_TOLERANCE = 200

/** Suchwörter je Laden (klein, ohne Umlaute) */
const STORE_KEYS: Record<string, string[]> = {
  lidl: ['lidl'],
  kaufland: ['kaufland'],
  penny: ['penny'],
  muller: ['muller', 'mueller'],
  rewe: ['rewe'],
  aldi: ['aldi'],
  netto: ['netto'],
  edeka: ['edeka'],
  dm: ['dm-drogerie', 'dm drogerie', 'dm fil', 'dm '],
  rossmann: ['rossmann'],
}

const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'u').replace(/ß/g, 'ss')

export function storeMatches(store: string, t: Pick<Transaction, 'counterparty' | 'rawCounterparty' | 'purpose'>): boolean {
  const key = norm(store).replace(/[^a-z]/g, '')
  const words = STORE_KEYS[key] ?? [norm(store)]
  const text = ` ${norm(`${t.rawCounterparty ?? ''} ${t.counterparty} ${t.purpose ?? ''}`)} `
  return words.some((w) => text.includes(w))
}

/** Tatsächliches Kaufdatum: ING-Visa "KAUFUMSATZ 03.11", Girocard "2026-11-03T12:57", sonst Buchungsdatum */
export function purchaseDate(t: Pick<Transaction, 'date' | 'purpose'>): string {
  const p = t.purpose ?? ''
  const iso = p.replace(/\s/g, '').match(/(\d{4}-\d{2}-\d{2})T\d{2}:/)
  if (iso) return iso[1]
  const k = p.match(/KAUFUMSATZ (\d{2})\.(\d{2})/)
  if (k) {
    const year = Number(t.date.slice(0, 4))
    // Kauf im Dezember, Buchung im Januar
    const y = Number(k[2]) > Number(t.date.slice(5, 7)) ? year - 1 : year
    return `${y}-${k[2]}-${k[1]}`
  }
  return t.date
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000)

export interface LinkCandidate {
  receipt: Receipt
  tx: Transaction
  /** true = sicher genug zum automatischen Verknüpfen */
  sure: boolean
  amountDiffCents: number
  dayDiff: number
  storeMatch: boolean
}

/** Bewertet ein Paar; null = passt nicht */
export function rateLink(r: Receipt, t: Transaction): LinkCandidate | null {
  if (t.kind !== 'expense' || t.amountCents >= 0 || t.linkedOrderId) return null
  const paid = -t.amountCents
  const amountDiff = r.totalCents - paid
  if (amountDiff < 0 || amountDiff > COUPON_TOLERANCE) return null
  const days = Math.abs(dayDiff(purchaseDate(t), r.date))
  const storeMatch = storeMatches(r.store, t)
  const hasPurchaseDate = purchaseDate(t) !== t.date
  // ohne erkennbares Kaufdatum darf die Buchung ein paar Tage später kommen
  const maxDays = hasPurchaseDate ? 1 : storeMatch ? 4 : 2
  if (dayDiff(purchaseDate(t), r.date) < -1 || days > maxDays) return null
  if (!storeMatch && amountDiff !== 0) return null
  const sure = storeMatch && amountDiff === 0 && days <= (hasPurchaseDate ? 1 : 3)
  return { receipt: r, tx: t, sure, amountDiffCents: amountDiff, dayDiff: days, storeMatch }
}

const score = (c: LinkCandidate) => (c.storeMatch ? 0 : 1000) + c.amountDiffCents + c.dayDiff * 10

export interface LinkResult {
  linked: number
  suggestions: LinkCandidate[]
}

async function loadRejected(db: TrackerDB): Promise<Set<string>> {
  const v = (await db.meta.get(REJECTED_KEY))?.value
  return new Set(v ? (JSON.parse(v) as string[]) : [])
}
const pairKey = (receiptId: number, txId: number) => `${receiptId}:${txId}`

/**
 * Sucht für alle offenen Bons die passende Kontobuchung. Mit apply = true werden sichere Treffer verknüpft.
 * Gibt die unsicheren Treffer als Vorschläge zurück (je Bon der beste, jede Buchung höchstens einmal).
 */
export async function findReceiptLinks(db: TrackerDB, apply = true): Promise<LinkResult> {
  const [receipts, txs, rejected] = await Promise.all([
    db.receipts.filter((r) => !r.paidCash).toArray(),
    db.transactions.filter((t) => t.kind === 'expense' && t.amountCents < 0).toArray(),
    loadRejected(db),
  ])
  const usedTx = new Set(txs.filter((t) => t.linkedReceiptId !== undefined).map((t) => t.id!))
  const linkedReceipts = new Set(txs.filter((t) => t.linkedReceiptId !== undefined).map((t) => t.linkedReceiptId!))
  const open = receipts.filter((r) => !linkedReceipts.has(r.id!))

  const candidates: LinkCandidate[] = []
  for (const r of open) {
    for (const t of txs) {
      if (usedTx.has(t.id!) || rejected.has(pairKey(r.id!, t.id!))) continue
      const c = rateLink(r, t)
      if (c) candidates.push(c)
    }
  }
  candidates.sort((a, b) => score(a) - score(b))

  // gierig: bester Treffer zuerst, jeder Bon und jede Buchung nur einmal
  const takenR = new Set<number>()
  const takenT = new Set<number>()
  const chosen: LinkCandidate[] = []
  for (const c of candidates) {
    if (takenR.has(c.receipt.id!) || takenT.has(c.tx.id!)) continue
    // ein "sicherer" Treffer ist nur sicher, wenn es für den Bon keinen zweiten gleich guten gibt
    const rivals = candidates.filter((o) => o.receipt.id === c.receipt.id && o !== c && score(o) === score(c) && !takenT.has(o.tx.id!))
    chosen.push(rivals.length ? { ...c, sure: false } : c)
    takenR.add(c.receipt.id!)
    takenT.add(c.tx.id!)
  }

  let linked = 0
  if (apply) {
    for (const c of chosen.filter((c) => c.sure)) {
      await db.transactions.update(c.tx.id!, { linkedReceiptId: c.receipt.id })
      linked++
    }
  }
  return { linked, suggestions: chosen.filter((c) => !c.sure || !apply) }
}

export async function linkReceipt(db: TrackerDB, receiptId: number, txId: number): Promise<void> {
  await db.transaction('rw', db.transactions, db.receipts, async () => {
    // ein Bon gehört zu höchstens einer Buchung
    await db.transactions.where('linkedReceiptId').equals(receiptId).modify((t) => { delete t.linkedReceiptId })
    await db.transactions.update(txId, { linkedReceiptId: receiptId })
    await db.receipts.update(receiptId, { paidCash: undefined })
  })
}

export async function unlinkReceipt(db: TrackerDB, receiptId: number, remember = true): Promise<void> {
  const txs = await db.transactions.where('linkedReceiptId').equals(receiptId).toArray()
  await db.transactions.where('linkedReceiptId').equals(receiptId).modify((t) => { delete t.linkedReceiptId })
  if (remember) for (const t of txs) await rejectLink(db, receiptId, t.id!)
}

export async function rejectLink(db: TrackerDB, receiptId: number, txId: number): Promise<void> {
  const set = await loadRejected(db)
  set.add(pairKey(receiptId, txId))
  await db.meta.put({ key: REJECTED_KEY, value: JSON.stringify([...set]) })
}
