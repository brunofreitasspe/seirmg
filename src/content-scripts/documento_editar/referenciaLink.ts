import { candidatoANumeroSei, extrairDigitos } from '../../features/referencia-link/numero'
import { construirLinkResultado } from '../../features/referencia-link/link'
import { fetchFinalUrl } from '../../lib/fetchFinalUrlViaBackground'
import { TIPO_LINK_SELECAO_CONVERTER, TIPO_LINK_SELECAO_ESTADO } from '../../lib/mensagensLink'
import { escaparHtml } from './dom'
import { mostrarToastErro, mostrarToastSucesso } from './toast'
import type { ClienteEditor, EditorSEI } from './ponteEditor'

// Igual a editor_montar/index.ts (obterIframeArvoreViaOpener): a tela de edição de documento do
// SEI abre como janela separada, com `window.opener` apontando pra janela que a abriu -- e essa
// janela pode por sua vez estar dentro de outro frame, por isso o `.parent` extra. Só no frame de
// topo da janela do editor (window === window.top) essa relação existe; nos iframes internos dela
// (um por campo do documento) `window.opener` não teria nenhuma relação útil.
function localizarFormularioPesquisaRapida(): HTMLFormElement | null {
  if (window !== window.top) return null
  try {
    const janelaAbridora = window.opener as Window | null
    const documentoAbridor = janelaAbridora?.parent?.document
    return documentoAbridor?.querySelector<HTMLFormElement>('#frmProtocoloPesquisaRapida') ?? null
  } catch (error) {
    console.error('[SEIRMG] Falha ao acessar a pesquisa rápida via window.opener:', error)
    return null
  }
}

async function converterSelecaoEmLink(editor: EditorSEI): Promise<void> {
  const textoSelecionado = await editor.obterTextoSelecionado()
  if (!candidatoANumeroSei(textoSelecionado)) return

  const digitos = extrairDigitos(textoSelecionado)

  const formulario = localizarFormularioPesquisaRapida()
  if (!formulario) {
    mostrarToastErro('Não foi possível localizar a pesquisa do SEI')
    return
  }

  const resultado = await fetchFinalUrl(formulario.action, {
    method: 'POST',
    body: new URLSearchParams({ txtPesquisaRapida: digitos }),
  })

  if (!resultado.ok) {
    mostrarToastErro(`Erro ao pesquisar número "${digitos}" no SEI: ${resultado.error}`)
    return
  }

  const link = construirLinkResultado(resultado.data)
  if (!link) {
    mostrarToastErro(`Número "${digitos}" não encontrado no SEI`)
    return
  }

  await editor.inserirHtml(`<a href="${link.href}" target="_blank">${escaparHtml(textoSelecionado)}</a>`)
  mostrarToastSucesso('Link inserido no documento')
}

export function iniciarReferenciaLink(cliente: ClienteEditor, editor: EditorSEI): void {
  cliente.aoMudarSelecao((texto) => {
    const ativo = candidatoANumeroSei(texto)
    chrome.runtime.sendMessage({ type: TIPO_LINK_SELECAO_ESTADO, ativo }).catch((error) => {
      console.error('[SEIRMG] Falha ao avisar estado de seleção de link:', error)
    })
  })

  chrome.runtime.onMessage.addListener((mensagem) => {
    if ((mensagem as { type?: unknown })?.type !== TIPO_LINK_SELECAO_CONVERTER) return
    converterSelecaoEmLink(editor).catch((error) => {
      console.error('[SEIRMG] Falha ao converter seleção em link:', error)
      mostrarToastErro('Erro inesperado ao converter seleção em link')
    })
  })

  window.addEventListener('pagehide', () => {
    chrome.runtime.sendMessage({ type: TIPO_LINK_SELECAO_ESTADO, ativo: false }).catch(() => undefined)
  })
}
