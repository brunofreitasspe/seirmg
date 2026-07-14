import { describe, expect, it } from 'vitest'
import { montarChamadaHtml, montarEntradaHtml } from './notaRodape'

describe('montarChamadaHtml', () => {
  it('monta a chamada sobrescrita com link pra entrada', () => {
    const html = montarChamadaHtml('n1', 1)
    expect(html).toBe('<sup id="chamada-n1"><a href="#nota-n1">1</a></sup>')
  })
})

describe('montarEntradaHtml', () => {
  it('monta a entrada no rodapé com link de volta pra chamada', () => {
    const html = montarEntradaHtml('n1', 1, 'Texto da nota')
    expect(html).toBe('<p id="nota-n1" class="Nota_Rodape">1. Texto da nota <a href="#chamada-n1">&uarr;</a></p>')
  })
})
