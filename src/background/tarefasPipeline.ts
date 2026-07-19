import { diffVencidas, type TarefaParaNotificar } from '../features/tarefas/diffVencidas'
import { createLocalConfigStore } from '../lib/storage'
import { notificarTarefaVencida } from './notifications/notify'

type LocalStore = ReturnType<typeof createLocalConfigStore>

export interface TarefasPipelineDeps {
  localStore?: LocalStore
  notificar?: typeof notificarTarefaVencida
  agoraIso?: string
}

export async function processarTarefasVencidas(
  tarefasVencidas: TarefaParaNotificar[],
  deps: TarefasPipelineDeps = {}
): Promise<void> {
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarTarefaVencida
  const agoraIso = deps.agoraIso ?? new Date().toISOString()

  const localConfig = await localStore.get()
  const { novas, estadoAtualizado } = diffVencidas(
    tarefasVencidas,
    localConfig.tarefasNotificadas,
    agoraIso
  )

  novas.forEach((tarefa) => notificar(tarefa))

  await localStore.set({
    ...localConfig,
    tarefasNotificadas: estadoAtualizado,
  })
}
