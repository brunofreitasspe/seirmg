import { PDFDocument, rgb } from 'pdf-lib'

export interface Tarja {
  pagina: number
  x: number
  y: number
  largura: number
  altura: number
}

// LIMITAÇÃO CONHECIDA: isto desenha um retângulo preto OPACO por cima da área (o conteúdo
// original fica embaixo, no fluxo do PDF — não é removido). Suficiente contra visualização
// normal e impressão; NÃO suficiente contra extração de texto/imagem por quem edita o PDF
// com outra ferramenta. Remoção de verdade exige reescrever o content stream da página
// (recortar os operadores de texto/imagem que caem dentro da área) — não implementado
// nesta tarefa; documentar isso na UI (Step 5) é obrigatório, não opcional.
export async function aplicarTarjas(arquivo: Uint8Array, tarjas: Tarja[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(arquivo)
  const paginas = doc.getPages()

  for (const tarja of tarjas) {
    if (tarja.pagina < 0 || tarja.pagina >= paginas.length) {
      throw new Error(`Página ${tarja.pagina} fora do intervalo (PDF tem ${paginas.length} página(s)).`)
    }
    paginas[tarja.pagina].drawRectangle({
      x: tarja.x,
      y: tarja.y,
      width: tarja.largura,
      height: tarja.altura,
      color: rgb(0, 0, 0),
      opacity: 1,
    })
  }

  return doc.save()
}
