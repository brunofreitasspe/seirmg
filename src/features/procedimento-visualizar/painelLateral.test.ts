import { describe, expect, it } from 'vitest'
import { extrairUrlEdicaoProcesso, extrairTipoProcesso, extrairInteressados } from './painelLateral'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extrairUrlEdicaoProcesso', () => {
  it('encontra a url de procedimento_alterar no head', () => {
    const head = `<title>SEI</title><a href="controlador.php?acao=procedimento_alterar&id_procedimento=123&infra_hash=abc" tabindex="0"></a>`
    expect(extrairUrlEdicaoProcesso(head)).toBe(
      'controlador.php?acao=procedimento_alterar&id_procedimento=123&infra_hash=abc'
    )
  })

  it('cai para procedimento_consultar quando alterar não existe', () => {
    const head = `<a href="controlador.php?acao=procedimento_consultar&id_procedimento=123&infra_hash=abc"></a>`
    expect(extrairUrlEdicaoProcesso(head)).toBe(
      'controlador.php?acao=procedimento_consultar&id_procedimento=123&infra_hash=abc'
    )
  })

  it('retorna null quando nenhum dos dois marcadores existe', () => {
    expect(extrairUrlEdicaoProcesso('<title>SEI</title>')).toBeNull()
  })
})

describe('extrairTipoProcesso', () => {
  it('extrai o texto da opção selecionada', () => {
    const doc = montarDocumento(`
      <select id="selTipoProcedimento">
        <option value="1">Outro tipo</option>
        <option value="2" selected="selected">Aquisições e ARPs</option>
      </select>
    `)
    expect(extrairTipoProcesso(doc)).toBe('Aquisições e ARPs')
  })

  it('retorna string vazia quando não há select', () => {
    expect(extrairTipoProcesso(montarDocumento('<div></div>'))).toBe('')
  })
})

describe('extrairInteressados', () => {
  it('extrai nome e sigla no formato "Nome (SIGLA)"', () => {
    const doc = montarDocumento(`
      <select id="selInteressadosProcedimento">
        <option value="10">João da Silva (JS)</option>
        <option value="11">Maria Souza (MS)</option>
      </select>
    `)
    expect(extrairInteressados(doc)).toEqual([
      { id: '10', nome: 'João da Silva', sigla: 'JS' },
      { id: '11', nome: 'Maria Souza', sigla: 'MS' },
    ])
  })

  it('usa o texto inteiro como nome quando não bate o formato "(SIGLA)"', () => {
    const doc = montarDocumento(`
      <select id="selInteressadosProcedimento">
        <option value="10">Secretaria de Obras</option>
      </select>
    `)
    expect(extrairInteressados(doc)).toEqual([{ id: '10', nome: 'Secretaria de Obras', sigla: '' }])
  })

  it('retorna lista vazia quando não há select', () => {
    expect(extrairInteressados(montarDocumento('<div></div>'))).toEqual([])
  })
})
