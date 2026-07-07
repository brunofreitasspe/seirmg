import { describe, expect, it } from 'vitest'
import { deveOcultarMenu } from './menu'

describe('deveOcultarMenu', () => {
  it('retorna true quando a classe de exibição grande está presente', () => {
    expect(deveOcultarMenu(['infraAreaTelaE', 'infraAreaTelaEExibeGrande'])).toBe(true)
  })

  it('retorna false quando a classe não está presente', () => {
    expect(deveOcultarMenu(['infraAreaTelaE'])).toBe(false)
  })
})
