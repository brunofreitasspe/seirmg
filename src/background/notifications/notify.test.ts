import { describe, expect, it } from 'vitest'
import { buildNotificationId, buildNotificationIdProcesso } from './notify'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import type { ProcessoItem } from '../../features/processos-novos/types'

describe('buildNotificationId', () => {
  it('prefixa o id do item', () => {
    const item: BlocoAssinaturaItem = { id: 'abc123', numero: '10', link: '/x', estado: 'aberto' }
    expect(buildNotificationId(item)).toBe('seirmg-bloco-assinatura-abc123')
  })
})

describe('buildNotificationIdProcesso', () => {
  it('prefixa o id do item', () => {
    const item: ProcessoItem = { id: 'abc123', numero: '10', visualizado: false }
    expect(buildNotificationIdProcesso(item)).toBe('seirmg-processo-novo-abc123')
  })
})
