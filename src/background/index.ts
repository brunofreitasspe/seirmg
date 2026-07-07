import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchText } from '../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { passouIntervalo } from '../lib/throttle'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'
const INTERVALO_MINIMO_VERIFICACAO_IMEDIATA_MINUTOS = 2

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}

interface MensagemSeiDetectado {
  type: 'seirmg:sei-detectado'
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

async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function verificarBlocoAssinaturaViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarBlocoAssinatura({
    fetchBlocoAssinaturaHtml: () =>
      fetchText(`${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`),
    parseOptions: { seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true },
  })
}

let verificacaoImediataEmAndamento = false

async function verificarImediatoSeNecessario(): Promise<void> {
  if (verificacaoImediataEmAndamento) return
  verificacaoImediataEmAndamento = true

  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    const agoraIso = new Date().toISOString()

    if (
      !passouIntervalo(
        localConfig.ultimaVerificacaoImediata,
        agoraIso,
        INTERVALO_MINIMO_VERIFICACAO_IMEDIATA_MINUTOS
      )
    ) {
      return
    }

    await localStore.set({ ...localConfig, ultimaVerificacaoImediata: agoraIso })
    await verificarBlocoAssinaturaViaFetch()
  } finally {
    verificacaoImediataEmAndamento = false
  }
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  verificarBlocoAssinaturaViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
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
  verificarImediatoSeNecessario().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar imediatamente após detectar sessão do SEI:', error)
  })
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return

    const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
    const [abaExistente] = await chrome.tabs.query({ url: `${localConfig.baseUrlSei}/*` })

    if (abaExistente?.id) {
      chrome.tabs.update(abaExistente.id, { active: true, url })
      if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
    } else {
      chrome.tabs.create({ url })
    }
    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique na notificação do bloco de assinatura:', error)
  }
})
