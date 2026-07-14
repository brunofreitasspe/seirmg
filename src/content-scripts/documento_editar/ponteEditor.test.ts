import { afterEach, describe, expect, it } from 'vitest'
import { criarClienteEditor } from './ponteEditor'
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalheResposta } from './protocolo'

function responderComando(
  janelaGlobal: Window,
  resolver: (detalhe: DetalheComando) => { resultado: unknown; erro: string | null }
): () => void {
  const handler = (evento: Event): void => {
    const detalhe = (evento as CustomEvent<DetalheComando>).detail
    const { resultado, erro } = resolver(detalhe)
    const resposta: DetalheResposta = { id: detalhe.id, resultado, erro }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_RESPOSTA, { detail: resposta }))
  }
  janelaGlobal.addEventListener(EVENTO_COMANDO, handler)
  return () => janelaGlobal.removeEventListener(EVENTO_COMANDO, handler)
}

describe('criarClienteEditor', () => {
  let pararDeResponder: (() => void) | null = null
  let cliente: ReturnType<typeof criarClienteEditor> | null = null

  afterEach(() => {
    pararDeResponder?.()
    cliente?.destruir()
    pararDeResponder = null
    cliente = null
    document.body.innerHTML = ''
  })

  it('monta o EditorSEI a partir do evento de pronto e localiza o iframe pelo nome', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="123"></iframe>`
    cliente = criarClienteEditor(window)

    const promessa = cliente.aguardarEditorPronto(document)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: '123' } }))

    const editor = await promessa
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    expect(editor.documento).toBe(iframe.contentDocument)
    expect(editor.corpo).toBe(iframe.contentDocument?.body)
    expect(editor.iframe).toBe(iframe)
  })

  it('resolve imediatamente se o evento de pronto já tinha disparado antes de aguardar', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="456"></iframe>`
    cliente = criarClienteEditor(window)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: '456' } }))

    const editor = await cliente.aguardarEditorPronto(document)
    expect(editor.documento).toBe((document.querySelector('iframe') as HTMLIFrameElement).contentDocument)
  })

  it('obterTextoSelecionado envia comando getSelectedText e resolve com o resultado', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="789"></iframe>`
    cliente = criarClienteEditor(window)
    pararDeResponder = responderComando(window, (detalhe) => {
      expect(detalhe.tipo).toBe('getSelectedText')
      return { resultado: 'texto selecionado', erro: null }
    })

    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: '789' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.obterTextoSelecionado()).resolves.toBe('texto selecionado')
  })

  it('inserirHtml rejeita quando o comando responde com erro', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="err"></iframe>`
    cliente = criarClienteEditor(window)
    pararDeResponder = responderComando(window, () => ({ resultado: null, erro: 'falhou' }))

    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'err' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.inserirHtml('<p>x</p>')).rejects.toThrow('falhou')
  })

  it('rejeita quando não encontra o iframe correspondente ao nome anunciado', async () => {
    cliente = criarClienteEditor(window)
    const promessa = cliente.aguardarEditorPronto(document)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'inexistente' } }))
    await expect(promessa).rejects.toThrow('Não foi possível localizar')
  })

  it('rejeita com timeout se nenhuma resposta ao comando chegar', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="to"></iframe>`
    cliente = criarClienteEditor(window, 20)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'to' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.obterTextoCompleto()).rejects.toThrow('Timeout')
  })
})
