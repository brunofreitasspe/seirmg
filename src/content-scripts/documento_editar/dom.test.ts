import { afterEach, describe, expect, it } from 'vitest'
import { injetarEstiloSeAusente } from './dom'

describe('injetarEstiloSeAusente', () => {
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('injeta uma tag <style> com o css e id dados', () => {
    injetarEstiloSeAusente(document, 'meu-estilo', '.x { color: red; }')
    const estilo = document.getElementById('meu-estilo')
    expect(estilo?.tagName).toBe('STYLE')
    expect(estilo?.textContent).toBe('.x { color: red; }')
  })

  it('não injeta de novo se o id já existe', () => {
    injetarEstiloSeAusente(document, 'meu-estilo', '.x { color: red; }')
    injetarEstiloSeAusente(document, 'meu-estilo', '.y { color: blue; }')
    expect(document.querySelectorAll('#meu-estilo').length).toBe(1)
    expect(document.getElementById('meu-estilo')?.textContent).toBe('.x { color: red; }')
  })
})
