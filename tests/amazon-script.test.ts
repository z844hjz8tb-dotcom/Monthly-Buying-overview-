// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8')
import { beforeAll, describe, expect, it } from 'vitest'

type Api = {
  parseEuro: (s: string) => number | null
  parseGermanDate: (s: string) => string | null
  parseDetail: (doc: Document, id: string) => { orderId: string; date: string; totalCents: number; status: string; items: { title: string; quantity: number; unitPriceCents: number | null }[] } | null
  orderIdsFromOverview: (doc: Document) => { id: string; date: string | null }[]
}
let api: Api
const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html')

beforeAll(async () => {
  await import('../amazon-script/amazon-export.js')
  api = (globalThis as unknown as { __ausgabenAmazon: Api }).__ausgabenAmazon
})

describe('Amazon-Exportskript', () => {
  it('liest Beträge und Datum im deutschen Format', () => {
    expect(api.parseEuro('1.024,97 €')).toBe(102497)
    expect(api.parseEuro('12,99€12,99€')).toBe(1299)
    expect(api.parseEuro('kostenlos')).toBeNull()
    expect(api.parseGermanDate('25. Oktober 2026')).toBe('2026-10-25')
    expect(api.parseGermanDate('3. März 2026')).toBe('2026-03-03')
  })

  it('liest eine Detailseite (erfundene Bestellung im echten Aufbau)', () => {
    const html = fixture('amazon-detail-beispiel.html')
    expect(api.parseDetail(doc(html), 'x')).toEqual({
      orderId: '306-1234567-7654321',
      date: '2026-11-03',
      totalCents: 102497,
      status: 'ok',
      items: [
        { title: 'USB-C Kabel, 2 m, geflochten', quantity: 2, unitPriceCents: 999 },
        { title: 'Akkuschrauber 18 V', quantity: 1, unitPriceCents: 100000 },
      ],
    })
  })

  it('erkennt stornierte Bestellungen und fremde Seiten', () => {
    const html = fixture('amazon-detail-beispiel.html')
      .replace('data-component="cancelled"> </div>', 'data-component="cancelled">Diese Bestellung wurde storniert.</div>')
    expect(api.parseDetail(doc(html), 'x')?.status).toBe('cancelled')
    expect(api.parseDetail(doc('<html><body>Anmelden</body></html>'), 'x')).toBeNull()
  })

  it('findet Bestellnummern in entschlüsselten Bestellkarten', () => {
    const d = doc(`<div class="order-card">Bestellung aufgegeben 3. November 2026 Summe 19,99 € Bestellnr. 306-1234567-7654321</div>
      <div class="order-card">Bestellung aufgegeben 1. Oktober 2026 Bestellnr. D01-1234567-1234567</div>`)
    expect(api.orderIdsFromOverview(d)).toEqual([
      { id: '306-1234567-7654321', date: '2026-11-03' },
      { id: 'D01-1234567-1234567', date: '2026-10-01' },
    ])
  })
})

it('Exportformat passt zum App-Import', async () => {
  const { parseAmazonExport } = await import('../src/import/amazon')
  const html = fixture('amazon-detail-beispiel.html')
  const order = api.parseDetail(doc(html), 'x')!
  const { orders, warnings } = parseAmazonExport(JSON.stringify({ format: 'ausgaben-tracker-amazon', version: 1, orders: [order] }))
  expect(warnings).toEqual([])
  expect(orders[0].order).toMatchObject({ orderId: '306-1234567-7654321', totalCents: 102497 })
  expect(orders[0].items).toHaveLength(2)
})
