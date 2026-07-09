import type { ProcessoItem } from '../features/processos-novos/types'
import type { InfoRedirecionamento } from './processosNovos/fetchListaProcessos'

const OFFSCREEN_URL = 'src/offscreen/index.html'
const TIPO_MENSAGEM_PARSE_HTML = 'seirmg:parse-html'

type MensagemParseHtml =
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'processosNovos'; html: string }
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'infoRedirecionamento'; html: string }

let criandoDocumentoOffscreen: Promise<void> | null = null

async function garantirDocumentoOffscreen(): Promise<void> {
  const contextos = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contextos.length > 0) return

  if (criandoDocumentoOffscreen) {
    await criandoDocumentoOffscreen
    return
  }

  criandoDocumentoOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Fazer parse do HTML retornado pelo SEI — DOMParser não existe no service worker.',
  })
  try {
    await criandoDocumentoOffscreen
  } finally {
    criandoDocumentoOffscreen = null
  }
}

async function enviarParaOffscreen<T>(mensagem: MensagemParseHtml): Promise<T> {
  await garantirDocumentoOffscreen()
  return chrome.runtime.sendMessage(mensagem) as Promise<T>
}

export function parseProcessosNovosHtmlViaOffscreen(html: string): Promise<ProcessoItem[]> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'processosNovos', html })
}

export function extrairInfoRedirecionamentoViaOffscreen(html: string): Promise<InfoRedirecionamento> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'infoRedirecionamento', html })
}
