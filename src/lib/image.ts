/** Verkleinert ein Foto (Handykamera: oft 4–8 MB) auf ein lesbares JPEG von ~200–400 KB. */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.75): Promise<{ type: string; data: ArrayBuffer }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verarbeitet werden.'))), 'image/jpeg', quality),
  )
  return { type: blob.type, data: await blob.arrayBuffer() }
}
