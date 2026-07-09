import crypto from 'node:crypto'

export interface SenhaHash {
  salt: string
  hash: string
}

export function hashSenha(senha: string): SenhaHash {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return { salt, hash }
}

export function verificarSenha(senha: string, salt: string, hashEsperado: string): boolean {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashEsperado, 'hex'))
}
