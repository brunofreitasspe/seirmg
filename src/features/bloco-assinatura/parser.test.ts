import { beforeEach, describe, expect, it } from 'vitest'
import { parseBlocoAssinaturaTable, resumirBlocos } from './parser'

function montarLinha(celulas: string[]): string {
  return `<tr>${celulas.map((c) => `<td>${c}</td>`).join('')}</tr>`
}

function montarTabelaV4(linhasDados: string[]): string {
  const cabecalho = montarLinha(['', 'Nº', 'Tipo', 'Data', 'Estado', 'Unidade', 'Disponibilização'])
  return `<div id="divInfraAreaTabela"><table><tbody>${cabecalho}${linhasDados.join('')}</tbody></table></div>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseBlocoAssinaturaTable (SEI >= 4.0)', () => {
  it('classifica disponibilizado para a área quando a disponibilização está em branco', () => {
    const linha = montarLinha([
      '', '<a href="/bloco/1">1</a>', 'Assinatura', '01/01/2026', 'Disponibilizado', 'UNIDADE-A', '',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const itens = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })

    expect(itens).toEqual([
      { id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'disponibilizado_para_area' },
    ])
  })

  it('classifica disponibilizado pela área quando a disponibilização está preenchida', () => {
    const linha = montarLinha([
      '', '<a href="/bloco/2">2</a>', 'Assinatura', '01/01/2026', 'Disponibilizado', 'UNIDADE-A', 'SETIC',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.estado).toBe('disponibilizado_pela_area')
  })

  it.each([
    ['Aberto', 'aberto'],
    ['Gerado', 'aberto'],
    ['Retornado', 'retornado'],
    ['Recebido', 'disponibilizado_para_area'],
  ])('classifica estado "%s" como "%s"', (textoEstado, esperado) => {
    const linha = montarLinha([
      '', '<a href="/bloco/3">3</a>', 'Assinatura', '01/01/2026', textoEstado, 'UNIDADE-A', '',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.estado).toBe(esperado)
  })

  it('ignora a linha de cabeçalho', () => {
    document.body.innerHTML = montarTabelaV4([])
    expect(parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })).toHaveLength(0)
  })

  it('usa um id de fallback quando a linha não tem link', () => {
    const linha = montarLinha(['', '5', 'Assinatura', '01/01/2026', 'Aberto', 'UNIDADE-A', ''])
    document.body.innerHTML = montarTabelaV4([linha])
    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.id.startsWith('linha:')).toBe(true)
  })
})

describe('resumirBlocos', () => {
  it('conta os itens por estado', () => {
    const resumo = resumirBlocos([
      { id: '1', numero: '1', link: '', estado: 'disponibilizado_para_area' },
      { id: '2', numero: '2', link: '', estado: 'disponibilizado_para_area' },
      { id: '3', numero: '3', link: '', estado: 'disponibilizado_pela_area' },
      { id: '4', numero: '4', link: '', estado: 'aberto' },
      { id: '5', numero: '5', link: '', estado: 'retornado' },
    ])
    expect(resumo).toEqual({
      totalDisponibilizadoParaArea: 2,
      totalDisponibilizadoPelaArea: 1,
      totalAberto: 1,
      totalRetornado: 1,
    })
  })
})
