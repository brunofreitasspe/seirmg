import type { HistoricoProcessoEntry } from '../../lib/storage'
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
  return [novo, ...semDuplicata].slice(0, limite)
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
