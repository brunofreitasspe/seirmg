import { describe, expect, it, vi } from 'vitest'
import { verificarProcessosNovos } from './processosNovosCheck'

function montarDocumentoComLinha(): Document {
  return new DOMParser().parseFromString(
    '<table id="tblProcessosDetalhado"><tbody><tr id="P1"><td></td><td></td><td><a href="#">1</a></td></tr></tbody></table>',
    'text/html'
  )
}

describe('verificarProcessosNovos', () => {
  it('interrompe silenciosamente quando o fetch falha', async () => {
    const processarItens = vi.fn()
    await verificarProcessosNovos({
      fetchProcessosDocument: async () => ({ ok: false, error: 'timeout' }),
      processarItens,
    })
    expect(processarItens).not.toHaveBeenCalled()
  })

  it('faz parse do Document retornado e delega os itens para processarItens', async () => {
    const processarItens = vi.fn()

    await verificarProcessosNovos({
      fetchProcessosDocument: async () => ({ ok: true, data: montarDocumentoComLinha() }),
      processarItens,
    })

    expect(processarItens).toHaveBeenCalledWith([{ id: 'P1', numero: '1', visualizado: false }])
  })

  it('não propaga erro quando processarItens rejeita', async () => {
    const processarItens = vi.fn().mockRejectedValue(new Error('boom'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      verificarProcessosNovos({
        fetchProcessosDocument: async () => ({ ok: true, data: montarDocumentoComLinha() }),
        processarItens,
      })
    ).resolves.not.toThrow()

    expect(processarItens).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
