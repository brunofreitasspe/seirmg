export interface DocumentoPendente {
  id: string
  nome: string
}

const REGEX_ICONE_TIPO = /^icon(\d+)$/

export function extrairDocumentosPendentes(doc: Document, unidadeAtual: string): DocumentoPendente[] {
  const pendentes: DocumentoPendente[] = []

  doc.querySelectorAll<HTMLImageElement>('img[id^="icon"]').forEach((img) => {
    const match = REGEX_ICONE_TIPO.exec(img.id)
    if (!match) return
    const id = match[1]

    const src = img.getAttribute('src') ?? ''
    if (!src.includes('documento_interno')) return

    const unidadeDocumento = doc.getElementById(`anchorUG${id}`)?.querySelector('span')?.textContent?.trim()
    if (!unidadeDocumento || unidadeDocumento !== unidadeAtual) return

    if (doc.getElementById(`anchorA${id}`)) return

    const nome = doc.getElementById(`anchor${id}`)?.textContent?.trim() || `Documento ${id}`
    pendentes.push({ id, nome })
  })

  return pendentes
}
