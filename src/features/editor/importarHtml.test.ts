import { describe, expect, it } from 'vitest'
import { aplicarEstilosSei, limparHtmlImportado, prepararHtmlParaSei, tipoArquivoImportavel } from './importarHtml'

describe('tipoArquivoImportavel', () => {
  it('aceita .docx, .html e .htm (sem diferenciar maiúsculas); recusa o resto', () => {
    expect(tipoArquivoImportavel('Ofício.DOCX')).toBe('docx')
    expect(tipoArquivoImportavel('pagina.htm')).toBe('html')
    expect(tipoArquivoImportavel('antigo.doc')).toBeNull()
    expect(tipoArquivoImportavel('arquivo.pdf')).toBeNull()
  })
})

describe('limparHtmlImportado', () => {
  it('remove scripts, estilos, eventos e atributos; mantém a estrutura permitida', () => {
    const sujo =
      '<style>p{color:red}</style><p style="color:red" class="x" onclick="roubar()">Olá <b>mundo</b><script>alert(1)</script></p>' +
      '<div><span>solto</span></div>'
    expect(limparHtmlImportado(sujo)).toBe('<p>Olá <b>mundo</b></p>solto')
  })

  it('links só http(s)/mailto; javascript: vira texto', () => {
    expect(limparHtmlImportado('<a href="https://a.gov.br">ok</a><a href="javascript:x()">ruim</a>')).toBe(
      '<a href="https://a.gov.br">ok</a>ruim'
    )
  })

  // O SEI recusa GIF ao salvar ("Imagem formato gif não permitida"); svg pode conter script.
  it('imagens só em data URI PNG/JPEG; GIF, SVG e externas saem', () => {
    const html =
      '<img src="data:image/png;base64,AAA" alt="a"><img src="data:image/jpeg;base64,CCC">' +
      '<img src="data:image/gif;base64,DDD"><img src="https://x.com/a.png"><img src="data:image/svg+xml;base64,BBB">'
    expect(limparHtmlImportado(html)).toBe('<img src="data:image/png;base64,AAA" alt="a"><img src="data:image/jpeg;base64,CCC">')
  })

  it('tabela mantém colspan numérico', () => {
    expect(limparHtmlImportado('<table><tr><td colspan="2" width="9">a</td></tr></table>')).toBe(
      '<table><tbody><tr><td colspan="2">a</td></tr></tbody></table>'
    )
  })
})

describe('aplicarEstilosSei', () => {
  it('parágrafos, títulos e tabelas com as classes do SEI', () => {
    const html = '<h1>Título</h1><h2>Seção</h2><p>Texto</p><table><tbody><tr><td>célula</td></tr></tbody></table>'
    expect(aplicarEstilosSei(html)).toBe(
      '<p class="Texto_Fundo_Cinza_Maiusculas_Negrito">Título</p>' +
        '<p class="Texto_Fundo_Cinza_Negrito">Seção</p>' +
        '<p class="Texto_Justificado">Texto</p>' +
        '<table class="Tabela" style="border-collapse:collapse;width:100%;"><tbody><tr><td><p class="Tabela_Texto_Alinhado_Esquerda">célula</p></td></tr></tbody></table>'
    )
  })

  it('texto solto no nível de cima vira parágrafo justificado', () => {
    expect(aplicarEstilosSei('solto')).toBe('<p class="Texto_Justificado">solto</p>')
  })
})

describe('prepararHtmlParaSei', () => {
  it('limpa e aplica os estilos', () => {
    expect(prepararHtmlParaSei('<p onclick="x()">Oi</p><script>y()</script>')).toBe('<p class="Texto_Justificado">Oi</p>')
  })
})
