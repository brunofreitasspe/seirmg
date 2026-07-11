export type TipoPromptPronto = 'resumir' | 'revisar' | 'formal'

const INSTRUCOES_PRONTAS: Record<TipoPromptPronto, string> = {
  resumir: 'Resuma o seguinte trecho de forma clara e objetiva:',
  revisar: 'Revise o seguinte trecho, corrigindo erros de português e clareza, sem mudar o sentido:',
  formal: 'Reescreva o seguinte trecho num tom mais formal, adequado a um documento oficial:',
}

export function montarPromptPronto(tipo: TipoPromptPronto, textoSelecionado: string): string {
  return `${INSTRUCOES_PRONTAS[tipo]}\n\n${textoSelecionado}`
}

export function montarPromptComContexto(instrucaoOuPergunta: string, textoSelecionado: string | null): string {
  if (!textoSelecionado) return instrucaoOuPergunta
  return `Com base neste trecho:\n\n${textoSelecionado}\n\n${instrucaoOuPergunta}`
}
