import { describe, expect, it } from 'vitest'
import { construirOpcoesFetchSei } from './fetchSeiOptions'

describe('construirOpcoesFetchSei', () => {
  it('monta body urlencoded + Content-Type quando bodyRaw é informado', () => {
    const opcoes = construirOpcoesFetchSei({ method: 'POST', bodyRaw: 'a=1&b=2' })
    expect(opcoes.method).toBe('POST')
    expect(opcoes.body).toBe('a=1&b=2')
    expect(opcoes.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
  })

  it('monta URLSearchParams a partir de body quando bodyRaw não é informado', () => {
    const opcoes = construirOpcoesFetchSei({ method: 'POST', body: 'x=1' })
    expect(opcoes.body).toBeInstanceOf(URLSearchParams)
    expect((opcoes.body as URLSearchParams).toString()).toBe('x=1')
    expect(opcoes.headers).toBeUndefined()
  })

  it('não define body nem headers quando nem body nem bodyRaw são informados (GET)', () => {
    const opcoes = construirOpcoesFetchSei({ method: 'GET' })
    expect(opcoes.body).toBeUndefined()
    expect(opcoes.headers).toBeUndefined()
  })

  it('monta FormData multipart a partir dos bytes quando upload é informado', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const opcoes = construirOpcoesFetchSei({
      upload: { fieldName: 'filArquivo', fileName: 'relatorio.pdf', bytes },
    })
    expect(opcoes.method).toBe('POST')
    expect(opcoes.headers).toBeUndefined()
    const formData = opcoes.body as FormData
    expect(formData).toBeInstanceOf(FormData)
    const arquivo = formData.get('filArquivo') as File
    expect(arquivo.name).toBe('relatorio.pdf')
    expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(bytes)
  })

  it('ignora bodyRaw/body quando upload também é informado (upload binário tem prioridade)', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const opcoes = construirOpcoesFetchSei({
      bodyRaw: 'nao-deveria-ser-usado',
      upload: { fieldName: 'filArquivo', fileName: 'a.pdf', bytes },
    })
    expect(opcoes.body).toBeInstanceOf(FormData)
  })

  it('respeita method customizado no upload quando informado', () => {
    const opcoes = construirOpcoesFetchSei({
      method: 'PUT',
      upload: { fieldName: 'f', fileName: 'a.pdf', bytes: new Uint8Array([1]) },
    })
    expect(opcoes.method).toBe('PUT')
  })
})
