import { describe, expect, it } from 'vitest'
import {
  createLocalConfigStore,
  createSyncConfigStore,
  DEFAULT_LOCAL_CONFIG,
  DEFAULT_SYNC_CONFIG,
  lerAgenteIAConfig,
  lerCredenciaisClaude,
  type StorageArea,
  type SyncConfig,
} from './storage'

describe('lerAgenteIAConfig', () => {
  it('config antigo sem agenteIA devolve os padrões', () => {
    const antigo = { ...DEFAULT_SYNC_CONFIG } as Partial<SyncConfig>
    delete antigo.agenteIA
    expect(lerAgenteIAConfig(antigo as SyncConfig)).toEqual(DEFAULT_SYNC_CONFIG.agenteIA)
  })

  it('preserva o que foi salvo e completa campos ausentes', () => {
    const salvo = { ativo: true } as SyncConfig['agenteIA']
    const resultado = lerAgenteIAConfig({ ...DEFAULT_SYNC_CONFIG, agenteIA: salvo })
    expect(resultado).toMatchObject({ ativo: true, fluxos: [] })
    expect(resultado.skills).toEqual(DEFAULT_SYNC_CONFIG.agenteIA.skills)
  })
})

describe('lerCredenciaisClaude', () => {
  function comClaude(apiKey: string, modelo: string, agenteLegado?: Record<string, unknown>): SyncConfig {
    return {
      ...DEFAULT_SYNC_CONFIG,
      ferramentasIA: { ...DEFAULT_SYNC_CONFIG.ferramentasIA, claude: { apiKey, modelo } },
      ...(agenteLegado && { agenteIA: { ...DEFAULT_SYNC_CONFIG.agenteIA, ...agenteLegado } as SyncConfig['agenteIA'] }),
    }
  }

  it('uma chave e um modelo só, os da seção Claude da Inteligência Artificial', () => {
    expect(lerCredenciaisClaude(comClaude('sk-1', 'claude-sonnet-5-5'))).toEqual({ apiKey: 'sk-1', modelo: 'claude-sonnet-5-5' })
  })

  it('aproveita a chave colada na antiga aba do Agente de IA quando a seção Claude está vazia', () => {
    const config = comClaude('', 'claude-opus-5-5', { apiKey: 'sk-legado', modelo: 'claude-haiku-4-5' })
    expect(lerCredenciaisClaude(config)).toEqual({ apiKey: 'sk-legado', modelo: 'claude-haiku-4-5' })
  })

  it('a chave da seção Claude prevalece sobre a antiga do agente', () => {
    const config = comClaude('sk-novo', 'claude-opus-5-5', { apiKey: 'sk-legado', modelo: 'claude-haiku-4-5' })
    expect(lerCredenciaisClaude(config)).toEqual({ apiKey: 'sk-novo', modelo: 'claude-opus-5-5' })
  })

  it('modelo padrão do Claude é o atual (Opus 5.5)', () => {
    expect(DEFAULT_SYNC_CONFIG.ferramentasIA.claude.modelo).toBe('claude-opus-5-5')
  })
})

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

  it('inclui ocultarDocumentosAssinados desativado por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).featureFlags.ocultarDocumentosAssinados).toBe(false)
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

  it('inclui checagemOportunistaIntervaloMinutos desativado (0) por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinatura.checagemOportunistaIntervaloMinutos).toBe(0)
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
      kanban: { ativo: false, listas: [], posicoes: [] },
    })
  })

  it('inclui tarefas padrão (desativado, sem itens) quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).tarefas).toEqual({ ativo: false, itens: [] })
  })

  it('persiste alteração de tarefas.itens', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const tarefa = {
      id: '1',
      titulo: 'Analisar parecer',
      processo: '0021.334',
      vencimento: '2026-07-20',
      prioridade: 'alta' as const,
      concluido: false,
    }
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      tarefas: { ativo: true, itens: [tarefa] },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
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

  it('faz round-trip de controleProcessos.kanban', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const config = await store.get()
    const atualizado = {
      ...config,
      controleProcessos: {
        ...config.controleProcessos,
        kanban: {
          ativo: true,
          listas: [{ id: 'lista-1', nome: 'Em análise', ordem: 0, cor: '#017fff' }],
          posicoes: [{ numero: 'HMMG.2025.00001-1', listaId: 'lista-1' }],
        },
      },
    }
    await store.set(atualizado)
    const relido = await store.get()
    expect(relido.controleProcessos.kanban).toEqual(atualizado.controleProcessos.kanban)
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
      claude: { apiKey: '', modelo: 'claude-opus-5-5' },
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

  it('inclui blocoAssinaturaEstadosConhecidos vazio por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinaturaEstadosConhecidos).toEqual({})
  })

  it('persiste blocoAssinaturaEstadosConhecidos', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaEstadosConhecidos: { '123': 'disponibilizado_para_area' },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })

  it('inclui tarefasNotificadas vazio por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).tarefasNotificadas).toEqual({})
  })

  it('inclui blocoAssinaturaUltimaChecagemOportunista vazia por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinaturaUltimaChecagemOportunista).toBe('')
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

  it('DEFAULT_LOCAL_CONFIG inclui snapshotAlteradosProcessos vazio', () => {
    expect(DEFAULT_LOCAL_CONFIG.snapshotAlteradosProcessos).toEqual([])
  })
})
