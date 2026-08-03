import { registrarEvento } from '../../features/dashboard/historicoEventos'
import { extrairNumeroProcessoDaBarra } from '../../features/procedimento-visualizar/numeroProcesso'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { EventoHistorico } from '../../lib/storage'

async function registrarEventoAssinatura(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.dashboard?.ativo) return

    const numero = extrairNumeroProcessoDaBarra(document)
    if (!numero) return

    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    const novo: EventoHistorico = { tipo: 'assinatura', numero, ocorridoEm: new Date().toISOString() }
    const historicoEventos = registrarEvento(localConfig.historicoEventos ?? [], novo)
    await localStore.set({ ...localConfig, historicoEventos })
  } catch (error) {
    console.error('[SEIRMG] Falha ao registrar evento de assinatura no Dashboard:', error)
  }
}

registrarEventoAssinatura()
