export function construirSeletorPontoControle(nome: string, emProcedimentoVisualizar: boolean): string {
  return emProcedimentoVisualizar ? `img[title*="${nome}" i]` : `a[aria-label*="${nome}" i] img`
}
