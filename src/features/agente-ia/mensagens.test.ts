import { describe, it, expect } from 'vitest'
import { montarRequisicaoAgente, extrairBlocos, explicarErroApi, type MensagemAgente } from './mensagens'
import type { FerramentaAgenteDescricao } from './tools'

const ferramenta: FerramentaAgenteDescricao = {
  id: 'ferramenta_x',
  nome: 'X',
  descricao: 'faz X',
  escrita: false,
  inputSchema: { type: 'object', properties: {} },
}
const mensagens: MensagemAgente[] = [{ role: 'user', content: [{ type: 'text', text: 'Olá' }] }]

describe('montarRequisicaoAgente', () => {
  it('monta o corpo com system, tools, messages e cache automático no formato da API Anthropic', () => {
    const requisicao = montarRequisicaoAgente({
      apiKey: 'sk-ant-teste',
      modelo: 'claude-haiku-4-5',
      systemPrompt: 'Você é um assistente.',
      ferramentas: [ferramenta],
      mensagens,
    })

    expect(requisicao.url).toBe('https://api.anthropic.com/v1/messages')
    expect(requisicao.headers['x-api-key']).toBe('sk-ant-teste')
    expect(requisicao.headers['anthropic-version']).toBe('2023-06-01')
    const corpo = JSON.parse(requisicao.body)
    expect(corpo.model).toBe('claude-haiku-4-5')
    expect(corpo.max_tokens).toBe(16000)
    expect(corpo.system).toBe('Você é um assistente.')
    expect(corpo.cache_control).toEqual({ type: 'ephemeral' })
    expect(corpo.tools).toEqual([{ name: 'ferramenta_x', description: 'faz X', input_schema: { type: 'object', properties: {} } }])
    expect(corpo.messages).toEqual(mensagens)
  })

  it('sem ferramentas liberadas não manda o campo tools', () => {
    const corpo = JSON.parse(
      montarRequisicaoAgente({ apiKey: 'k', modelo: 'claude-haiku-4-5', systemPrompt: 's', ferramentas: [], mensagens }).body
    )
    expect(corpo).not.toHaveProperty('tools')
  })

  it('Opus 5.5 e Sonnet 5.5 pedem fallback automático em caso de recusa (beta server-side-fallback)', () => {
    for (const modelo of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
      const requisicao = montarRequisicaoAgente({ apiKey: 'k', modelo, systemPrompt: 's', ferramentas: [], mensagens })
      expect(requisicao.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01')
      expect(JSON.parse(requisicao.body).fallbacks).toBe('default')
    }
  })

  it('outros modelos não mandam fallback', () => {
    const requisicao = montarRequisicaoAgente({ apiKey: 'k', modelo: 'claude-haiku-4-5', systemPrompt: 's', ferramentas: [], mensagens })
    expect(requisicao.headers).not.toHaveProperty('anthropic-beta')
    expect(JSON.parse(requisicao.body)).not.toHaveProperty('fallbacks')
  })
})

describe('extrairBlocos', () => {
  it('extrai texto, stop_reason, modelo que respondeu e uso de tokens (inclusive cache)', () => {
    const resposta = JSON.stringify({
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: 'Oi!' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 3, cache_creation_input_tokens: 5, cache_read_input_tokens: 7 },
    })
    expect(extrairBlocos(resposta)).toEqual({
      blocos: [{ type: 'text', text: 'Oi!' }],
      stopReason: 'end_turn',
      modelo: 'claude-opus-5-5',
      uso: { inputTokens: 10, outputTokens: 3, cacheCriacaoTokens: 5, cacheLeituraTokens: 7 },
    })
  })

  it('extrai bloco de tool_use', () => {
    const resposta = JSON.stringify({
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'adicionar_favorito', input: { numero: '123' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 20 },
    })
    expect(extrairBlocos(resposta).blocos).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'adicionar_favorito', input: { numero: '123' } }])
  })

  // Blocos de thinking (com signature) e de fallback precisam voltar intactos no histórico --
  // reenviar alterado ou sem eles quebra a continuação do turno.
  it('preserva intactos blocos que o agente não interpreta (thinking, fallback)', () => {
    const thinking = { type: 'thinking', thinking: '', signature: 'abc==' }
    const fallback = { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } }
    const resposta = JSON.stringify({ content: [thinking, fallback, { type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: {} })
    expect(extrairBlocos(resposta).blocos).toEqual([thinking, fallback, { type: 'text', text: 'ok' }])
  })

  it('resposta malformada lança erro claro em vez de devolver undefined silencioso', () => {
    expect(() => extrairBlocos('não é json')).toThrow()
    expect(() => extrairBlocos(JSON.stringify({ type: 'error' }))).toThrow(/formato inesperado/)
  })
})

describe('explicarErroApi', () => {
  it('traduz os status mais comuns da API pra uma explicação ao usuário', () => {
    expect(explicarErroApi('HTTP 401')).toMatch(/chave/i)
    expect(explicarErroApi('HTTP 429')).toMatch(/limite/i)
    expect(explicarErroApi('HTTP 529')).toMatch(/sobrecarregada/i)
    expect(explicarErroApi('Timeout')).toMatch(/demorou/i)
  })

  it('erro desconhecido devolve o texto original', () => {
    expect(explicarErroApi('algo estranho')).toContain('algo estranho')
  })
})
