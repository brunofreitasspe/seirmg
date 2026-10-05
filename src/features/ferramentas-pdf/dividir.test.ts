import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { dividirPdf } from './dividir'

async function pdfComNPaginas(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage()
  return doc.save()
}

describe('dividirPdf', () => {
  it('separa por intervalo, cada saída com as páginas certas', async () => {
    const original = await pdfComNPaginas(5)
    const [parte1, parte2] = await dividirPdf(original, [
      [0, 1],
      [2, 4],
    ])
    expect((await PDFDocument.load(parte1)).getPageCount()).toBe(2)
    expect((await PDFDocument.load(parte2)).getPageCount()).toBe(3)
  })

  it('rejeita intervalo fora do total de páginas', async () => {
    const original = await pdfComNPaginas(2)
    await expect(dividirPdf(original, [[0, 5]])).rejects.toThrow()
  })
})
