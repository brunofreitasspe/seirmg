import { describe, expect, it, vi } from 'vitest'
import { processarTarefasVencidas } from './tarefasPipeline'
import { DEFAULT_LOCAL_CONFIG } from '../lib/storage'

const tarefa = { id: '1', titulo: 'Analisar parecer' }

describe('processarTarefasVencidas', () => {
  it('notifica e persiste quando há tarefa vencida nova', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarTarefasVencidas([tarefa], {
      localStore: {
        get: async () => DEFAULT_LOCAL_CONFIG,
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-17T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith(tarefa)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      tarefasNotificadas: { '1': { notificadoEm: '2026-07-17T10:00:00.000Z' } },
    })
  })

  it('não notifica de novo a mesma tarefa no mesmo dia', async () => {
    const notificar = vi.fn()

    await processarTarefasVencidas([tarefa], {
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          tarefasNotificadas: { '1': { notificadoEm: '2026-07-17T08:00:00.000Z' } },
        }),
        set: async () => {},
      },
      notificar,
      agoraIso: '2026-07-17T18:00:00.000Z',
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('lista vazia não chama notificar nem falha', async () => {
    const notificar = vi.fn()

    await processarTarefasVencidas([], {
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })
})
