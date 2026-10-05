import type { Result } from './result'

export async function fetchText(
  url: string,
  options: { method?: string; body?: URLSearchParams; bodyRaw?: string } = {}
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-sei',
      url,
      method: options.method,
      body: options.body?.toString(),
      bodyRaw: options.bodyRaw,
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export interface ArquivoParaUpload {
  fieldName: string
  fileName: string
  bytes: Uint8Array
}

// Upload binário (ex.: bytes de um PDF) via background -- usada por páginas sem a sessão do SEI
// no próprio contexto (ex.: a aba standalone de Ferramentas de PDF). Os bytes trafegam intactos
// na mensagem (a API de extensão suporta ArrayBuffer/TypedArray via structured clone); o
// background remonta o Blob/FormData real antes do fetch (ver background/fetchSeiOptions.ts).
export async function enviarArquivoViaBackground(url: string, arquivo: ArquivoParaUpload): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-sei',
      url,
      upload: arquivo,
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
