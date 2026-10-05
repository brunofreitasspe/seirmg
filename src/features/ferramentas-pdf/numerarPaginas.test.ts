import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { numerarPaginas } from './numerarPaginas'

describe('numerarPaginas', () => {
  it('não altera a contagem de páginas', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addPage()
    const bytes = await doc.save()

    const resultado = await numerarPaginas(bytes, {})
    expect((await PDFDocument.load(resultado)).getPageCount()).toBe(2)
  })

  it('aceita número inicial diferente de 1', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()
    await expect(numerarPaginas(bytes, { inicioEm: 5 })).resolves.toBeInstanceOf(Uint8Array)
  })
})
