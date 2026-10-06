import { describe, it, expect } from 'vitest'
import { decidirProximoPasso, montarMensagemResultados, textoDaResposta } from './loop'
import type { FerramentaAgenteDescricao } from './tools'
import type { BlocoConteudo, RespostaExtraida } from './mensagens'

const ferramentas: FerramentaAgenteDescricao[] = [
  { id: 'leitura_x', nome: 'X', descricao: '', escrita: false, inputSchema: {} },
  { id: 'escrita_y', nome: 'Y', descricao: '', escrita: true, inputSchema: {} },
]

function resposta(blocos: BlocoConteudo[], stopReason = 'tool_use'): RespostaExtraida {
  return { blocos, stopReason, uso: { inputTokens: 0, outputTokens: 0 } }
}

describe('decidirProximoPasso', () => {
  it('stop_reason end_turn sem ferramenta -> fim', () => {
    expect(decidirProximoPasso(resposta([{ type: 'text', text: 'Oi' }], 'end_turn'), ferramentas)).toEqual({ tipo: 'fim' })
  })

  it('tool_use de ferramenta de leitura -> executar automaticamente', () => {
    const decisao = decidirProximoPasso(resposta([{ type: 'tool_use', id: '1', name: 'leitura_x', input: {} }]), ferramentas)
    expect(decisao).toEqual({
      tipo: 'executar_leitura',
      chamadas: [{ id: '1', name: 'leitura_x', input: {}, escrita: false, conhecida: true }],
    })
  })

  it('tool_use de ferramenta de escrita -> pedir aprovação', () => {
    const decisao = decidirProximoPasso(resposta([{ type: 'tool_use', id: '2', name: 'escrita_y', input: { numero: '1' } }]), ferramentas)
    expect(decisao).toEqual({
      tipo: 'pedir_aprovacao',
      chamadas: [{ id: '2', name: 'escrita_y', input: { numero: '1' }, escrita: true, conhecida: true }],
    })
  })

  it('mistura leitura e escrita no mesmo turno -> pedir aprovação, com todas as chamadas (cada uma marcada)', () => {
    const decisao = decidirProximoPasso(
      resposta([
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'tool_use', id: '1', name: 'leitura_x', input: {} },
        { type: 'tool_use', id: '2', name: 'escrita_y', input: {} },
      ]),
      ferramentas
    )
    expect(decisao.tipo).toBe('pedir_aprovacao')
    if (decisao.tipo !== 'pedir_aprovacao') return
    expect(decisao.chamadas.map((c) => [c.id, c.escrita])).toEqual([
      ['1', false],
      ['2', true],
    ])
  })

  it('ferramenta desconhecida não é ignorada: vira chamada marcada como desconhecida (responde com erro)', () => {
    const decisao = decidirProximoPasso(resposta([{ type: 'tool_use', id: '1', name: 'nao_existe', input: {} }]), ferramentas)
    expect(decisao).toEqual({
      tipo: 'executar_leitura',
      chamadas: [{ id: '1', name: 'nao_existe', input: {}, escrita: false, conhecida: false }],
    })
  })

  it('recusa -> parar, sem executar ferramenta nenhuma', () => {
    const decisao = decidirProximoPasso(resposta([{ type: 'tool_use', id: '2', name: 'escrita_y', input: {} }], 'refusal'), ferramentas)
    expect(decisao).toEqual({ tipo: 'parar', motivo: expect.stringMatching(/recusou/) })
  })

  it('resposta cortada por max_tokens -> parar (o tool_use pode estar incompleto)', () => {
    const decisao = decidirProximoPasso(resposta([{ type: 'tool_use', id: '1', name: 'leitura_x', input: {} }], 'max_tokens'), ferramentas)
    expect(decisao).toEqual({ tipo: 'parar', motivo: expect.stringMatching(/cortada/) })
  })

  it('pause_turn -> continuar (reenviar pra API terminar o turno)', () => {
    expect(decidirProximoPasso(resposta([{ type: 'text', text: '...' }], 'pause_turn'), ferramentas)).toEqual({ tipo: 'continuar' })
  })
})

describe('montarMensagemResultados', () => {
  it('junta todos os resultados do turno numa única mensagem do usuário, na ordem das chamadas', () => {
    expect(
      montarMensagemResultados([
        { id: '1', conteudo: '[1,2]' },
        { id: '2', conteudo: 'Usuário recusou executar esta ação.', erro: true },
      ])
    ).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: '1', content: '[1,2]' },
        { type: 'tool_result', tool_use_id: '2', content: 'Usuário recusou executar esta ação.', is_error: true },
      ],
    })
  })
})

describe('textoDaResposta', () => {
  it('junta só os blocos de texto', () => {
    expect(textoDaResposta([{ type: 'thinking', thinking: '' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
  })
})
