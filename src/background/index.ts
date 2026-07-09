import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS, verificarProcessosNovos } from './alarms/processosNovosCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal } from './sessionGate'
import { fetchListaProcessos } from './processosNovos/fetchListaProcessos'
import {
  extrairInfoRedirecionamentoViaOffscreen,
  parseBlocoAssinaturaHtmlViaOffscreen,
  parseProcessosNovosHtmlViaOffscreen,
} from './offscreenParser'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { passouIntervalo } from '../lib/throttle'
import { NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_PREFIX_PROCESSO } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'
const ACAO_PROCEDIMENTO_CONTROLAR = 'procedimento_controlar'
const INTERVALO_MINIMO_VERIFICACAO_IMEDIATA_MINUTOS = 2
const PAUSA_MINIMA_VERIFICACAO_IMEDIATA_MS = 5000

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

async function verificarBlocoAssinaturaViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
  console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaFetch: GET', url, new Date().toISOString())

  await verificarBlocoAssinatura({
    fetchBlocoAssinaturaHtml: () => fetchTextComGate(url),
    parseOptions: { seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true },
    parseBlocoAssinaturaHtml: parseBlocoAssinaturaHtmlViaOffscreen,
  })

  console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaFetch: concluído', new Date().toISOString())
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

let verificacaoImediataEmAndamento = false

async function dispararVerificacaoImediataSeNecessario(): Promise<void> {
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
      console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: throttled, pulando', agoraIso)
      return
    }

    console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: pausa na navegação detectada, iniciando fetch', agoraIso)
    await localStore.set({ ...localConfig, ultimaVerificacaoImediata: agoraIso })

    await verificarBlocoAssinaturaViaFetch()
    console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: fetch concluído', new Date().toISOString())
  } finally {
    verificacaoImediataEmAndamento = false
  }
}

let debounceVerificacaoImediata: ReturnType<typeof setTimeout> | null = null

// Em vez de um delay fixo após uma única navegação, espera até que a navegação
// realmente pare por PAUSA_MINIMA_VERIFICACAO_IMEDIATA_MS: cada seirmg:sei-detectado
// novo reinicia a espera. Um delay fixo não é suficiente porque não há como saber
// se o usuário vai navegar de novo dentro da janela — e navegar de novo enquanto
// esse fetch de fundo está em trânsito foi confirmado, em uso real, como gatilho
// de deslogamento (a navegação seguinte à checagem recebe a tela de login).
function agendarVerificacaoImediataComDebounce(): void {
  if (debounceVerificacaoImediata !== null) clearTimeout(debounceVerificacaoImediata)

  debounceVerificacaoImediata = setTimeout(() => {
    debounceVerificacaoImediata = null
    dispararVerificacaoImediataSeNecessario().catch((error) => {
      console.error('[SEIRMG] Falha ao verificar imediatamente após pausa na navegação:', error)
    })
  }, PAUSA_MINIMA_VERIFICACAO_IMEDIATA_MS)
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
  verificarBlocoAssinaturaViaFetch().catch((error) => {
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
  processarItensBlocoAssinatura(mensagem.itens).catch((error) => {
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
  agendarVerificacaoImediataComDebounce()
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
