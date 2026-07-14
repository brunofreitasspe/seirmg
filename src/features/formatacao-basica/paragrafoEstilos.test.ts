import { describe, expect, it } from 'vitest'
import { CLASSES_ALINHAMENTO, proximoTamanhoFontePx } from './paragrafoEstilos'

describe('CLASSES_ALINHAMENTO', () => {
  it('tem uma classe CSS pra cada alinhamento', () => {
    expect(CLASSES_ALINHAMENTO.esquerda).toBe('Texto_Alinhado_Esquerda')
    expect(CLASSES_ALINHAMENTO.centro).toBe('Texto_Alinhado_Centro')
    expect(CLASSES_ALINHAMENTO.direita).toBe('Texto_Alinhado_Direita')
    expect(CLASSES_ALINHAMENTO.justificado).toBe('Texto_Justificado')
  })
})

describe('proximoTamanhoFontePx', () => {
  it('aumenta em 2px', () => {
    expect(proximoTamanhoFontePx(14, 'up')).toBe(16)
  })

  it('reduz em 2px', () => {
    expect(proximoTamanhoFontePx(14, 'down')).toBe(12)
  })

  it('não passa do máximo (72px)', () => {
    expect(proximoTamanhoFontePx(72, 'up')).toBe(72)
    expect(proximoTamanhoFontePx(71, 'up')).toBe(72)
  })

  it('não passa do mínimo (8px)', () => {
    expect(proximoTamanhoFontePx(8, 'down')).toBe(8)
    expect(proximoTamanhoFontePx(9, 'down')).toBe(8)
  })
})
