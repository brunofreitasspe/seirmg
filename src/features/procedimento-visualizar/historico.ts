import type { HistoricoProcessoEntry } from '../../lib/storage'

export function registrarProcessoVisitado(
  historicoAtual: HistoricoProcessoEntry[],
  novo: HistoricoProcessoEntry,
  limite = 10
): HistoricoProcessoEntry[] {
  const semDuplicata = historicoAtual.filter((item) => item.idProcedimento !== novo.idProcedimento)
  return [novo, ...semDuplicata].slice(0, limite)
}
