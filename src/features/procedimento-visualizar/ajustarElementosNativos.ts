export function extrairTooltipRelacionado(onmouseover: string): string | null {
  const regex = /return infraTooltipMostrar\('(.*)'\)/m
  return regex.exec(onmouseover)?.[1] ?? null
}

export type EstadoDivRelacionados = 'vazio' | 'apenas-titulo' | 'com-conteudo'

export function classificarDivRelacionados(
  textoCompleto: string,
  textoContents: string
): EstadoDivRelacionados {
  if (textoCompleto.trim().length === 0) return 'vazio'
  if (textoContents.trim() === 'Processos Relacionados:') return 'apenas-titulo'
  return 'com-conteudo'
}
