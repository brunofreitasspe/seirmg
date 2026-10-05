import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { juntarPdfs } from './juntar'

async function pdfComNPaginas(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage()
  return doc.save()
}

describe('juntarPdfs', () => {
  it('une os PDFs na ordem recebida, somando as páginas', async () => {
    const a = await pdfComNPaginas(2)
    const b = await pdfComNPaginas(3)
    const resultado = await juntarPdfs([a, b])
    const unido = await PDFDocument.load(resultado)
    expect(unido.getPageCount()).toBe(5)
  })

  it('rejeita lista vazia', async () => {
    await expect(juntarPdfs([])).rejects.toThrow()
  })
})
