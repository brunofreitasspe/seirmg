import { describe, expect, it } from 'vitest'
import { trechoHorizontal } from './trechoTexto'

// medidor "monoespaçado": cada caractere mede 1
const porCaractere = (s: string): number => s.length

describe('trechoHorizontal', () => {
  it('recorta só o trecho pedido dentro de um item de texto mais longo', () => {
    // "Nome: 123" com largura total 90 -> cada caractere 10; "123" começa no 6
    expect(trechoHorizontal('Nome: 123', 6, 9, 90, porCaractere)).toEqual({ inicio: 60, fim: 90 })
  })

  it('usa a medida real dos caracteres (fonte proporcional)', () => {
    const largo = (s: string): number => [...s].reduce((soma, c) => soma + (c === 'W' ? 3 : 1), 0)
    // "WW12": larguras 3,3,1,1 = 8 -> total 80 => "12" vai de 60 a 80
    expect(trechoHorizontal('WW12', 2, 4, 80, largo)).toEqual({ inicio: 60, fim: 80 })
  })

  it('item inteiro devolve a largura toda', () => {
    expect(trechoHorizontal('123', 0, 3, 30, porCaractere)).toEqual({ inicio: 0, fim: 30 })
  })

  it('cai pra proporção por caractere quando o medidor não mede nada', () => {
    expect(trechoHorizontal('abcd', 2, 4, 40, () => 0)).toEqual({ inicio: 20, fim: 40 })
  })
})
