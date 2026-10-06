// Motor do agente: o que fazer com cada resposta da API. Função pura -- a página (src/agente-ia/
// main.ts) só executa o que esta decisão manda.
import { ehBlocoTexto, ehBlocoToolUse, type BlocoConteudo, type MensagemAgente, type RespostaExtraida } from './mensagens'
import type { FerramentaAgenteDescricao } from './tools'

export interface ChamadaFerramenta {
  id: string
  name: string
  input: unknown
  escrita: boolean
  // false = o modelo pediu uma ferramenta que não está liberada pra skill ativa; a página
  // responde com erro (nunca ignora: todo tool_use precisa de um tool_result no próximo envio).
  conhecida: boolean
}

export type DecisaoLoop =
  | { tipo: 'fim' }
  | { tipo: 'continuar' }
  | { tipo: 'parar'; motivo: string }
  | { tipo: 'executar_leitura'; chamadas: ChamadaFerramenta[] }
  | { tipo: 'pedir_aprovacao'; chamadas: ChamadaFerramenta[] }

export function decidirProximoPasso(resposta: RespostaExtraida, ferramentas: FerramentaAgenteDescricao[]): DecisaoLoop {
  // Antes de olhar ferramentas: resposta recusada ou cortada não executa nada (um tool_use
  // cortado por max_tokens pode ter o input incompleto).
  if (resposta.stopReason === 'refusal') {
    return { tipo: 'parar', motivo: 'O modelo recusou este pedido pelas regras de segurança da Anthropic.' }
  }
  if (resposta.stopReason === 'max_tokens') {
    return { tipo: 'parar', motivo: 'A resposta ficou longa demais e foi cortada. Peça algo mais específico.' }
  }
  if (resposta.stopReason === 'pause_turn') return { tipo: 'continuar' }

  const toolUses = resposta.blocos.filter(ehBlocoToolUse)
  if (toolUses.length === 0) return { tipo: 'fim' }

  const porId = new Map(ferramentas.map((f) => [f.id, f]))
  const chamadas: ChamadaFerramenta[] = toolUses.map((bloco) => {
    const ferramenta = porId.get(bloco.name)
    return { id: bloco.id, name: bloco.name, input: bloco.input, escrita: ferramenta?.escrita ?? false, conhecida: !!ferramenta }
  })

  // Qualquer ferramenta de escrita no turno exige aprovação -- nunca executa a de escrita
  // "de carona" com as de leitura do mesmo turno.
  return chamadas.some((chamada) => chamada.escrita) ? { tipo: 'pedir_aprovacao', chamadas } : { tipo: 'executar_leitura', chamadas }
}

export interface ResultadoChamada {
  id: string
  conteudo: string
  erro?: boolean
}

// A API exige um tool_result pra cada tool_use do turno, todos na mesma mensagem.
export function montarMensagemResultados(resultados: ResultadoChamada[]): MensagemAgente {
  return {
    role: 'user',
    content: resultados.map((resultado) => ({
      type: 'tool_result' as const,
      tool_use_id: resultado.id,
      content: resultado.conteudo,
      ...(resultado.erro && { is_error: true }),
    })),
  }
}

// Depois de uma parada ('parar'), o histórico precisa continuar aceito pela API na próxima mensagem:
// - recusa: volta pra antes da mensagem recusada (reenviar o pedido tende a ser recusado de novo,
//   e a resposta pode vir sem conteúdo -- assistente vazio é rejeitado pela API);
// - max_tokens: um tool_use cortado não tem tool_result possível, e turno vazio é inválido --
//   descarta só o turno do assistente; texto cortado fica como contexto.
export function historicoAposParada(historico: MensagemAgente[], tamanhoAntesDaMensagem: number, stopReason: string): MensagemAgente[] {
  if (stopReason === 'refusal') return historico.slice(0, tamanhoAntesDaMensagem)
  const ultima = historico[historico.length - 1]
  if (ultima?.role === 'assistant' && (ultima.content.length === 0 || ultima.content.some(ehBlocoToolUse))) {
    return historico.slice(0, -1)
  }
  return historico
}

export function textoDaResposta(blocos: BlocoConteudo[]): string {
  return blocos
    .filter(ehBlocoTexto)
    .map((bloco) => bloco.text)
    .join('\n')
}
