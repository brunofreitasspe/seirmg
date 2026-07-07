// src/lib/throttle.test.ts
import { describe, expect, it } from 'vitest'
import { passouIntervalo } from './throttle'

describe('passouIntervalo', () => {
  it('retorna true quando nunca verificou antes (desde é undefined)', () => {
    expect(passouIntervalo(undefined, '2026-07-06T10:00:00.000Z', 2)).toBe(true)
  })

  it('retorna false quando o intervalo mínimo ainda não passou', () => {
    expect(
      passouIntervalo('2026-07-06T10:00:00.000Z', '2026-07-06T10:01:00.000Z', 2)
    ).toBe(false)
  })

  it('retorna true quando o intervalo mínimo já passou', () => {
    expect(
      passouIntervalo('2026-07-06T10:00:00.000Z', '2026-07-06T10:02:01.000Z', 2)
    ).toBe(true)
  })

  it('retorna true no limite exato do intervalo', () => {
    expect(
      passouIntervalo('2026-07-06T10:00:00.000Z', '2026-07-06T10:02:00.000Z', 2)
    ).toBe(true)
  })
})
