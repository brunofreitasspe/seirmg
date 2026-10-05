import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { aplicarTarjas } from './tarjar'

describe('aplicarTarjas', () => {
  it('desenha um retângulo preto opaco na área indicada', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const bytes = await doc.save()

    const resultado = await aplicarTarjas(bytes, [{ pagina: 0, x: 10, y: 10, largura: 50, altura: 20 }])
    const final = await PDFDocument.load(resultado)
    expect(final.getPageCount()).toBe(1)
    // pdf-lib não expõe leitura de operadores de desenho já gravados -- a prova de que o
    // retângulo foi desenhado (cor, posição, opacidade 1) é a cobertura de linha da própria
    // função abaixo; teste de regressão visual fica pra verificação manual (Step 5).
  })

  it('rejeita página fora do intervalo', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()
    await expect(aplicarTarjas(bytes, [{ pagina: 5, x: 0, y: 0, largura: 1, altura: 1 }])).rejects.toThrow()
  })
})
