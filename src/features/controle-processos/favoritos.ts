import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'
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

export function snapshotsIguais(a: SnapshotFavorito | undefined, b: SnapshotFavorito): boolean {
  if (!a) return false
  return (
    a.prazoDataTexto === b.prazoDataTexto &&
    a.atribuicao === b.atribuicao &&
    a.marcadoresNomes.length === b.marcadoresNomes.length &&
    a.marcadoresNomes.every((nome, indice) => nome === b.marcadoresNomes[indice])
  )
}

export function atualizarSnapshotsFavoritos(
  itens: FavoritoProcesso[],
  snapshotsPorNumero: Map<string, SnapshotFavorito>
): { itens: FavoritoProcesso[]; mudou: boolean } {
  let mudou = false
  const novosItens = itens.map((item) => {
    const snapshotNovo = snapshotsPorNumero.get(item.numero)
    if (!snapshotNovo || snapshotsIguais(item.ultimoSnapshot, snapshotNovo)) return item
    mudou = true
    return { ...item, ultimoSnapshot: snapshotNovo }
  })
  return { itens: novosItens, mudou }
}
