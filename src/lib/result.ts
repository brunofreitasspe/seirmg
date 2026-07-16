export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

const TIMEOUT = Symbol('timeout')

export async function fetchText(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<typeof TIMEOUT>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve(TIMEOUT)
    }, timeoutMs)
  })

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

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise])
    if (result === TIMEOUT) {
      return { ok: false, error: 'Timeout' }
    }
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}
