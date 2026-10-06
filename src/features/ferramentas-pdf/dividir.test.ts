import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { dividirPdf, dividirPorTamanho } from './dividir'

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

// Páginas com "peso" de verdade: o pdf-lib comprime o conteúdo das páginas, então texto repetido
// quase não ocupa espaço -- usa texto pseudoaleatório (determinístico), que comprime mal.
async function pdfComPaginasPesadas(n: number, caracteresPorPagina = 20_000): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  let semente = 12345
  const proximoCaractere = (): string => {
    semente = (semente * 1103515245 + 12345) % 2147483648
    return String.fromCharCode(33 + (semente % 90))
  }
  for (let i = 0; i < n; i++) {
    const texto = Array.from({ length: caracteresPorPagina }, proximoCaractere).join('')
    doc.addPage().drawText(texto, { x: 10, y: 10, size: 4, font: fonte })
  }
  return doc.save()
}

describe('dividirPorTamanho', () => {
  it('cada parte fica dentro do limite e, juntas, cobrem todas as páginas na ordem', async () => {
    const original = await pdfComPaginasPesadas(10)
    const limite = Math.floor(original.length / 3)
    const partes = await dividirPorTamanho(original, limite)

    expect(partes.length).toBeGreaterThanOrEqual(3)
    for (const parte of partes) {
      expect(parte.bytes.length).toBeLessThanOrEqual(limite)
      expect(parte.excedeLimite).toBe(false)
      expect((await PDFDocument.load(parte.bytes)).getPageCount()).toBe(parte.fim - parte.inicio + 1)
    }
    expect(partes[0].inicio).toBe(0)
    expect(partes[partes.length - 1].fim).toBe(9)
    partes.slice(1).forEach((parte, i) => expect(parte.inicio).toBe(partes[i].fim + 1))
  })

  it('limite maior que o arquivo devolve uma parte só, com todas as páginas', async () => {
    const original = await pdfComPaginasPesadas(4)
    const partes = await dividirPorTamanho(original, original.length * 10)
    expect(partes.map((p) => [p.inicio, p.fim])).toEqual([[0, 3]])
  })

  it('página que sozinha passa do limite vai num arquivo próprio, sinalizada', async () => {
    const original = await pdfComPaginasPesadas(3)
    const partes = await dividirPorTamanho(original, 1000)
    expect(partes.map((p) => [p.inicio, p.fim, p.excedeLimite])).toEqual([
      [0, 0, true],
      [1, 1, true],
      [2, 2, true],
    ])
  })

  it('limite não positivo rejeita', async () => {
    await expect(dividirPorTamanho(await pdfComNPaginas(1), 0)).rejects.toThrow()
  })
})
