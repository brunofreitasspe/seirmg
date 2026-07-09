import { describe, expect, it } from 'vitest'
import { hashSenha, verificarSenha } from './hashSenha'

describe('hashSenha/verificarSenha', () => {
  it('verifica corretamente a senha certa', () => {
    const { salt, hash } = hashSenha('minhaSenhaSegura123')
    expect(verificarSenha('minhaSenhaSegura123', salt, hash)).toBe(true)
  })

  it('rejeita a senha errada', () => {
    const { salt, hash } = hashSenha('minhaSenhaSegura123')
    expect(verificarSenha('senhaErrada', salt, hash)).toBe(false)
  })

  it('gera salts diferentes a cada chamada, mesmo pra mesma senha', () => {
    const a = hashSenha('mesmaSenha')
    const b = hashSenha('mesmaSenha')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })
})
