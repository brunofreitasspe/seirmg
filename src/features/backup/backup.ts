import type { EventoHistorico, HistoricoProcessoEntry, SnapshotPrazoProcesso, SyncConfig } from '../../lib/storage'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../../lib/storage'

export interface BackupLocalConfig {
  historicoProcessosVisitados: HistoricoProcessoEntry[]
  historicoEventos: EventoHistorico[]
  snapshotPrazosProcessos: SnapshotPrazoProcesso[]
}

export interface BackupCompleto {
  versaoSeirmg: string
  exportadoEm: string
  sync: SyncConfig
  local: BackupLocalConfig
}

export function montarBackupCompleto(
  sync: SyncConfig,
  local: BackupLocalConfig,
  versaoSeirmg: string,
  agora: Date
): BackupCompleto {
  return {
    versaoSeirmg,
    exportadoEm: agora.toISOString(),
    sync,
    local,
  }
}

export function parseBackupCompleto(json: string): BackupCompleto | null {
  try {
    const dados: unknown = JSON.parse(json)
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
      return null
    }
    const { sync, local } = dados as { sync?: unknown; local?: unknown }
    if (typeof sync !== 'object' || sync === null || Array.isArray(sync)) {
      return null
    }
    if (typeof local !== 'object' || local === null || Array.isArray(local)) {
      return null
    }
    const { versaoSeirmg, exportadoEm } = dados as { versaoSeirmg?: unknown; exportadoEm?: unknown }
    if (typeof versaoSeirmg !== 'string' || typeof exportadoEm !== 'string') {
      return null
    }
    if (!('featureFlags' in sync)) {
      return null
    }
    return dados as BackupCompleto
  } catch {
    return null
  }
}

export function aplicarBackupRestaurado(backup: BackupCompleto): { sync: SyncConfig; local: BackupLocalConfig } {
  return {
    sync: { ...DEFAULT_SYNC_CONFIG, ...backup.sync },
    local: {
      historicoProcessosVisitados: backup.local.historicoProcessosVisitados ?? DEFAULT_LOCAL_CONFIG.historicoProcessosVisitados,
      historicoEventos: backup.local.historicoEventos ?? DEFAULT_LOCAL_CONFIG.historicoEventos,
      snapshotPrazosProcessos: backup.local.snapshotPrazosProcessos ?? DEFAULT_LOCAL_CONFIG.snapshotPrazosProcessos,
    },
  }
}
