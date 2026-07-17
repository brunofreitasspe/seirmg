import { afterEach, describe, expect, it } from 'vitest'
import { criarPonteMarcadorRapidoMainWorld } from './pontePrincipal'
import { EVENTO_CLIQUE_MARCADOR_RAPIDO } from './protocoloMarcadorRapido'
import type { DetalheCliqueMarcadorRapido } from './protocoloMarcadorRapido'

function montarPagina(qtdMarcadosRecebidos: number): void {
  const checkboxesRecebidos = Array.from({ length: 3 }, (_, i) => {
    const marcado = i < qtdMarcadosRecebidos
    return `<td><input type="checkbox" value="${100 + i}" ${marcado ? 'checked' : ''} /></td>`
  }).join('')

  // O onclick real do SEI chama acaoControleProcessos(...)/acaoRemoverMarcadorProcessar(...),
  // funções que só existem na página de verdade. Aqui basta um onclick inofensivo (sem
  // "return") que contenha a mesma substring usada pelo seletor/decisão de chave -- o teste
  // verifica a PONTE (nosso código), não o comportamento nativo do SEI em si.
  document.body.innerHTML = `
    <div id="divComandos">
      <a onclick="/* andamento_marcador_cadastrar */">Adicionar Marcador</a>
      <a onclick="/* andamento_marcador_remover */">Remover Marcador</a>
    </div>
    <table id="tblProcessosDetalhado"><tbody></tbody></table>
    <table id="tblProcessosGerados"><tbody></tbody></table>
    <table id="tblProcessosRecebidos"><tbody><tr>${checkboxesRecebidos}</tr></tbody></table>
  `
}

function clicarLink(rotulo: string): { defaultPrevented: boolean } {
  const link = Array.from(document.querySelectorAll('#divComandos a')).find(
    (a) => a.textContent === rotulo
  ) as HTMLAnchorElement
  const evento = new MouseEvent('click', { bubbles: true, cancelable: true })
  link.dispatchEvent(evento)
  return { defaultPrevented: evento.defaultPrevented }
}

describe('criarPonteMarcadorRapidoMainWorld', () => {
  let pontesCriadas: Array<{ destruir: () => void }> = []

  function criarPonte(): { destruir: () => void } {
    const ponte = criarPonteMarcadorRapidoMainWorld(document, window)
    pontesCriadas.push(ponte)
    return ponte
  }

  afterEach(() => {
    pontesCriadas.forEach((ponte) => ponte.destruir())
    pontesCriadas = []
    document.body.innerHTML = ''
  })

  it('intercepta (preventDefault + evento customizado) quando exatamente 1 checkbox está marcado', () => {
    montarPagina(1)
    let detalheRecebido: DetalheCliqueMarcadorRapido | null = null
    window.addEventListener(EVENTO_CLIQUE_MARCADOR_RAPIDO, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueMarcadorRapido>).detail
    })

    criarPonte()
    const resultado = clicarLink('Adicionar Marcador')

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ chave: 'adicionar', quantidade: 1 })
  })

  it('não intercepta (deixa o comportamento nativo) quando 0 checkboxes estão marcados', () => {
    montarPagina(0)
    let disparou = false
    window.addEventListener(EVENTO_CLIQUE_MARCADOR_RAPIDO, () => {
      disparou = true
    })

    criarPonte()
    const resultado = clicarLink('Adicionar Marcador')

    expect(resultado.defaultPrevented).toBe(false)
    expect(disparou).toBe(false)
  })

  it('intercepta também quando 2+ checkboxes estão marcados, com a quantidade certa', () => {
    montarPagina(2)
    let detalheRecebido: DetalheCliqueMarcadorRapido | null = null
    window.addEventListener(EVENTO_CLIQUE_MARCADOR_RAPIDO, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueMarcadorRapido>).detail
    })

    criarPonte()
    const resultado = clicarLink('Adicionar Marcador')

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ chave: 'adicionar', quantidade: 2 })
  })

  it('identifica a chave "remover" ao clicar no link de remoção', () => {
    montarPagina(1)
    let detalheRecebido: DetalheCliqueMarcadorRapido | null = null
    window.addEventListener(EVENTO_CLIQUE_MARCADOR_RAPIDO, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueMarcadorRapido>).detail
    })

    criarPonte()
    const resultado = clicarLink('Remover Marcador')

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ chave: 'remover', quantidade: 1 })
  })

  it('destruir() remove o listener, voltando ao comportamento nativo', () => {
    montarPagina(1)
    let disparou = false
    window.addEventListener(EVENTO_CLIQUE_MARCADOR_RAPIDO, () => {
      disparou = true
    })

    const ponte = criarPonte()
    ponte.destruir()
    const resultado = clicarLink('Adicionar Marcador')

    expect(resultado.defaultPrevented).toBe(false)
    expect(disparou).toBe(false)
  })
})

import { criarPonteAtribuicaoRapidaMainWorld } from './pontePrincipal'
import { EVENTO_CLIQUE_ATRIBUICAO_RAPIDA } from './protocoloAtribuicaoRapida'
import type { DetalheCliqueAtribuicaoRapida } from './protocoloAtribuicaoRapida'

function montarPaginaAtribuicao(qtdMarcadosRecebidos: number): void {
  const checkboxesRecebidos = Array.from({ length: 3 }, (_, i) => {
    const marcado = i < qtdMarcadosRecebidos
    return `<td><input type="checkbox" value="${100 + i}" ${marcado ? 'checked' : ''} /></td>`
  }).join('')

  document.body.innerHTML = `
    <div id="divComandos">
      <a onclick="/* procedimento_atribuicao_cadastrar */">Atribuição de Processos</a>
    </div>
    <table id="tblProcessosDetalhado"><tbody></tbody></table>
    <table id="tblProcessosGerados"><tbody></tbody></table>
    <table id="tblProcessosRecebidos"><tbody><tr>${checkboxesRecebidos}</tr></tbody></table>
  `
}

function clicarLinkAtribuicao(): { defaultPrevented: boolean } {
  const link = document.querySelector<HTMLAnchorElement>('#divComandos a')
  if (!link) throw new Error('link não encontrado')
  const evento = new MouseEvent('click', { bubbles: true, cancelable: true })
  link.dispatchEvent(evento)
  return { defaultPrevented: evento.defaultPrevented }
}

describe('criarPonteAtribuicaoRapidaMainWorld', () => {
  let pontesCriadas: Array<{ destruir: () => void }> = []

  function criarPonte(): { destruir: () => void } {
    const ponte = criarPonteAtribuicaoRapidaMainWorld(document, window)
    pontesCriadas.push(ponte)
    return ponte
  }

  afterEach(() => {
    pontesCriadas.forEach((ponte) => ponte.destruir())
    pontesCriadas = []
    document.body.innerHTML = ''
  })

  it('intercepta (preventDefault + evento customizado) quando 1 checkbox está marcado', () => {
    montarPaginaAtribuicao(1)
    let detalheRecebido: DetalheCliqueAtribuicaoRapida | null = null
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueAtribuicaoRapida>).detail
    })

    criarPonte()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ quantidade: 1 })
  })

  it('não intercepta (deixa o comportamento nativo) quando 0 checkboxes estão marcados', () => {
    montarPaginaAtribuicao(0)
    let disparou = false
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, () => {
      disparou = true
    })

    criarPonte()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(false)
    expect(disparou).toBe(false)
  })

  it('intercepta também quando 2+ checkboxes estão marcados, com a quantidade certa (bulk)', () => {
    montarPaginaAtribuicao(2)
    let detalheRecebido: DetalheCliqueAtribuicaoRapida | null = null
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueAtribuicaoRapida>).detail
    })

    criarPonte()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ quantidade: 2 })
  })

  it('destruir() remove o listener, voltando ao comportamento nativo', () => {
    montarPaginaAtribuicao(1)
    let disparou = false
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, () => {
      disparou = true
    })

    const ponte = criarPonte()
    ponte.destruir()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(false)
    expect(disparou).toBe(false)
  })
})
