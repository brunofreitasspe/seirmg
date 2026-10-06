import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listarFerramentasAgente, executarFerramenta, type ContextoFerramenta } from './tools'
import { DEFAULT_SYNC_CONFIG, DEFAULT_LOCAL_CONFIG, type SyncConfig, type LocalConfig } from '../../lib/storage'
import { consultarBlocosAoVivo } from '../bloco-assinatura/consultarAoVivo'

vi.mock('../bloco-assinatura/consultarAoVivo', () => ({ consultarBlocosAoVivo: vi.fn() }))

function contexto(sync: SyncConfig = DEFAULT_SYNC_CONFIG, local: LocalConfig = DEFAULT_LOCAL_CONFIG): ContextoFerramenta & {
  syncSet: ReturnType<typeof vi.fn>
} {
  const syncSet = vi.fn()
  return {
    syncStore: { get: async () => sync, set: syncSet },
    localStore: { get: async () => local, set: vi.fn() },
    syncSet,
  }
}

function comFavoritos(itens: SyncConfig['controleProcessos']['favoritos']['itens']): SyncConfig {
  return {
    ...DEFAULT_SYNC_CONFIG,
    controleProcessos: {
      ...DEFAULT_SYNC_CONFIG.controleProcessos,
      favoritos: { ...DEFAULT_SYNC_CONFIG.controleProcessos.favoritos, ativo: true, itens },
    },
  }
}

beforeEach(() => vi.resetAllMocks())

describe('listarFerramentasAgente', () => {
  it('lista 4 ferramentas, 3 de leitura e 1 de escrita', () => {
    const ferramentas = listarFerramentasAgente()
    expect(ferramentas).toHaveLength(4)
    expect(ferramentas.filter((f) => f.escrita).map((f) => f.id)).toEqual(['adicionar_favorito'])
  })

  it('ids seguem o formato aceito pela API como nome de ferramenta', () => {
    for (const ferramenta of listarFerramentasAgente()) expect(ferramenta.id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
  })
})

describe('executarFerramenta', () => {
  it('listar_processos_favoritos devolve número e especificação', async () => {
    const sync = comFavoritos([{ numero: '1234.001/2026', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' }])
    const resultado = await executarFerramenta('listar_processos_favoritos', {}, contexto(sync))
    expect(resultado).toEqual([{ numero: '1234.001/2026', especificacao: undefined }])
  })

  it('listar_historico_visitados devolve número e tipo (lista ausente = vazia)', async () => {
    const local = { ...DEFAULT_LOCAL_CONFIG, historicoProcessosVisitados: undefined } as unknown as LocalConfig
    expect(await executarFerramenta('listar_historico_visitados', {}, contexto(DEFAULT_SYNC_CONFIG, local))).toEqual([])
  })

  it('consultar_status_bloco_assinatura sem sessão do SEI detectada explica em vez de falhar', async () => {
    const resultado = await executarFerramenta('consultar_status_bloco_assinatura', {}, contexto())
    expect(resultado).toEqual({ ok: false, motivo: expect.stringMatching(/SEI/) })
    expect(consultarBlocosAoVivo).not.toHaveBeenCalled()
  })

  it('consultar_status_bloco_assinatura devolve o total pendente', async () => {
    vi.mocked(consultarBlocosAoVivo).mockResolvedValue({ ok: true, total: 3, resumo: {} as never })
    const local = { ...DEFAULT_LOCAL_CONFIG, baseUrlSei: 'https://sei.x/sei' }
    const resultado = await executarFerramenta('consultar_status_bloco_assinatura', {}, contexto(DEFAULT_SYNC_CONFIG, local))
    expect(consultarBlocosAoVivo).toHaveBeenCalledWith('https://sei.x/sei')
    expect(resultado).toEqual({ pendentes: 3 })
  })

  it('adicionar_favorito grava e informa que o processo não existia', async () => {
    const ctx = contexto(comFavoritos([]))
    const resultado = await executarFerramenta('adicionar_favorito', { numero: '1/2026' }, ctx)
    expect(resultado).toEqual({ ok: true, numero: '1/2026', jaExistia: false })
    const gravado = ctx.syncSet.mock.calls[0][0] as SyncConfig
    expect(gravado.controleProcessos.favoritos.itens.map((i) => i.numero)).toEqual(['1/2026'])
  })

  it('adicionar_favorito de processo já favoritado não duplica e informa jaExistia', async () => {
    const ctx = contexto(comFavoritos([{ numero: '1/2026', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' }]))
    expect(await executarFerramenta('adicionar_favorito', { numero: '1/2026' }, ctx)).toEqual({ ok: true, numero: '1/2026', jaExistia: true })
    expect(ctx.syncSet).not.toHaveBeenCalled()
  })

  it('adicionar_favorito sem número rejeita', async () => {
    await expect(executarFerramenta('adicionar_favorito', {}, contexto())).rejects.toThrow(/numero/)
  })

  it('ferramenta desconhecida rejeita', async () => {
    await expect(executarFerramenta('nao_existe', {}, contexto())).rejects.toThrow()
  })
})
