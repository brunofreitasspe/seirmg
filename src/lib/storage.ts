export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
  desabilitarDocumentosAssinados: boolean
  ocultarDocumentosAssinados: boolean
}

export type ThemePreset = 'claro' | 'black' | 'super-black' | 'custom'

export interface ThemeConfig {
  preset: ThemePreset
  customColor?: string
}

export interface BlocoAssinaturaConfig {
  ativo: boolean
  tocarSom: boolean
  lembreteIntervaloMinutos: number
  // Cargos que, se já aparecerem na coluna "Assinaturas" de um documento, também
  // contam como "já assinado" pra fins de desabilitar o checkbox — além da
  // assinatura do próprio usuário logado (featureFlags.desabilitarDocumentosAssinados).
  cargosAdicionais: string[]
  // Checagem oportunista (0 = desativado): dispara no máximo 1x a cada N minutos, como efeito
  // colateral de uma navegação real do usuário (não um alarme autônomo) -- ver spec
  // 2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md pro histórico de por que
  // um alarme autônomo não é uma opção aqui (2 tentativas anteriores causaram deslogamento real).
  checagemOportunistaIntervaloMinutos: number
}

export interface ConfiguracaoCor {
  valor: string
  cor: string
  [chave: string]: string
}

export interface PrazosConfig {
  ativo: boolean
  exibirDias: boolean
  exibirPrazo: boolean
  alerta: number
  critico: number
}

export interface CoresProcessoConfig {
  ativo: boolean
  regras: ConfiguracaoCor[]
}

export type ModoEspecificacao = 'mostrar' | 'substituir'

export interface EspecificacaoConfig {
  ativo: boolean
  modo: ModoEspecificacao
}

export interface RolagemInfinitaConfig {
  ativo: boolean
}

export type CriterioAgrupamento = 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'

export interface AgrupamentoConfig {
  criterio: CriterioAgrupamento
}

export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
}

export interface FavoritosConfig {
  ativo: boolean
  itens: FavoritoProcesso[]
}

export interface AlertaNaoAssinadosConfig {
  ativo: boolean
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
  favoritos: FavoritosConfig
  alertaNaoAssinados: AlertaNaoAssinadosConfig
}

export interface ConfiguracaoPontoControle {
  nome: string
  cor: string
  filter: string
}

export interface PontoControleConfig {
  ativo: boolean
  regras: ConfiguracaoPontoControle[]
}

export type FormatoDocumento = 'N' | 'D'
export type NivelAcessoDocumento = 'P' | 'R' | 'S'

export interface DocumentoExternoConfig {
  ativo: boolean
  formato: FormatoDocumento
  tipoConferencia: string
  nivelAcesso: NivelAcessoDocumento
  hipoteseLegal: string
  tipoDocumentoPadraoArrastar: string
}

export type ProvedorIA = 'openai' | 'gemini' | 'claude'

export interface ProvedorIAConfig {
  apiKey: string
  modelo: string
}

export interface FerramentasIAConfig {
  ativo: boolean
  provedorAtivo: ProvedorIA
  openai: ProvedorIAConfig
  gemini: ProvedorIAConfig
  claude: ProvedorIAConfig
}

export interface CorretorOrtograficoConfig {
  ativo: boolean
  palavrasIgnoradas: string[]
}

export interface AtalhoParagrafo {
  tecla: string
  classe: string
  rotulo: string
}

export interface FormatacaoBasicaConfig {
  ativo: boolean
  atalhos: AtalhoParagrafo[]
}

export type PrioridadeTarefa = 'baixa' | 'media' | 'alta'

export interface Tarefa {
  id: string
  titulo: string
  processo: string
  vencimento: string // ISO date (yyyy-mm-dd) ou '' quando sem prazo
  prioridade: PrioridadeTarefa
  concluido: boolean
  concluidoEm?: string // ISO datetime, só presente depois de marcar como concluída
  // true em tarefas trazidas por importação -- título/processo/vencimento ficam somente-leitura
  // na UI (mesmo comportamento do plugin original, pra evitar editar por engano dados de origem
  // quando a exportação veio de outra pessoa).
  bloqueada?: boolean
}

export interface TarefasConfig {
  ativo: boolean
  itens: Tarefa[]
}

export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
  documentoExterno: DocumentoExternoConfig
  ferramentasIA: FerramentasIAConfig
  corretorOrtografico: CorretorOrtograficoConfig
  formatacaoBasica: FormatacaoBasicaConfig
  tarefas: TarefasConfig
}

export interface NotificadoState {
  [itemId: string]: { notificadoEm: string }
}

export interface PlankaConfig {
  urlCadastro?: string
  urlLogin?: string
  urlConsulta?: string
  urlVerificarLote?: string
  email?: string
  token?: string
  tokenExp?: number
}

export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  // Último Estado conhecido de cada bloco (chave = número do bloco), usado só pela checagem
  // oportunista pra detectar transição pra "disponibilizado_para_area". Guardado como string crua
  // (não o tipo EstadoBloco) porque lib/storage.ts não importa de features/.
  blocoAssinaturaEstadosConhecidos: Record<string, string>
  blocoAssinaturaUltimaChecagemOportunista: string
  // Última data (yyyy-mm-dd) em que cada tarefa vencida já notificou -- no máximo 1x por dia por
  // tarefa (chave = Tarefa.id).
  tarefasNotificadas: NotificadoState
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
  atribuicaoSelecionada?: string
  mostrarIndicadorConfiguracao?: boolean
  linkNeutroControleProcessos?: string
  ultimaNavegacaoRealSei?: string
  sessaoInvalidaAte?: string
  atalhoPublicacoesDisponivel?: boolean
  planka?: PlankaConfig
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  schemaVersion: 1,
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
    selecaoEmMassaBlocoAssinatura: true,
    desabilitarDocumentosAssinados: true,
    ocultarDocumentosAssinados: false,
  },
  tema: { preset: 'claro' },
  blocoAssinatura: {
    ativo: true,
    tocarSom: true,
    lembreteIntervaloMinutos: 0,
    cargosAdicionais: [],
    checagemOportunistaIntervaloMinutos: 0,
  },
  controleProcessos: {
    prazos: {
      ativo: true,
      exibirDias: true,
      exibirPrazo: true,
      alerta: 10,
      critico: 5,
    },
    coresProcesso: {
      ativo: true,
      regras: [],
    },
    especificacao: {
      ativo: true,
      modo: 'mostrar',
    },
    rolagemInfinita: {
      ativo: false,
    },
    agrupamento: {
      criterio: 'nenhum',
    },
    favoritos: {
      ativo: false,
      itens: [],
    },
    alertaNaoAssinados: {
      ativo: true,
    },
  },
  pontoControle: {
    ativo: true,
    regras: [],
  },
  documentoExterno: {
    ativo: true,
    formato: 'N',
    tipoConferencia: '',
    nivelAcesso: 'P',
    hipoteseLegal: '',
    tipoDocumentoPadraoArrastar: 'Anexo',
  },
  ferramentasIA: {
    ativo: false,
    provedorAtivo: 'openai',
    openai: { apiKey: '', modelo: 'gpt-4o-mini' },
    gemini: { apiKey: '', modelo: 'gemini-2.0-flash' },
    claude: { apiKey: '', modelo: 'claude-3-5-haiku-20241022' },
  },
  corretorOrtografico: {
    ativo: false,
    palavrasIgnoradas: [],
  },
  formatacaoBasica: {
    ativo: false,
    atalhos: [],
  },
  tarefas: {
    ativo: false,
    itens: [],
  },
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
  blocoAssinaturaEstadosConhecidos: {},
  blocoAssinaturaUltimaChecagemOportunista: '',
  tarefasNotificadas: {},
}

export interface StorageArea {
  get<T>(keys: string | string[] | null): Promise<Record<string, T>>
  set(items: Record<string, unknown>): Promise<void>
}

function wrapChromeStorageArea(area: chrome.storage.StorageArea): StorageArea {
  return {
    get<T>(keys: string | string[] | null) {
      return new Promise<Record<string, T>>((resolve) => {
        area.get(keys, (result) => resolve(result as Record<string, T>))
      })
    },
    set(items: Record<string, unknown>) {
      return new Promise((resolve) => {
        area.set(items, () => resolve())
      })
    },
  }
}

export function createSyncConfigStore(area?: StorageArea) {
  const storageArea = area ?? wrapChromeStorageArea(chrome.storage.sync)
  return {
    async get(): Promise<SyncConfig> {
      const result = await storageArea.get<SyncConfig>('config')
      return result.config ?? DEFAULT_SYNC_CONFIG
    },
    async set(config: SyncConfig): Promise<void> {
      await storageArea.set({ config })
    },
  }
}

export function createLocalConfigStore(area?: StorageArea) {
  const storageArea = area ?? wrapChromeStorageArea(chrome.storage.local)
  return {
    async get(): Promise<LocalConfig> {
      const result = await storageArea.get<LocalConfig>('localConfig')
      return result.localConfig ?? DEFAULT_LOCAL_CONFIG
    },
    async set(config: LocalConfig): Promise<void> {
      await storageArea.set({ localConfig: config })
    },
  }
}
