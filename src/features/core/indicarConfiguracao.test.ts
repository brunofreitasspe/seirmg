import { describe, expect, it } from 'vitest'
import { estaNaTelaDeConfiguracao } from './indicarConfiguracao'

describe('estaNaTelaDeConfiguracao', () => {
  it('retorna true quando a url é a tela de configuração', () => {
    expect(
      estaNaTelaDeConfiguracao('https://sei.exemplo.br/controlador.php?acao=infra_configurar')
    ).toBe(true)
  })

  it('retorna false para outras urls', () => {
    expect(
      estaNaTelaDeConfiguracao('https://sei.exemplo.br/controlador.php?acao=procedimento_controlar')
    ).toBe(false)
  })
})
