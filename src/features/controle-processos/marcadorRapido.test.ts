import { describe, expect, it } from 'vitest'
import { extrairUrlDeOnclick, parseOpcoesMarcador } from './marcadorRapido'

describe('extrairUrlDeOnclick', () => {
  it('extrai a primeira string entre aspas simples de um onclick válido', () => {
    const onclick =
      "return acaoControleProcessos('controlador.php?acao=andamento_marcador_cadastrar&infra_hash=abc', true, true);"
    expect(extrairUrlDeOnclick(onclick)).toBe(
      'controlador.php?acao=andamento_marcador_cadastrar&infra_hash=abc'
    )
  })

  it('retorna null quando não há aspas simples', () => {
    expect(extrairUrlDeOnclick('return algumaFuncao(true, true);')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(extrairUrlDeOnclick('')).toBeNull()
  })
})

function criarDocComDropdownMarcador(opcoesHtml: string): Document {
  return new DOMParser().parseFromString(
    `<div id="selMarcador" class="dd-container"><ul class="dd-options">${opcoesHtml}</ul></div>`,
    'text/html'
  )
}

describe('parseOpcoesMarcador', () => {
  it('lê as opções do widget customizado, ignorando o placeholder "null"', () => {
    const doc = criarDocComDropdownMarcador(`
      <li><a class="dd-option">
        <input class="dd-option-value" type="hidden" value="null" />
        <label class="dd-option-text">Selecione</label>
      </a></li>
      <li><a class="dd-option">
        <input class="dd-option-value" type="hidden" value="3" />
        <img class="dd-option-image" src="marcador3.png" />
        <label class="dd-option-text">Urgente</label>
      </a></li>
      <li><a class="dd-option">
        <input class="dd-option-value" type="hidden" value="7" />
        <img class="dd-option-image" src="marcador7.png" />
        <label class="dd-option-text">Aguardando</label>
      </a></li>
    `)

    expect(parseOpcoesMarcador(doc)).toEqual([
      { id: '3', nome: 'Urgente', icone: 'marcador3.png' },
      { id: '7', nome: 'Aguardando', icone: 'marcador7.png' },
    ])
  })

  it('retorna lista vazia quando não há nenhuma opção', () => {
    const doc = criarDocComDropdownMarcador('')
    expect(parseOpcoesMarcador(doc)).toEqual([])
  })

  it('retorna lista vazia quando o widget #selMarcador não existe no documento', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(parseOpcoesMarcador(doc)).toEqual([])
  })
})

import { parseFormularioMarcador } from './marcadorRapido'

describe('parseFormularioMarcador', () => {
  it('lê action e campos ocultos do formulário de Adicionar Marcador', () => {
    const doc = new DOMParser().parseFromString(
      `<form id="frmAndamentoMarcadorCadastro" action="controlador.php?acao=andamento_marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&id_procedimento=123&infra_hash=abc">
        <input type="hidden" id="hdnIdMarcador" name="hdnIdMarcador" value="" />
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="456" />
        <textarea id="txaTexto" name="txaTexto"></textarea>
      </form>`,
      'text/html'
    )

    expect(parseFormularioMarcador(doc, 'frmAndamentoMarcadorCadastro')).toEqual({
      actionUrl:
        'controlador.php?acao=andamento_marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&id_procedimento=123&infra_hash=abc',
      campos: { hdnIdMarcador: '', hdnIdProtocolo: '456' },
    })
  })

  it('lê o formulário de Remoção com hdnIdMarcador já pré-preenchido', () => {
    const doc = new DOMParser().parseFromString(
      `<form id="frmAndamentoMarcadorRemocao" action="controlador.php?acao=andamento_marcador_remover&id_procedimento=123&infra_hash=xyz">
        <input type="hidden" id="hdnIdMarcador" name="hdnIdMarcador" value="3" />
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="456" />
      </form>`,
      'text/html'
    )

    expect(parseFormularioMarcador(doc, 'frmAndamentoMarcadorRemocao')).toEqual({
      actionUrl: 'controlador.php?acao=andamento_marcador_remover&id_procedimento=123&infra_hash=xyz',
      campos: { hdnIdMarcador: '3', hdnIdProtocolo: '456' },
    })
  })

  it('retorna null quando o formulário não é encontrado', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(parseFormularioMarcador(doc, 'frmAndamentoMarcadorCadastro')).toBeNull()
  })
})

import { montarCorpoConfirmacao } from './marcadorRapido'

describe('montarCorpoConfirmacao', () => {
  it('sobrescreve hdnIdMarcador com o valor escolhido e inclui o botão de confirmação', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '', hdnIdProtocolo: '456' },
      '3',
      '',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(Object.fromEntries(corpo)).toEqual({
      hdnIdMarcador: '3',
      hdnIdProtocolo: '456',
      sbmSalvar: 'Salvar',
    })
  })

  it('inclui txaTexto quando há texto', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '', hdnIdProtocolo: '456' },
      '3',
      'Observação qualquer',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(Object.fromEntries(corpo)).toEqual({
      hdnIdMarcador: '3',
      hdnIdProtocolo: '456',
      txaTexto: 'Observação qualquer',
      sbmSalvar: 'Salvar',
    })
  })

  it('não inclui txaTexto quando o texto é vazio', () => {
    const corpo = montarCorpoConfirmacao({ hdnIdMarcador: '' }, '3', '', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })
    expect(corpo.has('txaTexto')).toBe(false)
  })

  it('sobrescreve um hdnIdMarcador já preenchido (fluxo de remoção)', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '3', hdnIdProtocolo: '456' },
      '7',
      '',
      { nome: 'sbmRemover', valor: 'Remover' }
    )

    expect(Object.fromEntries(corpo)).toEqual({
      hdnIdMarcador: '7',
      hdnIdProtocolo: '456',
      sbmRemover: 'Remover',
    })
  })
})
