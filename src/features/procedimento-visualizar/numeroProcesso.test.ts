import { describe, expect, it } from 'vitest'
import { obterNumeroProcesso, extrairNumeroProcessoDaBarra, ehVisualizacaoDoProcesso } from './numeroProcesso'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('obterNumeroProcesso', () => {
  it('lê o nó selecionado da árvore quando presente', () => {
    const doc = montarDocumento('<span class="infraArvoreNoSelecionado">0001234-56.2026</span>')
    expect(obterNumeroProcesso(doc)).toBe('0001234-56.2026')
  })

  it('cai pro link de visualização quando não há nó selecionado', () => {
    const doc = montarDocumento(
      '<div class="infraArvore"><a target="ifrVisualizacao">0009876-54.2026</a></div>'
    )
    expect(obterNumeroProcesso(doc)).toBe('0009876-54.2026')
  })

  it('retorna null quando nenhum dos dois existe', () => {
    expect(obterNumeroProcesso(montarDocumento('<div></div>'))).toBeNull()
  })
})

describe('extrairNumeroProcessoDaBarra', () => {
  it('extrai o número de #divInfraBarraLocalizacao', () => {
    const doc = montarDocumento('<div id="divInfraBarraLocalizacao">GAB/2026 0001234-56.2026</div>')
    expect(extrairNumeroProcessoDaBarra(doc)).toBe('0001234-56.2026')
  })

  it('cai pro corpo inteiro da página quando a barra não existe', () => {
    const doc = montarDocumento('<body>Registrar recebimento — processo 0009876-54.2026</body>')
    expect(extrairNumeroProcessoDaBarra(doc)).toBe('0009876-54.2026')
  })

  it('retorna null quando nenhum padrão de número é encontrado', () => {
    expect(extrairNumeroProcessoDaBarra(montarDocumento('<div>sem número aqui</div>'))).toBeNull()
  })
})

describe('ehVisualizacaoDoProcesso', () => {
  it('retorna true quando a URL não tem id_documento (tela-resumo do processo)', () => {
    expect(ehVisualizacaoDoProcesso('controlador.php?acao=procedimento_visualizar&id_procedimento=123')).toBe(true)
  })

  it('retorna false quando a URL tem id_documento (visualizando um documento/despacho específico)', () => {
    expect(
      ehVisualizacaoDoProcesso(
        'controlador.php?acao=procedimento_visualizar&id_procedimento=123&id_documento=456'
      )
    ).toBe(false)
  })
})
