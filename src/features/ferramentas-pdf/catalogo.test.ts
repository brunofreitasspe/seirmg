import { describe, it, expect } from 'vitest'
import { listarFerramentasPdf } from './catalogo'

describe('listarFerramentasPdf', () => {
  it('lista as 9 ferramentas, cada uma com id único', () => {
    const ferramentas = listarFerramentasPdf()
    expect(ferramentas).toHaveLength(9)
    expect(new Set(ferramentas.map((f) => f.id)).size).toBe(9)
  })
})
