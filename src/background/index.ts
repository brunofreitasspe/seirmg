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
const ATRASO_VERIFICACAO_IMEDIATA_MS = 5000

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
      console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: throttled, pulando', agoraIso)
      return
    }

    console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: agendando fetch', agoraIso)
    await localStore.set({ ...localConfig, ultimaVerificacaoImediata: agoraIso })

    // Dá tempo do SEI terminar a própria inicialização de sessão/unidade antes de
    // fazer uma requisição autenticada concorrente (ver histórico de investigação:
    // disparar o fetch imediatamente após o carregamento da página coincidiu com
    // deslogamentos aleatórios, em uma página com inicializando=1 no querystring).
    await aguardar(ATRASO_VERIFICACAO_IMEDIATA_MS)

    console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: iniciando fetch', new Date().toISOString())
    await verificarBlocoAssinaturaViaFetch()
    console.log('[SEIRMG][diagnostico] verificarImediatoSeNecessario: fetch concluído', new Date().toISOString())
  } finally {
    verificacaoImediataEmAndamento = false
  }
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
  verificarImediatoSeNecessario().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar imediatamente após detectar sessão do SEI:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchSei(mensagem)) return false
  fetchTextComGate(mensagem.url, {
    method: mensagem.method,
    body: mensagem.body !== undefined ? new URLSearchParams(mensagem.body) : undefined,
  })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
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
