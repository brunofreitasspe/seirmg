import { describe, expect, it } from 'vitest'
import { registrarProcessoVisitado, podarPorJanela, filtrarHistoricoPorTexto } from './historico'
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

  it('limite <= 0 desativa o corte por quantidade (mantém todas as entradas)', () => {
    const historico = Array.from({ length: 15 }, (_, i) => entrada(String(i + 1)))
    const resultado = registrarProcessoVisitado(historico, entrada('16'), 0)
    expect(resultado).toHaveLength(16)
    expect(resultado[0]).toEqual(entrada('16'))
  })
})

import { ehNivelAcessoCapturavel } from './historico'

describe('ehNivelAcessoCapturavel', () => {
  it('permite capturar processo Público ou Restrito', () => {
    expect(ehNivelAcessoCapturavel('Público')).toBe(true)
    expect(ehNivelAcessoCapturavel('Restrito')).toBe(true)
  })

  it('bloqueia processo Sigiloso', () => {
    expect(ehNivelAcessoCapturavel('Sigiloso')).toBe(false)
  })

  it('bloqueia nível desconhecido (não há garantia de que é público)', () => {
    expect(ehNivelAcessoCapturavel('')).toBe(false)
  })
})

describe('podarPorJanela', () => {
  const agora = '2026-07-20T10:00:00.000Z'

  function entrada(id: string, acessadoEm: string): HistoricoProcessoEntry {
    return { idProcedimento: id, numero: id, tipo: 'Ofício', acessadoEm }
  }

  it('remove entradas mais antigas que a janela', () => {
    const historico = [
      entrada('1', '2026-07-20T09:00:00.000Z'), // hoje
      entrada('2', '2026-07-10T09:00:00.000Z'), // 10 dias atrás
    ]
    expect(podarPorJanela(historico, agora, 7)).toEqual([historico[0]])
  })

  it('janelaDias <= 0 desativa a poda por tempo', () => {
    const historico = [entrada('1', '2020-01-01T00:00:00.000Z')]
    expect(podarPorJanela(historico, agora, 0)).toEqual(historico)
  })
})

describe('filtrarHistoricoPorTexto', () => {
  const historico: HistoricoProcessoEntry[] = [
    { idProcedimento: '1', numero: '1234.001/2026', tipo: 'Ofício', acessadoEm: '2026-07-20T10:00:00.000Z' },
    { idProcedimento: '2', numero: '5678.002/2026', tipo: 'Memorando', acessadoEm: '2026-07-20T11:00:00.000Z' },
  ]

  it('termo vazio devolve tudo', () => {
    expect(filtrarHistoricoPorTexto(historico, '')).toEqual(historico)
  })

  it('filtra por número, sem distinguir maiúscula/minúscula', () => {
    expect(filtrarHistoricoPorTexto(historico, '5678')).toEqual([historico[1]])
  })

  it('filtra por tipo', () => {
    expect(filtrarHistoricoPorTexto(historico, 'ofício')).toEqual([historico[0]])
  })
})
