import { createSyncConfigStore } from '../../lib/storage'
import { applyTheme } from '../../lib/theme'

async function aplicarTemaDaPagina(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar tema:', error)
  }
}

aplicarTemaDaPagina()
