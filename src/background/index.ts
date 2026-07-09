import { ALARM_NAME } from './alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS, verificarProcessosNovos } from './alarms/processosNovosCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal } from './sessionGate'
import { verificarBlocoAssinaturaViaAbaOculta } from './blocoAssinaturaAbaOculta'
import { fetchListaProcessos } from './processosNovos/fetchListaProcessos'
import { extrairInfoRedirecionamentoViaOffscreen, parseProcessosNovosHtmlViaOffscreen } from './offscreenParser'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_PREFIX_PROCESSO } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'
const ACAO_PROCEDIMENTO_CONTROLAR = 'procedimento_controlar'

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
  origem?: 'alarme'
}

interface MensagemSeiDetectado {
  type: 'seirmg:sei-detectado'
}

interface MensagemFetchSei {
  type: 'seirmg:fetch-sei'
  url: string
  method?: string
  body?: string
}

interface MensagemTelaLoginDetectada {
  type: 'seirmg:tela-login-detectada'
  url: string
}

interface MensagemDiagnostico {
  type: 'seirmg:diagnostico'
  mensagem: string
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

function ehMensagemDiagnostico(mensagem: unknown): mensagem is MensagemDiagnostico {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:diagnostico'
  )
}

async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function agendarAlarmeProcessosNovos(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME_PROCESSOS_NOVOS, {
    periodInMinutes: config.processosNovos.intervaloMinutos,
  })
}

async function checarBlocoAssinaturaViaAlarme(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}&seirmgOrigem=alarme`
  console.log('[SEIRMG][diagnostico] checarBlocoAssinaturaViaAlarme: iniciando', url, new Date().toISOString())

  await verificarBlocoAssinaturaViaAbaOculta(url)

  console.log('[SEIRMG][diagnostico] checarBlocoAssinaturaViaAlarme: concluído', new Date().toISOString())
}

function atualizarBadgeIcone(count: number): void {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
}

async function verificarProcessosNovosViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  console.log(
    '[SEIRMG][diagnostico] verificarProcessosNovosViaFetch: iniciando',
    localConfig.baseUrlSei,
    new Date().toISOString()
  )

  await verificarProcessosNovos({
    fetchProcessosItens: () =>
      fetchListaProcessos(localConfig.baseUrlSei as string, {
        extrairInfoRedirecionamento: extrairInfoRedirecionamentoViaOffscreen,
        extrairProcessos: parseProcessosNovosHtmlViaOffscreen,
      }),
  })

  console.log('[SEIRMG][diagnostico] verificarProcessosNovosViaFetch: concluído', new Date().toISOString())

  const localConfigAtualizado = await createLocalConfigStore().get()
  atualizarBadgeIcone(localConfigAtualizado.processosNovosBadgeCount)
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
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
  agendarAlarmeProcessosNovos().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme de processos novos:', error)
  })
  marcarIndicadorConfiguracao().catch((error) => {
    console.error('[SEIRMG] Falha ao marcar indicador de configuração pendente:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  checarBlocoAssinaturaViaAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME_PROCESSOS_NOVOS) return
  verificarProcessosNovosViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar processos novos via alarme:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  const deps = mensagem.origem === 'alarme' ? { sempreNotificarPendentes: true } : undefined
  processarItensBlocoAssinatura(mensagem.itens, deps).catch((error) => {
    console.error(
      '[SEIRMG] Falha ao processar itens do bloco de assinatura recebidos via mensagem:',
      error
    )
  })
})

chrome.runtime.onMessage.addListener((mensagem, remetente) => {
  if (!ehMensagemSeiDetectado(mensagem)) return
  console.log(
    '[SEIRMG][diagnostico] seirmg:sei-detectado recebido de',
    remetente.tab?.url,
    new Date().toISOString()
  )
  registrarNavegacaoReal().catch((error) => {
    console.error('[SEIRMG] Falha ao registrar navegação real:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchSei(mensagem)) return false
  console.log(
    '[SEIRMG][diagnostico] seirmg:fetch-sei recebido de content script:',
    mensagem.url,
    mensagem.method ?? 'GET',
    new Date().toISOString()
  )
  fetchTextComGate(mensagem.url, {
    method: mensagem.method,
    body: mensagem.body !== undefined ? new URLSearchParams(mensagem.body) : undefined,
  })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})

chrome.runtime.onMessage.addListener((mensagem, remetente) => {
  if (!ehMensagemTelaLoginDetectada(mensagem)) return
  console.error(
    '[SEIRMG][diagnostico] TELA DE LOGIN DETECTADA NA ABA REAL:',
    mensagem.url,
    'aba id:',
    remetente.tab?.id,
    new Date().toISOString()
  )
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemDiagnostico(mensagem)) return
  console.log('[SEIRMG][diagnostico][content-script]', mensagem.mensagem)
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
    } else if (notificationId.startsWith(NOTIFICATION_ID_PREFIX_PROCESSO)) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_PROCEDIMENTO_CONTROLAR}`
      )
    }

    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique em notificação:', error)
  }
})
