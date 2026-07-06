import { createLocalConfigStore } from '../../lib/storage'

const BADGE_ID = 'seirmg-badge-pendencias'

export async function renderBadge(): Promise<void> {
  const existente = document.getElementById(BADGE_ID)
  if (existente) existente.remove()

  const localConfig = await createLocalConfigStore().get()
  // conta itens rastreados como pendentes; remoção ao assinar/resolver fica para um plano futuro
  const totalPendente = Object.keys(localConfig.blocoAssinaturaNotificado).length
  if (totalPendente === 0) return

  const logo = document.querySelector('#lnkInfraLogo, #divLogoSEI, .infraLogo')
  const container = logo?.parentElement ?? document.body

  const badge = document.createElement('span')
  badge.id = BADGE_ID
  badge.textContent = String(totalPendente)
  badge.title = `${totalPendente} pendência(s) de assinatura`
  badge.style.cssText =
    'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;' +
    'background:#e46e64;color:#fff;font-size:11px;font-weight:bold;vertical-align:top;'

  container.appendChild(badge)
}
