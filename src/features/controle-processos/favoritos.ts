import type { FavoritoProcesso } from '../../lib/storage'

export function extrairFavoritoDaLinha(linha: Element, agoraIso: string): FavoritoProcesso | null {
  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const numero = processo?.textContent?.trim()
  if (!processo || !numero) return null

  return {
    numero,
    link: processo.getAttribute('href'),
    adicionadoEm: agoraIso,
  }
}

export function calcularOcultacaoPorFavorito(
  linhas: Array<{ id: string; nup: string | null }>,
  idsFavoritados: Set<string>
): Record<string, boolean> {
  const resultado: Record<string, boolean> = {}
  linhas.forEach(({ id, nup }) => {
    resultado[id] = !(nup !== null && idsFavoritados.has(nup))
  })
  return resultado
}

export function ordenarFavoritosPorData(itens: FavoritoProcesso[]): FavoritoProcesso[] {
  return [...itens].sort((a, b) => b.adicionadoEm.localeCompare(a.adicionadoEm))
}
