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
    getSelection: () => ({
      getSelectedText: () => `selecionado-${nome}`,
      getStartElement: (): unknown => null,
    }),
    insertHtml: vi.fn(),
    insertText: vi.fn(),
    editable: () => ({ getText: () => `texto-completo-${nome}` }),
    document: {
      getBody: () => ({ $: { contentEditable: editavel ? 'true' : 'false' } as unknown as HTMLElement }),
      getWindow: () => ({ $: { frameElement } as unknown as Window }),
    },
    fire: vi.fn(),
    applyStyle: vi.fn(),
    execCommand: vi.fn(),
  }
}

class EstiloFalso {
  definicao: unknown
  constructor(definicao: unknown) {
    this.definicao = definicao
  }
}

function definirCkeditor(janela: Window, instances: Record<string, unknown>): void {
  ;(janela as unknown as { CKEDITOR: unknown }).CKEDITOR = { instances, style: EstiloFalso }
}

function criarElementoFalso(nomeTag: string): { setAttribute: ReturnType<typeof vi.fn>; getAscendant: (nomes: string[], incluirAtual: boolean) => unknown } {
  const setAttribute = vi.fn()
  const elemento = {
    setAttribute,
    getAscendant: (nomes: string[], incluirAtual: boolean): unknown =>
      incluirAtual && nomes.includes(nomeTag) ? elemento : null,
  }
  return elemento
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

  it('continua tentando marcar o iframe quando o frameElement da instância ainda não está acessível na primeira tentativa', async () => {
    document.body.innerHTML = '<iframe title="Corpo do Texto"></iframe>'
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    const janela = criarJanelaFalsa()
    let tentativasDeMarcar = 0
    const instancia = {
      ...criarInstanciaFalsa('corpo', true),
      document: {
        getBody: () => ({ $: { contentEditable: 'true' } as unknown as HTMLElement }),
        getWindow: () => {
          tentativasDeMarcar++
          return { $: { frameElement: tentativasDeMarcar < 3 ? null : frame } as unknown as Window }
        },
      },
    }
    definirCkeditor(janela, { corpo: instancia })

    const pronto = new Promise<DetalhePronto>((resolve) => {
      janela.addEventListener(
        EVENTO_PRONTO,
        (evento) => resolve((evento as CustomEvent<DetalhePronto>).detail),
        { once: true }
      )
    })

    const ponte = criarPonteMainWorld(janela, 5, 10)
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

  it('aplica a classe no parágrafo da seleção atual, envolvida em saveSnapshot', async () => {
    const janela = criarJanelaFalsa()
    const paragrafo = criarElementoFalso('p')
    const instancia = criarInstanciaFalsa('corpo', true)
    instancia.getSelection = () => ({
      getSelectedText: () => '',
      getStartElement: () => paragrafo,
    })
    definirCkeditor(janela, { corpo: instancia })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '1', tipo: 'aplicarClasseParagrafo', args: ['Texto_Alinhado_Centro'] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '1', resultado: null, erro: null })
    expect(paragrafo.setAttribute).toHaveBeenCalledWith('class', 'Texto_Alinhado_Centro')
    expect(instancia.fire).toHaveBeenCalledWith('saveSnapshot')
    ponte.destruir()
  })

  it('responde com erro quando não há parágrafo na seleção pra aplicarClasseParagrafo', async () => {
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
    const comando: DetalheComando = { id: '2', tipo: 'aplicarClasseParagrafo', args: ['Texto_Alinhado_Centro'] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({
      id: '2',
      resultado: null,
      erro: 'Nenhum parágrafo encontrado na seleção atual',
    })
    ponte.destruir()
  })

  it('aplica estilo de texto (tamanho de fonte + cor) via CKEDITOR.style, envolvido em saveSnapshot', async () => {
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
    const estilo = { fontSizePx: 18, color: '#ff0000' }
    const comando: DetalheComando = { id: '3', tipo: 'aplicarEstiloTexto', args: [estilo] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '3', resultado: null, erro: null })
    expect(instancia.applyStyle).toHaveBeenCalledWith(
      expect.objectContaining({ definicao: { element: 'span', styles: { 'font-size': '18px', color: '#ff0000' } } })
    )
    expect(instancia.fire).toHaveBeenCalledWith('saveSnapshot')
    ponte.destruir()
  })

  it('aplica negrito/itálico/sublinhado via execCommand quando aplicarEstiloTexto pede', async () => {
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
    const estilo = { bold: true, italic: true, underline: true }
    const comando: DetalheComando = { id: '4', tipo: 'aplicarEstiloTexto', args: [estilo] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '4', resultado: null, erro: null })
    expect(instancia.execCommand).toHaveBeenCalledWith('bold')
    expect(instancia.execCommand).toHaveBeenCalledWith('italic')
    expect(instancia.execCommand).toHaveBeenCalledWith('underline')
    expect(instancia.applyStyle).not.toHaveBeenCalled()
    ponte.destruir()
  })

  // Usa a `window` real (não `criarJanelaFalsa()`) porque a interceptação precisa de
  // `document.getElementById`/`setTimeout` de verdade, que a janela falsa (um `EventTarget`
  // puro, usada só pra disparar os eventos da ponte) não tem. `definirCkeditor` (helper deste
  // arquivo) não expõe `on`/`dialog`, então esse teste monta seu próprio objeto `CKEDITOR`
  // falso, incluindo esses dois -- mirando a API real usada pelo Sei Pro em produção
  // (`CKEDITOR.on('dialogDefinition', ...)` + `CKEDITOR.dialog.getCurrent()`).
  it('intercepta o diálogo nativo "linkseiDialog": preenche o campo protocolo e clica OK só quando a seleção é um número candidato', async () => {
    const instancia = criarInstanciaFalsa('corpo', true)
    let textoSelecionado = '0011035-79.2020.8.13.0079'
    instancia.getSelection = () => ({
      getSelectedText: () => textoSelecionado,
      getStartElement: (): unknown => null,
    })

    const manipuladoresDialogDefinition: Array<(ev: { data: { name: string; definition: { onShow?: () => void } } }) => void> = []
    const setValueProtocolo = vi.fn()
    const elementoBotaoOk = document.createElement('button')
    elementoBotaoOk.id = 'seirmg-teste-botao-ok'
    document.body.appendChild(elementoBotaoOk)
    const cliqueOk = vi.fn()
    elementoBotaoOk.addEventListener('click', cliqueOk)

    const dialogoAtual = {
      getContentElement: (pagina: string, elemento: string) =>
        pagina === 'general' && elemento === 'protocolo' ? { setValue: setValueProtocolo } : null,
      getButton: (id: string) => (id === 'ok' ? { domId: 'seirmg-teste-botao-ok' } : null),
    }

    ;(window as unknown as { CKEDITOR: unknown }).CKEDITOR = {
      instances: { corpo: instancia },
      style: EstiloFalso,
      on: (evento: string, callback: (ev: { data: { name: string; definition: { onShow?: () => void } } }) => void) => {
        if (evento === 'dialogDefinition') manipuladoresDialogDefinition.push(callback)
      },
      dialog: { getCurrent: () => dialogoAtual },
    }

    const ponte = criarPonteMainWorld(window, 10, 5)
    await new Promise<void>((resolve) => window.addEventListener(EVENTO_PRONTO, () => resolve(), { once: true }))

    const comando: DetalheComando = { id: '1', tipo: 'ativarInterceptacaoLinkSei', args: [] }
    window.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    expect(manipuladoresDialogDefinition).toHaveLength(1)

    try {
      // Diálogo de outro nome: ignorado, `onShow` nem é sobrescrito.
      const definicaoOutroDialogo: { name: string; onShow?: () => void } = { name: 'outroDialogo' }
      manipuladoresDialogDefinition[0]({ data: { name: 'outroDialogo', definition: definicaoOutroDialogo } })
      expect(definicaoOutroDialogo.onShow).toBeUndefined()

      // linkseiDialog com número candidato selecionado: preenche e clica OK.
      const definicaoLinkSei: { name: string; onShow?: () => void } = { name: 'linkseiDialog' }
      manipuladoresDialogDefinition[0]({ data: { name: 'linkseiDialog', definition: definicaoLinkSei } })
      expect(definicaoLinkSei.onShow).toBeDefined()

      definicaoLinkSei.onShow?.()
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(setValueProtocolo).toHaveBeenCalledWith('00110357920208130079')
      expect(cliqueOk).toHaveBeenCalledTimes(1)

      // Sem número candidato selecionado: não preenche nem clica.
      textoSelecionado = 'texto qualquer sem número'
      setValueProtocolo.mockClear()
      cliqueOk.mockClear()

      definicaoLinkSei.onShow?.()
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(setValueProtocolo).not.toHaveBeenCalled()
      expect(cliqueOk).not.toHaveBeenCalled()
    } finally {
      delete (window as unknown as { CKEDITOR?: unknown }).CKEDITOR
      ponte.destruir()
    }
  })
})
