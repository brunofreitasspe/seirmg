import { describe, expect, it } from 'vitest'
import { calcularIndicesParaClicar } from './selecaoMultipla'

describe('calcularIndicesParaClicar', () => {
  it('retorna os índices estritamente entre início e fim', () => {
    expect(calcularIndicesParaClicar(2, 5)).toEqual([3, 4])
  })

  it('funciona com os índices invertidos', () => {
    expect(calcularIndicesParaClicar(5, 2)).toEqual([3, 4])
  })

  it('retorna vazio quando os índices são adjacentes', () => {
    expect(calcularIndicesParaClicar(2, 3)).toEqual([])
  })

  it('retorna vazio quando os índices são iguais', () => {
    expect(calcularIndicesParaClicar(4, 4)).toEqual([])
  })
})
