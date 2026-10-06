import type { FavoritoProcesso, FavoritoRemovido, SnapshotFavorito } from '../../lib/storage'
import { extrairEspecificacaoParaExibicao } from './especificacao'

export function extrairHrefDaLinha(linha: Element): string | null {
  return linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')?.getAttribute('href') ?? null
}

// O link salvo no favorito é capturado uma vez, com o `infra_hash` válido só pro
// contexto (unidade/sessão) daquele momento. Confirmado ao vivo (2026-07-23): clicar
// nesse link depois do processo sair da caixa (fechado) faz o SEI tratar o hash como
// inválido e forçar deslogamento da sessão — não é um link quebrado comum. A mesma
// action sem `infra_hash` nenhum já é usada e funciona (popup/main.ts, histórico de
// processos visitados), então reconstruir o link só com `id_procedimento` é a forma
// segura de abrir um favorito fechado sem arriscar reusar um hash desatualizado.
export function extrairIdProcedimentoDoLink(link: string | null): string | null {
  if (!link) return null
  try {
    return new URL(link, 'https://seirmg.invalid/').searchParams.get('id_procedimento')
  } catch {
    return null
  }
}

export function construirLinkSeguro(link: string | null): string | null {
  const id = extrairIdProcedimentoDoLink(link)
  return id ? `controlador.php?acao=procedimento_trabalhar&id_procedimento=${id}` : null
}

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

// Reusada pelo botão de favoritar direto do histórico de visitados (popup e painel no SEI) e,
// futuramente, pelo Plano de Favoritos Avançados.
export function adicionarFavoritoSeNovo(itens: FavoritoProcesso[], novo: FavoritoProcesso): FavoritoProcesso[] {
  if (itens.some((item) => item.numero === novo.numero)) return itens
  return [...itens, novo]
}

// Lixeira: favorito removido fica disponível pra restaurar por um tempo (mais recente no topo).
export function moverParaLixeira(
  lixeiraAtual: FavoritoRemovido[],
  removido: FavoritoProcesso,
  removidoEm: string,
  limite = 20
): FavoritoRemovido[] {
  const semDuplicata = lixeiraAtual.filter((item) => item.numero !== removido.numero)
  return [{ ...removido, removidoEm }, ...semDuplicata].slice(0, limite)
}

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

export function podarLixeiraPorJanela(lixeira: FavoritoRemovido[], agoraIso: string, janelaDias = 30): FavoritoRemovido[] {
  if (janelaDias <= 0) return lixeira
  const limiteMs = new Date(agoraIso).getTime() - janelaDias * MILISSEGUNDOS_POR_DIA
  return lixeira.filter((item) => new Date(item.removidoEm).getTime() >= limiteMs)
}

export function restaurarDaLixeira(
  itens: FavoritoProcesso[],
  lixeira: FavoritoRemovido[],
  numero: string
): { itens: FavoritoProcesso[]; lixeira: FavoritoRemovido[] } {
  const encontrado = lixeira.find((item) => item.numero === numero)
  if (!encontrado) return { itens, lixeira }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { removidoEm, ...favorito } = encontrado
  return {
    itens: adicionarFavoritoSeNovo(itens, favorito),
    lixeira: lixeira.filter((item) => item.numero !== numero),
  }
}

export function removerDefinitivamenteDaLixeira(lixeira: FavoritoRemovido[], numero: string): FavoritoRemovido[] {
  return lixeira.filter((item) => item.numero !== numero)
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
