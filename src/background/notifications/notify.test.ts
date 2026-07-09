import { describe, expect, it } from 'vitest'
import { buildNotificationId } from './notify'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

describe('buildNotificationId', () => {
  it('prefixa o id do item', () => {
    const item: BlocoAssinaturaItem = { id: 'abc123', numero: '10', link: '/x', estado: 'aberto' }
    expect(buildNotificationId(item)).toBe('seirmg-bloco-assinatura-abc123')
  })
})
