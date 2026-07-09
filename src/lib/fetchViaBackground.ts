import type { Result } from './result'

export async function fetchText(
  url: string,
  options: { method?: string; body?: URLSearchParams } = {}
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-sei',
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
