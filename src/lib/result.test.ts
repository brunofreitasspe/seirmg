import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchText } from './result'

describe('fetchText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna ok com o texto da resposta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('conteudo') })
    )
    const resultado = await fetchText('https://exemplo.br')
    expect(resultado).toEqual({ ok: true, data: 'conteudo' })
  })

  it('retorna erro quando a resposta HTTP não é ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') })
    )
    const resultado = await fetchText('https://exemplo.br')
    expect(resultado).toEqual({ ok: false, error: 'HTTP 500' })
  })

  it('retorna erro quando a requisição estoura o timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const resultado = await fetchText('https://exemplo.br', { timeoutMs: 10 })
    expect(resultado.ok).toBe(false)
  })
})
