import { describe, expect, it } from 'vitest'
import { registrarProcessoVisitado } from './historico'
import type { HistoricoProcessoEntry } from '../../lib/storage'

function entrada(idProcedimento: string, acessadoEm = '2026-07-20T10:00:00.000Z'): HistoricoProcessoEntry {
  return { idProcedimento, numero: `NUM-${idProcedimento}`, tipo: 'Tipo Teste', acessadoEm }
}

describe('registrarProcessoVisitado', () => {
  it('adiciona no início de uma lista vazia', () => {
    const resultado = registrarProcessoVisitado([], entrada('1'))
    expect(resultado).toEqual([entrada('1')])
  })

  it('adiciona no início, na frente de entradas existentes', () => {
    const resultado = registrarProcessoVisitado([entrada('1')], entrada('2'))
    expect(resultado).toEqual([entrada('2'), entrada('1')])
  })

  it('revisitar um processo já na lista move ele pro topo, sem duplicar', () => {
    const historico = [entrada('3'), entrada('2'), entrada('1')]
    const novaVisita = entrada('2', '2026-07-20T12:00:00.000Z')
    const resultado = registrarProcessoVisitado(historico, novaVisita)
    expect(resultado).toEqual([novaVisita, entrada('3'), entrada('1')])
  })

  it('corta a lista no limite informado, descartando os mais antigos', () => {
    const historico = [entrada('3'), entrada('2'), entrada('1')]
    const resultado = registrarProcessoVisitado(historico, entrada('4'), 3)
    expect(resultado).toEqual([entrada('4'), entrada('3'), entrada('2')])
  })

  it('usa 10 como limite padrão', () => {
    const historico = Array.from({ length: 10 }, (_, i) => entrada(String(i + 1)))
    const resultado = registrarProcessoVisitado(historico, entrada('11'))
    expect(resultado).toHaveLength(10)
    expect(resultado[0]).toEqual(entrada('11'))
    expect(resultado.find((item) => item.idProcedimento === '10')).toBeUndefined()
  })
})
