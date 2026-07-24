import type { Result } from './result'
import { TIPO_FETCH_SEI_FINAL_URL } from './mensagensLink'

export async function fetchFinalUrl(
  url: string,
  options: { method?: string; body?: URLSearchParams } = {}
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: TIPO_FETCH_SEI_FINAL_URL,
      url,
      method: options.method,
      body: options.body?.toString(),
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
