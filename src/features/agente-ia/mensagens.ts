// Formato de requisição/resposta da API Messages da Anthropic (POST /v1/messages, tool use).
// A chamada em si passa pelo background (mensagem 'seirmg:fetch-ia'); aqui só se monta o corpo
// e se interpreta a resposta -- funções puras.
import type { FerramentaAgenteDescricao } from './tools'
import type { UsoModeloAgenteIA } from '../../lib/storage'

export interface BlocoTexto {
  type: 'text'
  text: string
}

export interface BlocoToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface BlocoToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

// Qualquer outro bloco da resposta (thinking com signature, fallback, ...): o agente não
// interpreta, mas devolve exatamente como veio no histórico -- a API exige isso pra continuar um
// turno com ferramentas.
export interface BlocoOpaco {
  type: string
  [campo: string]: unknown
}

export type BlocoConteudo = BlocoTexto | BlocoToolUse | BlocoToolResult | BlocoOpaco

export function ehBlocoTexto(bloco: BlocoConteudo): bloco is BlocoTexto {
  return bloco.type === 'text' && typeof (bloco as BlocoTexto).text === 'string'
}

export function ehBlocoToolUse(bloco: BlocoConteudo): bloco is BlocoToolUse {
  return bloco.type === 'tool_use'
}

export interface MensagemAgente {
  role: 'user' | 'assistant'
  content: BlocoConteudo[]
}

export interface RequisicaoAgente {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

// Com thinking sempre ligado (Opus 5.5), o raciocínio sai do mesmo orçamento de max_tokens --
// 16000 dá folga sem precisar de streaming.
const MAX_TOKENS = 16000

// Em caso de recusa pelos classificadores de segurança, a própria API refaz o pedido num modelo
// alternativo (modo "default": a API escolhe pela categoria da recusa). Só nos modelos que aceitam.
const MODELOS_COM_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5'])
const BETA_FALLBACK = 'server-side-fallback-2026-07-01'

export function montarRequisicaoAgente(opcoes: {
  apiKey: string
  modelo: string
  systemPrompt: string
  ferramentas: FerramentaAgenteDescricao[]
  mensagens: MensagemAgente[]
}): RequisicaoAgente {
  const comFallback = MODELOS_COM_FALLBACK.has(opcoes.modelo)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': opcoes.apiKey,
    'anthropic-version': '2023-06-01',
  }
  if (comFallback) headers['anthropic-beta'] = BETA_FALLBACK

  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opcoes.modelo,
      max_tokens: MAX_TOKENS,
      // Cache automático do prefixo (system + ferramentas + histórico): cada turno reenvia a
      // conversa inteira, e a parte repetida sai a 10% do preço.
      cache_control: { type: 'ephemeral' },
      system: opcoes.systemPrompt,
      ...(opcoes.ferramentas.length > 0 && {
        tools: opcoes.ferramentas.map((f) => ({ name: f.id, description: f.descricao, input_schema: f.inputSchema })),
      }),
      messages: opcoes.mensagens,
      ...(comFallback && { fallbacks: 'default' }),
    }),
  }
}

export interface RespostaExtraida {
  blocos: BlocoConteudo[]
  stopReason: string
  // Modelo que de fato respondeu -- com fallback pode não ser o pedido; o custo é calculado por ele.
  modelo?: string
  uso: UsoModeloAgenteIA
}

interface RespostaApiAnthropic {
  model?: string
  content?: unknown
  stop_reason?: unknown
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export function extrairBlocos(corpoResposta: string): RespostaExtraida {
  const json = JSON.parse(corpoResposta) as RespostaApiAnthropic
  if (!Array.isArray(json.content) || typeof json.stop_reason !== 'string') {
    throw new Error('Resposta da API em formato inesperado (sem "content" ou "stop_reason").')
  }
  const uso: UsoModeloAgenteIA = { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 }
  if (json.usage?.cache_creation_input_tokens) uso.cacheCriacaoTokens = json.usage.cache_creation_input_tokens
  if (json.usage?.cache_read_input_tokens) uso.cacheLeituraTokens = json.usage.cache_read_input_tokens
  return {
    blocos: json.content as BlocoConteudo[],
    stopReason: json.stop_reason,
    ...(json.model && { modelo: json.model }),
    uso,
  }
}

// O relay do background só repassa o status HTTP (o corpo do erro se perde) -- explica os casos
// comuns em linguagem do usuário.
const EXPLICACAO_POR_STATUS: Record<string, string> = {
  '400': 'A API recusou o pedido como inválido (HTTP 400). Se persistir, comece uma conversa nova.',
  '401': 'Chave de API inválida ou ausente. Confira a chave do Claude nas Opções da extensão, aba Inteligência Artificial.',
  '403': 'A chave de API não tem permissão pra este modelo ou recurso (HTTP 403).',
  '404': 'Modelo não encontrado (HTTP 404). Escolha outro modelo nas Opções.',
  '413': 'A conversa ficou grande demais (HTTP 413). Comece uma conversa nova.',
  '429': 'Limite de uso da API atingido (HTTP 429). Espere um pouco e tente de novo.',
  '500': 'Erro interno na API da Anthropic (HTTP 500). Tente de novo em instantes.',
  '529': 'A API da Anthropic está sobrecarregada no momento (HTTP 529). Tente de novo em instantes.',
}

export function explicarErroApi(erro: string): string {
  if (erro === 'Timeout') return 'A resposta demorou demais e foi interrompida. Tente de novo ou peça algo mais curto.'
  const status = /^HTTP (\d{3})$/.exec(erro)?.[1]
  return (status && EXPLICACAO_POR_STATUS[status]) ?? `Falha ao chamar a API: ${erro}`
}
