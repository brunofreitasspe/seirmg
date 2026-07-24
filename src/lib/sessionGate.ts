export function ehPaginaDeLogin(html: string): boolean {
  return html.includes('frmLogin')
}

export function calcularEsperaPosNavegacao(
  ultimaNavegacaoIso: string | undefined,
  agoraIso: string,
  atrasoMs: number
): number {
  if (!ultimaNavegacaoIso) return 0
  const decorrido = new Date(agoraIso).getTime() - new Date(ultimaNavegacaoIso).getTime()
  return Math.max(0, atrasoMs - decorrido)
}

export function circuitBreakerAberto(
  sessaoInvalidaAteIso: string | undefined,
  agoraIso: string
): boolean {
  if (!sessaoInvalidaAteIso) return false
  return new Date(sessaoInvalidaAteIso).getTime() > new Date(agoraIso).getTime()
}
