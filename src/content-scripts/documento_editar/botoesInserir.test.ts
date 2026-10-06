import { describe, expect, it, vi } from 'vitest'
import { ligarAlternanciaChecklist, montarBotoesInserir } from './botoesInserir'
import type { EditorSEI } from './ponteEditor'

function criarEditorFalso(corpo: HTMLElement = document.createElement('body')): EditorSEI {
  return {
    obterTextoSelecionado: vi.fn().mockResolvedValue(''),
    obterTextoCompleto: vi.fn().mockResolvedValue(''),
    inserirHtml: vi.fn().mockResolvedValue(undefined),
    inserirTexto: vi.fn().mockResolvedValue(undefined),
    aplicarClasseParagrafo: vi.fn().mockResolvedValue(undefined),
    aplicarEstiloTexto: vi.fn().mockResolvedValue(undefined),
    ativarInterceptacaoLinkSei: vi.fn().mockResolvedValue(undefined),
    registrarAlteracao: vi.fn().mockResolvedValue(undefined),
    corpo,
    documento: document,
    janela: window,
    iframe: document.createElement('iframe'),
  }
}

describe('checklist', () => {
  it('o botão insere a caixa no cursor', () => {
    const editor = criarEditorFalso()
    montarBotoesInserir(editor).get('checklist')?.dispatchEvent(new MouseEvent('click', { cancelable: true }))
    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('seirmg-checklist'))
  })

  it('clicar na caixa alterna ☐/☑ e avisa o CKEditor; dois cliques voltam ao início', () => {
    const corpo = document.createElement('div')
    corpo.innerHTML = '<p><span class="seirmg-checklist" data-marcado="nao">☐</span>&nbsp;item</p>'
    document.body.append(corpo)
    const editor = criarEditorFalso(corpo)
    ligarAlternanciaChecklist(editor)
    const caixa = corpo.querySelector('.seirmg-checklist') as HTMLElement

    caixa.click()
    expect([caixa.textContent, caixa.dataset.marcado]).toEqual(['☑', 'sim'])
    expect(editor.registrarAlteracao).toHaveBeenCalledTimes(1)
    caixa.click()
    expect([caixa.textContent, caixa.dataset.marcado]).toEqual(['☐', 'nao'])
    corpo.remove()
  })

  it('ligar a alternância duas vezes no mesmo corpo não faz um clique alternar duas vezes', () => {
    const corpo = document.createElement('div')
    corpo.innerHTML = '<p><span class="seirmg-checklist" data-marcado="nao">☐</span></p>'
    document.body.append(corpo)
    const editor = criarEditorFalso(corpo)
    ligarAlternanciaChecklist(editor)
    ligarAlternanciaChecklist(editor)
    const caixa = corpo.querySelector('.seirmg-checklist') as HTMLElement
    caixa.click()
    expect(caixa.textContent).toBe('☑')
    corpo.remove()
  })

  it('clicar fora de uma caixa não faz nada', () => {
    const corpo = document.createElement('div')
    corpo.innerHTML = '<p>texto</p>'
    document.body.append(corpo)
    const editor = criarEditorFalso(corpo)
    ligarAlternanciaChecklist(editor)
    ;(corpo.querySelector('p') as HTMLElement).click()
    expect(editor.registrarAlteracao).not.toHaveBeenCalled()
    corpo.remove()
  })
})
