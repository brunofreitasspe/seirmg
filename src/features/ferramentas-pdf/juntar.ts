import { PDFDocument } from 'pdf-lib'

export async function juntarPdfs(arquivos: Uint8Array[]): Promise<Uint8Array> {
  if (arquivos.length === 0) throw new Error('Nenhum arquivo informado pra juntar.')

  const resultado = await PDFDocument.create()
  for (const bytes of arquivos) {
    const origem = await PDFDocument.load(bytes)
    const paginas = await resultado.copyPages(origem, origem.getPageIndices())
    paginas.forEach((pagina) => resultado.addPage(pagina))
  }
  return resultado.save()
}
