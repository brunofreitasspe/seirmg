import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNotificationId, notificarLembreteFavorito, NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX } from './notify'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

describe('buildNotificationId', () => {
  it('prefixa o id do item', () => {
    const item: BlocoAssinaturaItem = { id: 'abc123', numero: '10', link: '/x', estado: 'aberto' }
    expect(buildNotificationId(item)).toBe('seirmg-bloco-assinatura-abc123')
  })
})

describe('notificarLembreteFavorito', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      notifications: { create: vi.fn() },
      runtime: { getURL: (caminho: string) => `chrome-extension://x/${caminho}` },
    })
  })

  it('cria notificação com o id prefixado pelo número do processo', () => {
    notificarLembreteFavorito({ numero: '1234.001/2026' })
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      `${NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX}1234.001/2026`,
      expect.objectContaining({ title: 'SEIRMG — Lembrete de favorito' })
    )
  })

  it('usa a nota do lembrete na mensagem quando houver', () => {
    notificarLembreteFavorito({ numero: '1234.001/2026', lembreteNota: 'Cobrar resposta' })
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: '1234.001/2026: Cobrar resposta' })
    )
  })
})
