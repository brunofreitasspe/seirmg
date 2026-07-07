import { describe, expect, it } from 'vitest'
import { construirSeletorPontoControle } from './seletor'

describe('construirSeletorPontoControle', () => {
  it('usa seletor por title em procedimento_visualizar', () => {
    expect(construirSeletorPontoControle('Concluído', true)).toBe('img[title*="Concluído" i]')
  })

  it('usa seletor por aria-label fora de procedimento_visualizar', () => {
    expect(construirSeletorPontoControle('Concluído', false)).toBe('a[aria-label*="Concluído" i] img')
  })
})
