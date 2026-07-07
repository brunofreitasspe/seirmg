export interface BlocoItem {
  numero: string
  href: string
  descricao: string
}

function linhasDeDados(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('div.infraAreaTabela table > tbody > tr')).filter(
    (linha) =>
      linha.classList.contains('infraTrClara') ||
      linha.classList.contains('infraTrEscura') ||
      linha.classList.contains('trVermelha')
  )
}

export function parseListaBlocos(root: ParentNode): BlocoItem[] {
  return linhasDeDados(root).flatMap((linha) => {
    const celulas = linha.children
    const link = celulas.item(1)?.querySelector('a')
    const celulaDescricao = celulas.item(celulas.length - 2)
    if (!link) return []

    return [
      {
        numero: link.textContent?.trim() ?? '',
        href: link.getAttribute('href') ?? '',
        descricao: celulaDescricao?.textContent?.trim() ?? '',
      },
    ]
  })
}

export function parseProcessosDoBloco(root: ParentNode): string[] {
  return linhasDeDados(root).flatMap((linha) => {
    const link = linha.children.item(2)?.querySelector('a')
    return link?.textContent ? [link.textContent.trim()] : []
  })
}

export function linhaCasaBloco(numeroProcesso: string, numerosDoBloco: string[]): boolean {
  return numerosDoBloco.includes(numeroProcesso)
}
