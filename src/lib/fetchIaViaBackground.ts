import type { Result } from './result'

export async function fetchIA(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string }
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-ia',
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
