import { diffNaoVisualizados } from '../features/processos-novos/diffNaoVisualizados'
import type { ProcessoItem } from '../features/processos-novos/types'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarNovoProcesso } from './notifications/notify'

type SyncStore = ReturnType<typeof createSyncConfigStore>
type LocalStore = ReturnType<typeof createLocalConfigStore>

export interface ProcessosNovosPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoProcesso
  agoraIso?: string
}

export async function processarItensProcessosNovos(
  itens: ProcessoItem[],
  deps: ProcessosNovosPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoProcesso
  const agoraIso = deps.agoraIso ?? new Date().toISOString()

  const config = await syncStore.get()
  if (!config.processosNovos.ativo) return

  const localConfig = await localStore.get()
  const { novos, estadoAtualizado } = diffNaoVisualizados(
    itens,
    localConfig.processosNovosNotificado,
    agoraIso
  )

  novos.forEach((item) => notificar(item, config.processosNovos.tocarSom))

  await localStore.set({
    ...localConfig,
    processosNovosNotificado: estadoAtualizado,
    processosNovosBadgeCount: localConfig.processosNovosBadgeCount + novos.length,
  })
}
