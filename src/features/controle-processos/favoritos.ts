import type { FavoritoProcesso } from '../../lib/storage'
import { extrairEspecificacaoParaExibicao } from './especificacao'

export function extrairFavoritoDaLinha(linha: Element, agoraIso: string): FavoritoProcesso | null {
  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const numero = processo?.textContent?.trim()
  if (!processo || !numero) return null

  const onmouseover = processo.getAttribute('onmouseover')
  const especificacao = onmouseover ? extrairEspecificacaoParaExibicao(onmouseover) : ''

  return {
    numero,
    link: processo.getAttribute('href'),
    adicionadoEm: agoraIso,
    especificacao: especificacao || undefined,
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
