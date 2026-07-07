import { diffPendentes, ehPendente } from '../features/bloco-assinatura/diffPendentes'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarNovoBloco } from './notifications/notify'

type SyncStore = ReturnType<typeof createSyncConfigStore>
type LocalStore = ReturnType<typeof createLocalConfigStore>

export interface BlocoAssinaturaPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoBloco
  agoraIso?: string
  sempreNotificarPendentes?: boolean
}

export async function processarItensBlocoAssinatura(
  itens: BlocoAssinaturaItem[],
  deps: BlocoAssinaturaPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoBloco
  const agoraIso = deps.agoraIso ?? new Date().toISOString()
  const sempreNotificarPendentes = deps.sempreNotificarPendentes ?? false

  const config = await syncStore.get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await localStore.get()
  const pendentesAgora = itens.filter(ehPendente)
  const { novos, estadoAtualizado } = diffPendentes(
    itens,
    localConfig.blocoAssinaturaNotificado,
    agoraIso
  )

  const quemNotificar = sempreNotificarPendentes ? pendentesAgora : novos
  quemNotificar.forEach((item) => notificar(item, config.blocoAssinatura.tocarSom))

  await localStore.set({
    ...localConfig,
    blocoAssinaturaNotificado: estadoAtualizado,
    blocoAssinaturaPendenteAtual: pendentesAgora.map((item) => item.id),
  })
}
