import { describe, it, expect, vi } from 'vitest'
import { registrarAcaoParaDesfazer, consumirAcaoParaDesfazer, reverterAcao } from './desfazer'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG, type AcaoAgenteParaDesfazer, type SyncConfig } from '../../lib/storage'

describe('registrarAcaoParaDesfazer', () => {
  it('adiciona no topo e respeita o limite', () => {
    const resultado = registrarAcaoParaDesfazer(
      [],
      { descricao: 'Favoritou 1234.001/2026', ferramenta: 'adicionar_favorito', estadoAnterior: { numero: '1234.001/2026', jaExistia: false } },
      '2026-07-20T10:00:00.000Z'
    )
    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toMatchObject({ descricao: 'Favoritou 1234.001/2026', criadoEm: '2026-07-20T10:00:00.000Z' })
    expect(typeof resultado[0].id).toBe('string')

    let historico = resultado
    for (let i = 0; i < 25; i++) {
      historico = registrarAcaoParaDesfazer(historico, { descricao: `${i}`, ferramenta: 'x', estadoAnterior: null }, '2026-07-20T10:00:00.000Z')
    }
    expect(historico).toHaveLength(20)
    expect(historico[0].descricao).toBe('24')
  })
})

describe('consumirAcaoParaDesfazer', () => {
  it('devolve a ação e remove do histórico', () => {
    const historico = registrarAcaoParaDesfazer([], { descricao: 'X', ferramenta: 'adicionar_favorito', estadoAnterior: null }, '2026-07-20T10:00:00.000Z')
    const resultado = consumirAcaoParaDesfazer(historico, historico[0].id)
    expect(resultado.acao).toEqual(historico[0])
    expect(resultado.historico).toEqual([])
  })

  it('id inexistente devolve null sem alterar o histórico', () => {
    expect(consumirAcaoParaDesfazer([], 'nao-existe')).toEqual({ acao: null, historico: [] })
  })
})

describe('reverterAcao', () => {
  function comFavoritos(numeros: string[]): SyncConfig {
    return {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        favoritos: {
          ...DEFAULT_SYNC_CONFIG.controleProcessos.favoritos,
          itens: numeros.map((numero) => ({ numero, link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' })),
        },
      },
    }
  }

  function acao(estadoAnterior: unknown): AcaoAgenteParaDesfazer {
    return { id: '1', descricao: '', ferramenta: 'adicionar_favorito', estadoAnterior, criadoEm: '' }
  }

  it('desfaz adicionar_favorito removendo só o processo que o agente acrescentou', async () => {
    const syncSet = vi.fn()
    const contexto = { syncStore: { get: async () => comFavoritos(['A', 'B']), set: syncSet }, localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: vi.fn() } }
    await reverterAcao(acao({ numero: 'B', jaExistia: false }), contexto)
    expect((syncSet.mock.calls[0][0] as SyncConfig).controleProcessos.favoritos.itens.map((i) => i.numero)).toEqual(['A'])
  })

  it('se o processo já era favorito antes do agente, desfazer não remove nada', async () => {
    const syncSet = vi.fn()
    const contexto = { syncStore: { get: async () => comFavoritos(['A']), set: syncSet }, localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: vi.fn() } }
    await reverterAcao(acao({ numero: 'A', jaExistia: true }), contexto)
    expect(syncSet).not.toHaveBeenCalled()
  })

  it('ferramenta sem desfazer conhecido rejeita', async () => {
    const contexto = { syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: vi.fn() }, localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: vi.fn() } }
    await expect(reverterAcao({ ...acao(null), ferramenta: 'outra' }, contexto)).rejects.toThrow()
  })
})
