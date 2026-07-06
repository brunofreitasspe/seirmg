export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

export async function fetchText(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      controller.abort()
      reject(new Error('Timeout'))
    }, timeoutMs)
  })

  try {
    const response = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      timeoutPromise
    ])
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }
    const text = await response.text()
    return { ok: true, data: text }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
