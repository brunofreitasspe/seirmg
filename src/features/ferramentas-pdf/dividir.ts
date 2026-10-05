import { PDFDocument } from 'pdf-lib'

export async function dividirPdf(arquivo: Uint8Array, intervalos: Array<[number, number]>): Promise<Uint8Array[]> {
  const origem = await PDFDocument.load(arquivo)
  const totalPaginas = origem.getPageCount()

  const resultados: Uint8Array[] = []
  for (const [inicio, fim] of intervalos) {
    if (inicio < 0 || fim >= totalPaginas || inicio > fim) {
      throw new Error(`Intervalo inválido [${inicio}, ${fim}] pra um PDF com ${totalPaginas} página(s).`)
    }
    const indices = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)
    const novo = await PDFDocument.create()
    const paginas = await novo.copyPages(origem, indices)
    paginas.forEach((pagina) => novo.addPage(pagina))
    resultados.push(await novo.save())
  }
  return resultados
}
