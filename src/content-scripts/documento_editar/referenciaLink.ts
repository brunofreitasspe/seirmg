import type { EditorSEI } from './ponteEditor'

// O SEI já tem um botão nativo no editor de documentos ("Inserir um Link para processo ou
// documento do SEI!") que busca e cria o link sozinho a partir de um número digitado num
// `window.prompt()` -- confirmado ao vivo (2026-07-24). Em vez de reimplementar essa busca,
// a ponte principal (pontePrincipal.ts, main world) intercepta esse prompt e pré-preenche
// com o número já selecionado no texto, quando houver um. Esta função só liga essa
// interceptação -- toda a lógica de fato mora do lado main world.
export function iniciarReferenciaLink(editor: EditorSEI): void {
  editor.ativarInterceptacaoLinkSei().catch((error) => {
    console.error('[SEIRMG] Falha ao ativar interceptação do link SEI:', error)
  })
}
