import { describe, expect, it } from 'vitest'
import { calcularIntervalo } from './periodo'

const AGORA = new Date(2026, 7, 15, 14, 30, 0) // 15 de agosto de 2026, 14:30, horário local

describe('calcularIntervalo', () => {
  it('"hoje" cobre só o dia atual', () => {
    const { inicio, fim } = calcularIntervalo('hoje', AGORA)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(7)
    expect(inicio.getDate()).toBe(15)
    expect(inicio.getHours()).toBe(0)
    expect(fim.getDate()).toBe(15)
    expect(fim.getHours()).toBe(23)
  })

  it('"7dias" cobre os últimos 7 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('7dias', AGORA)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(7)
    expect(inicio.getDate()).toBe(9)
  })

  it('"30dias" cobre os últimos 30 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('30dias', AGORA)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(6)
    expect(inicio.getDate()).toBe(17)
  })

  it('"90dias" cobre os últimos 90 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('90dias', AGORA)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(4)
    expect(inicio.getDate()).toBe(18)
  })

  it('"ano" cobre de 1º de janeiro a 31 de dezembro do ano de "agora"', () => {
    const { inicio, fim, rotulo } = calcularIntervalo('ano', AGORA)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(0)
    expect(inicio.getDate()).toBe(1)
    expect(fim.getFullYear()).toBe(2026)
    expect(fim.getMonth()).toBe(11)
    expect(fim.getDate()).toBe(31)
    expect(rotulo).toContain('2026')
  })

  it('"ano" na virada do ano usa o ano de "agora", não o ano seguinte', () => {
    const reveillon = new Date(2026, 11, 31, 23, 0, 0)
    const { inicio, fim } = calcularIntervalo('ano', reveillon)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(0)
    expect(inicio.getDate()).toBe(1)
    expect(fim.getFullYear()).toBe(2026)
    expect(fim.getMonth()).toBe(11)
    expect(fim.getDate()).toBe(31)
  })
})
