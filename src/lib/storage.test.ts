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

  it('inclui controleProcessos padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).controleProcessos).toEqual({
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alerta: 10,
        critico: 5,
      },
      coresProcesso: { ativo: true, regras: [] },
      especificacao: { ativo: true, modo: 'mostrar' },
      rolagemInfinita: { ativo: false },
      agrupamento: { criterio: 'nenhum' },
      favoritos: { ativo: false, itens: [] },
      alertaNaoAssinados: { ativo: true },
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

  it('persiste alteração de controleProcessos.rolagemInfinita', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        rolagemInfinita: { ativo: true },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('persiste alteração de controleProcessos.agrupamento', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        agrupamento: { criterio: 'marcador' as const },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('persiste alteração de controleProcessos.favoritos', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        favoritos: {
          ativo: true,
          itens: [
            { numero: 'HMMG.2025.00001-1', link: 'controlador.php?acao=x', adicionadoEm: '2026-07-10T10:00:00.000Z' },
          ],
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

  it('inclui documentoExterno padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).documentoExterno).toEqual({
      ativo: true,
      formato: 'N',
      tipoConferencia: '',
      nivelAcesso: 'P',
      hipoteseLegal: '',
      tipoDocumentoPadraoArrastar: 'Anexo',
    })
  })

  it('persiste alteração de documentoExterno', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      documentoExterno: {
        ativo: false,
        formato: 'D' as const,
        tipoConferencia: 'Cópia Simples',
        nivelAcesso: 'R' as const,
        hipoteseLegal: '1',
        tipoDocumentoPadraoArrastar: 'Ofício',
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui ferramentasIA padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).ferramentasIA).toEqual({
      ativo: false,
      provedorAtivo: 'openai',
      openai: { apiKey: '', modelo: 'gpt-4o-mini' },
      gemini: { apiKey: '', modelo: 'gemini-2.0-flash' },
      claude: { apiKey: '', modelo: 'claude-3-5-haiku-20241022' },
    })
  })

  it('persiste alteração de ferramentasIA', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      ferramentasIA: {
        ativo: true,
        provedorAtivo: 'claude' as const,
        openai: { apiKey: 'sk-teste', modelo: 'gpt-4o-mini' },
        gemini: { apiKey: '', modelo: 'gemini-2.0-flash' },
        claude: { apiKey: 'sk-ant-teste', modelo: 'claude-3-5-haiku-20241022' },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui corretorOrtografico desativado por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    const config = await store.get()
    expect(config.corretorOrtografico.ativo).toBe(false)
    expect(config.corretorOrtografico.palavrasIgnoradas).toEqual([])
  })

  it('persiste alteração de corretorOrtografico', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const config = await store.get()
    const atualizado = {
      ...config,
      corretorOrtografico: { ativo: true, palavrasIgnoradas: ['SEIRMG'] },
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

  it('persiste blocoAssinaturaPendenteAtual', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaPendenteAtual: ['abc', 'def'],
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })


  it('persiste mostrarIndicadorConfiguracao e linkNeutroControleProcessos', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      mostrarIndicadorConfiguracao: true,
      linkNeutroControleProcessos: 'controlador.php?acao=procedimento_controlar&x=1',
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

  it('persiste planka', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      planka: {
        urlCadastro: 'https://n8n.exemplo.com/form/abc123',
        urlLogin: 'https://n8n.exemplo.com/webhook/seirmg-login',
        urlConsulta: 'https://n8n.exemplo.com/webhook/seirmg-consultar-processo',
        urlVerificarLote: 'https://n8n.exemplo.com/webhook/seirmg-verificar-processos-lote',
        email: 'usuario@exemplo.com',
        token: 'aaa.bbb.ccc',
        tokenExp: 1799999999,
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
})
