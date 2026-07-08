import type { Result } from '../../lib/result'
import {
  parseBlocoAssinaturaTable,
  type ParseBlocoAssinaturaOptions,
} from '../../features/bloco-assinatura/parser'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import {
  processarItensBlocoAssinatura,
  type BlocoAssinaturaPipelineDeps,
} from '../blocoAssinaturaPipeline'

export const ALARM_NAME = 'seirmg-check-bloco-assinatura'

function parseBlocoAssinaturaHtmlPadrao(
  html: string,
  options: ParseBlocoAssinaturaOptions
): BlocoAssinaturaItem[] {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  return parseBlocoAssinaturaTable(dom, options)
}

export interface BlocoAssinaturaCheckDeps {
  fetchBlocoAssinaturaHtml: () => Promise<Result<string>>
  parseOptions: ParseBlocoAssinaturaOptions
  parseBlocoAssinaturaHtml?: (
    html: string,
    options: ParseBlocoAssinaturaOptions
  ) => BlocoAssinaturaItem[] | Promise<BlocoAssinaturaItem[]>
  processarItens?: (itens: BlocoAssinaturaItem[], deps?: BlocoAssinaturaPipelineDeps) => Promise<void>
}

export async function verificarBlocoAssinatura(deps: BlocoAssinaturaCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensBlocoAssinatura
  const parseHtml = deps.parseBlocoAssinaturaHtml ?? parseBlocoAssinaturaHtmlPadrao

  const resultado = await deps.fetchBlocoAssinaturaHtml()
  if (!resultado.ok) return

  try {
    const itens = await parseHtml(resultado.data, deps.parseOptions)
    await processarItens(itens, { sempreNotificarPendentes: true })
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens do bloco de assinatura:', error)
  }
}
