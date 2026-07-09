import { describe, expect, it } from 'vitest'
import { assinarJwt, verificarJwt } from './jwt'

describe('assinarJwt/verificarJwt', () => {
  it('assina e verifica um token válido', () => {
    const payload = { userId: 1, email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 3600 }
    const token = assinarJwt(payload, 'segredo-de-teste')
    expect(verificarJwt(token, 'segredo-de-teste')).toEqual(payload)
  })

  it('rejeita token com assinatura adulterada', () => {
    const token = assinarJwt({ userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 }, 'segredo-de-teste')
    const partes = token.split('.')
    const tokenAdulterado = `${partes[0]}.${partes[1]}.assinaturaFalsa`
    expect(() => verificarJwt(tokenAdulterado, 'segredo-de-teste')).toThrow('Assinatura inválida')
  })

  it('rejeita token expirado', () => {
    const token = assinarJwt({ userId: 1, exp: Math.floor(Date.now() / 1000) - 10 }, 'segredo-de-teste')
    expect(() => verificarJwt(token, 'segredo-de-teste')).toThrow('Token expirado')
  })

  it('rejeita token malformado', () => {
    expect(() => verificarJwt('nao-e-um-jwt', 'segredo-de-teste')).toThrow('Token malformado')
  })

  it('rejeita verificação com segredo diferente do usado pra assinar', () => {
    const token = assinarJwt({ userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 }, 'segredo-A')
    expect(() => verificarJwt(token, 'segredo-B')).toThrow('Assinatura inválida')
  })
})
