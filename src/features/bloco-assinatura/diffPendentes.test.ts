import { describe, expect, it } from 'vitest'
import { diffPendentes } from './diffPendentes'
import type { BlocoAssinaturaItem } from './types'

const itemPendente: BlocoAssinaturaItem = { id: 'a', numero: '1', link: '/a', estado: 'disponibilizado_para_area' }
const itemAberto: BlocoAssinaturaItem = { id: 'b', numero: '2', link: '/b', estado: 'aberto' }
const itemPelaArea: BlocoAssinaturaItem = { id: 'c', numero: '3', link: '/c', estado: 'disponibilizado_pela_area' }
const itemRetornado: BlocoAssinaturaItem = { id: 'd', numero: '4', link: '/d', estado: 'retornado' }

describe('diffPendentes', () => {
  it('considera novo um item pendente ainda não notificado', () => {
    const { novos, estadoAtualizado } = diffPendentes([itemPendente], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([itemPendente])
    expect(estadoAtualizado).toEqual({ a: { notificadoEm: '2026-07-06T10:00:00.000Z' } })
  })

  it('não repete notificação para item já notificado', () => {
    const { novos } = diffPendentes(
      [itemPendente],
      { a: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(novos).toEqual([])
  })

  it('ignora itens disponibilizados pela própria área (não são pendência)', () => {
    const { novos } = diffPendentes([itemPelaArea], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([])
  })

  it('ignora itens retornados (não são pendência)', () => {
    const { novos } = diffPendentes([itemRetornado], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([])
  })

  it('trata "aberto" como pendente', () => {
    const { novos } = diffPendentes([itemAberto], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([itemAberto])
  })

  it('preserva o estado de notificações anteriores não relacionadas', () => {
    const { estadoAtualizado } = diffPendentes(
      [itemAberto],
      { z: { notificadoEm: '2026-01-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(estadoAtualizado).toEqual({
      z: { notificadoEm: '2026-01-01T00:00:00.000Z' },
      b: { notificadoEm: '2026-07-06T10:00:00.000Z' },
    })
  })
})
