const REGEX_HREF_ARVORE =
  /Nos\s*\[\s*0\s*\]\s*=\s*new\s*infraArvoreNo\s*\(\s*"\w+"\s*,\s*"\d+"\s*,\s*null,\s*"([^"]+)"/
const REGEX_HREF_SOBRESTAMENTO = /(controlador\.php\?acao=procedimento_remover_sobrestamento[^']+)/
const REGEX_HREF_REABRIR = /(controlador\.php\?acao=procedimento_reabrir[^']+)/

export function extrairHrefArvore(textoScript: string): string | null {
  return textoScript.match(REGEX_HREF_ARVORE)?.[1] ?? null
}

export type AcaoDisponivel = 'sobrestamento' | 'reabrir'

export function detectarAcaoDisponivel(textoScript: string): AcaoDisponivel | null {
  if (textoScript.indexOf('Remover Sobrestamento do Processo') !== -1) return 'sobrestamento'
  if (textoScript.indexOf('Reabrir Processo') !== -1) return 'reabrir'
  return null
}

export function extrairHrefAcao(textoScript: string, acao: AcaoDisponivel): string | null {
  const regex = acao === 'sobrestamento' ? REGEX_HREF_SOBRESTAMENTO : REGEX_HREF_REABRIR
  return textoScript.match(regex)?.[1] ?? null
}

export function resolverUrl(relativa: string, base: string): string {
  return new URL(relativa, base).href
}
