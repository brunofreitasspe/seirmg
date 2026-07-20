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
    // insertAdjacentHTML (não `innerHTML +=`) preserva os nós já existentes — `+=`
    // re-serializa e reconstrói o body inteiro, invalidando as referências `iframe`/
    // `toolbox` já capturadas acima (viravam nós órfãos, desconectados do documento).
    document.body.insertAdjacentHTML(
      'beforeend',
      '<span id="origem" style="font-size:20px;font-weight:bold">origem</span>' +
        '<span id="destino">destino</span>'
    )

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

  it('tabela rápida: clicar na grade avança pro diálogo de estilo, Aplicar insere a tabela com as dimensões escolhidas', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const celula = document.querySelector('[data-linha="1"][data-coluna="2"]') as HTMLElement
    celula.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const btnAplicar = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Aplicar')
    ) as HTMLButtonElement
    btnAplicar.click()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<table class="Tabela"'))
    const htmlInserido = (editor.inserirHtml as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect((htmlInserido.match(/<tr>/g) ?? []).length).toBe(2)
    expect((htmlInserido.match(/<td/g) ?? []).length).toBe(6)
  })

  it('tabela rápida: Cancelar no diálogo de estilo não insere nada', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const celula = document.querySelector('[data-linha="0"][data-coluna="0"]') as HTMLElement
    celula.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const btnCancelar = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancelar')
    ) as HTMLButtonElement
    btnCancelar.click()

    expect(editor.inserirHtml).not.toHaveBeenCalled()
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

  it('nota de rodapé: abre diálogo, digita o texto, Inserir insere a chamada e anexa a entrada no fim do corpo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Texto da nota'
    const btnInserir = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inserir')
    ) as HTMLButtonElement
    btnInserir.click()
    await Promise.resolve()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<sup id="chamada-'))
    expect(editor.corpo.querySelector('.Nota_Rodape')?.textContent).toContain('Texto da nota')
  })

  it('nota de rodapé: duas notas em sequência, sem esperar a primeira resolver, recebem números 1 e 2 (não repetem)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    let textarea = document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Nota Y'
    let btnInserir = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inserir')
    ) as HTMLButtonElement
    btnInserir.click()

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    textarea = document.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Nota Y'
    btnInserir = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Inserir')
    ) as HTMLButtonElement
    btnInserir.click()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const entradas = Array.from(editor.corpo.querySelectorAll('.Nota_Rodape')).map((e) => e.textContent)
    expect(entradas).toEqual(['1. Nota Y ↑', '2. Nota Y ↑'])
  })

  it('atalho de tecla numérica (Ctrl+Alt+Shift+1) aplica a classe configurada, mesmo com Shift trocando o caractere de "1" pra "!"', async () => {
    const { iframe } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, {
      ativo: true,
      atalhos: [{ tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' }],
    })

    // Reproduz o evento real do navegador: com Shift pressionado, `key` vem como "!" (o
    // caractere já processado pelo layout), não "1" — só `code` ("Digit1") é estável.
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '!',
        code: 'Digit1',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        cancelable: true,
      })
    )

    expect(editor.aplicarClasseParagrafo).toHaveBeenCalledWith('Titulo1')
  })

  it('atalho de tecla de letra (Ctrl+Alt+Shift+A) continua funcionando', async () => {
    const { iframe } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, {
      ativo: true,
      atalhos: [{ tecla: 'a', classe: 'Titulo2', rotulo: 'Título 2' }],
    })

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'A',
        code: 'KeyA',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        cancelable: true,
      })
    )

    expect(editor.aplicarClasseParagrafo).toHaveBeenCalledWith('Titulo2')
  })

  it('acha a toolbox mesmo quando ela vive num container .cke separado do container do iframe editável (barra compartilhada entre instâncias, confirmado ao vivo no SEI)', async () => {
    document.body.innerHTML =
      // Instância que hospeda a barra compartilhada (ex.: cabeçalho) — sem nenhum <iframe> aqui.
      '<div id="cke_txaEditor_298" class="cke cke_shared cke_detached">' +
      '<span class="cke_inner"><span class="cke_top"><span class="cke_toolbox"></span></span></span>' +
      '</div>' +
      // Instância editável (corpo do texto) — container .cke próprio, sem toolbox dentro dele.
      '<div id="cke_txaEditor_174" class="cke_4 cke cke_reset cke_chrome cke_editor_txaEditor_174">' +
      '<div class="cke_inner"><div class="cke_contents"><iframe title="Corpo do Texto"></iframe></div></div>' +
      '</div>'
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    const toolbox = document.querySelector('.cke_toolbox') as HTMLElement
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    expect(toolbox.querySelectorAll('.seirmg-cke-button').length).toBeGreaterThanOrEqual(6)
  })
})
