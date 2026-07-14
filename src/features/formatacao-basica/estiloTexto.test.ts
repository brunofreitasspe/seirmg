import { afterEach, describe, expect, it } from 'vitest'
import { lerEstiloElemento } from './estiloTexto'

describe('lerEstiloElemento', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lê tamanho de fonte, negrito, itálico, sublinhado e cor de um elemento', () => {
    document.body.innerHTML =
      '<span id="alvo" style="font-size:18px;font-weight:bold;font-style:italic;' +
      'text-decoration:underline;color:rgb(255, 0, 0)">x</span>'
    const elemento = document.getElementById('alvo') as HTMLElement

    expect(lerEstiloElemento(elemento)).toEqual({
      fontSizePx: 18,
      bold: true,
      italic: true,
      underline: true,
      color: 'rgb(255, 0, 0)',
    })
  })

  it('retorna false pra negrito/itálico/sublinhado quando o elemento não tem essa formatação', () => {
    document.body.innerHTML = '<span id="alvo">x</span>'
    const elemento = document.getElementById('alvo') as HTMLElement

    const resultado = lerEstiloElemento(elemento)
    expect(resultado.bold).toBe(false)
    expect(resultado.italic).toBe(false)
    expect(resultado.underline).toBe(false)
  })
})
