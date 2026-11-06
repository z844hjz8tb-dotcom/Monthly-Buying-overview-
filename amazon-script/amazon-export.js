/*
 * Ausgaben-Tracker – Amazon-Bestellungen exportieren (Version 1)
 *
 * So geht's (am PC, Chrome/Edge/Firefox):
 *   1. Auf amazon.de "Meine Bestellungen" öffnen und oben den Zeitraum wählen (z. B. "2026").
 *   2. F12 drücken → Reiter "Konsole".
 *   3. Dieses Skript komplett einfügen und Enter drücken.
 *      (Chrome verlangt beim ersten Mal, dass du "Einfügen zulassen" eintippst.)
 *   4. Warten, bis die Datei "amazon-JJJJ-MM-TT.json" heruntergeladen wird.
 *   5. Die Datei in der App unter Amazon → "Amazon-Datei importieren" einlesen.
 *
 * Das Skript liest nur deine Bestellungen auf amazon.de und speichert sie als Datei.
 * Es schickt nichts woandershin.
 *
 * Wenn Amazon die Seite umbaut: Alle Stellen, an denen das Skript sucht, stehen unten in CONFIG.
 */
;(function () {
  const CONFIG = {
    /** Nur Bestellungen ab diesem Datum (JJJJ-MM-TT); leer = alle im gewählten Zeitraum */
    fromDate: '',
    /** Digitale Bestellungen (Prime Video, Kindle …, Nummer "D01-…") mitnehmen? Sie stehen meist als Abo im Konto. */
    includeDigital: false,
    /** Höchstens so viele Übersichtsseiten durchgehen */
    maxPages: 30,
    /** Pause zwischen zwei Abrufen (ms), um Amazon nicht zu überlasten */
    pauseMs: 700,
    /** Wie lange auf das Entschlüsseln einer Übersichtsseite gewartet wird (ms) */
    pageTimeoutMs: 15000,
    selectors: {
      orderCard: '.order-card, .js-order-card',
      paginationLink: '.a-pagination a[href*="page="], a[href*="/your-orders/orders?"][href*="page="]',
      // Detailseite: Amazon markiert die Felder mit data-component
      orderId: '[data-component="orderId"]',
      orderDate: '[data-component="orderDate"]',
      chargeSummary: '[data-component="chargeSummary"]',
      itemTitle: '[data-component="itemTitle"]',
      quantity: '[data-component="quantity"]',
      unitPrice: '[data-component="unitPrice"]',
      cancelled: '[data-component="cancelled"]',
    },
    detailUrls: [
      (id) => `/your-orders/order-details?orderID=${encodeURIComponent(id)}`,
      (id) => `/gp/your-account/order-details?orderID=${encodeURIComponent(id)}`,
    ],
  }

  const MONTHS = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 }
  const ORDER_ID = /\b(\d{3}-\d{7}-\d{7}|D01-\d{7}-\d{7})\b/g

  /** "1.234,56 €" → 123456 (Cent); null, wenn kein Betrag erkennbar */
  function parseEuro(text) {
    const m = String(text || '').replace(/\s/g, '').match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2}/)
    if (!m) return null
    const s = m[0].includes(',') ? m[0].replace(/\./g, '').replace(',', '.') : m[0]
    return Math.round(Number(s) * 100)
  }

  /** "25. Oktober 2026" → "2026-10-25" */
  function parseGermanDate(text) {
    const m = String(text || '').toLowerCase().match(/(\d{1,2})\.\s*([a-zäöü]+)\s+(\d{4})/)
    if (!m || !MONTHS[m[2]]) return null
    return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

  /** Liest eine Bestelldetail-Seite (Document). Gibt null zurück, wenn die Seite nicht passt. */
  function parseDetail(doc, expectedId) {
    const S = CONFIG.selectors
    const orderId = clean(doc.querySelector(S.orderId)?.textContent).match(ORDER_ID)?.[0] || expectedId
    const date = parseGermanDate(doc.querySelector(S.orderDate)?.textContent)
    const charge = doc.querySelector(S.chargeSummary)
    if (!orderId || !date || !charge) return null

    // Gesamtsumme bevorzugt, sonst "Summe", sonst der letzte Betrag der Übersicht
    const chargeText = charge.textContent || ''
    const total =
      parseEuro(chargeText.split(/Gesamtsumme/i)[1]) ??
      parseEuro(chargeText.split(/\bSumme\b/i).pop()) ??
      parseEuro([...chargeText.matchAll(/\d+,\d{2}/g)].pop()?.[0])

    const items = []
    for (const titleEl of doc.querySelectorAll(S.itemTitle)) {
      // Container eines Artikels: der nächste Vorfahre, der auch Menge/Preis enthält
      let box = titleEl.parentElement
      while (box && !box.querySelector(S.unitPrice)) box = box.parentElement
      const title = clean(titleEl.textContent)
      if (!title) continue
      const priceEl = box?.querySelector(`${S.unitPrice} .a-offscreen`) || box?.querySelector(S.unitPrice)
      const qty = parseInt(clean(box?.querySelector(S.quantity)?.textContent).replace(/\D/g, ''), 10)
      items.push({ title, quantity: qty > 0 ? qty : 1, unitPriceCents: priceEl ? parseEuro(priceEl.textContent) : null })
    }

    const cancelledText = clean(doc.querySelector(S.cancelled)?.textContent)
    return {
      orderId,
      date,
      totalCents: total ?? items.reduce((s, i) => s + (i.unitPriceCents ?? 0) * i.quantity, 0),
      status: cancelledText ? 'cancelled' : 'ok',
      items,
    }
  }

  /** Bestellnummern und (falls sichtbar) Datum aus den Bestellkarten einer Übersichtsseite */
  function orderIdsFromOverview(doc) {
    const out = []
    for (const card of doc.querySelectorAll(CONFIG.selectors.orderCard)) {
      const text = card.innerText || card.textContent || ''
      const id = text.match(ORDER_ID)?.[0] || card.querySelector('a[href*="orderID="]')?.href.match(/orderID=([\w-]+)/)?.[1]
      if (id) out.push({ id, date: parseGermanDate(text) })
    }
    return out
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  /** Lädt eine Übersichtsseite unsichtbar in einem Rahmen, damit Amazon sie selbst entschlüsselt. */
  function loadOverviewInFrame(url) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe')
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;visibility:hidden'
      const started = Date.now()
      const finish = (fn, v) => { frame.remove(); fn(v) }
      frame.onload = async () => {
        try {
          while (Date.now() - started < CONFIG.pageTimeoutMs) {
            const doc = frame.contentDocument
            const cards = doc ? doc.querySelectorAll(CONFIG.selectors.orderCard) : []
            const ids = doc ? orderIdsFromOverview(doc) : []
            if (cards.length && ids.length >= cards.length * 0.5) return finish(resolve, { ids, links: pageLinks(doc) })
            if (doc && !cards.length && doc.readyState === 'complete' && Date.now() - started > 4000) return finish(resolve, { ids: [], links: [] })
            await sleep(300)
          }
          finish(reject, new Error('Zeitüberschreitung beim Laden von ' + url))
        } catch (e) {
          finish(reject, e)
        }
      }
      frame.src = url
      document.body.appendChild(frame)
    })
  }

  function pageLinks(doc) {
    const set = new Set()
    for (const a of doc.querySelectorAll(CONFIG.selectors.paginationLink)) {
      const href = a.getAttribute('href')
      if (href && /[?&]page=\d+/.test(href)) set.add(new URL(href, location.origin).pathname + new URL(href, location.origin).search.replace(/&?ref_=[^&]*/, ''))
    }
    return [...set]
  }

  async function fetchDetail(id) {
    for (const make of CONFIG.detailUrls) {
      const res = await fetch(make(id), { credentials: 'include' })
      if (!res.ok) continue
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const order = parseDetail(doc, id)
      if (order) return order
    }
    return null
  }

  function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  async function main() {
    const log = (...a) => console.log('%c[Ausgaben-Tracker]', 'color:#0f766e;font-weight:bold', ...a)
    if (!/\/your-orders\/orders|order-history/.test(location.pathname)) {
      alert('Bitte zuerst "Meine Bestellungen" auf amazon.de öffnen und das Skript dort ausführen.')
      return
    }
    log('Sammle Bestellnummern …')
    const found = new Map()
    const add = (list) => list.forEach((o) => !found.has(o.id) && found.set(o.id, o))
    add(orderIdsFromOverview(document))
    const seenPages = new Set([location.pathname + location.search.replace(/&?ref_=[^&]*/, '')])
    const queue = pageLinks(document).filter((u) => !seenPages.has(u))
    let pages = 1
    while (queue.length && pages < CONFIG.maxPages) {
      const url = queue.shift()
      if (seenPages.has(url)) continue
      seenPages.add(url)
      try {
        const { ids, links } = await loadOverviewInFrame(url)
        add(ids)
        links.filter((u) => !seenPages.has(u) && !queue.includes(u)).forEach((u) => queue.push(u))
        pages++
        log(`Seite ${pages}: ${ids.length} Bestellungen`)
        if (CONFIG.fromDate && ids.length && ids.every((o) => o.date && o.date < CONFIG.fromDate)) break
      } catch (e) {
        log('Seite übersprungen:', e.message)
      }
      await sleep(CONFIG.pauseMs)
    }

    let ids = [...found.values()]
    if (!CONFIG.includeDigital) ids = ids.filter((o) => !o.id.startsWith('D01-'))
    if (CONFIG.fromDate) ids = ids.filter((o) => !o.date || o.date >= CONFIG.fromDate)
    log(`${ids.length} Bestellungen gefunden, lade Details …`)

    const orders = []
    const problems = []
    for (const [i, o] of ids.entries()) {
      try {
        const order = await fetchDetail(o.id)
        if (!order) problems.push(`${o.id}: Detailseite nicht lesbar`)
        else if (CONFIG.fromDate && order.date < CONFIG.fromDate) continue
        else {
          orders.push(order)
          const noPrice = order.items.filter((it) => it.unitPriceCents === null).length
          if (!order.items.length) problems.push(`${o.id}: keine Artikel gefunden`)
          if (noPrice) problems.push(`${o.id}: ${noPrice} Artikel ohne Preis`)
        }
      } catch (e) {
        problems.push(`${o.id}: ${e.message}`)
      }
      if ((i + 1) % 5 === 0) log(`${i + 1}/${ids.length} …`)
      await sleep(CONFIG.pauseMs)
    }

    const today = new Date().toISOString().slice(0, 10)
    download(`amazon-${today}.json`, { format: 'ausgaben-tracker-amazon', version: 1, exportedAt: new Date().toISOString(), orders })
    console.table(orders.map((o) => ({ Bestellung: o.orderId, Datum: o.date, Summe: (o.totalCents / 100).toFixed(2), Artikel: o.items.length, Status: o.status })))
    if (problems.length) console.warn('Hinweise:\n' + problems.join('\n'))
    alert(`Fertig: ${orders.length} Bestellungen exportiert${problems.length ? `, ${problems.length} Hinweise (siehe Konsole)` : ''}.\nDie Datei liegt in deinen Downloads.`)
  }

  globalThis.__ausgabenAmazon = { CONFIG, parseEuro, parseGermanDate, parseDetail, orderIdsFromOverview }
  if (typeof location !== 'undefined' && /(^|\.)amazon\.de$/.test(location.hostname)) main().catch((e) => alert('Fehler: ' + e.message))
})()
