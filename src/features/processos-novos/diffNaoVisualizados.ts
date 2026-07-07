import type { NotificadoState } from '../../lib/storage'
import type { ProcessoItem } from './types'

export interface DiffNaoVisualizadosResultado {
  novos: ProcessoItem[]
  estadoAtualizado: NotificadoState
}

export function ehNaoVisualizado(item: ProcessoItem): boolean {
  return !item.visualizado
}

export function diffNaoVisualizados(
  itens: ProcessoItem[],
  jaNotificados: NotificadoState,
  agoraIso: string
): DiffNaoVisualizadosResultado {
  const naoVisualizados = itens.filter(ehNaoVisualizado)
  const novos = naoVisualizados.filter((item) => !(item.id in jaNotificados))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  novos.forEach((item) => {
    estadoAtualizado[item.id] = { notificadoEm: agoraIso }
  })

  return { novos, estadoAtualizado }
}
