export function ehLinkConcluirIndividual(onclick: string | null | undefined): boolean {
  return !!onclick && /concluirProcesso\s*\(/.test(onclick)
}

export function ehLinkConcluirEmLote(onclick: string | null | undefined): boolean {
  return !!onclick && onclick.includes('acao=procedimento_concluir')
}
