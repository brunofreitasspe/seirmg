import { describe, expect, it } from 'vitest'
import { montarUrlFerramenta } from './catalogoUrl'

describe('montarUrlFerramenta', () => {
  it('monta só ?ferramenta=x quando não há contexto de processo', () => {
    expect(montarUrlFerramenta('juntar', '')).toBe('?ferramenta=juntar')
  })

  it('preserva idProcedimento na query string da ferramenta', () => {
    expect(montarUrlFerramenta('juntar', '?idProcedimento=123')).toBe('?ferramenta=juntar&idProcedimento=123')
  })

  it('preserva urlIncluir assinada intacta (ida e volta)', () => {
    const urlIncluir =
      'https://sei.exemplo.gov.br/sei/controlador.php?acao=documento_escolher_tipo&id_procedimento=1&infra_hash=a%2Bb'
    const busca = `?${new URLSearchParams({ idProcedimento: '1', urlIncluir }).toString()}`
    const resultado = new URLSearchParams(montarUrlFerramenta('tarjar', busca))
    expect(resultado.get('urlIncluir')).toBe(urlIncluir)
    expect(resultado.get('idProcedimento')).toBe('1')
  })

  it('descarta outros parâmetros (ex.: a ferramenta anterior)', () => {
    expect(montarUrlFerramenta('dividir', '?ferramenta=juntar&idProcedimento=123')).toBe(
      '?ferramenta=dividir&idProcedimento=123'
    )
  })

  it('escapa caracteres especiais do idProcedimento', () => {
    expect(montarUrlFerramenta('tarjar', '?idProcedimento=12%263')).toBe('?ferramenta=tarjar&idProcedimento=12%263')
  })
})
