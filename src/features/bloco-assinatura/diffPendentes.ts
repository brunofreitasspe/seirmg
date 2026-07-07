import type { NotificadoState } from '../../lib/storage'
import type { BlocoAssinaturaItem } from './types'

export interface DiffResultado {
  novos: BlocoAssinaturaItem[]
  estadoAtualizado: NotificadoState
}

export function ehPendente(item: BlocoAssinaturaItem): boolean {
  return item.estado === 'disponibilizado_para_area' || item.estado === 'aberto'
}

export function diffPendentes(
  itens: BlocoAssinaturaItem[],
  jaNotificados: NotificadoState,
  agoraIso: string
): DiffResultado {
  const pendentes = itens.filter(ehPendente)
  const novos = pendentes.filter((item) => !(item.id in jaNotificados))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  novos.forEach((item) => {
    estadoAtualizado[item.id] = { notificadoEm: agoraIso }
  })

  return { novos, estadoAtualizado }
}
