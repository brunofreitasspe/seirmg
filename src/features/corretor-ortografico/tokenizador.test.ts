import { describe, expect, it } from 'vitest'
import { tokenizar } from './tokenizador'

describe('tokenizar', () => {
  it('separa as palavras de uma frase simples com os offsets corretos', () => {
    const resultado = tokenizar('O despacho contem erro.')
    expect(resultado).toEqual([
      { palavra: 'O', inicio: 0, fim: 1 },
      { palavra: 'despacho', inicio: 2, fim: 10 },
      { palavra: 'contem', inicio: 11, fim: 17 },
      { palavra: 'erro', inicio: 18, fim: 22 },
    ])
  })

  it('ignora siglas em caixa alta (mais de uma letra)', () => {
    const resultado = tokenizar('Processo SEI 123.456 e RMG.')
    expect(resultado).toEqual([
      { palavra: 'Processo', inicio: 0, fim: 8 },
      { palavra: 'e', inicio: 21, fim: 22 },
    ])
  })

  it('ignora palavras dentro de um e-mail', () => {
    const resultado = tokenizar('Envie para fulano.beltrano@orgao.mg.gov.br por favor.')
    expect(resultado.map((token) => token.palavra)).toEqual(['Envie', 'para', 'por', 'favor'])
  })

  it('retorna array vazio para texto sem palavras', () => {
    expect(tokenizar('123 456 !!! ...')).toEqual([])
  })
})
