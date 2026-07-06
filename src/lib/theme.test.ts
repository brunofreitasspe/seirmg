import { describe, expect, it } from 'vitest'
import { applyTheme, computeThemeClassName } from './theme'

describe('computeThemeClassName', () => {
  it('retorna vazio para o tema claro', () => {
    expect(computeThemeClassName({ preset: 'claro' })).toBe('')
  })

  it('retorna a classe do preset black', () => {
    expect(computeThemeClassName({ preset: 'black' })).toBe('seirmg-theme-black')
  })
})

describe('applyTheme', () => {
  it('aplica a classe do preset e remove as demais', () => {
    const el = document.createElement('div')
    el.classList.add('seirmg-theme-black')
    applyTheme(el, { preset: 'super-black' })
    expect(el.classList.contains('seirmg-theme-black')).toBe(false)
    expect(el.classList.contains('seirmg-theme-super-black')).toBe(true)
  })

  it('define a cor customizada via variável CSS quando o preset é custom', () => {
    const el = document.createElement('div')
    applyTheme(el, { preset: 'custom', customColor: '#017fff' })
    expect(el.style.getPropertyValue('--seirmg-accent-color')).toBe('#017fff')
  })

  it('remove a variável de cor customizada quando o preset não é custom', () => {
    const el = document.createElement('div')
    el.style.setProperty('--seirmg-accent-color', '#ff0000')
    applyTheme(el, { preset: 'claro' })
    expect(el.style.getPropertyValue('--seirmg-accent-color')).toBe('')
  })
})
