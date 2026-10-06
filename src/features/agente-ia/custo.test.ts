import { describe, it, expect } from 'vitest'
import { calcularCustoUsd, acumularUso, custoTotalUsd } from './custo'

describe('calcularCustoUsd', () => {
  it('Claude Opus 5.5: $4 input / $20 output por milhão', () => {
    expect(calcularCustoUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(4, 5)
    expect(calcularCustoUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(20, 5)
  })

  it('Claude Sonnet 5.5: $2 / $10; Claude Haiku 4.5: $1 / $5', () => {
    expect(calcularCustoUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12, 5)
    expect(calcularCustoUsd('claude-haiku-4-5', { inputTokens: 2_000_000, outputTokens: 0 })).toBeCloseTo(2, 5)
  })

  it('cache: gravar custa 1,25x e ler custa 0,1x o preço de entrada', () => {
    const uso = { inputTokens: 0, outputTokens: 0, cacheCriacaoTokens: 1_000_000, cacheLeituraTokens: 1_000_000 }
    expect(calcularCustoUsd('claude-opus-5-5', uso)).toBeCloseTo(4 * 1.25 + 4 * 0.1, 5)
  })

  it('modelo desconhecido custa 0 (nunca quebra a UI por modelo não cadastrado)', () => {
    expect(calcularCustoUsd('modelo-desconhecido', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0)
  })
})

describe('acumularUso', () => {
  it('soma tokens no mesmo modelo entre chamadas, inclusive de cache', () => {
    const resultado = acumularUso(
      acumularUso({ porModelo: {} }, 'claude-opus-5-5', { inputTokens: 100, outputTokens: 50, cacheLeituraTokens: 7 }),
      'claude-opus-5-5',
      { inputTokens: 10, outputTokens: 5, cacheCriacaoTokens: 3 }
    )
    expect(resultado.porModelo['claude-opus-5-5']).toEqual({
      inputTokens: 110,
      outputTokens: 55,
      cacheCriacaoTokens: 3,
      cacheLeituraTokens: 7,
    })
  })
})

describe('custoTotalUsd', () => {
  it('soma o custo de todos os modelos usados', () => {
    const acumulado = {
      porModelo: {
        'claude-opus-5-5': { inputTokens: 1_000_000, outputTokens: 0 },
        'claude-haiku-4-5': { inputTokens: 0, outputTokens: 1_000_000 },
      },
    }
    expect(custoTotalUsd(acumulado)).toBeCloseTo(9, 5)
  })
})
