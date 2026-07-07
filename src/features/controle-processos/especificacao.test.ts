import { describe, expect, it } from 'vitest'
import { extrairEspecificacaoParaExibicao, extrairEspecificacaoParaLista } from './especificacao'

describe('extrairEspecificacaoParaExibicao', () => {
  it("extrai o texto entre ( ' e a vírgula do primeiro argumento", () => {
    expect(extrairEspecificacaoParaExibicao("mostrarDica('Recursos Humanos','outro')")).toBe(
      'Recursos Humanos'
    )
  })
})

describe('extrairEspecificacaoParaLista', () => {
  it('extrai o texto entre as duas primeiras aspas simples', () => {
    expect(extrairEspecificacaoParaLista("mostrarDica('Recursos Humanos','outro')")).toBe(
      'Recursos Humanos'
    )
  })

  it('retorna string vazia quando não há aspas', () => {
    expect(extrairEspecificacaoParaLista('semAspas')).toBe('')
  })
})
