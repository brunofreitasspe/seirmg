// Depois de assinar um documento, a janela do editor (editor_montar) fecha e volta pra tela
// principal do SEI. O próprio SEI já roda, nesse momento, uma atualização "leve" da árvore --
// função nativa `atualizarArvore()`, visível no HTML real da página, que acessa
// `window.opener.parent.document.getElementById('ifrArvore')` -- mas essa atualização só manipula
// objetos JS já carregados (`objArvore`), não busca HTML novo do servidor. Por isso o ícone de
// "assinado" (`anchorA{id}`, lido por content-scripts/procedimento_enviar/index.ts) nunca aparece
// só com ela -- só um reload de verdade busca o HTML atualizado. Este script reusa o mesmo caminho
// nativo (`window.opener`), mas força esse reload de verdade ao fechar a janela do editor.
//
// Roda só no frame de topo da janela do editor (sem all_frames, de propósito) -- editor_montar tem
// vários iframes internos (um por campo do documento: Cabeçalho/Título/Corpo do Texto/etc., ver
// content-scripts/documento_editar/), e `window.opener` só existe no frame de topo da própria
// janela, não nesses iframes internos dela.
function obterIframeArvoreViaOpener(): HTMLIFrameElement | null {
  try {
    const janelaAbridora = window.opener as Window | null
    const documentoAbridor = janelaAbridora?.parent?.document
    return documentoAbridor?.querySelector<HTMLIFrameElement>('#ifrArvore') ?? null
  } catch (error) {
    console.error('[SEIRMG] Falha ao acessar a árvore via window.opener:', error)
    return null
  }
}

window.addEventListener('pagehide', () => {
  try {
    obterIframeArvoreViaOpener()?.contentWindow?.location.reload()
  } catch (error) {
    console.error('[SEIRMG] Falha ao recarregar a árvore ao fechar o editor:', error)
  }
})
