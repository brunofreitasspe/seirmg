import { PDFDocument } from 'pdf-lib'

export async function organizarPaginas(arquivo: Uint8Array, ordemFinal: number[]): Promise<Uint8Array> {
  const origem = await PDFDocument.load(arquivo)
  const novo = await PDFDocument.create()
  const paginas = await novo.copyPages(origem, ordemFinal)
  paginas.forEach((pagina) => novo.addPage(pagina))
  return novo.save()
}
