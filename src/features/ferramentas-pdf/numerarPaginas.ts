import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface OpcoesNumeracao {
  inicioEm?: number
  posicao?: 'inferior-direito' | 'inferior-centro'
}

export async function numerarPaginas(arquivo: Uint8Array, opcoes: OpcoesNumeracao): Promise<Uint8Array> {
  const doc = await PDFDocument.load(arquivo)
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  const inicioEm = opcoes.inicioEm ?? 1
  const posicao = opcoes.posicao ?? 'inferior-direito'
  const tamanhoFonte = 10

  doc.getPages().forEach((pagina, indice) => {
    const texto = String(inicioEm + indice)
    const largura = fonte.widthOfTextAtSize(texto, tamanhoFonte)
    const x = posicao === 'inferior-direito' ? pagina.getWidth() - largura - 24 : pagina.getWidth() / 2 - largura / 2
    pagina.drawText(texto, { x, y: 16, size: tamanhoFonte, font: fonte, color: rgb(0, 0, 0) })
  })

  return doc.save()
}
