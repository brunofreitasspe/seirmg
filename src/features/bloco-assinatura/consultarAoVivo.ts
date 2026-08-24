import type { BlocoAssinaturaResumo } from './types'

export type ConsultaBlocosAoVivo = { ok: true; total: number; resumo: BlocoAssinaturaResumo } | { ok: false }

export async function consultarBlocosAoVivo(baseUrlSei: string | undefined): Promise<ConsultaBlocosAoVivo> {
  if (!baseUrlSei) return { ok: false }
  try {
    const [aba] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
    if (!aba?.id) return { ok: false }
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      type: 'seirmg:consultar-blocos-disponibilizados',
    })
    if (!resposta?.ok || typeof resposta.total !== 'number' || !resposta.resumo) return { ok: false }
    return { ok: true, total: resposta.total, resumo: resposta.resumo }
  } catch (error) {
    // Esperado quando a aba do SEI encontrada não tem o content script ativo (ex.: aba aberta
    // antes de a extensão ser recarregada) — quem chama já cai graciosamente no estado
    // "indisponível", então isso não é um erro de verdade, só um diagnóstico.
    console.warn('[SEIRMG] Não foi possível consultar blocos de assinatura ao vivo:', error)
    return { ok: false }
  }
}
