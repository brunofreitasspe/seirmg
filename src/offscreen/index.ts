import { parseBlocoAssinaturaTable, type ParseBlocoAssinaturaOptions } from '../features/bloco-assinatura/parser'
import { parseProcessosControlarTable } from '../features/processos-novos/parser'

function extrairInfoRedirecionamento(html: string): {
  tipoVisualizacao?: string
  acaoRedirecionamento?: string | null
} {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  return {
    tipoVisualizacao: form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value,
    acaoRedirecionamento: form?.getAttribute('action'),
  }
}

interface MensagemParseHtml {
  type: 'seirmg:parse-html'
  parser: 'blocoAssinatura' | 'processosNovos' | 'infoRedirecionamento'
  html: string
  options?: ParseBlocoAssinaturaOptions
}

function ehMensagemParseHtml(mensagem: unknown): mensagem is MensagemParseHtml {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:parse-html'
  )
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemParseHtml(mensagem)) return false

  try {
    const doc = new DOMParser().parseFromString(mensagem.html, 'text/html')

    if (mensagem.parser === 'blocoAssinatura') {
      responder(parseBlocoAssinaturaTable(doc, mensagem.options ?? { seiVersionAtLeast4: true }))
    } else if (mensagem.parser === 'processosNovos') {
      responder(parseProcessosControlarTable(doc))
    } else {
      responder(extrairInfoRedirecionamento(mensagem.html))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar HTML no documento offscreen:', error)
    responder(mensagem.parser === 'infoRedirecionamento' ? {} : [])
  }

  return true
})
