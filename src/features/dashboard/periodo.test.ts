import { describe, expect, it } from 'vitest'
import { calcularIntervalo } from './periodo'

const AGORA = new Date('2026-08-15T14:30:00.000Z')

describe('calcularIntervalo', () => {
  it('"hoje" cobre só o dia atual', () => {
    const { inicio, fim } = calcularIntervalo('hoje', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-08-15')
    expect(fim.toISOString().slice(0, 10)).toBe('2026-08-15')
    expect(inicio.getUTCHours()).toBe(0)
    expect(fim.getUTCHours()).toBe(23)
  })

  it('"7dias" cobre os últimos 7 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('7dias', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-08-09')
  })

  it('"30dias" cobre os últimos 30 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('30dias', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-07-17')
  })

  it('"90dias" cobre os últimos 90 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('90dias', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-05-18')
  })

  it('"ano" cobre de 1º de janeiro a 31 de dezembro do ano de "agora"', () => {
    const { inicio, fim, rotulo } = calcularIntervalo('ano', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(fim.toISOString().slice(0, 10)).toBe('2026-12-31')
    expect(rotulo).toContain('2026')
  })

  it('"ano" na virada do ano usa o ano de "agora", não o ano seguinte', () => {
    const reveillon = new Date('2026-12-31T23:00:00.000Z')
    const { inicio, fim } = calcularIntervalo('ano', reveillon)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(fim.toISOString().slice(0, 10)).toBe('2026-12-31')
  })
})
