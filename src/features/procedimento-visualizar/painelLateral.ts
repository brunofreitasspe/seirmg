export function extrairUrlEdicaoProcesso(headHtml: string): string | null {
  const marcadores = [
    'controlador.php?acao=procedimento_alterar&',
    'controlador.php?acao=procedimento_consultar&',
  ]
  for (const marcador of marcadores) {
    const inicio = headHtml.indexOf(marcador)
    if (inicio === -1) continue
    const fim = headHtml.indexOf('"', inicio)
    if (fim === -1) continue
    return headHtml.substring(inicio, fim)
  }
  return null
}

export function extrairTipoProcesso(doc: Document): string {
  return doc.querySelector("#selTipoProcedimento option[selected='selected']")?.textContent?.trim() ?? ''
}

export interface InteressadoExtraido {
  id: string
  nome: string
  sigla: string
}

export function extrairInteressados(doc: Document): InteressadoExtraido[] {
  return Array.from(doc.querySelectorAll('#selInteressadosProcedimento option')).map((option) => {
    const texto = option.textContent ?? ''
    const match = /^(.*) \((.*)\)$/.exec(texto)
    return {
      id: option.getAttribute('value') ?? '',
      nome: (match?.[1] ?? texto).trim(),
      sigla: (match?.[2] ?? '').trim(),
    }
  })
}
