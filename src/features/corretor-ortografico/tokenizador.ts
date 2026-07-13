export interface TokenPalavra {
  palavra: string
  inicio: number
  fim: number
}

const REGEX_PALAVRA = /\p{L}+(?:['-]\p{L}+)*/gu
const REGEX_EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu

function ehSigla(palavra: string): boolean {
  return palavra.length > 1 && palavra === palavra.toUpperCase() && palavra !== palavra.toLowerCase()
}

function localizarIntervalosDeEmail(texto: string): Array<{ inicio: number; fim: number }> {
  return Array.from(texto.matchAll(REGEX_EMAIL)).flatMap((match) =>
    match.index === undefined ? [] : [{ inicio: match.index, fim: match.index + match[0].length }]
  )
}

export function tokenizar(texto: string): TokenPalavra[] {
  const intervalosEmail = localizarIntervalosDeEmail(texto)
  const tokens: TokenPalavra[] = []

  for (const match of texto.matchAll(REGEX_PALAVRA)) {
    if (match.index === undefined) continue
    const inicio = match.index
    const fim = inicio + match[0].length
    const palavra = match[0]

    const dentroDeEmail = intervalosEmail.some(
      (intervalo) => inicio >= intervalo.inicio && fim <= intervalo.fim
    )
    if (dentroDeEmail) continue
    if (ehSigla(palavra)) continue

    tokens.push({ palavra, inicio, fim })
  }

  return tokens
}
