import { describe, expect, it } from 'vitest'
import { montarCorpoVerificacaoLote, extrairEncontrados } from './lote'

describe('montarCorpoVerificacaoLote', () => {
  it('monta o corpo com a lista de processos', () => {
    expect(montarCorpoVerificacaoLote(['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02'])).toEqual({
      processos: ['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02'],
    })
  })

  it('remove duplicados', () => {
    expect(montarCorpoVerificacaoLote(['HMMG.2025.00000001-01', 'HMMG.2025.00000001-01'])).toEqual({
      processos: ['HMMG.2025.00000001-01'],
    })
  })

  it('lista vazia gera corpo com lista vazia', () => {
    expect(montarCorpoVerificacaoLote([])).toEqual({ processos: [] })
  })
})

describe('extrairEncontrados', () => {
  it('extrai os processos encontrados de uma resposta válida', () => {
    const resultado = extrairEncontrados({ encontrados: ['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02'] })
    expect(resultado).toEqual(new Set(['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02']))
  })

  it('lista vazia retorna Set vazio', () => {
    expect(extrairEncontrados({ encontrados: [] })).toEqual(new Set())
  })

  it('ignora itens não-string dentro de encontrados', () => {
    const resultado = extrairEncontrados({ encontrados: ['HMMG.2025.00000001-01', 42, null] })
    expect(resultado).toEqual(new Set(['HMMG.2025.00000001-01']))
  })

  it('resposta sem o campo encontrados retorna Set vazio', () => {
    expect(extrairEncontrados({})).toEqual(new Set())
  })

  it('resposta que não é objeto retorna Set vazio', () => {
    expect(extrairEncontrados(null)).toEqual(new Set())
    expect(extrairEncontrados('texto')).toEqual(new Set())
    expect(extrairEncontrados(undefined)).toEqual(new Set())
  })

  it('encontrados que não é array retorna Set vazio', () => {
    expect(extrairEncontrados({ encontrados: 'não é lista' })).toEqual(new Set())
  })
})
