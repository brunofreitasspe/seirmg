import { describe, expect, it } from 'vitest'
import { formatarAtalhos, parsearAtalhos } from './atalhos'

describe('parsearAtalhos', () => {
  it('parseia uma linha no formato tecla=classe:rótulo', () => {
    expect(parsearAtalhos('1=Titulo1:Título 1')).toEqual([
      { tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' },
    ])
  })

  it('usa a classe como rótulo quando o rótulo não é informado', () => {
    expect(parsearAtalhos('1=Titulo1')).toEqual([{ tecla: '1', classe: 'Titulo1', rotulo: 'Titulo1' }])
  })

  it('ignora linhas vazias e linhas malformadas', () => {
    expect(parsearAtalhos('1=Titulo1:Título 1\n\n=semtecla\nsoclasse')).toEqual([
      { tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' },
    ])
  })

  it('retorna lista vazia pra texto vazio', () => {
    expect(parsearAtalhos('')).toEqual([])
  })
})

describe('formatarAtalhos', () => {
  it('formata de volta pro formato tecla=classe:rótulo, uma linha por atalho', () => {
    expect(
      formatarAtalhos([
        { tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' },
        { tecla: '2', classe: 'Titulo2', rotulo: 'Título 2' },
      ])
    ).toBe('1=Titulo1:Título 1\n2=Titulo2:Título 2')
  })
})
