import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DescritorEstiloTexto, DetalheComando, DetalhePronto, DetalheResposta, TipoComando } from './protocolo'

export interface EditorSEI {
  obterTextoSelecionado: () => Promise<string>
  obterTextoCompleto: () => Promise<string>
  inserirHtml: (html: string) => Promise<void>
  inserirTexto: (texto: string) => Promise<void>
  aplicarClasseParagrafo: (classe: string) => Promise<void>
  aplicarEstiloTexto: (estilo: DescritorEstiloTexto) => Promise<void>
  corpo: HTMLElement
  documento: Document
  janela: Window
  iframe: HTMLIFrameElement
}

export interface ClienteEditor {
  aguardarEditorPronto: (documentoGlobal?: Document) => Promise<EditorSEI>
  destruir: () => void
}

const TIMEOUT_COMANDO_MS_PADRAO = 5000

export function criarClienteEditor(janelaGlobal: Window, timeoutComandoMs = TIMEOUT_COMANDO_MS_PADRAO): ClienteEditor {
  let proximoId = 0
  const pendentes = new Map<string, (resposta: DetalheResposta) => void>()
  let ultimoPronto: DetalhePronto | null = null
  const aguardandoPronto: Array<(detalhe: DetalhePronto) => void> = []

  function tratarResposta(evento: Event): void {
    const detalhe = (evento as CustomEvent<DetalheResposta>).detail
    const resolver = pendentes.get(detalhe.id)
    if (!resolver) return
    pendentes.delete(detalhe.id)
    resolver(detalhe)
  }

  function tratarPronto(evento: Event): void {
    const detalhe = (evento as CustomEvent<DetalhePronto>).detail
    ultimoPronto = detalhe
    aguardandoPronto.splice(0).forEach((resolver) => resolver(detalhe))
  }

  janelaGlobal.addEventListener(EVENTO_RESPOSTA, tratarResposta)
  janelaGlobal.addEventListener(EVENTO_PRONTO, tratarPronto)

  function obterDetalhePronto(): Promise<DetalhePronto> {
    if (ultimoPronto) return Promise.resolve(ultimoPronto)
    return new Promise((resolve) => aguardandoPronto.push(resolve))
  }

  function enviarComando(tipo: TipoComando, args: unknown[]): Promise<unknown> {
    const id = String(proximoId++)
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => {
        pendentes.delete(id)
        reject(new Error(`Timeout aguardando resposta do comando "${tipo}"`))
      }, timeoutComandoMs)

      pendentes.set(id, (resposta) => {
        clearTimeout(temporizador)
        if (resposta.erro) {
          reject(new Error(resposta.erro))
          return
        }
        resolve(resposta.resultado)
      })

      const detalhe: DetalheComando = { id, tipo, args }
      janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: detalhe }))
    })
  }

  function montarEditor(nome: string, documentoGlobal: Document): EditorSEI | null {
    const iframe = documentoGlobal.querySelector<HTMLIFrameElement>(`iframe[${ATRIBUTO_EDITOR_ALVO}="${nome}"]`)
    const documentoEditor = iframe?.contentDocument
    const janelaEditor = iframe?.contentWindow
    if (!documentoEditor || !janelaEditor || !iframe) return null

    return {
      corpo: documentoEditor.body,
      documento: documentoEditor,
      janela: janelaEditor,
      iframe,
      obterTextoSelecionado: () => enviarComando('getSelectedText', []).then(String),
      obterTextoCompleto: () => enviarComando('getTextoCompleto', []).then(String),
      inserirHtml: (html: string) => enviarComando('insertHtml', [html]).then(() => undefined),
      inserirTexto: (texto: string) => enviarComando('insertText', [texto]).then(() => undefined),
      aplicarClasseParagrafo: (classe: string) =>
        enviarComando('aplicarClasseParagrafo', [classe]).then(() => undefined),
      aplicarEstiloTexto: (estilo: DescritorEstiloTexto) =>
        enviarComando('aplicarEstiloTexto', [estilo]).then(() => undefined),
    }
  }

  function aguardarEditorPronto(documentoGlobal: Document = document): Promise<EditorSEI> {
    return obterDetalhePronto().then(({ nome }) => {
      const editor = montarEditor(nome, documentoGlobal)
      if (!editor) throw new Error(`Não foi possível localizar o iframe do editor "${nome}"`)
      return editor
    })
  }

  return {
    aguardarEditorPronto,
    destruir(): void {
      janelaGlobal.removeEventListener(EVENTO_RESPOSTA, tratarResposta)
      janelaGlobal.removeEventListener(EVENTO_PRONTO, tratarPronto)
    },
  }
}
