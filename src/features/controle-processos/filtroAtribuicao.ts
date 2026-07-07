export function extrairNomesAtribuidos(textos: string[]): string[] {
  const unicos = new Set(textos.map((texto) => texto.trim()).filter((texto) => texto !== ''))
  return Array.from(unicos).sort()
}

export function linhaCasaAtribuicao(textoAtribuido: string | null, valorSelecionado: string): boolean {
  if (valorSelecionado === '*') return true

  const texto = textoAtribuido?.trim() ?? ''
  if (valorSelecionado === '') return texto === ''

  return texto === valorSelecionado
}
