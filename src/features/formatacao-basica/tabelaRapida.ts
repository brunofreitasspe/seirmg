export function montarTabelaHtml(linhas: number, colunas: number): string {
  const linhaHtml = `<tr>${'<td>&nbsp;</td>'.repeat(colunas)}</tr>`
  return `<table class="Tabela"><tbody>${linhaHtml.repeat(linhas)}</tbody></table>`
}

export interface EstiloTabela {
  id: string
  nome: string
  css: string
}

export const CATALOGO_ESTILOS_TABELA: EstiloTabela[] = [
  { id: 'padrao', nome: 'Padrão', css: 'border-collapse:collapse;width:100%' },
  { id: 'bordas', nome: 'Com bordas', css: 'border-collapse:collapse;width:100%;border:1px solid #000' },
]

export function aplicarEstiloTabelaHtml(tabelaHtml: string, estilo: EstiloTabela): string {
  return tabelaHtml.replace('<table class="Tabela">', `<table class="Tabela" style="${estilo.css}">`)
}
