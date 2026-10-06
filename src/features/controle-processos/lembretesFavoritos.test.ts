import { describe, it, expect } from 'vitest'
import { diffLembretesFavoritos } from './lembretesFavoritos'
import type { FavoritoProcesso } from '../../lib/storage'

function favorito(numero: string, lembreteData?: string): FavoritoProcesso {
  return { numero, link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', lembreteData }
}

describe('diffLembretesFavoritos', () => {
  const hoje = '2026-07-20T10:00:00.000Z'

  it('notifica favorito cuja data de lembrete já chegou', () => {
    const { devidos } = diffLembretesFavoritos([favorito('1', '2026-07-20')], {}, hoje)
    expect(devidos).toEqual([{ numero: '1', lembreteNota: undefined }])
  })

  it('notifica favorito cuja data de lembrete já passou', () => {
    const { devidos } = diffLembretesFavoritos([favorito('1', '2026-07-01')], {}, hoje)
    expect(devidos.map((d) => d.numero)).toEqual(['1'])
  })

  it('não notifica favorito sem lembrete ou com data futura', () => {
    const { devidos } = diffLembretesFavoritos([favorito('1'), favorito('2', '2026-08-01')], {}, hoje)
    expect(devidos).toEqual([])
  })

  it('não notifica de novo no mesmo dia', () => {
    const { devidos } = diffLembretesFavoritos(
      [favorito('1', '2026-07-20')],
      { '1': { notificadoEm: '2026-07-20T08:00:00.000Z' } },
      hoje
    )
    expect(devidos).toEqual([])
  })

  it('notifica de novo em outro dia (lembrete recorrente até ser removido)', () => {
    const { devidos } = diffLembretesFavoritos(
      [favorito('1', '2026-07-20')],
      { '1': { notificadoEm: '2026-07-19T08:00:00.000Z' } },
      hoje
    )
    expect(devidos.map((d) => d.numero)).toEqual(['1'])
  })

  it('estadoAtualizado registra a notificação de hoje', () => {
    const { estadoAtualizado } = diffLembretesFavoritos([favorito('1', '2026-07-20')], {}, hoje)
    expect(estadoAtualizado).toEqual({ '1': { notificadoEm: hoje } })
  })
})
