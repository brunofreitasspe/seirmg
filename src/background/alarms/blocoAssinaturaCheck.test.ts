import { describe, expect, it, vi } from 'vitest'
import { verificarBlocoAssinatura } from './blocoAssinaturaCheck'

describe('verificarBlocoAssinatura', () => {
  it('interrompe silenciosamente quando o fetch falha', async () => {
    const processarItens = vi.fn()
    await verificarBlocoAssinatura({
      fetchBlocoAssinaturaHtml: async () => ({ ok: false, error: 'timeout' }),
      parseOptions: { seiVersionAtLeast4: true },
      processarItens,
    })
    expect(processarItens).not.toHaveBeenCalled()
  })

  it('faz parse do HTML retornado e delega os itens para processarItens', async () => {
    const processarItens = vi.fn()
    const html = `<div id="divInfraAreaTabela"><table><tbody>
      <tr><td></td><td>Nº</td><td>Tipo</td><td>Data</td><td>Estado</td><td>Unidade</td><td>Disp</td></tr>
      <tr><td></td><td><a href="/bloco/1">1</a></td><td>Assinatura</td><td>01/01/2026</td><td>Aberto</td><td>UNIDADE-A</td><td></td></tr>
    </tbody></table></div>`

    await verificarBlocoAssinatura({
      fetchBlocoAssinaturaHtml: async () => ({ ok: true, data: html }),
      parseOptions: { seiVersionAtLeast4: true },
      processarItens,
    })

    expect(processarItens).toHaveBeenCalledWith(
      [{ id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'aberto' }],
      { sempreNotificarPendentes: true }
    )
  })

  it('não propaga erro quando processarItens rejeita', async () => {
    const html = `<div id="divInfraAreaTabela"><table><tbody>
      <tr><td></td><td>Nº</td><td>Tipo</td><td>Data</td><td>Estado</td><td>Unidade</td><td>Disp</td></tr>
      <tr><td></td><td><a href="/bloco/1">1</a></td><td>Assinatura</td><td>01/01/2026</td><td>Aberto</td><td>UNIDADE-A</td><td></td></tr>
    </tbody></table></div>`
    const processarItens = vi.fn().mockRejectedValue(new Error('boom'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      verificarBlocoAssinatura({
        fetchBlocoAssinaturaHtml: async () => ({ ok: true, data: html }),
        parseOptions: { seiVersionAtLeast4: true },
        processarItens,
      }),
    ).resolves.not.toThrow()

    expect(processarItens).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('usa parseBlocoAssinaturaHtml injetado em vez do DOMParser direto', async () => {
    const processarItens = vi.fn()
    const parseBlocoAssinaturaHtml = vi
      .fn()
      .mockResolvedValue([{ id: '/bloco/9', numero: '9', link: '/bloco/9', estado: 'aberto' }])

    await verificarBlocoAssinatura({
      fetchBlocoAssinaturaHtml: async () => ({ ok: true, data: 'html-qualquer' }),
      parseOptions: { seiVersionAtLeast4: true },
      parseBlocoAssinaturaHtml,
      processarItens,
    })

    expect(parseBlocoAssinaturaHtml).toHaveBeenCalledWith('html-qualquer', { seiVersionAtLeast4: true })
    expect(processarItens).toHaveBeenCalledWith(
      [{ id: '/bloco/9', numero: '9', link: '/bloco/9', estado: 'aberto' }],
      { sempreNotificarPendentes: true }
    )
  })
})
