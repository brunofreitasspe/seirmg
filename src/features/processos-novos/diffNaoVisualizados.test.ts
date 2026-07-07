import { describe, expect, it } from 'vitest'
import { diffNaoVisualizados, ehNaoVisualizado } from './diffNaoVisualizados'
import type { ProcessoItem } from './types'

const itemNaoVisualizado: ProcessoItem = { id: 'p1', numero: '1', visualizado: false }
const itemVisualizado: ProcessoItem = { id: 'p2', numero: '2', visualizado: true }

describe('ehNaoVisualizado', () => {
  it('considera não visualizado quando visualizado é false', () => {
    expect(ehNaoVisualizado(itemNaoVisualizado)).toBe(true)
  })

  it('considera visualizado quando visualizado é true', () => {
    expect(ehNaoVisualizado(itemVisualizado)).toBe(false)
  })
})

describe('diffNaoVisualizados', () => {
  it('considera novo um item não visualizado ainda não notificado', () => {
    const { novos, estadoAtualizado } = diffNaoVisualizados(
      [itemNaoVisualizado],
      {},
      '2026-07-06T10:00:00.000Z'
    )
    expect(novos).toEqual([itemNaoVisualizado])
    expect(estadoAtualizado).toEqual({ p1: { notificadoEm: '2026-07-06T10:00:00.000Z' } })
  })

  it('não repete notificação para item já notificado', () => {
    const { novos } = diffNaoVisualizados(
      [itemNaoVisualizado],
      { p1: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(novos).toEqual([])
  })

  it('ignora itens já visualizados', () => {
    const { novos } = diffNaoVisualizados([itemVisualizado], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([])
  })

  it('preserva o estado de notificações anteriores não relacionadas', () => {
    const { estadoAtualizado } = diffNaoVisualizados(
      [itemNaoVisualizado],
      { zzz: { notificadoEm: '2026-01-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(estadoAtualizado).toEqual({
      zzz: { notificadoEm: '2026-01-01T00:00:00.000Z' },
      p1: { notificadoEm: '2026-07-06T10:00:00.000Z' },
    })
  })
})
