import { describe, expect, it } from 'vitest'
import { ehPaginaDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from './sessionGate'

describe('ehPaginaDeLogin', () => {
  it('retorna true quando o HTML contém o formulário de login', () => {
    expect(ehPaginaDeLogin('<html><body><form id="frmLogin"></form></body></html>')).toBe(true)
  })

  it('retorna false quando o HTML não contém o formulário de login', () => {
    expect(ehPaginaDeLogin('<html><body><table id="tblProcessosDetalhado"></table></body></html>')).toBe(false)
  })
})

describe('calcularEsperaPosNavegacao', () => {
  it('retorna 0 quando nunca houve navegação registrada', () => {
    expect(calcularEsperaPosNavegacao(undefined, '2026-07-09T10:00:00.000Z', 1500)).toBe(0)
  })

  it('retorna o restante da janela quando a navegação foi recente', () => {
    expect(
      calcularEsperaPosNavegacao('2026-07-09T10:00:00.000Z', '2026-07-09T10:00:00.500Z', 1500)
    ).toBe(1000)
  })

  it('retorna 0 quando a janela de espera já passou', () => {
    expect(
      calcularEsperaPosNavegacao('2026-07-09T10:00:00.000Z', '2026-07-09T10:00:02.000Z', 1500)
    ).toBe(0)
  })

  it('retorna 0 no limite exato da janela', () => {
    expect(
      calcularEsperaPosNavegacao('2026-07-09T10:00:00.000Z', '2026-07-09T10:00:01.500Z', 1500)
    ).toBe(0)
  })
})

describe('circuitBreakerAberto', () => {
  it('retorna false quando não há data de expiração', () => {
    expect(circuitBreakerAberto(undefined, '2026-07-09T10:00:00.000Z')).toBe(false)
  })

  it('retorna true quando a data de expiração está no futuro', () => {
    expect(
      circuitBreakerAberto('2026-07-09T10:05:00.000Z', '2026-07-09T10:00:00.000Z')
    ).toBe(true)
  })

  it('retorna false quando a data de expiração já passou', () => {
    expect(
      circuitBreakerAberto('2026-07-09T10:00:00.000Z', '2026-07-09T10:05:00.000Z')
    ).toBe(false)
  })
})
