import { describe, expect, it } from 'vitest'
import { extrairDigitos, candidatoANumeroSei } from './numero'

describe('extrairDigitos', () => {
  it('remove tudo que não é dígito, mantendo só os números', () => {
    expect(extrairDigitos('0011035-79.2020.8.13.0079')).toBe('0011035792020813 0079'.replace(/\s/g, ''))
  })

  it('retorna string vazia quando não há nenhum dígito', () => {
    expect(extrairDigitos('sem números aqui')).toBe('')
  })
})

describe('candidatoANumeroSei', () => {
  it('retorna true para um número de processo formatado (bem acima do mínimo de dígitos)', () => {
    expect(candidatoANumeroSei('0011035-79.2020.8.13.0079')).toBe(true)
  })

  it('retorna true para um número de documento sem formatação (7 dígitos)', () => {
    expect(candidatoANumeroSei('7294607')).toBe(true)
  })

  it('retorna false para um número curto (ano, item de lista etc.)', () => {
    expect(candidatoANumeroSei('2026')).toBe(false)
  })

  it('retorna false para texto sem nenhum dígito', () => {
    expect(candidatoANumeroSei('Despacho de encaminhamento')).toBe(false)
  })

  it('retorna false para uma sequência de dígitos absurdamente longa (provável colagem de tabela)', () => {
    expect(candidatoANumeroSei('1'.repeat(30))).toBe(false)
  })

  it('retorna true no limite mínimo exato (6 dígitos) e falso um abaixo dele', () => {
    expect(candidatoANumeroSei('123456')).toBe(true)
    expect(candidatoANumeroSei('12345')).toBe(false)
  })

  it('retorna true no limite máximo exato (25 dígitos) e falso um acima dele', () => {
    expect(candidatoANumeroSei('1'.repeat(25))).toBe(true)
    expect(candidatoANumeroSei('1'.repeat(26))).toBe(false)
  })
})
