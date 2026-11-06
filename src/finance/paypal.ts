import type { Transaction, TrackerDB } from '../db/schema'

/** Wie viele Tage die Abbuchung bei Bank/Karte nach der PayPal-Zahlung liegen darf */
const MAX_DAYS = 7

const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
const flat = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Bank- oder Kartenbuchung, hinter der PayPal steckt */
export const isPaypalBankRow = (t: Pick<Transaction, 'accountId' | 'rawCounterparty' | 'counterparty' | 'purpose'>) =>
  t.accountId !== 'paypal' && /paypal/i.test(`${t.rawCounterparty ?? t.counterparty} ${t.purpose ?? ''}`)

export interface PaypalLink {
  bankTx: Transaction
  paypalTx: Transaction
}

/**
 * Findet zu PayPal-Buchungen die passende Abbuchung (bzw. bei Auszahlungen die Gutschrift) auf
 * Girokonto oder Karte: gleicher Betrag, 0–7 Tage später; bei mehreren Kandidaten gewinnt der Händlername
 * im Verwendungszweck ("Ihr Einkauf bei …"), dann das nächste Datum. Die Bankbuchung zählt danach nicht mehr
 * selbst (viaTransactionId), gezählt wird die PayPal-Buchung mit Händler und Kategorie.
 */
export function matchPaypal(paypalTxs: Transaction[], bankTxs: Transaction[]): PaypalLink[] {
  // was auf der Bank-/Kartenseite erscheinen muss: Finanzierung über Bank/Karte bzw. Auszahlung aufs Konto
  const expected: { tx: Transaction; cents: number; via: 'bank' | 'card' }[] = []
  for (const p of paypalTxs) {
    for (const f of p.funding ?? []) if (f.via !== 'credit') expected.push({ tx: p, cents: -f.cents, via: f.via })
    if (p.kind === 'transfer' && p.transferAccountId && p.amountCents < 0) expected.push({ tx: p, cents: -p.amountCents, via: 'bank' })
  }
  const used = new Set<number>()
  const links: PaypalLink[] = []
  for (const e of expected.sort((a, b) => a.tx.date.localeCompare(b.tx.date))) {
    const name = flat(e.tx.counterparty)
    const candidates = bankTxs
      .filter((b) => !used.has(b.id!) && b.amountCents === e.cents && days(e.tx.date, b.date) >= 0 && days(e.tx.date, b.date) <= MAX_DAYS)
      .map((b) => ({ b, named: name.length >= 4 && flat(b.purpose).includes(name.slice(0, 12)) ? 0 : 1, gap: days(e.tx.date, b.date) }))
      .sort((x, y) => x.named - y.named || x.gap - y.gap)
    const hit = candidates[0]?.b
    if (!hit) continue
    used.add(hit.id!)
    links.push({ bankTx: hit, paypalTx: e.tx })
  }
  return links
}

/** Verknüpft alle offenen PayPal-Abbuchungen. Läuft nach jedem Bank-/PayPal-Import und beim Start. */
export async function linkPaypal(db: TrackerDB): Promise<number> {
  const all = await db.transactions.toArray()
  const paypalTxs = all.filter((t) => t.accountId === 'paypal' && t.source === 'paypal')
  if (!paypalTxs.length) return 0
  const taken = new Set(all.filter((t) => t.viaTransactionId !== undefined).map((t) => t.viaTransactionId))
  const open = paypalTxs.filter((p) => !taken.has(p.id))
  const bankTxs = all.filter((t) => isPaypalBankRow(t) && t.viaTransactionId === undefined && t.source !== 'manual')
  const links = matchPaypal(open, bankTxs)
  for (const l of links) await db.transactions.update(l.bankTx.id!, { viaTransactionId: l.paypalTx.id })
  return links.length
}
