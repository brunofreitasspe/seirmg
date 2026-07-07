import { describe, expect, it } from 'vitest'
import { montarTituloJanela } from './alterarTitulo'

describe('montarTituloJanela', () => {
  it('monta o título no formato SEI - numero - tipo', () => {
    expect(montarTituloJanela('00001.000001/2026-01', 'Processo Administrativo')).toBe(
      'SEI - 00001.000001/2026-01 - Processo Administrativo'
    )
  })
})
