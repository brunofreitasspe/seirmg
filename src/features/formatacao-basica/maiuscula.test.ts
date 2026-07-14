import { describe, expect, it } from 'vitest'
import { primeiraLetraMaiuscula } from './maiuscula'

describe('primeiraLetraMaiuscula', () => {
  it('deixa a primeira letra maiúscula', () => {
    expect(primeiraLetraMaiuscula('processo administrativo')).toBe('Processo administrativo')
  })

  it('não muda nada se já estiver maiúscula', () => {
    expect(primeiraLetraMaiuscula('Processo')).toBe('Processo')
  })

  it('retorna string vazia sem quebrar', () => {
    expect(primeiraLetraMaiuscula('')).toBe('')
  })
})
