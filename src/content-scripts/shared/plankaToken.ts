import { createLocalConfigStore } from '../../lib/storage'

export async function limparTokenPlanka(): Promise<void> {
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  if (!localConfig.planka) return
  await localStore.set({
    ...localConfig,
    planka: { ...localConfig.planka, token: undefined, tokenExp: undefined },
  })
}
