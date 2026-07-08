import { describe, expect, it } from 'vitest'
import { agruparLinhas, extrairNomeMarcador, extrairTextoPontoControle, extrairTipoProcesso } from './agrupamento'

describe('extrairNomeMarcador', () => {
  it('extrai o segundo argumento entre aspas simples', () => {
    expect(extrairNomeMarcador("infraTooltipMostrar('Até 10/10/2026','Urgente')")).toBe('Urgente')
  })

  it('retorna string vazia quando só há um argumento', () => {
    expect(extrairNomeMarcador("infraTooltipMostrar('Até 10/10/2026')")).toBe('')
  })
})

describe('extrairTipoProcesso', () => {
  it('extrai o segundo argumento entre aspas simples', () => {
    expect(extrairTipoProcesso("mostrarDica('Recursos Humanos','Administrativo: Diárias')")).toBe(
      'Administrativo: Diárias'
    )
  })

  it('retorna string vazia quando só há um argumento', () => {
    expect(extrairTipoProcesso("mostrarDica('Recursos Humanos')")).toBe('')
  })
})

describe('extrairTextoPontoControle', () => {
  it('extrai o segundo argumento entre aspas simples', () => {
    expect(extrairTextoPontoControle("infraTooltipMostrar('01/01/2026','Aguardando Análise')")).toBe(
      'Aguardando Análise'
    )
  })

  it('retorna string vazia quando só há um argumento', () => {
    expect(extrairTextoPontoControle("infraTooltipMostrar('01/01/2026')")).toBe('')
  })
})

describe('agruparLinhas', () => {
  it('agrupa linhas com a mesma chave', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: 'Financeiro' },
      { id: '2', chaveGrupo: 'Financeiro' },
      { id: '3', chaveGrupo: 'Pessoal' },
    ])
    expect(grupos).toEqual([
      { chaveGrupo: 'Financeiro', ids: ['1', '2'] },
      { chaveGrupo: 'Pessoal', ids: ['3'] },
    ])
  })

  it('ordena os grupos nomeados em ordem alfabética', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: 'Pessoal' },
      { id: '2', chaveGrupo: 'Financeiro' },
    ])
    expect(grupos.map((g) => g.chaveGrupo)).toEqual(['Financeiro', 'Pessoal'])
  })

  it('coloca o grupo sem chave ("Sem Grupo") sempre por último, mesmo alfabeticamente antes', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: null },
      { id: '2', chaveGrupo: 'Ambiental' },
    ])
    expect(grupos.map((g) => g.chaveGrupo)).toEqual(['Ambiental', null])
  })

  it('trata string vazia como equivalente a null (Sem Grupo)', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: '' },
      { id: '2', chaveGrupo: 'Ambiental' },
    ])
    expect(grupos.map((g) => g.chaveGrupo)).toEqual(['Ambiental', null])
  })

  it('preserva a ordem de entrada dentro do grupo quando ordemDentroDoGrupo não é fornecido', () => {
    const grupos = agruparLinhas([
      { id: '3', chaveGrupo: 'Financeiro' },
      { id: '1', chaveGrupo: 'Financeiro' },
      { id: '2', chaveGrupo: 'Financeiro' },
    ])
    expect(grupos[0].ids).toEqual(['3', '1', '2'])
  })

  it('ordena dentro do grupo pela posição informada em ordemDentroDoGrupo', () => {
    const ordem = new Map([
      ['3', 2],
      ['1', 0],
      ['2', 1],
    ])
    const grupos = agruparLinhas(
      [
        { id: '3', chaveGrupo: 'Financeiro' },
        { id: '1', chaveGrupo: 'Financeiro' },
        { id: '2', chaveGrupo: 'Financeiro' },
      ],
      ordem
    )
    expect(grupos[0].ids).toEqual(['1', '2', '3'])
  })
})
