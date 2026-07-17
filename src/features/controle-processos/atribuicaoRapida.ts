export interface OpcaoAtribuicao {
  id: string
  nome: string
}

const ROTULO_NINGUEM = 'Ninguém (remover atribuição)'

// #selAtribuicao é um <select> nativo no HTML bruto do servidor (mesma confirmação já feita pro
// #selMarcador em marcadorRapido.ts). A opção value="null" NÃO é um placeholder de "nada
// escolhido" -- é uma opção real e válida ("atribuir a ninguém" / desatribuir, confirmado pelo
// usuário: um processo só pode estar atribuído a uma pessoa por vez), por isso é incluída aqui,
// só com um rótulo mais claro que o "&nbsp;" original.
export function parseOpcoesAtribuicao(doc: Document): OpcaoAtribuicao[] {
  const opcoes = Array.from(doc.querySelectorAll<HTMLOptionElement>('#selAtribuicao option'))
  return opcoes
    .filter((opcao) => opcao.value !== '')
    .map((opcao) => ({
      id: opcao.value,
      nome: opcao.value === 'null' ? ROTULO_NINGUEM : opcao.textContent?.trim() ?? '',
    }))
}

export function parseFormularioAtribuicao(
  doc: Document
): { actionUrl: string; campos: Record<string, string> } | null {
  const form = doc.getElementById('frmAtividadeAtribuir')
  if (!form) return null

  const campos: Record<string, string> = {}
  Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).forEach((input) => {
    if (input.name) campos[input.name] = input.value
  })

  return { actionUrl: form.getAttribute('action') ?? '', campos }
}

export function montarCorpoConfirmacaoAtribuicao(
  campos: Record<string, string>,
  pessoaEscolhida: string,
  botao: { nome: string; valor: string }
): URLSearchParams {
  const corpo: Record<string, string> = { ...campos, selAtribuicao: pessoaEscolhida }
  corpo[botao.nome] = botao.valor
  return new URLSearchParams(corpo)
}
