import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
import { createLocalConfigStore } from '../lib/storage'
import { NOTIFICATION_ID_PREFIX } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}

interface MensagemSeiDetectado {
  type: 'seirmg:sei-detectado'
}

interface MensagemFetchSei {
  type: 'seirmg:fetch-sei'
  url: string
  method?: string
  body?: string
  bodyRaw?: string
}

interface MensagemTelaLoginDetectada {
  type: 'seirmg:tela-login-detectada'
}

function ehMensagemItensBloco(mensagem: unknown): mensagem is MensagemItensBloco {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

function ehMensagemSeiDetectado(mensagem: unknown): mensagem is MensagemSeiDetectado {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:sei-detectado'
  )
}

function ehMensagemFetchSei(mensagem: unknown): mensagem is MensagemFetchSei {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:fetch-sei'
  )
}

function ehMensagemTelaLoginDetectada(mensagem: unknown): mensagem is MensagemTelaLoginDetectada {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:tela-login-detectada'
  )
}

async function abrirOuFocarAba(baseUrlSei: string, url: string): Promise<void> {
  const [abaExistente] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
}

async function marcarIndicadorConfiguracao(): Promise<void> {
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  await localStore.set({ ...localConfig, mostrarIndicadorConfiguracao: true })
}

chrome.runtime.onInstalled.addListener(() => {
  marcarIndicadorConfiguracao().catch((error) => {
    console.error('[SEIRMG] Falha ao marcar indicador de configuração pendente:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  processarItensBlocoAssinatura(mensagem.itens).catch((error) => {
    console.error(
      '[SEIRMG] Falha ao processar itens do bloco de assinatura recebidos via mensagem:',
      error
    )
  })
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemSeiDetectado(mensagem)) return
  registrarNavegacaoReal().catch((error) => {
    console.error('[SEIRMG] Falha ao registrar navegação real:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchSei(mensagem)) return false
  fetchTextComGate(mensagem.url, {
    method: mensagem.method,
    body:
      mensagem.bodyRaw !== undefined
        ? mensagem.bodyRaw
        : mensagem.body !== undefined
          ? new URLSearchParams(mensagem.body)
          : undefined,
    headers: mensagem.bodyRaw !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
  })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemTelaLoginDetectada(mensagem)) return
  abrirCircuitBreaker().catch((error) => {
    console.error('[SEIRMG] Falha ao abrir circuit breaker após detectar tela de login na aba real:', error)
  })
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return

    if (notificationId.startsWith(NOTIFICATION_ID_PREFIX)) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
      )
    }

    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique em notificação:', error)
  }
})
