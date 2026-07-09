import { fetchText, type FetchWithTimeoutOptions, type Result } from '../lib/result'
import { createLocalConfigStore } from '../lib/storage'
import { ehPaginaDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from '../lib/sessionGate'

const ATRASO_POS_NAVEGACAO_MS = 1500
const DURACAO_CIRCUIT_BREAKER_MINUTOS = 5

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let filaMutex: Promise<unknown> = Promise.resolve()

export function serializar<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = filaMutex.then(tarefa, tarefa)
  filaMutex = execucao.catch(() => undefined)
  return execucao
}

export async function circuitBreakerEstaAberto(): Promise<boolean> {
  const config = await createLocalConfigStore().get()
  return circuitBreakerAberto(config.sessaoInvalidaAte, new Date().toISOString())
}

export async function abrirCircuitBreaker(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    sessaoInvalidaAte: new Date(Date.now() + DURACAO_CIRCUIT_BREAKER_MINUTOS * 60 * 1000).toISOString(),
  })
  console.error(
    '[SEIRMG] Sessão do SEI parece inválida (tela de login detectada) — pausando chamadas por',
    DURACAO_CIRCUIT_BREAKER_MINUTOS,
    'min'
  )
}

export async function registrarNavegacaoReal(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    ultimaNavegacaoRealSei: new Date().toISOString(),
    sessaoInvalidaAte: undefined,
  })
  console.log('[SEIRMG][diagnostico] registrarNavegacaoReal: navegação real registrada', new Date().toISOString())
}

export function fetchTextComGate(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  return serializar(async () => {
    try {
      if (await circuitBreakerEstaAberto()) {
        console.log('[SEIRMG][diagnostico] fetchTextComGate: circuit breaker aberto — pulando', url)
        return { ok: false, error: 'Sessão do SEI inválida — chamadas de fundo pausadas temporariamente' }
      }

      const config = await createLocalConfigStore().get()
      const agoraIso = new Date().toISOString()
      console.log('[SEIRMG][diagnostico] fetchTextComGate: solicitado', url, agoraIso)

      const espera = calcularEsperaPosNavegacao(config.ultimaNavegacaoRealSei, agoraIso, ATRASO_POS_NAVEGACAO_MS)
      if (espera > 0) {
        console.log('[SEIRMG][diagnostico] fetchTextComGate: aguardando', espera, 'ms pós-navegação antes de', url)
        await aguardar(espera)
      }

      const resultado = await fetchText(url, options)
      if (resultado.ok && ehPaginaDeLogin(resultado.data)) {
        await abrirCircuitBreaker()
        return { ok: false, error: 'Sessão do SEI inválida (tela de login detectada)' }
      }

      console.log(
        '[SEIRMG][diagnostico] fetchTextComGate: concluído',
        url,
        resultado.ok ? 'ok' : `erro: ${resultado.error}`,
        new Date().toISOString()
      )
      return resultado
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
