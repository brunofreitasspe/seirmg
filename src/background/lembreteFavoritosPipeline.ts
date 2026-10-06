import { diffLembretesFavoritos } from '../features/controle-processos/lembretesFavoritos'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarLembreteFavorito } from './notifications/notify'

type LocalStore = ReturnType<typeof createLocalConfigStore>
type SyncStore = ReturnType<typeof createSyncConfigStore>

export interface LembreteFavoritosPipelineDeps {
  localStore?: LocalStore
  syncStore?: SyncStore
  notificar?: typeof notificarLembreteFavorito
  hojeIso?: string
}

export async function processarLembretesFavoritos(deps: LembreteFavoritosPipelineDeps = {}): Promise<void> {
  const localStore = deps.localStore ?? createLocalConfigStore()
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const notificar = deps.notificar ?? notificarLembreteFavorito
  const hojeIso = deps.hojeIso ?? new Date().toISOString()

  const syncConfig = await syncStore.get()
  const localConfig = await localStore.get()
  const { devidos, estadoAtualizado } = diffLembretesFavoritos(
    syncConfig.controleProcessos.favoritos.itens,
    // ?? {}: localConfig salvo antes desta versão não tem o campo.
    localConfig.favoritosLembretesNotificados ?? {},
    hojeIso
  )
  if (devidos.length === 0) return

  devidos.forEach((favorito) => notificar(favorito))
  await localStore.set({ ...localConfig, favoritosLembretesNotificados: estadoAtualizado })
}
