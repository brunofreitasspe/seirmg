export function extrairUrlDeOnclick(onclick: string): string | null {
  const match = onclick.match(/'([^']*)'/)
  return match ? match[1] : null
}

export interface OpcaoMarcador {
  id: string
  nome: string
  icone: string
}

// #selMarcador é um <select> nativo no HTML bruto do servidor (confirmado ao vivo via "Ver
// código-fonte" numa instância SEI real) -- o widget customizado com classes .dd-container/
// .dd-options (ddslick) só existe depois que o JS da própria página transforma o <select> no
// carregamento (onload="inicializar()"), o que nunca roda aqui (só fazemos fetch + parse do
// HTML, sem executar nenhum script da página).
export function parseOpcoesMarcador(doc: Document, seletor = '#selMarcador option'): OpcaoMarcador[] {
  const opcoes = Array.from(doc.querySelectorAll<HTMLOptionElement>(seletor))
  return opcoes
    .filter((opcao) => opcao.value !== '' && opcao.value !== 'null')
    .map((opcao) => ({
      id: opcao.value,
      nome: opcao.textContent?.trim() ?? '',
      icone: opcao.getAttribute('data-imagesrc') ?? '',
    }))
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
