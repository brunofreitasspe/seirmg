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

  it('maiúscula automática: lê a seleção, capitaliza e reinsere', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    editor.obterTextoSelecionado = vi.fn().mockResolvedValue('processo administrativo')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const botao = toolbox.querySelector('#seirmg-cke-maiuscula') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()

    expect(editor.inserirTexto).toHaveBeenCalledWith('Processo administrativo')
  })

  it('tabela rápida: pede linhas/colunas/estilo via prompt e insere a tabela já com o estilo escolhido', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValueOnce('2').mockReturnValueOnce('3').mockReturnValueOnce('bordas')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith(
      expect.stringContaining('<table class="Tabela" style="border-collapse:collapse;width:100%;border:1px solid #000">')
    )
    window.prompt = promptOriginal
  })

  it('tabela rápida: estilo inválido ou vazio cai no padrão (tabela sem style extra)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValueOnce('1').mockReturnValueOnce('1').mockReturnValueOnce('')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<table class="Tabela">'))
    window.prompt = promptOriginal
  })

  it('quebra de página: insere o marcador direto, sem diálogo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-quebra-pagina') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith('<div class="Quebra_Pagina" style="page-break-after:always">&nbsp;</div>')
  })

  it('sumário: lê os parágrafos numerados do corpo, atribui id, e insere a lista', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    editor.corpo.innerHTML =
      '<p class="Paragrafo_Numerado_Nivel1">Introdução</p><p>texto comum</p>'

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-sumario') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const paragrafoNumerado = editor.corpo.querySelector('.Paragrafo_Numerado_Nivel1') as HTMLElement
    expect(paragrafoNumerado.id).not.toBe('')
    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining(`href="#${paragrafoNumerado.id}"`))
  })

  it('sumário: parágrafo com classe numerada composta com classe de alinhamento continua sendo classificado corretamente', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    editor.corpo.innerHTML =
      '<p class="Paragrafo_Numerado_Nivel1 Texto_Alinhado_Centro">Introdução</p><p>texto comum</p>'

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-sumario') as HTMLElement
    expect(() => botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).not.toThrow()

    const paragrafoNumerado = editor.corpo.querySelector('.Paragrafo_Numerado_Nivel1') as HTMLElement
    expect(paragrafoNumerado.id).not.toBe('')
    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining(`href="#${paragrafoNumerado.id}"`))
  })

  it('nota de rodapé: pede o texto via prompt, insere a chamada e anexa a entrada no fim do corpo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValue('Texto da nota')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<sup id="chamada-'))
    expect(editor.corpo.querySelector('.Nota_Rodape')?.textContent).toContain('Texto da nota')
    window.prompt = promptOriginal
  })

  it('nota de rodapé: duas notas clicadas em sequência, sem esperar a primeira resolver, recebem números 1 e 2 (não repetem)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValue('Nota Y')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    // Dispara os dois cliques antes de aguardar qualquer resolução: reproduz o cenário real
    // em que inserirHtml faz um round-trip assíncrono pela ponte e o DOM só reflete a
    // primeira nota depois que sua Promise resolve.
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const entradas = Array.from(editor.corpo.querySelectorAll('.Nota_Rodape')).map((e) => e.textContent)
    expect(entradas).toEqual(['1. Nota Y ↑', '2. Nota Y ↑'])
    window.prompt = promptOriginal
  })
})
