import { PDFDocument } from 'pdf-lib'

export interface ResultadoCompressao {
  bytes: Uint8Array
  tamanhoOriginal: number
  tamanhoFinal: number
}

// Compressão "estrutural": remove objetos órfãos e reescreve com fluxo de objetos
// comprimido (pdf-lib `useObjectStreams`). Não recomprime imagens com perda — isso
// precisa decodificar/recodificar cada imagem interna (JPEG/PNG) e é tratado como
// melhoria futura, não parte deste plano.
export async function comprimirPdf(arquivo: Uint8Array): Promise<ResultadoCompressao> {
  const doc = await PDFDocument.load(arquivo)
  const bytes = await doc.save({ useObjectStreams: true })
  return { bytes, tamanhoOriginal: arquivo.length, tamanhoFinal: bytes.length }
}
