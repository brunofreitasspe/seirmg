import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { comprimirPdf } from './comprimir'

describe('comprimirPdf', () => {
  it('devolve bytes válidos e informa os dois tamanhos', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save({ useObjectStreams: false }) // propositalmente "não otimizado"

    const resultado = await comprimirPdf(bytes)
    expect(resultado.tamanhoOriginal).toBe(bytes.length)
    expect((await PDFDocument.load(resultado.bytes)).getPageCount()).toBe(1)
  })
})
