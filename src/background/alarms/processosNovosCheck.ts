import type { Result } from '../../lib/result'
import type { ProcessoItem } from '../../features/processos-novos/types'
import { processarItensProcessosNovos } from '../processosNovosPipeline'

export const ALARM_NAME_PROCESSOS_NOVOS = 'seirmg-check-processos-novos'

export interface ProcessosNovosCheckDeps {
  fetchProcessosItens: () => Promise<Result<ProcessoItem[]>>
  processarItens?: (itens: ProcessoItem[]) => Promise<void>
}

export async function verificarProcessosNovos(deps: ProcessosNovosCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensProcessosNovos

  const resultado = await deps.fetchProcessosItens()
  if (!resultado.ok) return

  try {
    await processarItens(resultado.data)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens de processos novos:', error)
  }
}
