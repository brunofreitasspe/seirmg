import { describe, it, expect } from 'vitest'
import { montarTextoPorPagina } from './ocr'

describe('montarTextoPorPagina', () => {
  it('junta o texto de cada página com cabeçalho de página', () => {
    const resultado = montarTextoPorPagina(['Texto da página 1', 'Texto da página 2'])
    expect(resultado).toBe('--- Página 1 ---\nTexto da página 1\n\n--- Página 2 ---\nTexto da página 2')
  })

  it('lista vazia devolve string vazia', () => {
    expect(montarTextoPorPagina([])).toBe('')
  })
})
