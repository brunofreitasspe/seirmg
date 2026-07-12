import { describe, expect, it } from 'vitest'
import { montarDialogoConfirmacao } from './montarDialogo'

describe('montarDialogoConfirmacao', () => {
  it('monta um <dialog> com título, unidade e lista de documentos', () => {
    const dialog = montarDialogoConfirmacao(
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

  it('inclui botões de cancelar e confirmar', () => {
    const dialog = montarDialogoConfirmacao([{ id: '200', nome: 'Ofício 2/2026' }], 'HMMG-DIR ADM')

    const cancelar = dialog.querySelector('.seirmg-alerta-nao-assinados-cancelar')
    const confirmar = dialog.querySelector('.seirmg-alerta-nao-assinados-confirmar')
    expect(cancelar?.textContent).toBe('Cancelar')
    expect(confirmar?.textContent).toBe('Enviar mesmo assim')
  })
})
