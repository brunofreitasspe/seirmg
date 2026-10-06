import { describe, it, expect, vi } from 'vitest'
import { processarLembretesFavoritos } from './lembreteFavoritosPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG, type LocalConfig } from '../lib/storage'

describe('processarLembretesFavoritos', () => {
  it('notifica favoritos com lembrete devido e persiste o estado', async () => {
    const localConfig = { ...DEFAULT_LOCAL_CONFIG, favoritosLembretesNotificados: {} }
    const syncConfig = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        favoritos: {
          ...DEFAULT_SYNC_CONFIG.controleProcessos.favoritos,
          ativo: true,
          itens: [{ numero: '1', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', lembreteData: '2026-07-20' }],
        },
      },
    }
    const localSet = vi.fn()
    const notificar = vi.fn()

    await processarLembretesFavoritos({
      localStore: { get: async () => localConfig, set: localSet },
      syncStore: { get: async () => syncConfig, set: vi.fn() },
      notificar,
      hojeIso: '2026-07-20T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith({ numero: '1', lembreteNota: undefined })
    expect(localSet).toHaveBeenCalledWith(
      expect.objectContaining({ favoritosLembretesNotificados: { '1': { notificadoEm: '2026-07-20T10:00:00.000Z' } } })
    )
  })

  it('não notifica quando não há lembrete devido', async () => {
    const notificar = vi.fn()
    await processarLembretesFavoritos({
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: vi.fn() },
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: vi.fn() },
      notificar,
      hojeIso: '2026-07-20T10:00:00.000Z',
    })
    expect(notificar).not.toHaveBeenCalled()
  })

  // localConfig gravado antes desta versão não tem o campo (o store não mescla os defaults).
  it('funciona com localConfig antigo, sem favoritosLembretesNotificados', async () => {
    const antigo = { ...DEFAULT_LOCAL_CONFIG } as Partial<LocalConfig>
    delete antigo.favoritosLembretesNotificados
    const syncConfig = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        favoritos: {
          ...DEFAULT_SYNC_CONFIG.controleProcessos.favoritos,
          itens: [{ numero: '1', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', lembreteData: '2026-07-20' }],
        },
      },
    }
    const notificar = vi.fn()
    await processarLembretesFavoritos({
      localStore: { get: async () => antigo as LocalConfig, set: vi.fn() },
      syncStore: { get: async () => syncConfig, set: vi.fn() },
      notificar,
      hojeIso: '2026-07-20T10:00:00.000Z',
    })
    expect(notificar).toHaveBeenCalledTimes(1)
  })
})
