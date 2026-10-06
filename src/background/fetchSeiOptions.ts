import type { FetchWithTimeoutOptions } from '../lib/result'
import type { ArquivoUploadMensagem } from '../lib/fetchViaBackground'
import { base64ParaBytes } from '../lib/base64'

export interface MensagemFetchSeiOpcoes {
  method?: string
  body?: string
  bodyRaw?: string
  // Presente só quando o chamador precisa de um upload multipart real (ex.: enviar bytes de PDF
  // pro endpoint infraUpload do SEI) -- não dá pra representar o corpo como string sem corromper
  // bytes binários. A mensagem chega serializada como JSON, então os bytes vêm em base64 --
  // só aqui decodificamos e remontamos o Blob/FormData real pro fetch de verdade.
  upload?: ArquivoUploadMensagem
}

// Função pura (dado o mesmo shape de mensagem, sempre monta as mesmas opções de fetch) --
// isolada do listener de chrome.runtime.onMessage pra poder ser testada sem mockar a API de
// extensão. Quando `upload` está presente, ignora bodyRaw/body: upload binário e texto não se
// combinam na mesma chamada.
export function construirOpcoesFetchSei(mensagem: MensagemFetchSeiOpcoes): FetchWithTimeoutOptions {
  if (mensagem.upload) {
    const formData = new FormData()
    const blob = new Blob([base64ParaBytes(mensagem.upload.base64) as BlobPart])
    formData.append(mensagem.upload.fieldName, blob, mensagem.upload.fileName)
    // Sem Content-Type manual: o fetch() preenche o boundary do multipart/form-data sozinho
    // quando o body é um FormData -- declarar na mão quebraria o boundary.
    return { method: mensagem.method ?? 'POST', body: formData }
  }

  return {
    method: mensagem.method,
    body: mensagem.bodyRaw !== undefined ? mensagem.bodyRaw : mensagem.body !== undefined ? new URLSearchParams(mensagem.body) : undefined,
    headers: mensagem.bodyRaw !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
  }
}
