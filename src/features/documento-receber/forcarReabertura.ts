export function extrairUrlUnidadeSelecionarReabertura(headHtml: string, baseUrl: string): string | null {
  const marcador = 'controlador.php?acao=unidade_selecionar_reabertura_processo'
  const inicio = headHtml.indexOf(marcador)
  if (inicio === -1) return null

  const fim = headHtml.indexOf("'", inicio)
  if (fim === -1) return null

  return new URL(headHtml.substring(inicio, fim), baseUrl).href
}

export function processoFechadoEmTodasUnidades(totalUnidades: number, totalFechadas: number): boolean {
  return totalUnidades === totalFechadas
}
