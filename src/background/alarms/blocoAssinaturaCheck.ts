import type { Result } from '../../lib/result'
import {
  parseBlocoAssinaturaTable,
  type ParseBlocoAssinaturaOptions,
} from '../../features/bloco-assinatura/parser'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import { processarItensBlocoAssinatura } from '../blocoAssinaturaPipeline'

export const ALARM_NAME = 'seirmg-check-bloco-assinatura'

export interface BlocoAssinaturaCheckDeps {
  fetchBlocoAssinaturaHtml: () => Promise<Result<string>>
  parseOptions: ParseBlocoAssinaturaOptions
  processarItens?: (itens: BlocoAssinaturaItem[]) => Promise<void>
}

export async function verificarBlocoAssinatura(deps: BlocoAssinaturaCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensBlocoAssinatura

  const resultado = await deps.fetchBlocoAssinaturaHtml()
  if (!resultado.ok) return

  try {
    const dom = new DOMParser().parseFromString(resultado.data, 'text/html')
    const itens = parseBlocoAssinaturaTable(dom, deps.parseOptions)
    await processarItens(itens)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens do bloco de assinatura:', error)
  }
}
