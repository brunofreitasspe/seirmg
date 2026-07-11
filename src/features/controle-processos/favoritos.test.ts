import { describe, expect, it } from 'vitest'
import { calcularOcultacaoPorFavorito, extrairFavoritoDaLinha, ordenarFavoritosPorData } from './favoritos'
import type { FavoritoProcesso } from '../../lib/storage'

function criarLinhaComProcesso(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

describe('extrairFavoritoDaLinha', () => {
  it('extrai numero e link de uma linha com .processoVisualizado', () => {
    const linha = criarLinhaComProcesso(
      '<td><a class="processoVisualizado" href="controlador.php?acao=x&id=1"> HMMG.2025.00001-1 </a></td>'
    )
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')).toEqual({
      numero: 'HMMG.2025.00001-1',
      link: 'controlador.php?acao=x&id=1',
      adicionadoEm: '2026-07-10T10:00:00.000Z',
    })
  })

  it('extrai numero de uma linha com .processoNaoVisualizado', () => {
    const linha = criarLinhaComProcesso(
      '<td><a class="processoNaoVisualizado" href="controlador.php?acao=y">HMMG.2025.00002-2</a></td>'
    )
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.numero).toBe('HMMG.2025.00002-2')
  })

  it('retorna link null quando o elemento não tem atributo href', () => {
    const linha = criarLinhaComProcesso('<td><a class="processoVisualizado">HMMG.2025.00003-3</a></td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.link).toBeNull()
  })

  it('retorna null quando a linha não tem elemento de processo', () => {
    const linha = criarLinhaComProcesso('<td>sem link</td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')).toBeNull()
  })

  it('retorna null quando o texto do processo está vazio', () => {
    const linha = criarLinhaComProcesso('<td><a class="processoVisualizado" href="x">   </a></td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')).toBeNull()
  })
})

describe('calcularOcultacaoPorFavorito', () => {
  it('marca como oculta (false) a linha cujo nup está favoritado', () => {
    const linhas = [{ id: 'a', nup: 'HMMG.1' }, { id: 'b', nup: 'HMMG.2' }]
    const resultado = calcularOcultacaoPorFavorito(linhas, new Set(['HMMG.1']))
    expect(resultado).toEqual({ a: false, b: true })
  })

  it('mantém visível (true) quando o conjunto de favoritados está vazio', () => {
    const linhas = [{ id: 'a', nup: 'HMMG.1' }]
    expect(calcularOcultacaoPorFavorito(linhas, new Set())).toEqual({ a: true })
  })

  it('trata nup null como sempre visível', () => {
    const linhas = [{ id: 'a', nup: null }]
    expect(calcularOcultacaoPorFavorito(linhas, new Set(['HMMG.1']))).toEqual({ a: true })
  })
})

describe('ordenarFavoritosPorData', () => {
  const item = (numero: string, adicionadoEm: string): FavoritoProcesso => ({ numero, link: null, adicionadoEm })

  it('ordena do mais recente para o mais antigo', () => {
    const itens = [
      item('HMMG.1', '2026-07-01T10:00:00.000Z'),
      item('HMMG.2', '2026-07-10T10:00:00.000Z'),
      item('HMMG.3', '2026-07-05T10:00:00.000Z'),
    ]
    expect(ordenarFavoritosPorData(itens).map((i) => i.numero)).toEqual(['HMMG.2', 'HMMG.3', 'HMMG.1'])
  })

  it('não modifica o array original', () => {
    const itens = [item('HMMG.1', '2026-07-01T10:00:00.000Z'), item('HMMG.2', '2026-07-10T10:00:00.000Z')]
    const copia = [...itens]
    ordenarFavoritosPorData(itens)
    expect(itens).toEqual(copia)
  })
})
