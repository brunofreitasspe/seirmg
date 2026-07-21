import { describe, expect, it } from 'vitest'
import {
  atualizarSnapshotsFavoritos,
  calcularOcultacaoPorFavorito,
  extrairFavoritoDaLinha,
  ordenarFavoritosPorData,
  snapshotsIguais,
} from './favoritos'
import type { FavoritoProcesso, SnapshotFavorito } from '../../lib/storage'

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

  it('inclui especificação quando o onmouseover contém dados de especificação', () => {
    const linha = criarLinhaComProcesso(
      `<td><a class="processoVisualizado" href="x" onmouseover="return infraTooltipMostrar('Aquisição de bens','Detalhe')">HMMG.2025.00004-4</a></td>`
    )
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.especificacao).toBe('Aquisição de bens')
  })

  it('deixa especificação indefinida quando a linha não tem onmouseover', () => {
    const linha = criarLinhaComProcesso('<td><a class="processoVisualizado" href="x">HMMG.2025.00005-5</a></td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.especificacao).toBeUndefined()
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

describe('snapshotsIguais', () => {
  const base: SnapshotFavorito = { prazoDataTexto: '15/08/2026', atribuicao: 'joao.silva', marcadoresNomes: ['Urgente'] }

  it('retorna false quando o atual é undefined (força a primeira gravação)', () => {
    expect(snapshotsIguais(undefined, base)).toBe(false)
  })

  it('retorna true quando os dois são idênticos', () => {
    expect(snapshotsIguais(base, { ...base })).toBe(true)
  })

  it('retorna false quando prazoDataTexto difere', () => {
    expect(snapshotsIguais(base, { ...base, prazoDataTexto: '20/08/2026' })).toBe(false)
  })

  it('retorna false quando atribuicao difere', () => {
    expect(snapshotsIguais(base, { ...base, atribuicao: 'maria.souza' })).toBe(false)
  })

  it('retorna false quando marcadoresNomes difere em conteúdo', () => {
    expect(snapshotsIguais(base, { ...base, marcadoresNomes: ['Concluído'] })).toBe(false)
  })

  it('retorna false quando marcadoresNomes difere em quantidade', () => {
    expect(snapshotsIguais(base, { ...base, marcadoresNomes: ['Urgente', 'Concluído'] })).toBe(false)
  })
})

describe('atualizarSnapshotsFavoritos', () => {
  const item = (numero: string, ultimoSnapshot?: SnapshotFavorito): FavoritoProcesso => ({
    numero,
    link: null,
    adicionadoEm: '2026-07-01T10:00:00.000Z',
    ultimoSnapshot,
  })

  it('não muda item sem entrada correspondente no mapa', () => {
    const itens = [item('HMMG.1')]
    const resultado = atualizarSnapshotsFavoritos(itens, new Map())
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(itens)
  })

  it('atualiza item cujo snapshot no mapa difere do atual', () => {
    const novoSnapshot: SnapshotFavorito = { prazoDataTexto: '15/08/2026', atribuicao: 'joao.silva', marcadoresNomes: [] }
    const itens = [item('HMMG.1')]
    const resultado = atualizarSnapshotsFavoritos(itens, new Map([['HMMG.1', novoSnapshot]]))
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens[0].ultimoSnapshot).toEqual(novoSnapshot)
  })

  it('não marca mudou quando o snapshot no mapa é igual ao já salvo', () => {
    const snapshot: SnapshotFavorito = { prazoDataTexto: '15/08/2026', atribuicao: 'joao.silva', marcadoresNomes: [] }
    const itens = [item('HMMG.1', snapshot)]
    const resultado = atualizarSnapshotsFavoritos(itens, new Map([['HMMG.1', { ...snapshot }]]))
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(itens)
  })

  it('trata uma lista com mistura de itens que mudam e não mudam', () => {
    const snapshotIgual: SnapshotFavorito = { prazoDataTexto: '01/01/2026', atribuicao: null, marcadoresNomes: [] }
    const snapshotNovo: SnapshotFavorito = { prazoDataTexto: '20/08/2026', atribuicao: 'carlos.lima', marcadoresNomes: ['Urgente'] }
    const itens = [item('HMMG.1', snapshotIgual), item('HMMG.2'), item('HMMG.3')]
    const mapa = new Map([
      ['HMMG.1', { ...snapshotIgual }],
      ['HMMG.2', snapshotNovo],
    ])
    const resultado = atualizarSnapshotsFavoritos(itens, mapa)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens[0].ultimoSnapshot).toEqual(snapshotIgual)
    expect(resultado.itens[1].ultimoSnapshot).toEqual(snapshotNovo)
    expect(resultado.itens[2].ultimoSnapshot).toBeUndefined()
  })
})
