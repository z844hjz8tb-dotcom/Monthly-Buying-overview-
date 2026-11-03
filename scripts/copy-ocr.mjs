// Kopiert die Texterkennung (tesseract.js) und die deutschen Sprachdaten nach public/ocr,
// damit die App sie selbst ausliefert: keine fremden Server, Bilder bleiben auf dem Gerät.
import { cpSync, mkdirSync } from 'node:fs'

const out = 'public/ocr'
mkdirSync(out, { recursive: true })
const files = {
  'node_modules/tesseract.js/dist/worker.min.js': 'worker.min.js',
  'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js': 'tesseract-core-lstm.wasm.js',
  'node_modules/tesseract.js-core/tesseract-core-lstm.wasm': 'tesseract-core-lstm.wasm',
  'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js': 'tesseract-core-simd-lstm.wasm.js',
  'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm': 'tesseract-core-simd-lstm.wasm',
  'node_modules/@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz': 'deu.traineddata.gz',
}
for (const [from, to] of Object.entries(files)) cpSync(from, `${out}/${to}`)
console.log(`OCR-Dateien nach ${out} kopiert`)
