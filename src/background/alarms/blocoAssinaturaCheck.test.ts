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

    expect(processarItens).toHaveBeenCalledWith([
      { id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'aberto' },
    ])
  })
})
