import type { Result } from '../../lib/result'
import { parseProcessosControlarTable } from '../../features/processos-novos/parser'
import type { ProcessoItem } from '../../features/processos-novos/types'
import { processarItensProcessosNovos } from '../processosNovosPipeline'

export const ALARM_NAME_PROCESSOS_NOVOS = 'seirmg-check-processos-novos'

export interface ProcessosNovosCheckDeps {
  fetchProcessosDocument: () => Promise<Result<Document>>
  processarItens?: (itens: ProcessoItem[]) => Promise<void>
}

export async function verificarProcessosNovos(deps: ProcessosNovosCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensProcessosNovos

  const resultado = await deps.fetchProcessosDocument()
  if (!resultado.ok) return

  try {
    const itens = parseProcessosControlarTable(resultado.data)
    await processarItens(itens)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens de processos novos:', error)
  }
}
