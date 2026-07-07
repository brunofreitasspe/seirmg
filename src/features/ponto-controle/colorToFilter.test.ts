import { describe, expect, it } from 'vitest'
import { colorToFilter, hexToRgb, isHEXValid, isRGBValid, rgbToHex } from './colorToFilter'

describe('isHEXValid', () => {
  it('aceita HEX de 6 dígitos', () => {
    expect(isHEXValid('#ff0000')).toBe(true)
  })

  it('aceita HEX de 3 dígitos', () => {
    expect(isHEXValid('#f00')).toBe(true)
  })

  it('rejeita string sem #', () => {
    expect(isHEXValid('ff0000')).toBe(false)
  })

  it('rejeita HEX com tamanho inválido', () => {
    expect(isHEXValid('#ff00')).toBe(false)
  })
})

describe('isRGBValid', () => {
  it('aceita "rgb(255, 0, 0)"', () => {
    expect(isRGBValid('rgb(255, 0, 0)')).toBe(true)
  })

  it('aceita "255,0,0" sem o prefixo rgb', () => {
    expect(isRGBValid('255,0,0')).toBe(true)
  })

  it('rejeita valores de componente fora de 0-255', () => {
    expect(isRGBValid('300,0,0')).toBe(false)
  })

  it('rejeita prefixo sem fechamento', () => {
    expect(isRGBValid('rgb(255,0,0')).toBe(false)
  })
})

describe('hexToRgb', () => {
  it('converte HEX de 6 dígitos', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
  })

  it('expande e converte HEX de 3 dígitos', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
  })

  it('retorna null para HEX malformado', () => {
    expect(hexToRgb('#zzzzzz')).toBeNull()
  })
})

describe('rgbToHex', () => {
  it('converte componentes RGB para HEX', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
  })

  it('preenche com zero à esquerda componentes de um dígito', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
  })
})

describe('colorToFilter', () => {
  it('lança erro para formato inválido', () => {
    expect(() => colorToFilter('não é uma cor')).toThrow('Invalid format!')
  })

  it('retorna uma string de filtro CSS válida para HEX', () => {
    const filtro = colorToFilter('#ff0000')
    expect(filtro).toMatch(
      /^brightness\(0\) saturate\(100%\) invert\(-?\d+%\) sepia\(-?\d+%\) saturate\(-?\d+%\) hue-rotate\(-?\d+deg\) brightness\(-?\d+%\) contrast\(-?\d+%\)$/
    )
  })

  it('retorna uma string de filtro CSS válida para RGB', () => {
    const filtro = colorToFilter('rgb(0, 255, 0)')
    expect(filtro).toMatch(/^brightness\(0\) saturate\(100%\)/)
  })
})
