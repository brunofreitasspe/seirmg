import { describe, expect, it } from 'vitest'
import { diffarParagrafos } from './diffParagrafos'

describe('diffarParagrafos', () => {
  it('marca como alterado um parágrafo que não existia no snapshot', () => {
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Texto novo.' }], new Map())
    expect(resultado).toEqual({ novosOuAlterados: ['p0'], removidos: [] })
  })

  it('não marca como alterado um parágrafo cujo texto não mudou', () => {
    const snapshot = new Map([['p0', 'Texto igual.']])
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Texto igual.' }], snapshot)
    expect(resultado).toEqual({ novosOuAlterados: [], removidos: [] })
  })

  it('marca como alterado um parágrafo cujo texto mudou', () => {
    const snapshot = new Map([['p0', 'Texto antigo.']])
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Texto editado.' }], snapshot)
    expect(resultado).toEqual({ novosOuAlterados: ['p0'], removidos: [] })
  })

  it('marca como removido um parágrafo que estava no snapshot mas não está mais nos atuais', () => {
    const snapshot = new Map([
      ['p0', 'Primeiro.'],
      ['p1', 'Segundo.'],
    ])
    const resultado = diffarParagrafos([{ id: 'p0', texto: 'Primeiro.' }], snapshot)
    expect(resultado).toEqual({ novosOuAlterados: [], removidos: ['p1'] })
  })

  it('lida com múltiplos parágrafos alterados, inalterados e removidos ao mesmo tempo', () => {
    const snapshot = new Map([
      ['p0', 'Fica igual.'],
      ['p1', 'Vai mudar.'],
      ['p2', 'Vai sumir.'],
    ])
    const resultado = diffarParagrafos(
      [
        { id: 'p0', texto: 'Fica igual.' },
        { id: 'p1', texto: 'Mudou.' },
        { id: 'p3', texto: 'É novo.' },
      ],
      snapshot
    )
    expect(resultado.novosOuAlterados.sort()).toEqual(['p1', 'p3'])
    expect(resultado.removidos).toEqual(['p2'])
  })
})
