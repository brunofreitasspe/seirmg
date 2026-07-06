import { describe, expect, it, vi } from 'vitest'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../lib/storage'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const item: BlocoAssinaturaItem = { id: 'x', numero: '9', link: '/x', estado: 'aberto' }

describe('processarItensBlocoAssinatura', () => {
  it('notifica e persiste quando há item novo pendente', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensBlocoAssinatura([item], {
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

    expect(notificar).toHaveBeenCalledWith(item, DEFAULT_SYNC_CONFIG.blocoAssinatura.tocarSom)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
    })
  })

  it('não notifica quando a feature está desativada nas opções', async () => {
    const notificar = vi.fn()

    await processarItensBlocoAssinatura([item], {
      syncStore: {
        get: async () => ({
          ...DEFAULT_SYNC_CONFIG,
          blocoAssinatura: { ...DEFAULT_SYNC_CONFIG.blocoAssinatura, ativo: false },
        }),
        set: async () => {},
      },
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('não notifica novamente um item já registrado como notificado', async () => {
    const notificar = vi.fn()

    await processarItensBlocoAssinatura([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
        }),
        set: async () => {},
      },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })
})
