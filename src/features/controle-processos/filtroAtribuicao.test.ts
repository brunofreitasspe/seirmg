import { describe, expect, it } from 'vitest'
import { extrairNomesAtribuidos, linhaCasaAtribuicao } from './filtroAtribuicao'

describe('extrairNomesAtribuidos', () => {
  it('retorna nomes únicos e ordenados', () => {
    expect(extrairNomesAtribuidos(['Maria', 'João', 'Maria'])).toEqual(['João', 'Maria'])
  })

  it('ignora textos vazios', () => {
    expect(extrairNomesAtribuidos(['Maria', '', '  '])).toEqual(['Maria'])
  })

  it('retorna lista vazia quando não há nomes', () => {
    expect(extrairNomesAtribuidos([])).toEqual([])
  })
})

describe('linhaCasaAtribuicao', () => {
  it('"*" sempre casa', () => {
    expect(linhaCasaAtribuicao('Maria', '*')).toBe(true)
    expect(linhaCasaAtribuicao(null, '*')).toBe(true)
  })

  it('"" casa só quando não há atribuído', () => {
    expect(linhaCasaAtribuicao(null, '')).toBe(true)
    expect(linhaCasaAtribuicao('', '')).toBe(true)
    expect(linhaCasaAtribuicao('Maria', '')).toBe(false)
  })

  it('valor específico casa por texto exato', () => {
    expect(linhaCasaAtribuicao('Maria', 'Maria')).toBe(true)
    expect(linhaCasaAtribuicao('João', 'Maria')).toBe(false)
  })
})
