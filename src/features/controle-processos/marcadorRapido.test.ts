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
