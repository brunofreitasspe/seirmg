// Link curto pelo TinyURL: validação da entrada, URL da API e leitura da resposta (texto puro).
import type { Result } from '../../lib/result'
import { escaparAtributo, escaparHtml } from '../../content-scripts/documento_editar/dom'

export function validarUrlHttp(texto: string): { ok: true; url: string } | { ok: false } {
  const candidato = texto.trim()
  if (!candidato) return { ok: false }
  try {
    const url = new URL(candidato)
    return url.protocol === 'http:' || url.protocol === 'https:' ? { ok: true, url: candidato } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export function validarAlias(alias: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(alias)
}

export function montarUrlTinyUrl(url: string, alias?: string): string {
  const base = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`
  return alias ? `${base}&alias=${encodeURIComponent(alias)}` : base
}

export function interpretarRespostaTinyUrl(resultado: Result<string>): { ok: true; link: string } | { ok: false; erro: string } {
  if (!resultado.ok) {
    if (resultado.error === 'HTTP 422') {
      return { ok: false, erro: 'Esse nome personalizado já está em uso ou não é aceito. Tente outro.' }
    }
    return { ok: false, erro: `Não foi possível falar com o TinyURL (${resultado.error}). Tente de novo.` }
  }
  const link = resultado.data.trim()
  if (!/^https:\/\/tinyurl\.com\/\S+$/.test(link)) {
    return { ok: false, erro: 'O TinyURL não aceitou esse endereço. Confira o link e tente de novo.' }
  }
  return { ok: true, link }
}

export function montarLinkHtml(href: string, texto: string): string {
  return `<a href="${escaparAtributo(href)}">${escaparHtml(texto)}</a>`
}
