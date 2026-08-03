import { describe, expect, it } from 'vitest'
import { registrarEvento, filtrarPorPeriodo, calcularMetricas, agruparPorDia } from './historicoEventos'
import type { EventoHistorico } from '../../lib/storage'

const evento = (tipo: EventoHistorico['tipo'], numero: string, ocorridoEm: string): EventoHistorico => ({
  tipo,
  numero,
  ocorridoEm,
})

describe('registrarEvento', () => {
  it('acrescenta o novo evento no fim da lista', () => {
    const atual = [evento('acesso', '0001', '2026-08-01T10:00:00.000Z')]
    const novo = evento('enviado', '0002', '2026-08-02T10:00:00.000Z')
    expect(registrarEvento(atual, novo)).toEqual([...atual, novo])
  })

  it('não deduplica por número — mesmo processo pode aparecer várias vezes', () => {
    const atual = [evento('acesso', '0001', '2026-08-01T10:00:00.000Z')]
    const novo = evento('acesso', '0001', '2026-08-02T10:00:00.000Z')
    expect(registrarEvento(atual, novo)).toEqual([...atual, novo])
  })

  it('apara pelo limite, descartando os mais antigos', () => {
    const atual = [evento('acesso', '0001', '2026-08-01T10:00:00.000Z'), evento('acesso', '0002', '2026-08-01T11:00:00.000Z')]
    const novo = evento('acesso', '0003', '2026-08-01T12:00:00.000Z')
    const resultado = registrarEvento(atual, novo, 2)
    expect(resultado).toEqual([evento('acesso', '0002', '2026-08-01T11:00:00.000Z'), novo])
  })
})

describe('filtrarPorPeriodo', () => {
  const eventos = [
    evento('acesso', '0001', '2026-08-01T10:00:00.000Z'),
    evento('enviado', '0002', '2026-08-02T10:00:00.000Z'),
    evento('documento', '0003', '2026-08-03T10:00:00.000Z'),
  ]

  it('inclui eventos dentro do intervalo, com bordas inclusivas', () => {
    const inicio = new Date('2026-08-01T00:00:00.000Z')
    const fim = new Date('2026-08-02T23:59:59.999Z')
    expect(filtrarPorPeriodo(eventos, inicio, fim)).toEqual(eventos.slice(0, 2))
  })

  it('retorna lista vazia quando nada está no intervalo', () => {
    const inicio = new Date('2026-09-01T00:00:00.000Z')
    const fim = new Date('2026-09-30T23:59:59.999Z')
    expect(filtrarPorPeriodo(eventos, inicio, fim)).toEqual([])
  })
})

describe('calcularMetricas', () => {
  it('conta eventos por tipo, com zero pros tipos ausentes', () => {
    const eventos = [
      evento('acesso', '0001', '2026-08-01T10:00:00.000Z'),
      evento('acesso', '0002', '2026-08-01T11:00:00.000Z'),
      evento('enviado', '0003', '2026-08-01T12:00:00.000Z'),
    ]
    expect(calcularMetricas(eventos)).toEqual({ acesso: 2, enviado: 1, documento: 0, assinatura: 0, concluido: 0 })
  })

  it('retorna todos os tipos zerados pra lista vazia', () => {
    expect(calcularMetricas([])).toEqual({ acesso: 0, enviado: 0, documento: 0, assinatura: 0, concluido: 0 })
  })
})

describe('agruparPorDia', () => {
  it('agrupa por data local (yyyy-mm-dd), preservando a ordem de chegada dentro do grupo', () => {
    const eventos = [
      evento('acesso', '0001', new Date(2026, 7, 1, 10, 0).toISOString()),
      evento('enviado', '0002', new Date(2026, 7, 1, 14, 0).toISOString()),
      evento('documento', '0003', new Date(2026, 7, 2, 9, 0).toISOString()),
    ]
    expect(agruparPorDia(eventos)).toEqual([
      { data: '2026-08-01', eventos: [eventos[0], eventos[1]] },
      { data: '2026-08-02', eventos: [eventos[2]] },
    ])
  })

  it('retorna lista vazia pra entrada vazia', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})
