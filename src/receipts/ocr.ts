/**
 * Texterkennung für Bon-Bilder, komplett im Browser (tesseract.js, deutsche Sprachdaten).
 * Die Dateien liegen unter /ocr/ in der App selbst (siehe scripts/copy-ocr.mjs).
 *
 * Bon-Bilder aus Händler-Apps sind oft schmal (≈ 500 px) mit kleiner Schrift.
 * Ohne Vergrößerung übersieht die Erkennung die Artikelzeilen, deshalb wird das Bild
 * vorher auf ≈ 1500 px Breite skaliert und in Schwarz-Weiß umgewandelt.
 */

const TARGET_WIDTH = 1500
const MAX_PIXELS = 16_000_000 // Canvas-Grenze auf iOS
const THRESHOLD = 160

export async function prepareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  // ganzzahlig vergrößern: ergibt sauberere Buchstabenkanten als z. B. ×3,1
  let scale = Math.min(4, Math.max(1, Math.round(TARGET_WIDTH / bitmap.width)))
  if (bitmap.width * bitmap.height * scale * scale > MAX_PIXELS) {
    scale = Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height))
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < THRESHOLD ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht vorbereitet werden.'))), 'image/png'),
  )
}

export async function imageToText(file: Blob, onProgress?: (p: number, phase: string) => void): Promise<string> {
  onProgress?.(0, 'Bild vorbereiten')
  const prepared = await prepareImage(file)
  const { createWorker, PSM } = await import('tesseract.js')
  const base = new URL('ocr/', document.baseURI).href
  const worker = await createWorker('deu', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress, 'Text erkennen')
      else if (m.status.startsWith('loading')) onProgress?.(m.progress, 'Texterkennung laden')
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(prepared)
    return data.text
  } finally {
    await worker.terminate()
  }
}
