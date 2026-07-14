import { describe, expect, it } from 'vitest'
import { renderizarLatexHtml } from './renderizarLatex'

describe('renderizarLatexHtml', () => {
  it('renderiza uma fórmula simples em HTML do KaTeX', () => {
    const html = renderizarLatexHtml('x^2')
    expect(html).toContain('katex')
  })

  it('lança erro pra sintaxe LaTeX inválida', () => {
    expect(() => renderizarLatexHtml('\\frac{1}')).toThrow()
  })
})
