import { describe, expect, it } from 'vitest'
import { compararValores, detectarTipoColuna, ordenarIds } from './ordenarTabela'

describe('detectarTipoColuna', () => {
  it('retorna numero quando todos os valores são numéricos', () => {
    expect(detectarTipoColuna(['10', '2', '33'])).toBe('numero')
  })

  it('retorna data quando todos os valores batem dd/mm/yyyy', () => {
    expect(detectarTipoColuna(['01/01/2026', '15/03/2025'])).toBe('data')
  })

  it('retorna texto quando os valores não são numéricos nem datas', () => {
    expect(detectarTipoColuna(['Processo A', 'Processo B'])).toBe('texto')
  })

  it('ignora valores vazios ao detectar o tipo numero', () => {
    expect(detectarTipoColuna(['10', '', '5'])).toBe('numero')
  })

  it('retorna texto quando não há nenhum valor não vazio', () => {
    expect(detectarTipoColuna(['', ''])).toBe('texto')
  })

  it('retorna texto quando os valores misturam número e texto', () => {
    expect(detectarTipoColuna(['10', 'abc'])).toBe('texto')
  })
})

describe('compararValores', () => {
  it('compara números numericamente, não como string', () => {
    expect(compararValores('2', '10', 'numero')).toBeLessThan(0)
  })

  it('trata vírgula como separador decimal em numero', () => {
    expect(compararValores('1,5', '1,20', 'numero')).toBeGreaterThan(0)
  })

  it('compara datas dd/mm/yyyy pela data real, não pela string', () => {
    expect(compararValores('01/01/2026', '15/03/2025', 'data')).toBeGreaterThan(0)
  })

  it('compara texto por ordem alfabética', () => {
    expect(compararValores('Ana', 'Bruno', 'texto')).toBeLessThan(0)
  })

  it('ordena valor vazio depois de valor não vazio', () => {
    expect(compararValores('', 'Ana', 'texto')).toBeGreaterThan(0)
  })

  it('ordena valor não vazio antes de valor vazio', () => {
    expect(compararValores('Ana', '', 'texto')).toBeLessThan(0)
  })

  it('considera dois valores vazios iguais', () => {
    expect(compararValores('', '', 'texto')).toBe(0)
  })
})

describe('ordenarIds', () => {
  it('ordena ascendente por tipo numero', () => {
    const linhas = [
      { id: 'a', valor: '10' },
      { id: 'b', valor: '2' },
    ]
    expect(ordenarIds(linhas, 'numero', 'asc')).toEqual(['b', 'a'])
  })

  it('ordena descendente por tipo numero', () => {
    const linhas = [
      { id: 'a', valor: '10' },
      { id: 'b', valor: '2' },
    ]
    expect(ordenarIds(linhas, 'numero', 'desc')).toEqual(['a', 'b'])
  })

  it('mantém valores vazios sempre por último, mesmo em ordem descendente', () => {
    const linhas = [
      { id: 'a', valor: '10' },
      { id: 'b', valor: '' },
      { id: 'c', valor: '2' },
    ]
    expect(ordenarIds(linhas, 'numero', 'desc')).toEqual(['a', 'c', 'b'])
  })

  it('retorna lista vazia para entrada vazia', () => {
    expect(ordenarIds([], 'texto', 'asc')).toEqual([])
  })
})
