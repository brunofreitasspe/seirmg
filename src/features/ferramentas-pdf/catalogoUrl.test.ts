import { describe, expect, it } from 'vitest'
import { montarUrlFerramenta } from './catalogoUrl'

describe('montarUrlFerramenta', () => {
  it('monta só ?ferramenta=x quando não há idProcedimento', () => {
    expect(montarUrlFerramenta('juntar', null)).toBe('?ferramenta=juntar')
  })

  it('preserva idProcedimento na query string da ferramenta', () => {
    expect(montarUrlFerramenta('juntar', '123')).toBe('?ferramenta=juntar&idProcedimento=123')
  })

  it('escapa caracteres especiais do idProcedimento', () => {
    expect(montarUrlFerramenta('tarjar', '12&3')).toBe('?ferramenta=tarjar&idProcedimento=12%263')
  })
})
