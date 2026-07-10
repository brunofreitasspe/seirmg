import { describe, expect, it } from 'vitest'
import { decodificarPayloadJwtSemVerificar, tokenValido } from './token'

function construirToken(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown): string =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const header = base64url({ alg: 'HS256', typ: 'JWT' })
  const body = base64url(payload)
  return `${header}.${body}.assinatura-fake`
}

describe('decodificarPayloadJwtSemVerificar', () => {
  it('decodifica um payload válido', () => {
    const token = construirToken({ userId: 1, email: 'a@b.com', exp: 1999999999 })
    expect(decodificarPayloadJwtSemVerificar(token)).toEqual({
      userId: 1,
      email: 'a@b.com',
      exp: 1999999999,
    })
  })

  it('retorna null para token com menos de 3 partes', () => {
    expect(decodificarPayloadJwtSemVerificar('apenas-uma-parte')).toBeNull()
  })

  it('retorna null para token com mais de 3 partes', () => {
    expect(decodificarPayloadJwtSemVerificar('a.b.c.d')).toBeNull()
  })

  it('retorna null quando a parte do payload não é JSON válido', () => {
    const payloadInvalido = btoa('não é json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodificarPayloadJwtSemVerificar(`header.${payloadInvalido}.assinatura`)).toBeNull()
  })
})

describe('tokenValido', () => {
  it('é falso quando tokenExp está ausente', () => {
    expect(tokenValido(undefined, '2026-07-09T12:00:00.000Z')).toBe(false)
  })

  it('é falso quando tokenExp já passou', () => {
    const agora = new Date('2026-07-09T12:00:00.000Z')
    const tokenExpNoPassado = Math.floor(agora.getTime() / 1000) - 10
    expect(tokenValido(tokenExpNoPassado, agora.toISOString())).toBe(false)
  })

  it('é verdadeiro quando tokenExp está no futuro', () => {
    const agora = new Date('2026-07-09T12:00:00.000Z')
    const tokenExpNoFuturo = Math.floor(agora.getTime() / 1000) + 3600
    expect(tokenValido(tokenExpNoFuturo, agora.toISOString())).toBe(true)
  })
})
