import { describe, expect, it } from 'vitest'
import { diffVencidas } from './diffVencidas'
import type { NotificadoState } from '../../lib/storage'

const tarefa = { id: '1', titulo: 'Analisar parecer' }

describe('diffVencidas', () => {
  it('inclui tarefa nunca notificada', () => {
    const resultado = diffVencidas([tarefa], {}, '2026-07-17T10:00:00.000Z')
    expect(resultado.novas).toEqual([tarefa])
    expect(resultado.estadoAtualizado).toEqual({ '1': { notificadoEm: '2026-07-17T10:00:00.000Z' } })
  })

  it('não repete tarefa já notificada no mesmo dia', () => {
    const notificadas: NotificadoState = { '1': { notificadoEm: '2026-07-17T08:00:00.000Z' } }
    const resultado = diffVencidas([tarefa], notificadas, '2026-07-17T18:00:00.000Z')
    expect(resultado.novas).toEqual([])
  })

  it('notifica de novo em um dia diferente', () => {
    const notificadas: NotificadoState = { '1': { notificadoEm: '2026-07-16T08:00:00.000Z' } }
    const resultado = diffVencidas([tarefa], notificadas, '2026-07-17T08:00:00.000Z')
    expect(resultado.novas).toEqual([tarefa])
    expect(resultado.estadoAtualizado['1'].notificadoEm).toBe('2026-07-17T08:00:00.000Z')
  })

  it('preserva o estado de outras tarefas não presentes na lista atual', () => {
    const notificadas: NotificadoState = { outraTarefa: { notificadoEm: '2026-07-10T08:00:00.000Z' } }
    const resultado = diffVencidas([tarefa], notificadas, '2026-07-17T08:00:00.000Z')
    expect(resultado.estadoAtualizado.outraTarefa).toEqual({ notificadoEm: '2026-07-10T08:00:00.000Z' })
  })
})
