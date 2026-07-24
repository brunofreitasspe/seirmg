export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

const TIMEOUT = Symbol('timeout')

async function corridaComTimeout<T>(
  fetchPromise: Promise<Result<T>>,
  controller: AbortController,
  timeoutMs: number
): Promise<Result<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<typeof TIMEOUT>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve(TIMEOUT)
    }, timeoutMs)
  })

  try {
    const resultado = await Promise.race([fetchPromise, timeoutPromise])
    if (resultado === TIMEOUT) return { ok: false, error: 'Timeout' }
    return resultado
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchText(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()

  const fetchPromise = (async (): Promise<Result<string>> => {
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }
      // response.text() sempre decodifica como UTF-8, ignorando o charset do header
      // Content-Type (limitação conhecida do fetch(), ao contrário do XMLHttpRequest antigo)
      // -- o SEI serve HTML em iso-8859-1, então acentos saíam corrompidos. Decodifica com o
      // charset real do header quando presente, caindo pra utf-8 (comportamento de antes) se
      // o header não declarar nenhum.
      const buffer = await response.arrayBuffer()
      const charsetMatch = response.headers.get('content-type')?.match(/charset=([^;]+)/i)
      const charset = charsetMatch ? charsetMatch[1].trim() : 'utf-8'
      const text = new TextDecoder(charset).decode(buffer)
      return { ok: true, data: text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })()

  return corridaComTimeout(fetchPromise, controller, timeoutMs)
}

// Usada quando só a URL final (depois de redirecionamentos do próprio SEI) importa, não o corpo
// da resposta -- caso da Pesquisa Rápida do SEI, que redireciona pra
// controlador.php?...&id_procedimento=... ou &id_documento=....
export async function fetchFinalUrl(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()

  const fetchPromise = (async (): Promise<Result<string>> => {
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }
      return { ok: true, data: response.url }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })()

  return corridaComTimeout(fetchPromise, controller, timeoutMs)
}
