import { describe, expect, it } from 'vitest'
import { formatarDataHoje } from './autopreencher'

describe('formatarDataHoje', () => {
  it('formata com zero à esquerda quando dia e mês têm um dígito', () => {
    expect(formatarDataHoje(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('formata sem zero à esquerda desnecessário quando dia e mês têm dois dígitos', () => {
    expect(formatarDataHoje(new Date(2026, 10, 25))).toBe('25/11/2026')
  })
})
