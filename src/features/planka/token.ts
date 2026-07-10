function base64UrlDecodeParaTexto(segmento: string): string {
  let normalizado = segmento.replace(/-/g, '+').replace(/_/g, '/')
  while (normalizado.length % 4) normalizado += '='
  return decodeURIComponent(
    atob(normalizado)
      .split('')
      .map((caractere) => '%' + caractere.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function decodificarPayloadJwtSemVerificar(token: string): Record<string, unknown> | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    return JSON.parse(base64UrlDecodeParaTexto(partes[1])) as Record<string, unknown>
  } catch {
    return null
  }
}

export function tokenValido(tokenExp: number | undefined, agoraIso: string): boolean {
  if (tokenExp === undefined) return false
  return tokenExp > new Date(agoraIso).getTime() / 1000
}
