// Referência interna: link pra um parágrafo numerado do próprio documento. O SEI numera esses
// parágrafos pela CSS (contadores), então o número exibido é recalculado aqui pela ordem e nível.
import { escaparHtml } from '../../content-scripts/documento_editar/dom'

export const PREFIXO_ANCORA = 'seirmg-ref-'

const PLURAIS: Record<string, string> = {
  item: 'itens',
  'art.': 'arts.',
  artigo: 'artigos',
  inciso: 'incisos',
  'alínea': 'alíneas',
  'parágrafo': 'parágrafos',
}

export function numerarParagrafos(niveis: number[]): string[] {
  const contadores: number[] = []
  return niveis.map((nivel) => {
    contadores[nivel - 1] = (contadores[nivel - 1] ?? 0) + 1
    contadores.length = nivel
    return Array.from({ length: nivel }, (_, i) => contadores[i] ?? 1).join('.')
  })
}

export function montarReferenciaHtml(alvos: Array<{ id: string; numero: string }>, prefixo: string): string {
  const links = alvos.map((alvo) => `<a href="#${alvo.id}" class="seirmg-ref-interna">${escaparHtml(alvo.numero)}</a>`)
  const lista = links.length <= 1 ? links.join('') : `${links.slice(0, -1).join(', ')} e ${links[links.length - 1]}`
  const base = prefixo.trim()
  if (!base) return lista
  const prefixoFinal = alvos.length > 1 ? (PLURAIS[base.toLowerCase()] ?? base) : base
  return `${escaparHtml(prefixoFinal)} ${lista}`
}
