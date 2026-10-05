import type { FavoritoProcesso, HistoricoProcessoEntry } from '../../lib/storage'
import type { NivelAcessoExtraido } from './painelLateral'

// Processos sigilosos não entram no histórico: evita que o popup ou o painel lateral
// (Tarefa 4 deste plano) revelem número/tipo de um processo sigiloso pra quem olhar por
// cima do ombro. Nível desconhecido ('', falha de parse da página) também é bloqueado —
// nesse caso não há garantia de que o processo é público.
export function ehNivelAcessoCapturavel(nivel: NivelAcessoExtraido['nivel']): boolean {
  return nivel === 'Público' || nivel === 'Restrito'
}

export function registrarProcessoVisitado(
  historicoAtual: HistoricoProcessoEntry[],
  novo: HistoricoProcessoEntry,
  limite = 10
): HistoricoProcessoEntry[] {
  const semDuplicata = historicoAtual.filter((item) => item.idProcedimento !== novo.idProcedimento)
  const atualizado = [novo, ...semDuplicata]
  if (limite <= 0) return atualizado
  return atualizado.slice(0, limite)
}

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

export function podarPorJanela(
  historico: HistoricoProcessoEntry[],
  agoraIso: string,
  janelaDias: number
): HistoricoProcessoEntry[] {
  if (janelaDias <= 0) return historico
  const limiteMs = new Date(agoraIso).getTime() - janelaDias * MILISSEGUNDOS_POR_DIA
  return historico.filter((item) => new Date(item.acessadoEm).getTime() >= limiteMs)
}

export function filtrarHistoricoPorTexto(
  historico: HistoricoProcessoEntry[],
  termo: string
): HistoricoProcessoEntry[] {
  const termoNormalizado = termo.trim().toLowerCase()
  if (!termoNormalizado) return historico
  return historico.filter(
    (item) =>
      item.numero.toLowerCase().includes(termoNormalizado) || item.tipo.toLowerCase().includes(termoNormalizado)
  )
}

// Usado pelo painel "Visitados recentemente" dentro do próprio SEI (procedimento_visualizar):
// remove o processo atualmente aberto (ele ainda não foi persistido no histórico nesse momento,
// mas por segurança também o filtramos caso já esteja) e limita a quantidade exibida.
export function prepararListaRecentes(
  historico: HistoricoProcessoEntry[],
  idProcedimentoAtual: string | null,
  max = 5
): HistoricoProcessoEntry[] {
  return historico.filter((item) => item.idProcedimento !== idProcedimentoAtual).slice(0, max)
}

// Usado pelo botão de favoritar direto do histórico de visitados (popup e painel no SEI).
// O link é reconstruído só com id_procedimento (sem infra_hash/infra_unidade_atual), igual
// ao `construirLinkSeguro` de favoritos.ts -- ver o comentário lá sobre por que um hash
// capturado nesse momento não é seguro de reusar depois.
export function historicoEntryParaFavorito(entry: HistoricoProcessoEntry, adicionadoEm: string): FavoritoProcesso {
  return {
    numero: entry.numero,
    link: `controlador.php?acao=procedimento_trabalhar&id_procedimento=${entry.idProcedimento}`,
    adicionadoEm,
  }
}
