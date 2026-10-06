import { describe, expect, it } from 'vitest'
import { ehPedidoRecarregarArvore, TIPO_RECARREGAR_ARVORE } from './recarregarArvore'

describe('ehPedidoRecarregarArvore', () => {
  it('aceita o pedido do mesmo processo', () => {
    expect(ehPedidoRecarregarArvore({ type: TIPO_RECARREGAR_ARVORE, idProcedimento: '123' }, '123')).toBe(true)
  })

  it('ignora pedido de outro processo (outra aba do SEI aberta em outro processo)', () => {
    expect(ehPedidoRecarregarArvore({ type: TIPO_RECARREGAR_ARVORE, idProcedimento: '456' }, '123')).toBe(false)
  })

  it('ignora outras mensagens', () => {
    expect(ehPedidoRecarregarArvore({ type: 'seirmg:outra', idProcedimento: '123' }, '123')).toBe(false)
    expect(ehPedidoRecarregarArvore(null, '123')).toBe(false)
  })

  it('ignora quando a página atual não tem id_procedimento', () => {
    expect(ehPedidoRecarregarArvore({ type: TIPO_RECARREGAR_ARVORE, idProcedimento: '123' }, null)).toBe(false)
  })
})
