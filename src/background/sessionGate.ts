import { fetchText, type FetchWithTimeoutOptions, type Result } from '../lib/result'
import { createLocalConfigStore } from '../lib/storage'
import { ehPaginaDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from '../lib/sessionGate'

const ATRASO_POS_NAVEGACAO_MS = 1500
const DURACAO_CIRCUIT_BREAKER_MINUTOS = 5

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let filaMutex: Promise<unknown> = Promise.resolve()

function serializar<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = filaMutex.then(tarefa, tarefa)
  filaMutex = execucao.catch(() => undefined)
  return execucao
}

export async function registrarNavegacaoReal(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    ultimaNavegacaoRealSei: new Date().toISOString(),
    sessaoInvalidaAte: undefined,
  })
}

export function fetchTextComGate(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  return serializar(async () => {
    const config = await createLocalConfigStore().get()
    const agoraIso = new Date().toISOString()

    if (circuitBreakerAberto(config.sessaoInvalidaAte, agoraIso)) {
      return { ok: false, error: 'Sessão do SEI inválida — chamadas de fundo pausadas temporariamente' }
    }

    const espera = calcularEsperaPosNavegacao(config.ultimaNavegacaoRealSei, agoraIso, ATRASO_POS_NAVEGACAO_MS)
    if (espera > 0) await aguardar(espera)

    const resultado = await fetchText(url, options)
    if (resultado.ok && ehPaginaDeLogin(resultado.data)) {
      const store = createLocalConfigStore()
      const configAtual = await store.get()
      await store.set({
        ...configAtual,
        sessaoInvalidaAte: new Date(Date.now() + DURACAO_CIRCUIT_BREAKER_MINUTOS * 60 * 1000).toISOString(),
      })
      console.error(
        '[SEIRMG] Sessão do SEI parece inválida (tela de login detectada) — pausando chamadas por',
        DURACAO_CIRCUIT_BREAKER_MINUTOS,
        'min'
      )
      return { ok: false, error: 'Sessão do SEI inválida (tela de login detectada)' }
    }

    return resultado
  })
}
