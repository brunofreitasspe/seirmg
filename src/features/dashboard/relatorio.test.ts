import { describe, expect, it } from 'vitest'
import { montarCsvHistorico, montarHtmlRelatorio } from './relatorio'
import type { EventoHistorico } from '../../lib/storage'

describe('montarCsvHistorico', () => {
  it('gera cabeçalho e uma linha por evento', () => {
    const eventos: EventoHistorico[] = [
      { tipo: 'acesso', numero: '0001/2026', tipoProcesso: 'Ofício', especificacao: 'Teste', ocorridoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const csv = montarCsvHistorico(eventos)
    const linhas = csv.split('\r\n')
    expect(linhas[0]).toBe('Processo;Tipo de Evento;Tipo do Processo;Especificação;Data;Hora')
    expect(linhas[1]).toContain('0001/2026')
    expect(linhas[1]).toContain('acesso')
  })

  it('escapa campos com ponto e vírgula usando a mesma lógica de favoritosExportar', () => {
    const eventos: EventoHistorico[] = [
      { tipo: 'documento', numero: '0002/2026', especificacao: 'Nota; Fiscal', ocorridoEm: '2026-08-01T10:00:00.000Z' },
    ]
    expect(montarCsvHistorico(eventos)).toContain('"Nota; Fiscal"')
  })

  it('lista vazia gera só o cabeçalho', () => {
    expect(montarCsvHistorico([]).split('\r\n')).toEqual(['Processo;Tipo de Evento;Tipo do Processo;Especificação;Data;Hora'])
  })
})

describe('montarHtmlRelatorio', () => {
  const intervalo = { inicio: new Date('2026-08-01T00:00:00.000Z'), fim: new Date('2026-08-31T23:59:59.999Z'), rotulo: 'Agosto 2026' }

  it('inclui o rótulo do período e a contagem total de eventos', () => {
    const eventos: EventoHistorico[] = [
      { tipo: 'acesso', numero: '0001/2026', ocorridoEm: '2026-08-05T10:00:00.000Z' },
      { tipo: 'enviado', numero: '0002/2026', ocorridoEm: '2026-08-06T10:00:00.000Z' },
    ]
    const html = montarHtmlRelatorio(eventos, intervalo)
    expect(html).toContain('Agosto 2026')
    expect(html).toContain('0001/2026')
    expect(html).toContain('0002/2026')
  })

  it('período sem eventos não quebra e mostra mensagem de vazio', () => {
    const html = montarHtmlRelatorio([], intervalo)
    expect(html).toContain('Nenhum evento')
  })
})
