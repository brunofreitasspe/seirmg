import { describe, expect, it } from 'vitest'
import { linhaCasaBloco, parseListaBlocos, parseProcessosDoBloco } from './filtroBloco'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('parseListaBlocos', () => {
  it('extrai número, href e descrição de cada bloco', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="infraTrClara">
            <td>x</td>
            <td><a href="controlador.php?acao=bloco_visualizar&id=1">123</a></td>
            <td>y</td>
            <td>Descrição do bloco</td>
            <td>z</td>
          </tr>
        </tbody></table>
      </div>
    `)
    expect(parseListaBlocos(doc)).toEqual([
      { numero: '123', href: 'controlador.php?acao=bloco_visualizar&id=1', descricao: 'Descrição do bloco' },
    ])
  })

  it('ignora linhas sem a classe de linha de dados', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="infraTh"><td>Cabeçalho</td></tr>
        </tbody></table>
      </div>
    `)
    expect(parseListaBlocos(doc)).toEqual([])
  })

  it('retorna lista vazia quando não há tabela', () => {
    expect(parseListaBlocos(montarDocumento('<div></div>'))).toEqual([])
  })
})

describe('parseProcessosDoBloco', () => {
  it('extrai o número de processo da 3ª célula', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="infraTrEscura">
            <td>x</td>
            <td>y</td>
            <td><a href="#">00001.000001/2026-01</a></td>
          </tr>
        </tbody></table>
      </div>
    `)
    expect(parseProcessosDoBloco(doc)).toEqual(['00001.000001/2026-01'])
  })

  it('retorna lista vazia quando a linha não tem link na 3ª célula', () => {
    const doc = montarDocumento(`
      <div class="infraAreaTabela">
        <table><tbody>
          <tr class="trVermelha"><td>x</td><td>y</td><td>sem link</td></tr>
        </tbody></table>
      </div>
    `)
    expect(parseProcessosDoBloco(doc)).toEqual([])
  })
})

describe('linhaCasaBloco', () => {
  it('casa quando o número está na lista', () => {
    expect(linhaCasaBloco('123', ['123', '456'])).toBe(true)
  })

  it('não casa quando o número não está na lista', () => {
    expect(linhaCasaBloco('789', ['123', '456'])).toBe(false)
  })
})
