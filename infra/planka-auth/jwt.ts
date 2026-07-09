import crypto from 'node:crypto'

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(input: string): string {
  let normalizado = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalizado.length % 4) normalizado += '='
  return Buffer.from(normalizado, 'base64').toString('utf8')
}

function assinar(headerCod: string, payloadCod: string, segredo: string): string {
  return crypto
    .createHmac('sha256', segredo)
    .update(`${headerCod}.${payloadCod}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function assinarJwt(payload: Record<string, unknown>, segredo: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerCod = base64url(JSON.stringify(header))
  const payloadCod = base64url(JSON.stringify(payload))
  const assinatura = assinar(headerCod, payloadCod, segredo)
  return `${headerCod}.${payloadCod}.${assinatura}`
}

export function verificarJwt(token: string, segredo: string): Record<string, unknown> {
  const partes = token.split('.')
  if (partes.length !== 3) throw new Error('Token malformado')
  const [headerCod, payloadCod, assinaturaRecebida] = partes

  const assinaturaEsperada = assinar(headerCod, payloadCod, segredo)
  if (assinaturaRecebida !== assinaturaEsperada) throw new Error('Assinatura inválida')

  const payload = JSON.parse(base64urlDecode(payloadCod)) as Record<string, unknown>
  if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expirado')
  }

  return payload
}
