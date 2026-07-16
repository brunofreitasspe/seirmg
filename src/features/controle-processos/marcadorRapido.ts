export function extrairUrlDeOnclick(onclick: string): string | null {
  const match = onclick.match(/'([^']*)'/)
  return match ? match[1] : null
}

export interface OpcaoMarcador {
  id: string
  nome: string
  icone: string
}

export function parseOpcoesMarcador(doc: Document): OpcaoMarcador[] {
  const opcoes = Array.from(doc.querySelectorAll('#selMarcador .dd-options .dd-option'))
  return opcoes
    .map((opcao) => ({
      id: opcao.querySelector<HTMLInputElement>('.dd-option-value')?.value ?? '',
      nome: opcao.querySelector('.dd-option-text')?.textContent?.trim() ?? '',
      icone: opcao.querySelector<HTMLImageElement>('.dd-option-image')?.getAttribute('src') ?? '',
    }))
    .filter((opcao) => opcao.id !== '' && opcao.id !== 'null')
}

export function parseFormularioMarcador(
  doc: Document,
  idFormulario: string
): { actionUrl: string; campos: Record<string, string> } | null {
  const form = doc.getElementById(idFormulario)
  if (!form) return null

  const campos: Record<string, string> = {}
  Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).forEach((input) => {
    if (input.name) campos[input.name] = input.value
  })

  return { actionUrl: form.getAttribute('action') ?? '', campos }
}

export function montarCorpoConfirmacao(
  campos: Record<string, string>,
  marcadorEscolhido: string,
  texto: string,
  botao: { nome: string; valor: string }
): URLSearchParams {
  const corpo: Record<string, string> = { ...campos, hdnIdMarcador: marcadorEscolhido }
  if (texto) corpo.txaTexto = texto
  corpo[botao.nome] = botao.valor
  return new URLSearchParams(corpo)
}
