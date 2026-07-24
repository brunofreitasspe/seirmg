import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'
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
