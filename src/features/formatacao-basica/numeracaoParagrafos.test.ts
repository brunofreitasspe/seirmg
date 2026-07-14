import { describe, expect, it } from 'vitest'
import { nivelDaClasse } from './numeracaoParagrafos'

describe('nivelDaClasse', () => {
  it('retorna o nível 1-4 pras classes de parágrafo numerado', () => {
    expect(nivelDaClasse('Paragrafo_Numerado_Nivel1')).toBe(1)
    expect(nivelDaClasse('Paragrafo_Numerado_Nivel4')).toBe(4)
  })

  it('retorna null pra classes que não são de parágrafo numerado', () => {
    expect(nivelDaClasse('Texto_Alinhado_Centro')).toBeNull()
    expect(nivelDaClasse('')).toBeNull()
  })
})
