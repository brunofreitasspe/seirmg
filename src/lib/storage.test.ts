import { describe, expect, it } from 'vitest'
import {
  createLocalConfigStore,
  createSyncConfigStore,
  DEFAULT_LOCAL_CONFIG,
  DEFAULT_SYNC_CONFIG,
  type StorageArea,
} from './storage'

function criarAreaFalsa(): StorageArea {
  const dados = new Map<string, unknown>()
  return {
    async get<T>(keys: string | string[] | null) {
      const chaves = keys === null ? Array.from(dados.keys()) : Array.isArray(keys) ? keys : [keys]
      const resultado: Record<string, T> = {}
      chaves.forEach((chave) => {
        if (dados.has(chave)) resultado[chave] = dados.get(chave) as T
      })
      return resultado
    },
    async set(items: Record<string, unknown>) {
      Object.entries(items).forEach(([chave, valor]) => dados.set(chave, valor))
    },
  }
}

describe('createSyncConfigStore', () => {
  it('retorna a configuração padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect(await store.get()).toEqual(DEFAULT_SYNC_CONFIG)
  })

  it('persiste e recupera alterações', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = { ...DEFAULT_SYNC_CONFIG, tema: { preset: 'black' as const } }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui processosNovos padrão (ativo, 5 min, som) quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).processosNovos).toEqual({ ativo: true, intervaloMinutos: 5, tocarSom: true })
  })

  it('inclui selecaoEmMassaBlocoAssinatura ativo por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).featureFlags.selecaoEmMassaBlocoAssinatura).toBe(true)
  })

  it('persiste alteração de featureFlags.selecaoEmMassaBlocoAssinatura', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      featureFlags: { ...DEFAULT_SYNC_CONFIG.featureFlags, selecaoEmMassaBlocoAssinatura: false },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('persiste e recupera alterações de processosNovos', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      processosNovos: { ativo: false, intervaloMinutos: 10, tocarSom: false },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui controleProcessos padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).controleProcessos).toEqual({
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alertaDias: 30,
        criticoDias: 60,
        alertaPrazo: 10,
        criticoPrazo: 5,
      },
      coresProcesso: { ativo: true, regras: [] },
      especificacao: { ativo: true, modo: 'mostrar' },
    })
  })

  it('persiste alteração de controleProcessos', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        coresProcesso: {
          ativo: false,
          regras: [{ valor: 'orçamento', cor: '#ff0000' }],
        },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui pontoControle padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).pontoControle).toEqual({ ativo: true, regras: [] })
  })

  it('persiste alteração de pontoControle', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      pontoControle: {
        ativo: false,
        regras: [{ nome: 'Concluído', cor: '#00ff00', filter: 'filter: invert(1);' }],
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
})

describe('createLocalConfigStore', () => {
  it('retorna a configuração padrão quando vazio', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect(await store.get()).toEqual(DEFAULT_LOCAL_CONFIG)
  })

  it('persiste o estado de itens já notificados', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaNotificado: { abc: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui blocoAssinaturaPendenteAtual vazio por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinaturaPendenteAtual).toEqual([])
  })

  it('persiste blocoAssinaturaPendenteAtual e ultimaVerificacaoImediata', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaPendenteAtual: ['abc', 'def'],
      ultimaVerificacaoImediata: '2026-07-06T10:00:00.000Z',
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui processosNovosBadgeCount zero por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).processosNovosBadgeCount).toBe(0)
  })

  it('persiste processosNovosNotificado e processosNovosBadgeCount', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      processosNovosNotificado: { p1: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
      processosNovosBadgeCount: 3,
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('persiste atribuicaoSelecionada', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = { ...DEFAULT_LOCAL_CONFIG, atribuicaoSelecionada: 'joao.silva' }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
})
