import { describe, expect, it } from 'vitest'
import { extrairItensSumario, montarSumarioHtml } from './sumario'

describe('extrairItensSumario', () => {
  it('ignora parágrafos sem classe de numeração e mantém a ordem dos demais', () => {
    const itens = extrairItensSumario([
      { classe: 'Paragrafo_Numerado_Nivel1', texto: 'Introdução' },
      { classe: 'Texto_Alinhado_Centro', texto: 'texto comum' },
      { classe: 'Paragrafo_Numerado_Nivel2', texto: 'Objetivo' },
    ])

    expect(itens).toHaveLength(2)
    expect(itens[0]).toMatchObject({ texto: 'Introdução', nivel: 1 })
    expect(itens[1]).toMatchObject({ texto: 'Objetivo', nivel: 2 })
    expect(itens[0].id).not.toBe(itens[1].id)
  })
})

describe('montarSumarioHtml', () => {
  it('monta uma lista de links âncora indentada por nível', () => {
    const html = montarSumarioHtml([{ id: 'x1', texto: 'Introdução', nivel: 1 }])
    expect(html).toContain('<div class="Sumario">')
    expect(html).toContain('href="#x1"')
    expect(html).toContain('Introdução')
  })
})
