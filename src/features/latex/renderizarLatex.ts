import katex from 'katex'

export function renderizarLatexHtml(formula: string): string {
  return katex.renderToString(formula, { throwOnError: true, displayMode: true })
}
