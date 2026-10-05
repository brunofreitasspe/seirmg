import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { imagensParaPdf } from './imagemParaPdf'

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function bytesDoPng(): Uint8Array {
  return Uint8Array.from(Buffer.from(PNG_1X1_BASE64, 'base64'))
}

describe('imagensParaPdf', () => {
  it('cria um PDF com uma página por imagem', async () => {
    const resultado = await imagensParaPdf([
      { bytes: bytesDoPng(), tipo: 'png' },
      { bytes: bytesDoPng(), tipo: 'png' },
    ])
    expect((await PDFDocument.load(resultado)).getPageCount()).toBe(2)
  })

  it('rejeita lista vazia', async () => {
    await expect(imagensParaPdf([])).rejects.toThrow()
  })
})
