// pdf.js configurado uma vez só (worker local, empacotado pelo Vite) pra quem precisa renderizar
// páginas: organizar (miniaturas), OCR (página -> imagem) e tarjar (pré-visualização).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

export type PDFDocumentProxy = Awaited<ReturnType<typeof getDocument>['promise']>
export type PDFPageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>
export type PageViewport = ReturnType<PDFPageProxy['getViewport']>

// pdf.js transfere (e invalida) o buffer recebido pro worker -- passa uma cópia pra não estragar
// os bytes que a ferramenta ainda vai usar.
export async function abrirPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({ data: bytes.slice() }).promise
}

export async function renderizarPagina(
  pagina: PDFPageProxy,
  escala: number
): Promise<{ canvas: HTMLCanvasElement; viewport: PageViewport }> {
  const viewport = pagina.getViewport({ scale: escala })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const contexto = canvas.getContext('2d')
  if (!contexto) throw new Error('Canvas 2D indisponível.')
  await pagina.render({ canvas, canvasContext: contexto, viewport }).promise
  return { canvas, viewport }
}

// Escala pra página caber em `larguraAlvo` px (CSS), renderizada em resolução de tela (nítida em
// telas de alta densidade).
export function escalaParaLargura(pagina: PDFPageProxy, larguraAlvo: number): number {
  const larguraBase = pagina.getViewport({ scale: 1 }).width
  return (larguraAlvo / larguraBase) * Math.min(2, window.devicePixelRatio || 1)
}
