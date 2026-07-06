export function idPainelParaAba(aba: string): string {
  return `painel-${aba}`
}

export function ativarAba(
  botoes: NodeListOf<Element>,
  paineis: NodeListOf<Element>,
  abaAlvo: string
): void {
  botoes.forEach((botao) => {
    botao.classList.toggle('ativa', botao.getAttribute('data-aba') === abaAlvo)
  })
  paineis.forEach((painel) => {
    painel.classList.toggle('ativo', painel.id === idPainelParaAba(abaAlvo))
  })
}
