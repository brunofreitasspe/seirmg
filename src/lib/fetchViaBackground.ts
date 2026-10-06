import type { Result } from './result'
import { bytesParaBase64 } from './base64'

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

// Formato que de fato atravessa chrome.runtime.sendMessage: a mensagem é serializada como JSON,
// então os bytes vão em base64 (um Uint8Array cru chegaria como {"0":..,"1":..} e o arquivo
// enviado ao SEI sairia corrompido).
export interface ArquivoUploadMensagem {
  fieldName: string
  fileName: string
  base64: string
}

// Upload binário (ex.: bytes de um PDF) via background -- usada por páginas sem a sessão do SEI
// no próprio contexto (ex.: a aba standalone de Ferramentas de PDF). O background decodifica o
// base64 e remonta o Blob/FormData real antes do fetch (ver background/fetchSeiOptions.ts).
export async function enviarArquivoViaBackground(url: string, arquivo: ArquivoParaUpload): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-sei',
      url,
      upload: {
        fieldName: arquivo.fieldName,
        fileName: arquivo.fileName,
        base64: bytesParaBase64(arquivo.bytes),
      } satisfies ArquivoUploadMensagem,
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
