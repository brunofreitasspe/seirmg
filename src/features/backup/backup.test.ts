import { describe, expect, it } from 'vitest'
import { montarBackupCompleto, parseBackupCompleto, aplicarBackupRestaurado } from './backup'
import { DEFAULT_SYNC_CONFIG, DEFAULT_LOCAL_CONFIG, type EventoHistorico, type HistoricoProcessoEntry, type SnapshotPrazoProcesso } from '../../lib/storage'

const historico: HistoricoProcessoEntry[] = [
  { idProcedimento: '123', numero: 'HMMG.2026.00123-4', tipo: 'Ofício', acessadoEm: '2026-08-01T10:00:00.000Z' },
]

const eventos: EventoHistorico[] = [
  { tipo: 'acesso', numero: 'HMMG.2026.00123-4', ocorridoEm: '2026-08-01T10:00:00.000Z' },
]

const snapshots: SnapshotPrazoProcesso[] = [
  { numero: 'HMMG.2026.00123-4', link: null, prazoDataTexto: '15/08/2026', vistoEm: '2026-08-01T10:00:00.000Z' },
]

describe('montarBackupCompleto', () => {
  it('monta o objeto de backup com sync completo e os 3 campos de local', () => {
    const agora = new Date('2026-08-17T12:00:00.000Z')
    const backup = montarBackupCompleto(
      DEFAULT_SYNC_CONFIG,
      { historicoProcessosVisitados: historico, historicoEventos: eventos, snapshotPrazosProcessos: snapshots },
      '5.0',
      agora
    )

    expect(backup).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-08-17T12:00:00.000Z',
      sync: DEFAULT_SYNC_CONFIG,
      local: {
        historicoProcessosVisitados: historico,
        historicoEventos: eventos,
        snapshotPrazosProcessos: snapshots,
      },
    })
  })
})

describe('parseBackupCompleto', () => {
  const backupValido = {
    versaoSeirmg: '5.0',
    exportadoEm: '2026-08-17T12:00:00.000Z',
    sync: DEFAULT_SYNC_CONFIG,
    local: {
      historicoProcessosVisitados: historico,
      historicoEventos: eventos,
      snapshotPrazosProcessos: snapshots,
    },
  }

  it('faz parse de um backup válido', () => {
    expect(parseBackupCompleto(JSON.stringify(backupValido))).toEqual(backupValido)
  })

  it('retorna null pra JSON com erro de sintaxe', () => {
    expect(parseBackupCompleto('{ isso não é json')).toBeNull()
  })

  it('retorna null pra "null" (JSON válido, mas não é objeto)', () => {
    expect(parseBackupCompleto('null')).toBeNull()
  })

  it('retorna null pra um array no lugar de objeto', () => {
    expect(parseBackupCompleto('[]')).toBeNull()
  })

  it('retorna null quando falta o campo sync', () => {
    const { sync: _sync, ...semSync } = backupValido
    expect(parseBackupCompleto(JSON.stringify(semSync))).toBeNull()
  })

  it('retorna null quando falta o campo local', () => {
    const { local: _local, ...semLocal } = backupValido
    expect(parseBackupCompleto(JSON.stringify(semLocal))).toBeNull()
  })

  it('retorna null quando sync não é objeto', () => {
    expect(parseBackupCompleto(JSON.stringify({ ...backupValido, sync: 'não é objeto' }))).toBeNull()
  })

  it('retorna null quando versaoSeirmg está ausente ou não é string', () => {
    const { versaoSeirmg: _versaoSeirmg, ...semVersao } = backupValido
    expect(parseBackupCompleto(JSON.stringify(semVersao))).toBeNull()
  })

  it('retorna null quando exportadoEm está ausente ou não é string', () => {
    const { exportadoEm: _exportadoEm, ...semExportadoEm } = backupValido
    expect(parseBackupCompleto(JSON.stringify(semExportadoEm))).toBeNull()
  })

  it('retorna null quando sync é um objeto vazio (não parece um SyncConfig real)', () => {
    expect(parseBackupCompleto(JSON.stringify({ ...backupValido, sync: {} }))).toBeNull()
  })
})

describe('aplicarBackupRestaurado', () => {
  it('devolve sync e local do backup quando o backup tem todas as chaves', () => {
    const backup = {
      versaoSeirmg: '5.0',
      exportadoEm: '2026-08-17T12:00:00.000Z',
      sync: { ...DEFAULT_SYNC_CONFIG, tema: { preset: 'black' as const } },
      local: {
        historicoProcessosVisitados: historico,
        historicoEventos: eventos,
        snapshotPrazosProcessos: snapshots,
      },
    }

    const resultado = aplicarBackupRestaurado(backup)

    expect(resultado.sync.tema).toEqual({ preset: 'black' })
    expect(resultado.local).toEqual(backup.local)
  })

  it('preenche com o default uma chave de topo ausente no sync do backup (simula backup antigo)', () => {
    const { dashboard: _dashboard, ...syncSemDashboard } = DEFAULT_SYNC_CONFIG
    const backup = {
      versaoSeirmg: '4.0',
      exportadoEm: '2026-01-01T00:00:00.000Z',
      sync: syncSemDashboard as typeof DEFAULT_SYNC_CONFIG,
      local: { historicoProcessosVisitados: [], historicoEventos: [], snapshotPrazosProcessos: [] },
    }

    const resultado = aplicarBackupRestaurado(backup)

    expect(resultado.sync.dashboard).toEqual(DEFAULT_SYNC_CONFIG.dashboard)
  })

  it('preenche com o default um campo de local ausente no backup', () => {
    const backup = {
      versaoSeirmg: '4.0',
      exportadoEm: '2026-01-01T00:00:00.000Z',
      sync: DEFAULT_SYNC_CONFIG,
      local: { historicoProcessosVisitados: historico } as unknown as { historicoProcessosVisitados: HistoricoProcessoEntry[]; historicoEventos: EventoHistorico[]; snapshotPrazosProcessos: SnapshotPrazoProcesso[] },
    }

    const resultado = aplicarBackupRestaurado(backup)

    expect(resultado.local.historicoProcessosVisitados).toEqual(historico)
    expect(resultado.local.historicoEventos).toEqual(DEFAULT_LOCAL_CONFIG.historicoEventos)
    expect(resultado.local.snapshotPrazosProcessos).toEqual(DEFAULT_LOCAL_CONFIG.snapshotPrazosProcessos)
  })
})
