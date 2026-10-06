// Catálogo de ferramentas do Agente de IA. Cada entrada vira uma ferramenta no formato de tool
// use da API Anthropic (montarRequisicaoAgente converte inputSchema -> input_schema). `escrita`
// decide o gate de aprovação (ver loop.ts): ferramenta de escrita nunca roda sem clique do usuário.
import { adicionarFavoritoSeNovo } from '../controle-processos/favoritos'
import { consultarBlocosAoVivo } from '../bloco-assinatura/consultarAoVivo'
import type { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

export interface FerramentaAgenteDescricao {
  id: string
  nome: string
  descricao: string
  escrita: boolean
  inputSchema: Record<string, unknown>
}

export interface ContextoFerramenta {
  syncStore: ReturnType<typeof createSyncConfigStore>
  localStore: ReturnType<typeof createLocalConfigStore>
}

const SEM_PARAMETROS = { type: 'object', properties: {}, additionalProperties: false }

const FERRAMENTAS: FerramentaAgenteDescricao[] = [
  {
    id: 'listar_processos_favoritos',
    nome: 'Listar processos favoritos',
    descricao: 'Lista os processos marcados como favoritos pelo usuário, com número e especificação.',
    escrita: false,
    inputSchema: SEM_PARAMETROS,
  },
  {
    id: 'listar_historico_visitados',
    nome: 'Listar processos visitados recentemente',
    descricao: 'Lista os últimos processos que o usuário abriu (processos sigilosos nunca entram nessa lista).',
    escrita: false,
    inputSchema: SEM_PARAMETROS,
  },
  {
    id: 'consultar_status_bloco_assinatura',
    nome: 'Consultar status do bloco de assinatura',
    descricao:
      'Informa quantos documentos estão pendentes de assinatura pra área do usuário. Precisa de uma aba do SEI aberta.',
    escrita: false,
    inputSchema: SEM_PARAMETROS,
  },
  {
    id: 'adicionar_favorito',
    nome: 'Adicionar processo aos favoritos',
    descricao: 'Marca um processo como favorito, pelo número do processo. Pede aprovação do usuário antes de gravar.',
    escrita: true,
    inputSchema: {
      type: 'object',
      properties: { numero: { type: 'string', description: 'Número do processo, no formato do SEI.' } },
      required: ['numero'],
      additionalProperties: false,
    },
  },
]

export function listarFerramentasAgente(): FerramentaAgenteDescricao[] {
  return FERRAMENTAS
}

export async function executarFerramenta(id: string, input: unknown, contexto: ContextoFerramenta): Promise<unknown> {
  if (id === 'listar_processos_favoritos') {
    const sync = await contexto.syncStore.get()
    return sync.controleProcessos.favoritos.itens.map((item) => ({ numero: item.numero, especificacao: item.especificacao }))
  }

  if (id === 'listar_historico_visitados') {
    const local = await contexto.localStore.get()
    return (local.historicoProcessosVisitados ?? []).map((item) => ({ numero: item.numero, tipo: item.tipo }))
  }

  if (id === 'consultar_status_bloco_assinatura') {
    const local = await contexto.localStore.get()
    if (!local.baseUrlSei) return { ok: false, motivo: 'Nenhuma sessão do SEI detectada nesta máquina ainda.' }
    const consulta = await consultarBlocosAoVivo(local.baseUrlSei)
    return consulta.ok
      ? { pendentes: consulta.total }
      : { ok: false, motivo: 'Não foi possível consultar o bloco de assinatura. Confira se há uma aba do SEI aberta e logada.' }
  }

  if (id === 'adicionar_favorito') {
    const numero = (input as { numero?: unknown } | null)?.numero
    if (typeof numero !== 'string' || !numero.trim()) throw new Error('Parâmetro "numero" é obrigatório.')
    const atual = await contexto.syncStore.get()
    const itens = atual.controleProcessos.favoritos.itens
    // jaExistia volta no resultado e vai pro histórico de desfazer: desfazer só remove o que o
    // agente de fato acrescentou.
    const jaExistia = itens.some((item) => item.numero === numero)
    if (!jaExistia) {
      const novosItens = adicionarFavoritoSeNovo(itens, { numero, link: null, adicionadoEm: new Date().toISOString() })
      await contexto.syncStore.set({
        ...atual,
        controleProcessos: { ...atual.controleProcessos, favoritos: { ...atual.controleProcessos.favoritos, itens: novosItens } },
      })
    }
    return { ok: true, numero, jaExistia }
  }

  throw new Error(`Ferramenta desconhecida: ${id}`)
}
