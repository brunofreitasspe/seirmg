import { describe, expect, it, vi } from 'vitest'
import { extrairInfoRedirecionamento, fetchListaProcessos } from './fetchListaProcessos'

function montarHtmlTabela(): string {
  return `<html><body>
    <form id="frmProcedimentoControlar"><input id="hdnTipoVisualizacao" value="D" /></form>
    <table id="tblProcessosDetalhado"><tbody><tr id="P1"><td></td><td></td><td><a href="#">1</a></td></tr></tbody></table>
  </body></html>`
}

function montarHtmlRedirecionamento(actionUrl: string): string {
  return `<html><body><form id="frmProcedimentoControlar" action="${actionUrl}"><input id="hdnTipoVisualizacao" value="R" /></form></body></html>`
}

describe('extrairInfoRedirecionamento', () => {
  it('extrai tipoVisualizacao e acaoRedirecionamento do HTML', () => {
    const info = extrairInfoRedirecionamento(montarHtmlRedirecionamento('/controlador.php?acao=outro'))
    expect(info).toEqual({ tipoVisualizacao: 'R', acaoRedirecionamento: '/controlador.php?acao=outro' })
  })

  it('retorna tipoVisualizacao sem acaoRedirecionamento quando já é a tabela final', () => {
    const info = extrairInfoRedirecionamento(montarHtmlTabela())
    expect(info.tipoVisualizacao).toBe('D')
  })
})

describe('fetchListaProcessos', () => {
  it('retorna os itens direto quando a primeira resposta já é a tabela (tipoVisualizacao=D)', async () => {
    const fetchText = vi.fn().mockResolvedValue({ ok: true, data: montarHtmlTabela() })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })

    expect(resultado.ok).toBe(true)
    expect(fetchText).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual({ ok: true, data: [{ id: 'P1', numero: '1', visualizado: false }] })
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
    expect(resultado).toEqual({ ok: true, data: [{ id: 'P1', numero: '1', visualizado: false }] })
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

  it('usa extrairInfoRedirecionamento e extrairProcessos injetados em vez do DOMParser direto', async () => {
    const fetchText = vi.fn().mockResolvedValue({ ok: true, data: 'html-qualquer' })
    const extrairInfoRedirecionamentoFn = vi.fn().mockResolvedValue({ tipoVisualizacao: 'D' })
    const extrairProcessos = vi.fn().mockResolvedValue([{ id: 'X', numero: '9', visualizado: true }])

    const resultado = await fetchListaProcessos('https://sei.exemplo.br', {
      fetchText,
      extrairInfoRedirecionamento: extrairInfoRedirecionamentoFn,
      extrairProcessos,
    })

    expect(extrairInfoRedirecionamentoFn).toHaveBeenCalledWith('html-qualquer')
    expect(extrairProcessos).toHaveBeenCalledWith('html-qualquer')
    expect(resultado).toEqual({ ok: true, data: [{ id: 'X', numero: '9', visualizado: true }] })
  })
})
