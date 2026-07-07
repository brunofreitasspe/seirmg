import { describe, expect, it, vi } from 'vitest'
import { fetchListaProcessos } from './fetchListaProcessos'

function montarHtmlTabela(): string {
  return '<html><body><form id="frmProcedimentoControlar"><input id="hdnTipoVisualizacao" value="D" /></form></body></html>'
}

function montarHtmlRedirecionamento(actionUrl: string): string {
  return `<html><body><form id="frmProcedimentoControlar" action="${actionUrl}"><input id="hdnTipoVisualizacao" value="R" /></form></body></html>`
}

describe('fetchListaProcessos', () => {
  it('retorna o Document direto quando a primeira resposta já é a tabela (tipoVisualizacao=D)', async () => {
    const fetchText = vi.fn().mockResolvedValue({ ok: true, data: montarHtmlTabela() })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })

    expect(resultado.ok).toBe(true)
    expect(fetchText).toHaveBeenCalledTimes(1)
    if (resultado.ok) {
      expect(resultado.data.querySelector('#hdnTipoVisualizacao')?.getAttribute('value')).toBe('D')
    }
  })

  it('refaz a requisição uma vez quando recebe o formulário de redirecionamento', async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: montarHtmlRedirecionamento('/controlador.php?acao=outro') })
      .mockResolvedValueOnce({ ok: true, data: montarHtmlTabela() })

    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })

    expect(resultado.ok).toBe(true)
    expect(fetchText).toHaveBeenCalledTimes(2)
    expect(fetchText).toHaveBeenNthCalledWith(
      2,
      'https://sei.exemplo.br/controlador.php?acao=outro',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('retorna erro quando o fetch inicial falha', async () => {
    const fetchText = vi.fn().mockResolvedValue({ ok: false, error: 'Timeout' })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })
    expect(resultado).toEqual({ ok: false, error: 'Timeout' })
    expect(fetchText).toHaveBeenCalledTimes(1)
  })

  it('retorna erro quando a retentativa também falha', async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: montarHtmlRedirecionamento('/controlador.php?acao=outro') })
      .mockResolvedValueOnce({ ok: false, error: 'Timeout' })

    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })
    expect(resultado).toEqual({ ok: false, error: 'Timeout' })
    expect(fetchText).toHaveBeenCalledTimes(2)
  })

  it('retorna erro quando o formulário de redirecionamento não tem action', async () => {
    const fetchText = vi.fn().mockResolvedValue({
      ok: true,
      data: '<html><body><form id="frmProcedimentoControlar"><input id="hdnTipoVisualizacao" value="R" /></form></body></html>',
    })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })
    expect(resultado.ok).toBe(false)
  })
})
