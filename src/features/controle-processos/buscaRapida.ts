export function parseTermosBusca(textoOriginal: string): string[] {
  const texto = textoOriginal.toLowerCase()
  if (!texto) return []

  const match = texto.match(/^\[(.+)\]$/)
  if (match) return match[1].match(/\S+/g) ?? []

  return [texto]
}

export function linhaCasaBusca(textoLinha: string, termos: string[]): boolean {
  const texto = textoLinha.toLowerCase()
  return termos.some((termo) => texto.includes(termo))
}
