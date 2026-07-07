import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import type { ProcessoItem } from '../../features/processos-novos/types'

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

export const NOTIFICATION_ID_PREFIX_PROCESSO = 'seirmg-processo-novo-'

export function buildNotificationIdProcesso(item: ProcessoItem): string {
  return `${NOTIFICATION_ID_PREFIX_PROCESSO}${item.id}`
}

export function notificarNovoProcesso(item: ProcessoItem, tocarSom: boolean): void {
  chrome.notifications.create(buildNotificationIdProcesso(item), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Processo novo',
    message: `Processo ${item.numero} está com pendência de visualização.`,
    priority: 2,
    silent: !tocarSom,
  })
}
