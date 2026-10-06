import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirDialogoReferenciaInterna, atualizarNumerosReferencias, garantirAncora, listarParagrafosNumerados } from './referenciaInternaDialogo'
import type { EditorSEI } from './ponteEditor'

function corpoCom(html: string): HTMLElement {
  const corpo = document.createElement('div')
  corpo.innerHTML = html
  return corpo
}

describe('listarParagrafosNumerados', () => {
  it('lista os numerados com número hierárquico e começo do texto', () => {
    const corpo = corpoCom(
      '<p class="Texto_Justificado">intro</p><p class="Paragrafo_Numerado_Nivel1">Primeiro</p><p class="Paragrafo_Numerado_Nivel2">Sub</p>'
    )
    expect(listarParagrafosNumerados(corpo).map((p) => [p.numero, p.resumo])).toEqual([
      ['1', 'Primeiro'],
      ['1.1', 'Sub'],
    ])
  })
})

describe('garantirAncora', () => {
  it('cria a âncora uma vez e reaproveita depois', () => {
    const corpo = corpoCom('<p class="Paragrafo_Numerado_Nivel1">A</p>')
    const paragrafo = corpo.querySelector('p') as HTMLElement
    const id = garantirAncora(paragrafo)
    expect(id).toMatch(/^seirmg-ref-[a-z0-9]{8}$/)
    expect(garantirAncora(paragrafo)).toBe(id)
    expect(paragrafo.querySelectorAll('a[name]').length).toBe(1)
  })
})

describe('atualizarNumerosReferencias', () => {
  it('recalcula o número das referências pela posição atual do parágrafo', () => {
    const corpo = corpoCom(
      '<p class="Paragrafo_Numerado_Nivel1">novo primeiro</p>' +
        '<p class="Paragrafo_Numerado_Nivel1"><a name="seirmg-ref-abc12345" id="seirmg-ref-abc12345"></a>alvo</p>' +
        '<p>ver item <a href="#seirmg-ref-abc12345" class="seirmg-ref-interna">1</a></p>'
    )
    atualizarNumerosReferencias(corpo)
    expect(corpo.querySelector('.seirmg-ref-interna')?.textContent).toBe('2')
  })
})

describe('abrirDialogoReferenciaInterna', () => {
  afterEach(() => document.querySelectorAll('.seirmg-painel-flutuante').forEach((e) => e.remove()))

  it('documento sem parágrafo numerado: explica e não insere', () => {
    const editor = { corpo: corpoCom('<p>sem numeração</p>'), inserirHtml: vi.fn(), registrarAlteracao: vi.fn() } as unknown as EditorSEI
    abrirDialogoReferenciaInterna(editor)
    expect(document.querySelector('.seirmg-painel-flutuante')?.textContent).toContain('Nenhum parágrafo numerado')
    expect(editor.inserirHtml).not.toHaveBeenCalled()
  })

  it('escolher dois parágrafos insere "itens X e Y" com âncoras nos alvos', async () => {
    const corpo = corpoCom('<p class="Paragrafo_Numerado_Nivel1">A</p><p class="Paragrafo_Numerado_Nivel1">B</p>')
    const editor = {
      corpo,
      inserirHtml: vi.fn().mockResolvedValue(undefined),
      registrarAlteracao: vi.fn().mockResolvedValue(undefined),
    } as unknown as EditorSEI
    abrirDialogoReferenciaInterna(editor)
    const lista = document.querySelector('.seirmg-painel-flutuante select') as HTMLSelectElement
    Array.from(lista.options).forEach((opcao) => (opcao.selected = true))
    ;(Array.from(document.querySelectorAll('.seirmg-painel-flutuante button')).find((b) => b.textContent?.includes('Inserir')) as HTMLButtonElement).click()
    await vi.waitFor(() => expect(editor.inserirHtml).toHaveBeenCalled())
    expect(vi.mocked(editor.inserirHtml).mock.calls[0][0]).toMatch(/^itens <a href="#seirmg-ref-\w+" class="seirmg-ref-interna">1<\/a> e <a href="#seirmg-ref-\w+" class="seirmg-ref-interna">2<\/a>$/)
    expect(corpo.querySelectorAll('a[name^="seirmg-ref-"]').length).toBe(2)
    expect(editor.registrarAlteracao).toHaveBeenCalled()
  })
})
