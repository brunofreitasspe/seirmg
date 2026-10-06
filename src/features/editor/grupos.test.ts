import { describe, expect, it } from 'vitest'
import { GRUPOS_BARRA, organizarEmGrupos, type IdBotaoEditor } from './grupos'

describe('GRUPOS_BARRA', () => {
  it('tem os grupos na ordem combinada', () => {
    expect(GRUPOS_BARRA.map((g) => g.titulo)).toEqual(['Inserir', 'Referências e links', 'Formatação', 'Tabelas'])
  })

  it('nenhum botão aparece em dois grupos', () => {
    const todos = GRUPOS_BARRA.flatMap((g) => g.botoes)
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('organizarEmGrupos', () => {
  it('segue a ordem do registro e omite grupos sem botão montado', () => {
    const disponiveis = new Map<IdBotaoEditor, string>([
      ['tabela', 'T'],
      ['maiuscula', 'M'],
      ['fonte-aumentar', 'F+'],
    ])
    const resultado = organizarEmGrupos(disponiveis)
    expect(resultado.map((r) => [r.grupo.id, r.itens])).toEqual([
      ['formatacao', ['F+', 'M']],
      ['tabelas', ['T']],
    ])
  })

  it('ignora botão montado que não está no registro', () => {
    const disponiveis = new Map([['inexistente' as IdBotaoEditor, 'X']])
    expect(organizarEmGrupos(disponiveis)).toEqual([])
  })
})
