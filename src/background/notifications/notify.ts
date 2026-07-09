import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

export const NOTIFICATION_ID_PREFIX = 'seirmg-bloco-assinatura-'

export function buildNotificationId(item: BlocoAssinaturaItem): string {
  return `${NOTIFICATION_ID_PREFIX}${item.id}`
}

export function notificarNovoBloco(item: BlocoAssinaturaItem, tocarSom: boolean): void {
  chrome.notifications.create(buildNotificationId(item), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Bloco de assinatura pendente',
    message: `Bloco ${item.numero} está com pendência de assinatura.`,
    priority: 2,
    silent: !tocarSom,
  })
}

export const NOTIFICATION_ID_SESSAO_INVALIDA = 'seirmg-sessao-invalida'

export function notificarSessaoInvalida(): void {
  chrome.notifications.create(NOTIFICATION_ID_SESSAO_INVALIDA, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Sessão do SEI parece ter caído',
    message:
      'A extensão vai pausar as checagens de fundo por alguns minutos. Se estiver navegando, talvez precise logar de novo.',
    priority: 1,
  })
}
