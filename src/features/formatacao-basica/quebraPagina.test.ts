import { describe, expect, it } from 'vitest'
import { montarQuebraPaginaHtml } from './quebraPagina'

describe('montarQuebraPaginaHtml', () => {
  it('monta um marcador de quebra de página', () => {
    expect(montarQuebraPaginaHtml()).toBe('<div class="Quebra_Pagina" style="page-break-after:always">&nbsp;</div>')
  })
})
