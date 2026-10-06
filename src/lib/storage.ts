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

export interface SnapshotFavorito {
  prazoDataTexto: string | null
  atribuicao: string | null
  marcadoresNomes: string[]
}

export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
  ultimoSnapshot?: SnapshotFavorito
  // Data (yyyy-mm-dd) em que o lembrete deve notificar. Ausente = sem lembrete.
  lembreteData?: string
  lembreteNota?: string
}

export interface FavoritoRemovido extends FavoritoProcesso {
  removidoEm: string
}

export interface SnapshotPrazoProcesso {
  numero: string
  especificacao?: string
  link: string | null
  prazoDataTexto: string
  vistoEm: string // ISO — informativo, não usado para expirar nada
}

export interface SnapshotAlteradoProcesso {
  numero: string
  especificacao?: string
  link: string | null
  vistoEm: string // ISO — informativo, não usado para expirar nada
}

export interface FavoritosConfig {
  ativo: boolean
  itens: FavoritoProcesso[]
}

export interface AlertaNaoAssinadosConfig {
  ativo: boolean
}

export interface KanbanLista {
  id: string
  nome: string
  ordem: number
  cor: string
}

export interface KanbanCardPosicao {
  numero: string
  listaId: string
}

export interface KanbanConfig {
  ativo: boolean
  listas: KanbanLista[]
  posicoes: KanbanCardPosicao[]
}

export interface HistoricoProcessoEntry {
  idProcedimento: string
  numero: string
  tipo: string
  acessadoEm: string
}

export interface HistoricoProcessosConfig {
  ativo: boolean
  // 0 = sem limite de quantidade.
  limiteItens: number
  // Entradas mais antigas que essa janela são podadas a cada nova visita. 0 = sem janela.
  janelaDias: number
}

export type TipoEventoHistorico = 'acesso' | 'enviado' | 'documento' | 'concluido'

export interface EventoHistorico {
  tipo: TipoEventoHistorico
  numero: string
  tipoProcesso?: string
  especificacao?: string
  ocorridoEm: string // ISO
}

export interface DashboardConfig {
  ativo: boolean
}

export interface FerramentasPdfConfig {
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
  kanban: KanbanConfig
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

export interface ReferenciaLinkConfig {
  ativo: boolean
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

// Agente de IA (features/agente-ia, página src/agente-ia/) -- só Claude, com a chave do usuário.
export interface SkillAgenteIA {
  id: string
  nome: string
  systemPrompt: string
  // ids de FerramentaAgenteDescricao.id (features/agente-ia/tools.ts) -- vazio = nenhuma
  // ferramenta liberada pra essa skill (só conversa).
  ferramentasPermitidas: string[]
}

export interface PassoFluxoAgenteIA {
  instrucao: string
}

export interface FluxoAgenteIA {
  id: string
  nome: string
  passos: PassoFluxoAgenteIA[]
}

// A chave e o modelo do Claude ficam em ferramentasIA.claude (uma chave só pra toda a parte de
// Inteligência Artificial) -- ler com lerCredenciaisClaude.
export interface AgenteIAConfig {
  ativo: boolean
  skillAtivaId: string
  skills: SkillAgenteIA[]
  fluxos: FluxoAgenteIA[]
}

export interface UsoModeloAgenteIA {
  inputTokens: number
  outputTokens: number
  // Prompt caching: gravar no cache e ler do cache têm preço próprio (ver features/agente-ia/custo.ts).
  cacheCriacaoTokens?: number
  cacheLeituraTokens?: number
}

export interface AgenteIAUsoAcumulado {
  porModelo: Record<string, UsoModeloAgenteIA>
}

export interface AcaoAgenteParaDesfazer {
  id: string
  descricao: string
  ferramenta: string
  estadoAnterior: unknown
  criadoEm: string
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
  referenciaLink: ReferenciaLinkConfig
  tarefas: TarefasConfig
  historicoProcessos: HistoricoProcessosConfig
  dashboard: DashboardConfig
  ferramentasPdf: FerramentasPdfConfig
  agenteIA: AgenteIAConfig
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
  historicoProcessosVisitados: HistoricoProcessoEntry[]
  historicoEventos: EventoHistorico[]
  snapshotPrazosProcessos: SnapshotPrazoProcesso[]
  snapshotAlteradosProcessos: SnapshotAlteradoProcesso[]
  // Último Estado conhecido de cada bloco (chave = número do bloco), usado só pela checagem
  // oportunista pra detectar transição pra "disponibilizado_para_area". Guardado como string crua
  // (não o tipo EstadoBloco) porque lib/storage.ts não importa de features/.
  blocoAssinaturaEstadosConhecidos: Record<string, string>
  blocoAssinaturaUltimaChecagemOportunista: string
  // Última data (yyyy-mm-dd) em que cada tarefa vencida já notificou -- no máximo 1x por dia por
  // tarefa (chave = Tarefa.id).
  tarefasNotificadas: NotificadoState
  // Última notificação de lembrete de cada favorito (chave = número do processo) -- no máximo 1x
  // por dia por favorito.
  favoritosLembretesNotificados: NotificadoState
  // Favoritos removidos recentemente, pra desfazer. Local (não sincroniza entre dispositivos).
  favoritosLixeira: FavoritoRemovido[]
  // Agente de IA: tokens gastos por modelo (custo exibido na página) e ações que dá pra desfazer.
  // Ausentes em localConfig salvo antes -- ler com ?? { porModelo: {} } / ?? [].
  agenteIAUsoAcumulado: AgenteIAUsoAcumulado
  agenteIAHistoricoDesfazer: AcaoAgenteParaDesfazer[]
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
  atribuicaoSelecionada?: string
  mostrarIndicadorConfiguracao?: boolean
  linkNeutroControleProcessos?: string
  ultimaNavegacaoRealSei?: string
  sessaoInvalidaAte?: string
  atalhoPublicacoesDisponivel?: boolean
  planka?: PlankaConfig
  // Preferência do usuário por manter a Visão Kanban ativa entre navegações (F5, sair e voltar
  // pro Controle de Processos) — sem isso, cada carregamento de página volta pra tabela nativa.
  kanbanVisaoAtiva?: boolean
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
    kanban: {
      ativo: false,
      listas: [],
      posicoes: [],
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
    claude: { apiKey: '', modelo: 'claude-opus-5-5' },
  },
  corretorOrtografico: {
    ativo: false,
    palavrasIgnoradas: [],
  },
  formatacaoBasica: {
    ativo: false,
    atalhos: [],
  },
  referenciaLink: {
    ativo: false,
  },
  tarefas: {
    ativo: false,
    itens: [],
  },
  historicoProcessos: {
    ativo: false,
    limiteItens: 50,
    janelaDias: 7,
  },
  dashboard: {
    ativo: false,
  },
  ferramentasPdf: {
    ativo: false,
  },
  agenteIA: {
    ativo: false,
    skillAtivaId: 'padrao',
    skills: [
      {
        id: 'padrao',
        nome: 'Padrão',
        systemPrompt:
          'Você é um assistente dentro do SEI (Sistema Eletrônico de Informações). Responda em português do Brasil, de forma objetiva.',
        ferramentasPermitidas: [],
      },
    ],
    fluxos: [],
  },
}

// config salvo antes do Agente de IA existir não tem `agenteIA` (o store não mescla defaults) --
// todo consumidor lê por aqui.
export function lerAgenteIAConfig(config: SyncConfig): AgenteIAConfig {
  const padrao = DEFAULT_SYNC_CONFIG.agenteIA
  const salvo = (config as Partial<SyncConfig>).agenteIA
  if (!salvo) return padrao
  return {
    ativo: salvo.ativo ?? padrao.ativo,
    skillAtivaId: salvo.skillAtivaId ?? padrao.skillAtivaId,
    skills: salvo.skills?.length ? salvo.skills : padrao.skills,
    fluxos: salvo.fluxos ?? [],
  }
}

// Chave e modelo do Claude, compartilhados pelo assistente do editor e pelo Agente de IA. Versões
// anteriores guardavam uma chave própria do agente (agenteIA.apiKey/modelo): ela ainda é usada
// enquanto a seção Claude estiver vazia, pra ninguém perder a configuração na atualização.
export function lerCredenciaisClaude(config: SyncConfig): ProvedorIAConfig {
  const claude = config.ferramentasIA?.claude ?? DEFAULT_SYNC_CONFIG.ferramentasIA.claude
  if (claude.apiKey) return { apiKey: claude.apiKey, modelo: claude.modelo || DEFAULT_SYNC_CONFIG.ferramentasIA.claude.modelo }
  const legado = (config as { agenteIA?: { apiKey?: string; modelo?: string } }).agenteIA
  if (legado?.apiKey) return { apiKey: legado.apiKey, modelo: legado.modelo || claude.modelo }
  return { apiKey: '', modelo: claude.modelo || DEFAULT_SYNC_CONFIG.ferramentasIA.claude.modelo }
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
  blocoAssinaturaEstadosConhecidos: {},
  blocoAssinaturaUltimaChecagemOportunista: '',
  tarefasNotificadas: {},
  favoritosLembretesNotificados: {},
  favoritosLixeira: [],
  agenteIAUsoAcumulado: { porModelo: {} },
  agenteIAHistoricoDesfazer: [],
  historicoProcessosVisitados: [],
  historicoEventos: [],
  snapshotPrazosProcessos: [],
  snapshotAlteradosProcessos: [],
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
