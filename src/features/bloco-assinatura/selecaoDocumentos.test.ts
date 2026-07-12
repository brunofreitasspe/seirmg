import { describe, expect, it } from 'vitest'
import { deveSelecionar, encontrarIndiceColunaAssinaturas, extrairNomeUsuario } from './selecaoDocumentos'

describe('extrairNomeUsuario', () => {
  it('extrai o nome no formato "NOME - usuário"', () => {
    expect(extrairNomeUsuario('João da Silva - joao.silva')).toBe('João da Silva')
  })

  it('extrai o nome no formato "NOME (usuário/órgão)"', () => {
    expect(extrairNomeUsuario('João da Silva (joao.silva/SEIRMG)')).toBe('João da Silva')
  })

  it('retorna null quando não casa nenhum formato', () => {
    expect(extrairNomeUsuario('joao.silva')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(extrairNomeUsuario('')).toBeNull()
  })
})

describe('encontrarIndiceColunaAssinaturas', () => {
  it('encontra o índice de "Assinaturas" em posição arbitrária', () => {
    expect(encontrarIndiceColunaAssinaturas(['Sequência', 'Protocolo', 'Assinaturas', 'Situação'])).toBe(2)
  })

  it('retorna o default 6 quando não há coluna "Assinaturas"', () => {
    expect(encontrarIndiceColunaAssinaturas(['Sequência', 'Protocolo'])).toBe(6)
  })

  it('retorna o default 6 para lista vazia', () => {
    expect(encontrarIndiceColunaAssinaturas([])).toBe(6)
  })
})

describe('deveSelecionar', () => {
  it('"todos" sempre seleciona', () => {
    expect(deveSelecionar('todos', '', { usuario: 'joao', unidade: '' })).toBe(true)
    expect(deveSelecionar('todos', 'Assinado por João', { usuario: 'joao', unidade: '' })).toBe(true)
  })

  it('"nenhum" nunca seleciona', () => {
    expect(deveSelecionar('nenhum', '', { usuario: 'joao', unidade: '' })).toBe(false)
    expect(deveSelecionar('nenhum', 'Assinado por João', { usuario: 'joao', unidade: '' })).toBe(false)
  })

  it('"sem-assinatura" seleciona só documentos sem nenhuma assinatura', () => {
    expect(deveSelecionar('sem-assinatura', '', { usuario: 'João', unidade: '' })).toBe(true)
    expect(deveSelecionar('sem-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })).toBe(false)
  })

  it('"sem-minha-assinatura" seleciona documentos sem assinatura ou só com a de outro usuário', () => {
    expect(deveSelecionar('sem-minha-assinatura', '', { usuario: 'João', unidade: '' })).toBe(true)
    expect(
      deveSelecionar('sem-minha-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(true)
    expect(
      deveSelecionar('sem-minha-assinatura', 'Assinado por João', { usuario: 'João', unidade: '' })
    ).toBe(false)
  })

  it('"com-minha-assinatura" seleciona só documentos que incluem a assinatura do usuário', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por João e Maria', { usuario: 'João', unidade: '' })
    ).toBe(true)
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(false)
    expect(deveSelecionar('com-minha-assinatura', '', { usuario: 'João', unidade: '' })).toBe(false)
  })

  it('"com-minha-assinatura" também seleciona por correspondência de unidade', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria (HMMG-DIR ADM)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria (HMMG-DJUR)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(false)
  })

  it('correspondência é case-insensitive', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'ASSINADO POR JOÃO DA SILVA', {
        usuario: 'joão da silva',
        unidade: '',
      })
    ).toBe(true)
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria (hmmg-dir adm)', {
        usuario: 'joão',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
  })

  it('correspondência tolera espaços extras/quebras de linha na célula', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado   por\nJoão    da Silva', {
        usuario: 'João da Silva',
        unidade: '',
      })
    ).toBe(true)
  })

  it('ignora unidade vazia (não seleciona tudo por engano)', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(false)
  })
})
