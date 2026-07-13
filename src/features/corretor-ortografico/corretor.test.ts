import { describe, expect, it } from 'vitest'
import { criarCorretor } from './corretor'

describe('criarCorretor', () => {
  it('não aponta erro em palavras corretas', async () => {
    const corretor = await criarCorretor()
    expect(corretor.verificarTexto('Este despacho foi enviado corretamente.')).toEqual([])
  })

  it('aponta erro em uma palavra incorreta e sugere a forma certa', async () => {
    const corretor = await criarCorretor()
    const erros = corretor.verificarTexto('Este processo tem uma informacao incorreta.')
    expect(erros).toHaveLength(1)
    expect(erros[0].palavra).toBe('informacao')
    expect(erros[0].inicio).toBe(22)
    expect(erros[0].fim).toBe(32)
    expect(erros[0].sugestoes).toContain('informação')
  })

  it('limita a no máximo 5 sugestões', async () => {
    const corretor = await criarCorretor()
    const erros = corretor.verificarTexto('isso e um teste com palavra errda.')
    const erro = erros.find((item) => item.palavra === 'errda')
    expect(erro?.sugestoes.length).toBeLessThanOrEqual(5)
  })

  it('não aponta erro em palavra passada como já ignorada na criação', async () => {
    const corretor = await criarCorretor(['Seirmg'])
    const erros = corretor.verificarTexto('A extensão Seirmg ajuda no processo.')
    expect(erros.some((erro) => erro.palavra === 'Seirmg')).toBe(false)
  })

  it('para de apontar erro numa palavra depois de adicionarPalavra', async () => {
    const corretor = await criarCorretor()
    expect(corretor.verificarTexto('Isso e um jusia.').some((erro) => erro.palavra === 'jusia')).toBe(true)
    corretor.adicionarPalavra('jusia')
    expect(corretor.verificarTexto('Isso e um jusia.').some((erro) => erro.palavra === 'jusia')).toBe(false)
  })
})
