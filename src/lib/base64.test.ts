import { describe, expect, it } from 'vitest'
import { bytesParaBase64, base64ParaBytes } from './base64'

describe('bytesParaBase64 / base64ParaBytes', () => {
  it('ida e volta preserva todos os 256 valores de byte', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    expect(base64ParaBytes(bytesParaBase64(bytes))).toEqual(bytes)
  })

  it('codifica no formato base64 padrão', () => {
    expect(bytesParaBase64(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe('JVBERg==')
  })

  it('aguenta arquivos maiores que o limite de argumentos de String.fromCharCode', () => {
    const bytes = new Uint8Array(300_000).map((_, i) => (i * 7) % 256)
    expect(base64ParaBytes(bytesParaBase64(bytes))).toEqual(bytes)
  })

  it('array vazio vira string vazia e volta', () => {
    expect(bytesParaBase64(new Uint8Array())).toBe('')
    expect(base64ParaBytes('')).toEqual(new Uint8Array())
  })
})
