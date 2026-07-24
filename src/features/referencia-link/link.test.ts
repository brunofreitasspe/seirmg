import { describe, expect, it } from 'vitest'
import { extrairIdDoUrl, construirLinkResultado } from './link'

describe('extrairIdDoUrl', () => {
  it('extrai o valor do parâmetro pedido de uma URL absoluta', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=20637997&infra_hash=abc'
    expect(extrairIdDoUrl(url, 'id_procedimento')).toBe('20637997')
  })

  it('retorna null quando o parâmetro não existe na URL', () => {
    expect(extrairIdDoUrl('https://exemplo.br/sei/controlador.php?acao=x', 'id_documento')).toBeNull()
  })

  it('retorna null quando a URL é inválida', () => {
    expect(extrairIdDoUrl('::não é url::', 'id_procedimento')).toBeNull()
  })
})

describe('construirLinkResultado', () => {
  it('monta link de documento quando a URL final tem id_documento', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=documento_visualizar&id_documento=72946073&infra_hash=abc'
    expect(construirLinkResultado(url)).toEqual({
      href: 'controlador.php?acao=documento_visualizar&id_documento=72946073',
      tipo: 'documento',
    })
  })

  it('monta link de processo quando a URL final tem id_procedimento e não tem id_documento', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=20637997&infra_hash=abc'
    expect(construirLinkResultado(url)).toEqual({
      href: 'controlador.php?acao=procedimento_trabalhar&id_procedimento=20637997',
      tipo: 'processo',
    })
  })

  it('prioriza id_documento quando a URL final tem os dois parâmetros', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=x&id_procedimento=1&id_documento=2'
    expect(construirLinkResultado(url)?.tipo).toBe('documento')
  })

  it('retorna null quando a URL final não tem nenhum dos dois parâmetros (número não encontrado)', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=procedimento_pesquisar&id_protocolo=0'
    expect(construirLinkResultado(url)).toBeNull()
  })
})
