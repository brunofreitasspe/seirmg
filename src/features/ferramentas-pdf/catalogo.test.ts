import { describe, it, expect } from 'vitest'
import { listarFerramentasPdf, GRUPOS_FERRAMENTAS_PDF } from './catalogo'

describe('listarFerramentasPdf', () => {
  it('lista as 9 ferramentas, cada uma com id único', () => {
    const ferramentas = listarFerramentasPdf()
    expect(ferramentas).toHaveLength(9)
    expect(new Set(ferramentas.map((f) => f.id)).size).toBe(9)
  })
})

describe('grupos', () => {
  it('toda ferramenta pertence a um grupo existente', () => {
    const grupos = new Set(GRUPOS_FERRAMENTAS_PDF.map((g) => g.id))
    expect(listarFerramentasPdf().every((f) => grupos.has(f.grupo))).toBe(true)
  })
})
