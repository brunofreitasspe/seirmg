import { afterEach, describe, expect, it, vi } from 'vitest'
import { iniciarFormatacaoBasica } from './formatacaoBasica'
import type { EditorSEI } from './ponteEditor'

function montarToolboxFalsa(): { iframe: HTMLIFrameElement; toolbox: HTMLElement } {
  document.body.innerHTML =
    '<div class="cke"><span class="cke_inner"><span class="cke_top"><span class="cke_toolbox"></span></span>' +
    '<span class="cke_contents"><iframe title="Corpo do Texto"></iframe></span></span></div>'
  const iframe = document.querySelector('iframe') as HTMLIFrameElement
  const toolbox = document.querySelector('.cke_toolbox') as HTMLElement
  return { iframe, toolbox }
}

function criarEditorFalso(iframe: HTMLIFrameElement): EditorSEI {
  return {
    obterTextoSelecionado: vi.fn().mockResolvedValue(''),
    obterTextoCompleto: vi.fn().mockResolvedValue(''),
    inserirHtml: vi.fn().mockResolvedValue(undefined),
    inserirTexto: vi.fn().mockResolvedValue(undefined),
    aplicarClasseParagrafo: vi.fn().mockResolvedValue(undefined),
    aplicarEstiloTexto: vi.fn().mockResolvedValue(undefined),
    corpo: document.createElement('body'),
    documento: document,
    janela: window,
    iframe,
  }
}

describe('iniciarFormatacaoBasica', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('injeta 4 botões de alinhamento e 2 de fonte na toolbox', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    expect(toolbox.querySelectorAll('.seirmg-cke-button').length).toBeGreaterThanOrEqual(6)
  })

  it('clicar em "alinhar ao centro" chama aplicarClasseParagrafo com a classe certa', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const botao = toolbox.querySelector('#seirmg-cke-alinhar-centro') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.aplicarClasseParagrafo).toHaveBeenCalledWith('Texto_Alinhado_Centro')
  })

  it('não injeta nada quando a toolbox nunca aparece', async () => {
    document.body.innerHTML = '<iframe title="Corpo do Texto"></iframe>'
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    const editor = criarEditorFalso(iframe)

    await expect(iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] }, 5, 2)).rejects.toThrow(
      'Barra de ferramentas do CKEditor não apareceu a tempo'
    )
  })

  it('copiar formatação: primeiro clique lê o estilo, segundo aplica e limpa', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    document.body.innerHTML +=
      '<span id="origem" style="font-size:20px;font-weight:bold">origem</span>' +
      '<span id="destino">destino</span>'

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const range = document.createRange()
    range.selectNodeContents(document.getElementById('origem') as HTMLElement)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const botao = toolbox.querySelector('#seirmg-cke-copiar-formatacao') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(botao.title).toBe('Colar formatação copiada')

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(editor.aplicarEstiloTexto).toHaveBeenCalledWith(
      expect.objectContaining({ fontSizePx: 20, bold: true })
    )
    expect(botao.title).toBe('Copiar formatação')
  })
})
