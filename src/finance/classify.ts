import type { Account, CategoryRule, Transaction } from '../db/schema'
import { transferKind } from './store'

/**
 * Ordnet eine Bank-Buchung ein: Ausgabe (mit Kategorie), Erstattung, Einnahme, Umbuchung oder Sparen.
 * Reihenfolge der Prüfungen (die erste passende gewinnt):
 *   1. Kredite (Darlehensrate, Rahmenkredit, Bausparkasse) → Ausgabe "Kredite"; Darlehensauszahlung → Umbuchung;
 *      Bausparkasse-Ansparung ("U.A.", Sparbeitrag) beim Vorausdarlehen → Sparen (in den Bausparvertrag)
 *   2. Wertpapierkauf/-verkauf → Sparen (aufs Depot) bzw. Entnahme
 *   3. Empfänger passt zu einem eigenen Konto (Name oder "Erkennen an") → Umbuchung oder Sparen
 *   4. Eigene Namen (z. B. "Max Muster") → Umbuchung, Zielkonto offen
 *   5. Kreditkarten-Abrechnung (American Express) → Umbuchung auf die Karte
 *   6. Gehalt/Rente, Bezüge → Einnahme
 *   7. Kategorie-Regeln (eigene vor eingebauten); Gutschrift eines Händlers = Erstattung, sonst Einnahme
 */

export interface BankRow {
  date: string
  amountCents: number
  counterparty: string
  bookingText: string
  purpose: string
}

export interface ClassifyContext {
  /** Konto, auf dem die Buchung steht */
  accountId: string
  accounts: Account[]
  /** Namen der Kontoinhaber: Überweisungen an/von diesen Namen sind Umbuchungen */
  ownNames: string[]
  /** Regeln des Nutzers (haben Vorrang vor den eingebauten) */
  rules: Pick<CategoryRule, 'pattern' | 'field' | 'categoryId'>[]
}

export type Classified = Pick<Transaction, 'kind' | 'categoryId' | 'transferAccountId' | 'counterparty' | 'linkedOrderId'>

/** Eingebaute Regeln: Suchtext (klein, ohne Umlaute) → Kategorie. Geprüft in Empfänger und Verwendungszweck. */
/** Wird erhöht, wenn sich die eingebauten Regeln ändern → importierte Buchungen werden beim Start neu eingeordnet */
export const RULES_VERSION = 7

export const BUILTIN_RULES: [string, string][] = [
  // spezielle Kategorien zuerst (z. B. "Tierarzt" vor "Arzt", "Haustierversicherung" vor "Versicherung")
  ['*tierarzt', 'haustier'], ['*tierfachmarkt', 'haustier'], ['*haustier', 'haustier'], ['fressnapf', 'haustier'], ['koelle-zoo', 'haustier'], ['zoo ', 'haustier'], ['zooplus', 'haustier'],
  ['futterhaus', 'haustier'], ['tiernahrung', 'haustier'],
  ['*apotheke', 'gesundheit'], ['*arzt', 'gesundheit'], ['*aerzte', 'gesundheit'], ['*praxis', 'gesundheit'], ['klinik', 'gesundheit'],
  ['krankenhaus', 'gesundheit'], ['physio', 'gesundheit'], ['optik', 'gesundheit'], ['fielmann', 'gesundheit'], ['labor ', 'gesundheit'],
  ['*kindergarten', 'schule'], ['kita', 'schule'], ['*schule', 'schule'], ['nachhilfe', 'schule'], ['hort ', 'schule'], ['schulbuch', 'schule'],
  ['architekt', 'hausbau'], ['genehmigungsplanung', 'hausbau'], ['*notar', 'hausbau'], ['energieberat', 'hausbau'], ['baustoff', 'hausbau'],
  ['baumaterial', 'hausbau'], ['bauunternehm', 'hausbau'], ['zimmerei', 'hausbau'], ['dachdecker', 'hausbau'], ['statiker', 'hausbau'],
  ['vermessung', 'hausbau'], ['bauamt', 'hausbau'], ['baugenehmigung', 'hausbau'],
  // Abos vor Online-Shopping, damit "Amazon Prime Video" nicht bei Online landet
  ['prime video', 'abos'], ['amazon kids', 'abos'], ['amazon digital', 'abos'], ['audible', 'abos'], ['netflix', 'abos'],
  ['spotify', 'abos'], ['disney', 'abos'], ['apple.com bill', 'abos'], ['google payment', 'abos'], ['congstar', 'abos'],
  ['telekom', 'abos'], ['vodafone', 'abos'], ['o2 ', 'abos'], ['dazn', 'abos'], ['youtube', 'abos'], ['anthropic', 'abos'], ['claude sub', 'abos'], ['apple.com/bill', 'abos'], ['apple services', 'abos'], ['openai', 'abos'], ['subscription', 'abos'],
  ['lidl', 'lebensmittel'], ['aldi', 'lebensmittel'], ['rewe', 'lebensmittel'], ['edeka', 'lebensmittel'], ['kaufland', 'lebensmittel'],
  ['penny', 'lebensmittel'], ['netto', 'lebensmittel'], ['norma', 'lebensmittel'], ['markt ohg', 'lebensmittel'], ['*baeckerei', 'lebensmittel'],
  ['*backerei', 'lebensmittel'], ['backhaus', 'lebensmittel'], ['*metzgerei', 'lebensmittel'], ['*baeck', 'lebensmittel'], ['backstube', 'lebensmittel'], ['vinzenzmurr', 'lebensmittel'], ['*getranke', 'lebensmittel'], ['*getraenke', 'lebensmittel'],
  ['muller handels', 'drogerie'], ['muller vertrieb', 'drogerie'], ['mueller ', 'drogerie'], ['mueller handels', 'drogerie'], ['*drogerie', 'drogerie'], ['dm-drogerie', 'drogerie'], ['rossmann', 'drogerie'],
  ['amazon', 'online'], ['amzn', 'online'], ['ebay', 'online'], ['zalando', 'online'], ['otto gmbh', 'online'], ['temu', 'online'], ['bergfreunde', 'online'],
  ['octopus', 'wohnen'], ['*baumarkt', 'wohnen'], ['stadtwerke', 'wohnen'], ['strom', 'wohnen'], ['rundfunk', 'wohnen'], ['miete', 'wohnen'], ['hausverwaltung', 'wohnen'],
  ['baumarkt', 'wohnen'], ['obi ', 'wohnen'], ['hornbach', 'wohnen'], ['bauhaus', 'wohnen'], ['ikea', 'wohnen'], ['garten', 'wohnen'],
  ['*versicherung', 'versicherungen'], ['allianz', 'versicherungen'], ['huk', 'versicherungen'], ['ergo ', 'versicherungen'], ['axa', 'versicherungen'],
  ['devk', 'versicherungen'], ['hdi', 'versicherungen'], ['debeka', 'versicherungen'],
  ['*tankstelle', 'mobilitaet'], ['tamoil', 'mobilitaet'], ['aral', 'mobilitaet'], ['shell', 'mobilitaet'], ['esso', 'mobilitaet'], ['agip', 'mobilitaet'],
  ['jet ', 'mobilitaet'], ['easypark', 'mobilitaet'], ['parken', 'mobilitaet'], ['parkster', 'mobilitaet'], ['mobility hub', 'mobilitaet'],
  ['parkservice', 'mobilitaet'], ['taxi', 'mobilitaet'], ['db vertrieb', 'mobilitaet'], ['dbvertrieb', 'mobilitaet'], ['tesla', 'mobilitaet'], ['deutsche bahn', 'mobilitaet'], ['flixbus', 'mobilitaet'],
  ['*restaurant', 'freizeit'], ['*pizzeria', 'freizeit'], ['mcdonalds', 'freizeit'], ['burger', 'freizeit'], ['cafe', 'freizeit'], ['kino', 'freizeit'],
  ['eventim', 'freizeit'], ['lotto', 'freizeit'], ['booking.com', 'freizeit'], ['center parc', 'freizeit'], ['tourismus', 'freizeit'], ['toys', 'freizeit'],
  ['playstation', 'freizeit'], ['steam', 'freizeit'], ['freizeitbad', 'freizeit'], ['bergbahn', 'freizeit'],
  ['airbnb', 'freizeit'], ['*hotel', 'freizeit'], ['premier inn', 'freizeit'], ['winstub', 'freizeit'], ['decathlon', 'freizeit'], ['*kantine', 'lebensmittel'], ['eurest', 'lebensmittel'],
]

const norm = (s: string) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim()

/** Lesbarer Empfängername: "VISA LIDL SAGT DANKE" → "LIDL SAGT DANKE", PayPal → "PayPal: Netflix.com" */
export function displayCounterparty(row: BankRow): string {
  const cp = row.counterparty.replace(/\s+/g, ' ').trim()
  // Kreditkarte: "PAYPAL *FRISEURMUSTER" → "PayPal: FRISEURMUSTER"
  const cardPaypal = cp.match(/^PAYPAL \*\s*(\S+)/i)
  if (cardPaypal) return `PayPal: ${cardPaypal[1]}`
  if (/paypal/i.test(cp)) {
    // "…/. Netflix. com, Ihr Einkauf bei Netflix.com": Händler steht zweimal da; die ING fügt beim Export
    // an Zeilenumbrüchen Leerzeichen ein ("Servi ces"). Die Fassung mit den wenigsten Leerzeichen ist die heile.
    const m = row.purpose.match(/(?:\/\.|\.)\s*([^/]+?), Ihr Einkauf bei (.+)$/i) ?? row.purpose.match(/()Ihr Einkauf bei (.+)$/i)
    if (m) {
      const variants = [m[1], m[2]].map((v) => v.replace(/\s+/g, ' ').trim()).filter(Boolean)
      const same = variants.length === 2 && variants[0].replace(/ /g, '') === variants[1].replace(/ /g, '')
      const best = same ? variants.sort((a, b) => a.split(' ').length - b.split(' ').length)[0] : variants[variants.length - 1]
      return `PayPal: ${best}`
    }
    return 'PayPal'
  }
  if (/^VISA /.test(cp)) return cp.slice(5)
  if (!cp && /wertpapier/i.test(row.bookingText)) {
    const m = row.purpose.match(/ISIN \S+ (.+)$/)
    return m ? `${row.bookingText}: ${m[1].trim()}` : row.bookingText
  }
  return cp || row.bookingText
}

/** Amazon-Bestellnummer im Verwendungszweck, z. B. "302-1234567-1234567" */
export function amazonOrderId(row: BankRow): string | undefined {
  if (!/amazon|amzn/i.test(row.counterparty + ' ' + row.purpose)) return undefined
  return row.purpose.match(/\b(\d{3}-\d{7}-\d{7})\b/)?.[1]
}

/**
 * Muster gilt ab Wortanfang ("garten" passt zu "Baldur-Garten", nicht zu "Kindergarten").
 * Ohne Leerzeichen wird nur bei längeren Mustern verglichen, weil die ING Wörter beim Export umbricht.
 */
const patternCache = new Map<string, RegExp>()
/** "*muster" passt auch mitten im Wort (für Wortendungen wie "…versicherung", "…apotheke") */
export function hasPattern(text: string, pattern: string): boolean {
  let re = patternCache.get(pattern)
  if (!re) {
    const anywhere = pattern.startsWith('*')
    if (anywhere) pattern = pattern.slice(1)
    // zwischen zwei Buchstaben darf ein vom Export eingefügtes Leerzeichen stehen ("ope nai" = "openai")
    const body = [...pattern].map((c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join(' ?').replace(/  \?/g, ' ')
    re = new RegExp(`${anywhere ? '' : '(^|[^a-z0-9])'}${body}`)
    patternCache.set(anywhere ? `*${pattern}` : pattern, re)
  }
  return re.test(text)
}

/** Für Tests/Fehlersuche: welches eingebaute Muster hat gegriffen */
export function matchedBuiltin(row: BankRow): string | undefined {
  const all = norm(`${displayCounterparty(row)} ${row.purpose}`)
  return BUILTIN_RULES.find(([p]) => hasPattern(all, p))?.[0]
}

export function matchCategory(row: BankRow, rules: ClassifyContext['rules']): string | undefined {
  const cp = norm(displayCounterparty(row))
  const all = norm(`${displayCounterparty(row)} ${row.purpose}`)
  // Leerzeichen zählen nicht: die ING bricht Wörter beim Export um ("Apple Servi ces")
  // Nur bei längeren Mustern, sonst passt z. B. "obi" (Baumarkt) in "Mobility"
  const has = hasPattern
  for (const r of rules) {
    const p = norm(r.pattern)
    if (p && has(r.field === 'counterparty' ? cp : all, p)) return r.categoryId
  }
  for (const [p, cat] of BUILTIN_RULES) if (has(all, p)) return cat
  return undefined
}

function findAccountByName(name: string, ctx: ClassifyContext): Account | undefined {
  const n = norm(name)
  if (!n) return undefined
  return ctx.accounts.find(
    (a) => a.id !== ctx.accountId && !a.demo && (norm(a.name) === n || (a.matchNames ?? []).some((m) => norm(m) && n.includes(norm(m)))),
  )
}

export function classify(row: BankRow, ctx: ClassifyContext): Classified {
  const counterparty = displayCounterparty(row)
  const text = norm(`${row.counterparty} ${row.purpose}`)
  const self = ctx.accounts.find((a) => a.id === ctx.accountId) ?? { countsAsSaving: false }
  const move = (target: Account | undefined): Classified => ({
    kind: target ? transferKind(self, target) : 'transfer',
    transferAccountId: target?.id,
    counterparty,
  })

  // 0. Kreditkarte: Ausgleich vom Girokonto ist eine Umbuchung
  const isCard = row.bookingText === 'Kreditkarte'
  if (isCard && /zahlung.{0,15}erhalten|payment received|lastschrift erhalten/.test(text)) {
    return move(ctx.accounts.find((a) => a.id === 'ing' && !a.hidden) ?? ctx.accounts.find((a) => a.kind === 'giro' && !a.demo && !a.hidden))
  }

  // PayPal-Konto: Auszahlung aufs Girokonto = Umbuchung; Rückzahlung an PayPal ("Später bezahlen", Ratenzahlung)
  // = Umbuchung, denn der Einkauf selbst zählt schon beim Kauf (Zeile "Zahlung per PayPal-Käuferkredit")
  if ('kind' in self && self.kind === 'paypal') {
    if (/abbuchung|auszahlung/i.test(row.bookingText) && row.amountCents < 0) {
      return move(ctx.accounts.find((a) => a.id === 'ing' && !a.hidden) ?? ctx.accounts.find((a) => a.kind === 'giro' && !a.demo && !a.hidden))
    }
    // genaue Einordnung (Später bezahlen / Ratenzahlung / Kauf vor dem Export) braucht die anderen Buchungen: settlePaypalRepayments
    if (/paypal\s*\(?europe/i.test(row.counterparty) && row.amountCents < 0) return { kind: 'transfer', counterparty: 'PayPal-Rückzahlung (Später bezahlen)' }
  }

  // Amazon-Monatsabrechnung: Sammelzahlung für Bestellungen, die einzeln aus dem Amazon-Import zählen
  // (auch über einen Zahlungsdienst; die ING bricht Wörter um: "Monatsabrech nung")
  if (hasPattern(text, 'monatsabrechnung') && /amazon/.test(text)) return { kind: 'transfer', counterparty: 'Amazon Monatsabrechnung' }

  // 1. Kredite
  if (/darlehensauszahlung|kreditauszahlung/.test(text)) return { kind: 'transfer', counterparty: counterparty === row.counterparty ? 'Darlehensauszahlung' : counterparty }
  // Vorausdarlehen: Zinsen sind Kosten (Kredite), die Ansparung in den Bausparvertrag baut Vermögen auf (Sparen)
  if (/bausparkasse|bausparvertrag/.test(text) && /\bu\.\s?a\.|ansparung|sparbeitrag|regelspar|sparrate/.test(text) && !/zins/.test(text)) {
    const bauspar = ctx.accounts.find((a) => !a.demo && !a.hidden && (/bauspar/i.test(a.name) || (a.matchNames ?? []).some((m) => /bauspar/i.test(m))))
    return { kind: 'saving', transferAccountId: bauspar?.id, counterparty: counterparty === row.counterparty ? 'Bausparvertrag (Ansparung)' : counterparty }
  }
  if (/darlehensrate|rate darlehen|rahmenkredit|bausparkasse|tilgung|kreditrate/.test(text)) return { kind: 'expense', categoryId: 'kredite', counterparty }

  // 2. Wertpapiere
  if (/^wertpapier/i.test(row.bookingText)) {
    const depot = ctx.accounts.find((a) => a.kind === 'depot' && !a.hidden && !a.demo && /ing/i.test(a.name)) ?? ctx.accounts.find((a) => a.kind === 'depot' && !a.hidden && !a.demo)
    return { kind: 'saving', transferAccountId: depot?.id, counterparty }
  }

  // 3. Eigenes Konto am Namen erkannt
  const target = findAccountByName(row.counterparty, ctx) ?? findAccountByName(row.purpose, ctx)
  if (target) return move(target)

  // 4. Eigene Namen
  const cpn = norm(row.counterparty)
  if (cpn && ctx.ownNames.some((n) => norm(n) && cpn === norm(n))) return move(undefined)
  if (/kleingeld plus/.test(cpn)) return move(undefined)

  // 5. Kreditkarten-Abrechnung
  if (/american express|amex/.test(cpn)) return move(ctx.accounts.find((a) => a.kind === 'credit' && /amex|american/i.test(a.name)) ?? ctx.accounts.find((a) => a.id === 'amex'))

  // Bargeld abheben = Umbuchung aufs Bargeld-Konto (Visa: "Bargeldauszahlung"; Girocard am Automaten einer Bank: "Folgenr.")
  const cashAtm = /bargeldauszahlung|geldautomat/.test(text) ||
    (/volksbank|sparkasse|raiffeisen|raiba|commerzbank|deutsche bank|postbank|hypovereinsbank/.test(norm(row.counterparty)) && /folgenr/.test(text) && row.amountCents < 0)
  if (cashAtm) return move(ctx.accounts.find((a) => a.kind === 'cash' && !a.demo))

  // 6. Einkommen
  if (/gehalt|rente|bezuege/.test(norm(row.bookingText))) return { kind: 'income', counterparty }

  // 7. Kategorie
  const categoryId = matchCategory(row, ctx.rules)
  const linkedOrderId = amazonOrderId(row)
  // Gutschrift auf der Kreditkarte ist (fast) immer eine Erstattung, keine Einnahme
  if (row.amountCents > 0 && !categoryId && !isCard) return { kind: 'income', counterparty }
  // Gutschrift eines Händlers = Erstattung: Ausgabe mit positivem Betrag, mindert die Kategorie
  return { kind: 'expense', categoryId, counterparty, ...(linkedOrderId ? { linkedOrderId } : {}) }
}
