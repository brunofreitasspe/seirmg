import { serializar, circuitBreakerEstaAberto, abrirCircuitBreaker } from './sessionGate'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const TIMEOUT_ABA_OCULTA_MS = 15000

function extrairItensBlocoDaAba(
  mensagem: unknown,
  remetente: chrome.runtime.MessageSender,
  tabId: number
): BlocoAssinaturaItem[] | undefined {
  if (
    remetente.tab?.id === tabId &&
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  ) {
    return (mensagem as { itens: BlocoAssinaturaItem[] }).itens
  }
  return undefined
}

function aguardarMensagemOuTimeout(tabId: number): Promise<BlocoAssinaturaItem[] | undefined> {
  return new Promise((resolve) => {
    let resolvido = false
    const finalizar = (itens: BlocoAssinaturaItem[] | undefined): void => {
      if (resolvido) return
      resolvido = true
      chrome.runtime.onMessage.removeListener(listener)
      clearTimeout(timer)
      resolve(itens)
    }
    const listener = (mensagem: unknown, remetente: chrome.runtime.MessageSender): void => {
      const itens = extrairItensBlocoDaAba(mensagem, remetente, tabId)
      if (itens !== undefined) finalizar(itens)
    }
    chrome.runtime.onMessage.addListener(listener)
    const timer = setTimeout(() => finalizar(undefined), TIMEOUT_ABA_OCULTA_MS)
  })
}

async function paginaEhTelaDeLogin(tabId: number): Promise<boolean> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.getElementById('frmLogin') !== null,
    })
    return result === true
  } catch {
    return false
  }
}

export function verificarBlocoAssinaturaViaAbaOculta(url: string): Promise<void> {
  return serializar(async () => {
    try {
      if (await circuitBreakerEstaAberto()) {
        return
      }

      const tab = await chrome.tabs.create({ url, active: false })
      if (!tab.id) return

      try {
        const itens = await aguardarMensagemOuTimeout(tab.id)

        if (itens !== undefined) {
          await processarItensBlocoAssinatura(itens, { sempreNotificarPendentes: true })
        }

        if (await paginaEhTelaDeLogin(tab.id)) {
          await abrirCircuitBreaker()
        }
      } finally {
        chrome.tabs.remove(tab.id).catch(() => {})
      }
    } catch (error) {
      console.error('[SEIRMG] Falha ao verificar bloco de assinatura via aba oculta:', error)
    }
  })
}
