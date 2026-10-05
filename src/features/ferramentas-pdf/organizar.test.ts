import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { organizarPaginas } from './organizar'

describe('organizarPaginas', () => {
  it('reordena e remove páginas conforme a lista final de índices', async () => {
    const doc = await PDFDocument.create()
    const tamanhos = [100, 200, 300]
    for (const largura of tamanhos) doc.addPage([largura, 100])
    const bytes = await doc.save()

    // mantém só a página 2 (índice 1) e a página 0, nessa ordem -> [1, 0]
    const resultado = await organizarPaginas(bytes, [1, 0])
    const final = await PDFDocument.load(resultado)
    expect(final.getPageCount()).toBe(2)
    expect(final.getPage(0).getWidth()).toBe(200)
    expect(final.getPage(1).getWidth()).toBe(100)
  })
})
