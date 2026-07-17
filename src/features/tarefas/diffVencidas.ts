import type { NotificadoState } from '../../lib/storage'

export interface TarefaParaNotificar {
  id: string
  titulo: string
}

export interface DiffVencidasResultado {
  novas: TarefaParaNotificar[]
  estadoAtualizado: NotificadoState
}

function mesmoDia(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10)
}

export function diffVencidas(
  tarefasVencidas: TarefaParaNotificar[],
  jaNotificadas: NotificadoState,
  agoraIso: string
): DiffVencidasResultado {
  const novas = tarefasVencidas.filter((tarefa) => {
    const ultimaNotificacao = jaNotificadas[tarefa.id]?.notificadoEm
    return !ultimaNotificacao || !mesmoDia(ultimaNotificacao, agoraIso)
  })

  const estadoAtualizado: NotificadoState = { ...jaNotificadas }
  novas.forEach((tarefa) => {
    estadoAtualizado[tarefa.id] = { notificadoEm: agoraIso }
  })

  return { novas, estadoAtualizado }
}
