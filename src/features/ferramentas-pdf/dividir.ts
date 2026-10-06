import { PDFDocument } from 'pdf-lib'

async function extrairPaginas(origem: PDFDocument, inicio: number, fim: number): Promise<Uint8Array> {
  const indices = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)
  const novo = await PDFDocument.create()
  const paginas = await novo.copyPages(origem, indices)
  paginas.forEach((pagina) => novo.addPage(pagina))
  return novo.save()
}

export async function dividirPdf(arquivo: Uint8Array, intervalos: Array<[number, number]>): Promise<Uint8Array[]> {
  const origem = await PDFDocument.load(arquivo)
  const totalPaginas = origem.getPageCount()

  const resultados: Uint8Array[] = []
  for (const [inicio, fim] of intervalos) {
    if (inicio < 0 || fim >= totalPaginas || inicio > fim) {
      throw new Error(`Intervalo inválido [${inicio}, ${fim}] pra um PDF com ${totalPaginas} página(s).`)
    }
    resultados.push(await extrairPaginas(origem, inicio, fim))
  }
  return resultados
}

export interface ParteDividida {
  bytes: Uint8Array
  // Índices base 0, inclusivos.
  inicio: number
  fim: number
  // true = uma página sozinha já passa do limite (não dá pra dividir uma página): vai assim mesmo,
  // num arquivo só dela, e a interface avisa.
  excedeLimite: boolean
}

// Divide em partes de páginas consecutivas, cada uma com no máximo `limiteBytes` -- útil pro
// limite de tamanho de upload do SEI. O tamanho só se conhece salvando (recursos como fontes e
// imagens são compartilhados entre páginas), então mede de verdade; pra não salvar a cada página,
// cresce a parte dobrando o número de páginas e depois acha o ponto exato por busca binária.
export async function dividirPorTamanho(arquivo: Uint8Array, limiteBytes: number): Promise<ParteDividida[]> {
  if (!(limiteBytes > 0)) throw new Error('O tamanho máximo precisa ser maior que zero.')
  const origem = await PDFDocument.load(arquivo)
  const totalPaginas = origem.getPageCount()
  const partes: ParteDividida[] = []

  let inicio = 0
  while (inicio < totalPaginas) {
    const primeira = await extrairPaginas(origem, inicio, inicio)
    if (primeira.length > limiteBytes) {
      partes.push({ bytes: primeira, inicio, fim: inicio, excedeLimite: true })
      inicio += 1
      continue
    }

    // `cabe` = maior fim conhecido que cabe; `naoCabe` = menor fim conhecido que não cabe.
    let cabe = inicio
    let bytesCabe = primeira
    let naoCabe = totalPaginas
    let passo = 1
    while (cabe + passo < naoCabe) {
      const fim = Math.min(cabe + passo, totalPaginas - 1)
      const bytes = await extrairPaginas(origem, inicio, fim)
      if (bytes.length <= limiteBytes) {
        cabe = fim
        bytesCabe = bytes
        if (fim === totalPaginas - 1) break
        passo *= 2
      } else {
        naoCabe = fim
        passo = Math.max(1, Math.floor((naoCabe - cabe) / 2))
      }
    }

    partes.push({ bytes: bytesCabe, inicio, fim: cabe, excedeLimite: false })
    inicio = cabe + 1
  }
  return partes
}
