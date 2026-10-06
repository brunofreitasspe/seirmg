import { describe, expect, it } from 'vitest'
import { interpretarRespostaTinyUrl, montarLinkHtml, montarUrlTinyUrl, validarAlias, validarUrlHttp } from './linkCurto'

describe('validarUrlHttp', () => {
  it('aceita http(s) e tira espaços em volta', () => {
    expect(validarUrlHttp('  https://sei.gov.br/x?a=1  ')).toEqual({ ok: true, url: 'https://sei.gov.br/x?a=1' })
  })
  it('recusa texto comum, javascript: e vazio', () => {
    expect(validarUrlHttp('Ofício 123')).toEqual({ ok: false })
    expect(validarUrlHttp('javascript:alert(1)')).toEqual({ ok: false })
    expect(validarUrlHttp('')).toEqual({ ok: false })
  })
})

describe('validarAlias', () => {
  it('só letras, números e hífen', () => {
    expect(validarAlias('processo-123')).toBe(true)
    expect(validarAlias('com espaco')).toBe(false)
    expect(validarAlias('ç')).toBe(false)
  })
})

describe('montarUrlTinyUrl', () => {
  it('codifica a URL e inclui o nome personalizado quando houver', () => {
    expect(montarUrlTinyUrl('https://a.gov.br/?x=1&y=2')).toBe(
      'https://tinyurl.com/api-create.php?url=https%3A%2F%2Fa.gov.br%2F%3Fx%3D1%26y%3D2'
    )
    expect(montarUrlTinyUrl('https://a.gov.br', 'meu-link')).toBe(
      'https://tinyurl.com/api-create.php?url=https%3A%2F%2Fa.gov.br&alias=meu-link'
    )
  })
})

describe('interpretarRespostaTinyUrl', () => {
  it('resposta com o link curto', () => {
    expect(interpretarRespostaTinyUrl({ ok: true, data: 'https://tinyurl.com/abc123\n' })).toEqual({
      ok: true,
      link: 'https://tinyurl.com/abc123',
    })
  })
  it('nome personalizado em uso (HTTP 422)', () => {
    expect(interpretarRespostaTinyUrl({ ok: false, error: 'HTTP 422' })).toEqual({
      ok: false,
      erro: 'Esse nome personalizado já está em uso ou não é aceito. Tente outro.',
    })
  })
  it('corpo "Error" e falha de rede', () => {
    expect(interpretarRespostaTinyUrl({ ok: true, data: 'Error' }).ok).toBe(false)
    expect(interpretarRespostaTinyUrl({ ok: false, error: 'Timeout' })).toEqual({
      ok: false,
      erro: 'Não foi possível falar com o TinyURL (Timeout). Tente de novo.',
    })
  })
})

describe('montarLinkHtml', () => {
  it('escapa o texto e o endereço (aspas no atributo)', () => {
    expect(montarLinkHtml('https://tinyurl.com/a"b', 'Ofício <1>')).toBe(
      '<a href="https://tinyurl.com/a&quot;b">Ofício &lt;1&gt;</a>'
    )
  })
})
