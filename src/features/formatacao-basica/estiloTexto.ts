import type { DescritorEstiloTexto } from '../../content-scripts/documento_editar/protocolo'

export function lerEstiloElemento(elemento: Element): DescritorEstiloTexto {
  const janela = elemento.ownerDocument.defaultView
  if (!janela) return {}
  const estiloComputado = janela.getComputedStyle(elemento)

  const fontSizePx = Number.parseFloat(estiloComputado.fontSize)
  const peso = estiloComputado.fontWeight

  // Check textDecoration first (contains the shorthand value like "underline")
  // Fall back to textDecorationLine if needed
  const decoracao = estiloComputado.textDecoration || estiloComputado.textDecorationLine || ''
  const underline = decoracao.includes('underline')

  return {
    fontSizePx: Number.isNaN(fontSizePx) ? undefined : Math.round(fontSizePx),
    bold: peso === 'bold' || Number(peso) >= 700,
    italic: estiloComputado.fontStyle === 'italic',
    underline,
    color: estiloComputado.color || undefined,
  }
}
