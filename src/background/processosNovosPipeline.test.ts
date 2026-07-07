import { describe, expect, it, vi } from 'vitest'
import { processarItensProcessosNovos } from './processosNovosPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../lib/storage'
import type { ProcessoItem } from '../features/processos-novos/types'

const item: ProcessoItem = { id: 'p1', numero: '100', visualizado: false }

describe('processarItensProcessosNovos', () => {
  it('notifica e persiste quando há processo novo não visualizado', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensProcessosNovos([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => DEFAULT_LOCAL_CONFIG,
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-06T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith(item, DEFAULT_SYNC_CONFIG.processosNovos.tocarSom)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      processosNovosNotificado: { p1: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
      processosNovosBadgeCount: 1,
    })
  })

  it('não notifica quando a feature está desativada nas opções', async () => {
    const notificar = vi.fn()

    await processarItensProcessosNovos([item], {
      syncStore: {
        get: async () => ({
          ...DEFAULT_SYNC_CONFIG,
          processosNovos: { ...DEFAULT_SYNC_CONFIG.processosNovos, ativo: false },
        }),
        set: async () => {},
      },
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('não notifica novamente um processo já registrado como notificado, mas preserva o badgeCount', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensProcessosNovos([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          processosNovosNotificado: { p1: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
          processosNovosBadgeCount: 2,
        }),
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
    expect((localSalvo as { processosNovosBadgeCount: number }).processosNovosBadgeCount).toBe(2)
  })

  it('soma ao badgeCount existente em vez de substituir', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown
    const item2: ProcessoItem = { id: 'p2', numero: '200', visualizado: false }

    await processarItensProcessosNovos([item, item2], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({ ...DEFAULT_LOCAL_CONFIG, processosNovosBadgeCount: 5 }),
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-06T10:00:00.000Z',
    })

    expect((localSalvo as { processosNovosBadgeCount: number }).processosNovosBadgeCount).toBe(7)
  })
})
