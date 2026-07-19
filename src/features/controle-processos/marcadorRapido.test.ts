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

function criarDocComSelectMarcador(optionsHtml: string): Document {
  return new DOMParser().parseFromString(
    `<select id="selMarcador" name="selMarcador">${optionsHtml}</select>`,
    'text/html'
  )
}

describe('parseOpcoesMarcador', () => {
  it('lê as opções do <select> nativo (HTML bruto do servidor), ignorando o placeholder "null"', () => {
    const doc = criarDocComSelectMarcador(`
      <option value="null" selected="selected">&nbsp;</option>
      <option value="3" data-imagesrc="svg/marcador_azul.svg?11">Urgente</option>
      <option value="7" data-imagesrc="svg/marcador_vermelho.svg?11">Aguardando</option>
    `)

    expect(parseOpcoesMarcador(doc)).toEqual([
      { id: '3', nome: 'Urgente', icone: 'svg/marcador_azul.svg?11' },
      { id: '7', nome: 'Aguardando', icone: 'svg/marcador_vermelho.svg?11' },
    ])
  })

  it('retorna lista vazia quando não há nenhuma opção', () => {
    const doc = criarDocComSelectMarcador('')
    expect(parseOpcoesMarcador(doc)).toEqual([])
  })

  it('retorna lista vazia quando o #selMarcador não existe no documento', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(parseOpcoesMarcador(doc)).toEqual([])
  })

  it('lê as opções de um seletor customizado (ex.: #selStaIcone, mesmo formato de <select>)', () => {
    const doc = new DOMParser().parseFromString(
      `<select id="selStaIcone" name="selStaIcone">
        <option value="null" selected="selected">&nbsp;</option>
        <option value="4" data-imagesrc="svg/marcador_amarelo.svg?11">Amarelo</option>
        <option value="6" data-imagesrc="svg/marcador_azul.svg?11">Azul</option>
      </select>`,
      'text/html'
    )

    expect(parseOpcoesMarcador(doc, '#selStaIcone option')).toEqual([
      { id: '4', nome: 'Amarelo', icone: 'svg/marcador_amarelo.svg?11' },
      { id: '6', nome: 'Azul', icone: 'svg/marcador_azul.svg?11' },
    ])
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

import { extrairUrlNovoMarcador } from './marcadorRapido'

describe('extrairUrlNovoMarcador', () => {
  it('extrai a URL de dentro da função cadastrarMarcador() num <script> (formato real confirmado)', () => {
    const doc = new DOMParser().parseFromString(
      `<html><head><script>
        function inicializar(){}
        function cadastrarMarcador(){
          parent.infraAbrirJanelaModal('controlador.php?acao=marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&acao_retorno=andamento_marcador_cadastrar&pagina_simples=1&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abb1398175f14729ef520469874ce8549e4ff88bdb86f5e2309a216dab21604e',700,450);
        }
        function recarregarMarcadores(idMarcador){}
      </script></head><body></body></html>`,
      'text/html'
    )

    expect(extrairUrlNovoMarcador(doc)).toBe(
      'controlador.php?acao=marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&acao_retorno=andamento_marcador_cadastrar&pagina_simples=1&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abb1398175f14729ef520469874ce8549e4ff88bdb86f5e2309a216dab21604e'
    )
  })

  it('retorna null quando existe <script> mas sem a função cadastrarMarcador', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><script>function outraFuncao(){}</script></head><body></body></html>',
      'text/html'
    )
    expect(extrairUrlNovoMarcador(doc)).toBeNull()
  })

  it('retorna null quando não há nenhum <script> no documento', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(extrairUrlNovoMarcador(doc)).toBeNull()
  })
})
