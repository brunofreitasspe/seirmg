import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarPonteMainWorld } from './pontePrincipal'
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalhePronto, DetalheResposta } from './protocolo'

function criarJanelaFalsa(): Window {
  return new EventTarget() as unknown as Window
}

function criarInstanciaFalsa(nome: string, editavel: boolean, frameElement: HTMLIFrameElement | null = null) {
  return {
    name: nome,
    getSelection: () => ({ getSelectedText: () => `selecionado-${nome}` }),
    insertHtml: vi.fn(),
    insertText: vi.fn(),
    editable: () => ({ getText: () => `texto-completo-${nome}` }),
    document: {
      getBody: () => ({ $: { contentEditable: editavel ? 'true' : 'false' } as unknown as HTMLElement }),
      getWindow: () => ({ $: { frameElement } as unknown as Window }),
    },
  }
}

function definirCkeditor(janela: Window, instances: Record<string, unknown>): void {
  ;(janela as unknown as { CKEDITOR: unknown }).CKEDITOR = { instances }
}

describe('criarPonteMainWorld', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('marca o iframe real da instância editável com o atributo de identificação da ponte', async () => {
    document.body.innerHTML = '<iframe title="Corpo do Texto"></iframe>'
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    const janela = criarJanelaFalsa()
    definirCkeditor(janela, {
      cabecalho: criarInstanciaFalsa('cabecalho', false),
      corpo: criarInstanciaFalsa('corpo', true, frame),
    })

    const pronto = new Promise<DetalhePronto>((resolve) => {
      janela.addEventListener(
        EVENTO_PRONTO,
        (evento) => resolve((evento as CustomEvent<DetalhePronto>).detail),
        { once: true }
      )
    })

    const ponte = criarPonteMainWorld(janela, 10, 5)
    await pronto
    expect(frame.getAttribute(ATRIBUTO_EDITOR_ALVO)).toBe('corpo')
    ponte.destruir()
  })

  it('anuncia a instância editável quando há mais de uma instância CKEditor', async () => {
    const janela = criarJanelaFalsa()
    definirCkeditor(janela, {
      cabecalho: criarInstanciaFalsa('cabecalho', false),
      corpo: criarInstanciaFalsa('corpo', true),
    })

    const pronto = new Promise<DetalhePronto>((resolve) => {
      janela.addEventListener(
        EVENTO_PRONTO,
        (evento) => resolve((evento as CustomEvent<DetalhePronto>).detail),
        { once: true }
      )
    })

    const ponte = criarPonteMainWorld(janela, 10, 5)
    await expect(pronto).resolves.toEqual({ nome: 'corpo' })
    ponte.destruir()
  })

  it('executa getSelectedText na instância editável e responde pelo evento de resposta', async () => {
    const janela = criarJanelaFalsa()
    definirCkeditor(janela, { corpo: criarInstanciaFalsa('corpo', true) })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '1', tipo: 'getSelectedText', args: [] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '1', resultado: 'selecionado-corpo', erro: null })
    ponte.destruir()
  })

  it('executa insertHtml repassando o argumento pra instância', async () => {
    const janela = criarJanelaFalsa()
    const instancia = criarInstanciaFalsa('corpo', true)
    definirCkeditor(janela, { corpo: instancia })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '2', tipo: 'insertHtml', args: ['<p>oi</p>'] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '2', resultado: null, erro: null })
    expect(instancia.insertHtml).toHaveBeenCalledWith('<p>oi</p>')
    ponte.destruir()
  })

  it('responde com erro quando nenhuma instância está disponível ainda', async () => {
    const janela = criarJanelaFalsa()
    const ponte = criarPonteMainWorld(janela, 10, 0)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '3', tipo: 'getSelectedText', args: [] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({
      id: '3',
      resultado: null,
      erro: 'Nenhuma instância de CKEditor disponível',
    })
    ponte.destruir()
  })
})
