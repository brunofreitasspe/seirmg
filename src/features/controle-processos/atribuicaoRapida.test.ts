import { beforeEach, describe, expect, it } from 'vitest'
import {
  montarCorpoConfirmacaoAtribuicao,
  parseFormularioAtribuicao,
  parseOpcoesAtribuicao,
} from './atribuicaoRapida'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseOpcoesAtribuicao', () => {
  it('lê as opções do #selAtribuicao, rotulando value="null" como "Ninguém"', () => {
    document.body.innerHTML = `
      <select id="selAtribuicao">
        <option value="null" selected="selected">&nbsp;</option>
        <option value="100006975">bruno.freitas - BRUNO FREITAS DA SILVA PEREIRA</option>
        <option value="100006934">danielle.marchi - DANIELLE REGINA MARCHI</option>
      </select>
    `

    expect(parseOpcoesAtribuicao(document)).toEqual([
      { id: 'null', nome: 'Ninguém (remover atribuição)' },
      { id: '100006975', nome: 'bruno.freitas - BRUNO FREITAS DA SILVA PEREIRA' },
      { id: '100006934', nome: 'danielle.marchi - DANIELLE REGINA MARCHI' },
    ])
  })

  it('ignora opções com value vazio (mas mantém "null")', () => {
    document.body.innerHTML = `
      <select id="selAtribuicao">
        <option value="">deveria ser ignorada</option>
        <option value="null">&nbsp;</option>
      </select>
    `

    expect(parseOpcoesAtribuicao(document)).toEqual([{ id: 'null', nome: 'Ninguém (remover atribuição)' }])
  })

  it('retorna lista vazia quando #selAtribuicao não existe', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseOpcoesAtribuicao(document)).toEqual([])
  })
})

describe('parseFormularioAtribuicao', () => {
  it('lê action e campos ocultos, incluindo hdnIdProtocolo em lote (separado por vírgula)', () => {
    document.body.innerHTML = `
      <form id="frmAtividadeAtribuir" action="controlador.php?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_atribuicao_cadastrar&infra_hash=abc">
        <input type="hidden" id="hdnInfraTipoPagina" name="hdnInfraTipoPagina" value="1" />
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="21095007,5793758" />
      </form>
    `

    expect(parseFormularioAtribuicao(document)).toEqual({
      actionUrl:
        'controlador.php?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_atribuicao_cadastrar&infra_hash=abc',
      campos: { hdnInfraTipoPagina: '1', hdnIdProtocolo: '21095007,5793758' },
    })
  })

  it('lê hdnIdProtocolo com um só processo', () => {
    document.body.innerHTML = `
      <form id="frmAtividadeAtribuir" action="controlador.php?acao=x">
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="21095007" />
      </form>
    `

    expect(parseFormularioAtribuicao(document)?.campos.hdnIdProtocolo).toBe('21095007')
  })

  it('retorna null quando o formulário não existe', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseFormularioAtribuicao(document)).toBeNull()
  })
})

describe('montarCorpoConfirmacaoAtribuicao', () => {
  it('sobrescreve selAtribuicao com a pessoa escolhida e inclui o botão de confirmação', () => {
    const campos = { hdnInfraTipoPagina: '1', hdnIdProtocolo: '21095007' }
    const corpo = montarCorpoConfirmacaoAtribuicao(campos, '100006975', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })

    expect(corpo.get('hdnInfraTipoPagina')).toBe('1')
    expect(corpo.get('hdnIdProtocolo')).toBe('21095007')
    expect(corpo.get('selAtribuicao')).toBe('100006975')
    expect(corpo.get('sbmSalvar')).toBe('Salvar')
  })

  it('funciona com "Ninguém" (value "null")', () => {
    const corpo = montarCorpoConfirmacaoAtribuicao({ hdnIdProtocolo: '21095007' }, 'null', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })

    expect(corpo.get('selAtribuicao')).toBe('null')
  })
})
