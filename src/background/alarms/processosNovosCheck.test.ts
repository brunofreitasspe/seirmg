import { describe, expect, it, vi } from 'vitest'
import { verificarProcessosNovos } from './processosNovosCheck'

describe('verificarProcessosNovos', () => {
  it('interrompe silenciosamente quando o fetch falha', async () => {
    const processarItens = vi.fn()
    await verificarProcessosNovos({
      fetchProcessosItens: async () => ({ ok: false, error: 'timeout' }),
      processarItens,
    })
    expect(processarItens).not.toHaveBeenCalled()
  })

  it('delega os itens já extraídos para processarItens', async () => {
    const processarItens = vi.fn()
    const itens = [{ id: 'P1', numero: '1', visualizado: false }]

    await verificarProcessosNovos({
      fetchProcessosItens: async () => ({ ok: true, data: itens }),
      processarItens,
    })

    expect(processarItens).toHaveBeenCalledWith(itens)
  })

  it('não propaga erro quando processarItens rejeita', async () => {
    const processarItens = vi.fn().mockRejectedValue(new Error('boom'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      verificarProcessosNovos({
        fetchProcessosItens: async () => ({ ok: true, data: [] }),
        processarItens,
      })
    ).resolves.not.toThrow()

    expect(processarItens).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
