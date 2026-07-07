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
    expect(deveSelecionar('todos', '', 'joao')).toBe(true)
    expect(deveSelecionar('todos', 'Assinado por João', 'joao')).toBe(true)
  })

  it('"nenhum" nunca seleciona', () => {
    expect(deveSelecionar('nenhum', '', 'joao')).toBe(false)
    expect(deveSelecionar('nenhum', 'Assinado por João', 'joao')).toBe(false)
  })

  it('"sem-assinatura" seleciona só documentos sem nenhuma assinatura', () => {
    expect(deveSelecionar('sem-assinatura', '', 'João')).toBe(true)
    expect(deveSelecionar('sem-assinatura', 'Assinado por Maria', 'João')).toBe(false)
  })

  it('"sem-minha-assinatura" seleciona documentos sem assinatura ou só com a de outro usuário', () => {
    expect(deveSelecionar('sem-minha-assinatura', '', 'João')).toBe(true)
    expect(deveSelecionar('sem-minha-assinatura', 'Assinado por Maria', 'João')).toBe(true)
    expect(deveSelecionar('sem-minha-assinatura', 'Assinado por João', 'João')).toBe(false)
  })

  it('"com-minha-assinatura" seleciona só documentos que incluem a assinatura do usuário', () => {
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por João e Maria', 'João')).toBe(true)
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por Maria', 'João')).toBe(false)
    expect(deveSelecionar('com-minha-assinatura', '', 'João')).toBe(false)
  })
})
