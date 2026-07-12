import { createLocalConfigStore } from '../../lib/storage'

const BADGE_ID = 'seirmg-badge-pendencias'

export function encontrarContainerBadge(doc: Document): Element | null {
  const logo = doc.querySelector('#lnkInfraLogo, #divLogoSEI, .infraLogo')
  return logo?.parentElement ?? null
}

export async function renderBadge(): Promise<void> {
  const existente = document.getElementById(BADGE_ID)
  if (existente) existente.remove()

  const localConfig = await createLocalConfigStore().get()
  const totalPendente = localConfig.blocoAssinaturaPendenteAtual.length
  if (totalPendente === 0) return

  const container = encontrarContainerBadge(document)
  if (!container) return

  const badge = document.createElement('span')
  badge.id = BADGE_ID
  badge.textContent = String(totalPendente)
  badge.title = `${totalPendente} pendência(s) de assinatura`
  badge.style.cssText =
    'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;' +
    'background:#e46e64;color:#fff;font-size:11px;font-weight:bold;vertical-align:top;'

  container.appendChild(badge)
}
