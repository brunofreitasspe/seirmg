import { describe, expect, it } from 'vitest'
import { extrairCamposOcultos, extrairLinhasValidas, extrairNroItens } from './rolagemInfinita'

function criarFormComHidden(campos: Array<{ id: string; name: string; value: string }>): HTMLFormElement {
  const form = document.createElement('form')
  campos.forEach(({ id, name, value }) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.id = id
    input.name = name
    input.value = value
    form.appendChild(input)
  })
  return form
}

describe('extrairCamposOcultos', () => {
  it('coleta apenas hidden inputs cujo id contém "hdn"', () => {
    const form = criarFormComHidden([
      { id: 'hdnRecebidosPaginaAtual', name: 'hdnRecebidosPaginaAtual', value: '1' },
      { id: 'outroCampo', name: 'outroCampo', value: 'x' },
    ])
    expect(extrairCamposOcultos(form)).toEqual({ hdnRecebidosPaginaAtual: '1' })
  })

  it('ignora hidden inputs sem atributo name mesmo com "hdn" no id', () => {
    const form = document.createElement('form')
    const input = document.createElement('input')
    input.type = 'hidden'
    input.id = 'hdnRecebidosPaginaAtual'
    input.value = '1'
    form.appendChild(input)
    expect(extrairCamposOcultos(form)).toEqual({})
  })

  it('coleta múltiplos campos hdn com nomes e valores diferentes', () => {
    const form = criarFormComHidden([
      { id: 'hdnRecebidosPaginaAtual', name: 'hdnRecebidosPaginaAtual', value: '1' },
      { id: 'hdnRecebidosNroItens', name: 'hdnRecebidosNroItens', value: '20' },
      { id: 'hdnGeradosPaginaAtual', name: 'hdnGeradosPaginaAtual', value: '0' },
    ])
    expect(extrairCamposOcultos(form)).toEqual({
      hdnRecebidosPaginaAtual: '1',
      hdnRecebidosNroItens: '20',
      hdnGeradosPaginaAtual: '0',
    })
  })

  it('retorna objeto vazio quando não há nenhum campo hdn', () => {
    const form = criarFormComHidden([{ id: 'outroCampo', name: 'outroCampo', value: 'x' }])
    expect(extrairCamposOcultos(form)).toEqual({})
  })
})

function criarDocComTabela(idTabela: string, linhasHtml: string): Document {
  const doc = new DOMParser().parseFromString(
    `<table id="${idTabela.replace('#', '')}"><tbody>${linhasHtml}</tbody></table>`,
    'text/html'
  )
  return doc
}

describe('extrairLinhasValidas', () => {
  it('retorna linhas com classe infraTrClara', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="infraTrClara" id="a"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['a'])
  })

  it('retorna linhas com classe infraTrEscura', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="infraTrEscura" id="b"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['b'])
  })

  it('retorna linhas com classe trVermelha', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="trVermelha" id="c"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['c'])
  })

  it('ignora linhas sem nenhuma das três classes válidas', () => {
    const doc = criarDocComTabela(
      '#tbl',
      '<tr class="outraClasse" id="x"><td>1</td></tr><tr class="infraTrClara" id="a"><td>1</td></tr>'
    )
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['a'])
  })

  it('retorna lista vazia quando a tabela não existe no documento', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="infraTrClara" id="a"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#outraTabela')).toEqual([])
  })

  it('preserva a ordem das linhas do documento', () => {
    const doc = criarDocComTabela(
      '#tbl',
      '<tr class="infraTrClara" id="a"><td>1</td></tr><tr class="infraTrEscura" id="b"><td>2</td></tr><tr class="trVermelha" id="c"><td>3</td></tr>'
    )
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('extrairNroItens', () => {
  it('retorna o número quando o campo existe e é numérico', () => {
    const doc = new DOMParser().parseFromString(
      '<input id="hdnRecebidosNroItens" value="42" />',
      'text/html'
    )
    expect(extrairNroItens(doc, 'Recebidos')).toBe(42)
  })

  it('retorna null quando o campo não existe', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(extrairNroItens(doc, 'Recebidos')).toBeNull()
  })

  it('retorna null quando o valor não é numérico', () => {
    const doc = new DOMParser().parseFromString(
      '<input id="hdnRecebidosNroItens" value="abc" />',
      'text/html'
    )
    expect(extrairNroItens(doc, 'Recebidos')).toBeNull()
  })
})
