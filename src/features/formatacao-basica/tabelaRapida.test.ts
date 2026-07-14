import { describe, expect, it } from 'vitest'
import { CATALOGO_ESTILOS_TABELA, aplicarEstiloTabelaHtml, montarTabelaHtml } from './tabelaRapida'

describe('montarTabelaHtml', () => {
  it('monta uma tabela com o número certo de linhas e colunas', () => {
    const html = montarTabelaHtml(2, 3)
    expect(html).toContain('<table class="Tabela">')
    expect((html.match(/<tr>/g) ?? []).length).toBe(2)
    expect((html.match(/<td>/g) ?? []).length).toBe(6)
  })
})

describe('aplicarEstiloTabelaHtml', () => {
  it('injeta o css do estilo escolhido no atributo style da tabela', () => {
    const html = montarTabelaHtml(1, 1)
    const comEstilo = aplicarEstiloTabelaHtml(html, CATALOGO_ESTILOS_TABELA[0])
    expect(comEstilo).toContain(`style="${CATALOGO_ESTILOS_TABELA[0].css}"`)
  })
})
