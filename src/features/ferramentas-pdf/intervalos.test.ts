import { describe, expect, it } from 'vitest'
import { interpretarIntervalos } from './intervalos'

describe('interpretarIntervalos', () => {
  it('converte "1-3, 4, 6-8" (base 1) em índices base 0', () => {
    expect(interpretarIntervalos('1-3, 4, 6-8', 10)).toEqual({
      ok: true,
      intervalos: [
        [0, 2],
        [3, 3],
        [5, 7],
      ],
    })
  })

  it('tolera espaços em volta do hífen e vírgulas sobrando', () => {
    expect(interpretarIntervalos(' 1 - 2 ,, 3 ,', 3)).toEqual({ ok: true, intervalos: [[0, 1], [2, 2]] })
  })

  it('recusa texto vazio', () => {
    expect(interpretarIntervalos('  ', 5)).toEqual({ ok: false, erro: 'Informe pelo menos um intervalo, ex.: 1-3, 4-8.' })
  })

  it('recusa trecho que não é número', () => {
    expect(interpretarIntervalos('1-2, abc-def', 5)).toEqual({ ok: false, erro: '"abc-def" não é um intervalo válido. Use o formato 1-3 ou 4.' })
  })

  it('recusa página zero', () => {
    expect(interpretarIntervalos('0-2', 5)).toEqual({ ok: false, erro: '"0-2" não é um intervalo válido. Use o formato 1-3 ou 4.' })
  })

  it('recusa início maior que fim', () => {
    expect(interpretarIntervalos('5-3', 8)).toEqual({ ok: false, erro: 'Em "5-3" o início é maior que o fim.' })
  })

  it('recusa página além do total', () => {
    expect(interpretarIntervalos('7-9', 8)).toEqual({ ok: false, erro: 'A página 9 não existe — o PDF tem 8 páginas.' })
  })

  it('usa singular quando o PDF tem 1 página', () => {
    expect(interpretarIntervalos('2', 1)).toEqual({ ok: false, erro: 'A página 2 não existe — o PDF tem 1 página.' })
  })
})
