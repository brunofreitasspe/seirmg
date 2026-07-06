import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { applyTheme } from '../../lib/theme'
import { detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
