import { describe, expect, it } from 'vitest'
import { montarUrlFerramenta, montarUrlCatalogo } from './catalogoUrl'

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

  it('preserva o número do processo', () => {
    expect(montarUrlFerramenta('ocr', '?idProcedimento=1&numeroProcesso=2026.0.1-4')).toBe(
      '?ferramenta=ocr&idProcedimento=1&numeroProcesso=2026.0.1-4'
    )
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

describe('montarUrlCatalogo', () => {
  it('volta pro catálogo mantendo o contexto e descartando a ferramenta', () => {
    expect(montarUrlCatalogo('?ferramenta=juntar&idProcedimento=1')).toBe('?idProcedimento=1')
  })

  it('modo avulso volta pra ? vazio', () => {
    expect(montarUrlCatalogo('?ferramenta=juntar')).toBe('?')
  })
})
