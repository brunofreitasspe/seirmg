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

export const NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA = 'seirmg-lembrete-bloco-assinatura'

export function notificarLembreteBlocoAssinatura(): void {
  chrome.notifications.create(NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Lembrete',
    message: 'Não esqueça de conferir o Bloco de Assinatura.',
    priority: 1,
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

export const NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX = 'seirmg-bloco-disponibilizado-'

// Sem `href` de propósito -- ver "Desvio deliberado da spec" no cabeçalho do plano: o clique reaproveita
// a mesma navegação genérica pra tela de Blocos de Assinatura que as outras notificações de bloco já usam.
export function notificarBlocoDisponibilizado(bloco: { numero: string; descricao: string }): void {
  chrome.notifications.create(`${NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX}${bloco.numero}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Bloco de Assinatura disponibilizado',
    message: `Bloco ${bloco.numero}${bloco.descricao ? ` (${bloco.descricao})` : ''} está disponível para sua área assinar.`,
    priority: 2,
  })
}

export const NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX = 'seirmg-tarefa-vencida-'

export function notificarTarefaVencida(tarefa: { id: string; titulo: string }): void {
  chrome.notifications.create(`${NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX}${tarefa.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Tarefa vencida',
    message: `"${tarefa.titulo || 'Sem título'}" está com o prazo vencido.`,
    priority: 1,
  })
}
