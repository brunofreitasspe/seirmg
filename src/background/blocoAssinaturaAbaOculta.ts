import { serializar, circuitBreakerEstaAberto, abrirCircuitBreaker } from './sessionGate'

const TIMEOUT_ABA_OCULTA_MS = 15000

function ehMensagemItensBlocoDaAba(
  mensagem: unknown,
  remetente: chrome.runtime.MessageSender,
  tabId: number
): boolean {
  return (
    remetente.tab?.id === tabId &&
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

function aguardarMensagemOuTimeout(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    let resolvido = false
    const finalizar = (): void => {
      if (resolvido) return
      resolvido = true
      chrome.runtime.onMessage.removeListener(listener)
      clearTimeout(timer)
      resolve()
    }
    const listener = (mensagem: unknown, remetente: chrome.runtime.MessageSender): void => {
      if (ehMensagemItensBlocoDaAba(mensagem, remetente, tabId)) finalizar()
    }
    chrome.runtime.onMessage.addListener(listener)
    const timer = setTimeout(finalizar, TIMEOUT_ABA_OCULTA_MS)
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
    if (await circuitBreakerEstaAberto()) {
      console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: circuit breaker aberto, pulando')
      return
    }

    console.log(
      '[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: abrindo aba oculta',
      url,
      new Date().toISOString()
    )
    const tab = await chrome.tabs.create({ url, active: false })
    if (!tab.id) return

    try {
      await aguardarMensagemOuTimeout(tab.id)
      console.log(
        '[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: aba concluída/timeout',
        new Date().toISOString()
      )

      if (await paginaEhTelaDeLogin(tab.id)) {
        await abrirCircuitBreaker()
      }
    } finally {
      chrome.tabs.remove(tab.id).catch(() => {})
    }
  })
}
