import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
import { fetchText } from '../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import {
  NOTIFICATION_ID_PREFIX,
  NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA,
  NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX,
  NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX,
  notificarLembreteBlocoAssinatura,
  notificarBlocoDisponibilizado,
} from './notifications/notify'
import { processarTarefasVencidas } from './tarefasPipeline'
import { ALARME_LEMBRETE_BLOCO_ASSINATURA, agendarLembreteBlocoAssinatura } from './lembreteBlocoAssinatura'
import { construirOpcoesFetchSei } from './fetchSeiOptions'
import type { ArquivoUploadMensagem } from '../lib/fetchViaBackground'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}

interface MensagemBlocoDisponibilizado {
  type: 'seirmg:bloco-disponibilizado'
  bloco: { numero: string; descricao: string }
}

interface MensagemTarefasVencidas {
  type: 'seirmg:tarefas-vencidas'
  tarefas: Array<{ id: string; titulo: string }>
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
  // Presente só quando o chamador precisa de um upload multipart real (ex.: enviarAoProcesso.ts,
  // ferramentas de PDF enviando o resultado pro processo aberto) -- ver fetchSeiOptions.ts.
  upload?: ArquivoUploadMensagem
}

interface MensagemFetchIA {
  type: 'seirmg:fetch-ia'
  url: string
  method: string
  headers: Record<string, string>
  body: string
  // Opcional: o Agente de IA pede mais que o padrão (resposta com raciocínio pode passar de 1 min).
  timeoutMs?: number
}

const TIMEOUT_FETCH_IA_PADRAO_MS = 60_000
const TIMEOUT_FETCH_IA_MAXIMO_MS = 300_000

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

function ehMensagemBlocoDisponibilizado(mensagem: unknown): mensagem is MensagemBlocoDisponibilizado {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-disponibilizado'
  )
}

function ehMensagemTarefasVencidas(mensagem: unknown): mensagem is MensagemTarefasVencidas {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:tarefas-vencidas'
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

function ehMensagemFetchIA(mensagem: unknown): mensagem is MensagemFetchIA {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:fetch-ia'
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

async function reagendarLembreteBlocoAssinatura(): Promise<void> {
  const config = await createSyncConfigStore().get()
  agendarLembreteBlocoAssinatura(config.blocoAssinatura.lembreteIntervaloMinutos)
}

chrome.runtime.onInstalled.addListener(() => {
  marcarIndicadorConfiguracao().catch((error) => {
    console.error('[SEIRMG] Falha ao marcar indicador de configuração pendente:', error)
  })
  reagendarLembreteBlocoAssinatura().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar lembrete de bloco de assinatura:', error)
  })
})

chrome.runtime.onStartup.addListener(() => {
  reagendarLembreteBlocoAssinatura().catch((error) => {
    console.error('[SEIRMG] Falha ao reagendar lembrete de bloco de assinatura:', error)
  })
})

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area !== 'sync' || !('config' in mudancas)) return
  reagendarLembreteBlocoAssinatura().catch((error) => {
    console.error('[SEIRMG] Falha ao reagendar lembrete de bloco de assinatura após mudança de config:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARME_LEMBRETE_BLOCO_ASSINATURA) return
  notificarLembreteBlocoAssinatura()
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
  if (!ehMensagemBlocoDisponibilizado(mensagem)) return
  notificarBlocoDisponibilizado(mensagem.bloco)
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemTarefasVencidas(mensagem)) return
  processarTarefasVencidas(mensagem.tarefas).catch((error) => {
    console.error('[SEIRMG] Falha ao processar tarefas vencidas:', error)
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
  fetchTextComGate(mensagem.url, construirOpcoesFetchSei(mensagem))
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchIA(mensagem)) return false
  fetchText(mensagem.url, {
    method: mensagem.method,
    headers: mensagem.headers,
    body: mensagem.body,
    timeoutMs: Math.min(mensagem.timeoutMs ?? TIMEOUT_FETCH_IA_PADRAO_MS, TIMEOUT_FETCH_IA_MAXIMO_MS),
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

    if (
      notificationId.startsWith(NOTIFICATION_ID_PREFIX) ||
      notificationId === NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA ||
      notificationId.startsWith(NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX)
    ) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
      )
    } else if (notificationId.startsWith(NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX)) {
      // Sem tela dedicada de tarefas -- o painel convive em qualquer página do SEI, então só
      // focamos/abrimos a aba do SEI onde o usuário já estava.
      await abrirOuFocarAba(localConfig.baseUrlSei, localConfig.baseUrlSei)
    }

    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique em notificação:', error)
  }
})
