import { describe, expect, it } from 'vitest'
import { linhaCasaBusca, parseTermosBusca } from './buscaRapida'

describe('parseTermosBusca', () => {
  it('retorna lista vazia para texto vazio', () => {
    expect(parseTermosBusca('')).toEqual([])
  })

  it('retorna um único termo em minúsculo para texto simples', () => {
    expect(parseTermosBusca('Processo')).toEqual(['processo'])
  })

  it('divide em múltiplos termos no formato "[termo1 termo2]" (busca OU)', () => {
    expect(parseTermosBusca('[Urgente Recurso]')).toEqual(['urgente', 'recurso'])
  })

  it('trata espaços múltiplos entre termos dentro dos colchetes', () => {
    expect(parseTermosBusca('[a   b]')).toEqual(['a', 'b'])
  })
})

describe('linhaCasaBusca', () => {
  it('casa quando o texto da linha contém o termo (case-insensitive)', () => {
    expect(linhaCasaBusca('Processo URGENTE aberto', ['urgente'])).toBe(true)
  })

  it('casa quando qualquer um dos termos aparece (OU)', () => {
    expect(linhaCasaBusca('Processo de recurso', ['urgente', 'recurso'])).toBe(true)
  })

  it('não casa quando nenhum termo aparece', () => {
    expect(linhaCasaBusca('Processo comum', ['urgente', 'recurso'])).toBe(false)
  })

  it('não casa quando a lista de termos está vazia', () => {
    expect(linhaCasaBusca('qualquer texto', [])).toBe(false)
  })
})
