import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchText } from './result'

function bufferDe(texto: string): ArrayBuffer {
  return new TextEncoder().encode(texto).buffer
}

describe('fetchText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna ok com o texto da resposta (sem charset no header, usa utf-8)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: () => Promise.resolve(bufferDe('conteudo')),
      })
    )
    const resultado = await fetchText('https://exemplo.br')
    expect(resultado).toEqual({ ok: true, data: 'conteudo' })
  })

  it('decodifica usando o charset do header Content-Type quando presente (não sempre utf-8)', async () => {
    // "ção" em ISO-8859-1 -- como utf-8 (comportamento antigo/errado de response.text()),
    // essa sequência de bytes não é válida e viraria caracteres de substituição.
    const bytesLatin1 = new Uint8Array([0xe7, 0xe3, 0x6f])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html; charset=iso-8859-1' },
        arrayBuffer: () => Promise.resolve(bytesLatin1.buffer),
      })
    )
    const resultado = await fetchText('https://exemplo.br')
    expect(resultado).toEqual({ ok: true, data: 'ção' })
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
