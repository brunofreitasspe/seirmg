export function montarCorpoVerificacaoLote(nups: string[]): { processos: string[] } {
  return { processos: [...new Set(nups)] }
}

export function extrairEncontrados(resposta: unknown): Set<string> {
  if (typeof resposta !== 'object' || resposta === null) return new Set()

  const encontrados = (resposta as { encontrados?: unknown }).encontrados
  if (!Array.isArray(encontrados)) return new Set()

  return new Set(encontrados.filter((item): item is string => typeof item === 'string'))
}
