/**
 * Liest den Text aus einem PDF-eBon, lokal im Browser (pdf.js).
 * Textstücke werden nach ihrer Höhe auf der Seite zu Zeilen zusammengesetzt,
 * damit "Artikel ... Preis" wieder in einer Zeile steht.
 */
export async function pdfToText(file: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const rows: { y: number; parts: { x: number; w: number; s: string }[] }[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [, , , , x, y] = item.transform as number[]
      const h = item.height || 8
      let row = rows.find((r) => Math.abs(r.y - y) < h * 0.5)
      if (!row) rows.push((row = { y, parts: [] }))
      row.parts.push({ x, w: item.width, s: item.str })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x)
      let line = ''
      let end = -Infinity
      for (const part of r.parts) {
        // großer Abstand = Spaltenwechsel -> mehrere Leerzeichen
        line += line ? (part.x - end > 12 ? '   ' : part.x - end > 1 ? ' ' : '') : ''
        line += part.s
        end = part.x + part.w
      }
      out.push(line)
    }
  }
  await task.destroy()
  return out.join('\n')
}
