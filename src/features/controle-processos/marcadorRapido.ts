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
