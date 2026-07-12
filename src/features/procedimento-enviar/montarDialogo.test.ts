import { describe, expect, it } from 'vitest'
import { montarDialogoAviso } from './montarDialogo'

describe('montarDialogoAviso', () => {
  it('monta um <dialog> com título, unidade e lista de documentos', () => {
    const dialog = montarDialogoAviso(
      [
        { id: '200', nome: 'Ofício 2/2026' },
        { id: '300', nome: 'Parecer 3/2026' },
      ],
      'HMMG-DIR ADM'
    )

    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog.className).toContain('seirmg-alerta-nao-assinados')
    expect(dialog.textContent).toContain('Documentos pendentes de assinatura')
    expect(dialog.textContent).toContain('HMMG-DIR ADM')

    const itens = dialog.querySelectorAll('.seirmg-alerta-nao-assinados-item')
    expect(itens).toHaveLength(2)
    expect(itens[0].textContent).toBe('Ofício 2/2026')
    expect(itens[1].textContent).toBe('Parecer 3/2026')
  })

  it('inclui um único botão de dispensar o aviso', () => {
    const dialog = montarDialogoAviso([{ id: '200', nome: 'Ofício 2/2026' }], 'HMMG-DIR ADM')

    const botoes = dialog.querySelectorAll('.seirmg-alerta-nao-assinados-rodape button')
    expect(botoes).toHaveLength(1)
    expect(botoes[0].textContent).toBe('Entendi')
  })
})
