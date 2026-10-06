// chrome.runtime.sendMessage serializa a mensagem como JSON -- um Uint8Array chega do outro lado
// como objeto {"0":37,"1":80,...}, não como bytes. Pra atravessar binário (ex.: PDF) até o
// background, codificamos em base64 na ida e decodificamos na volta.

// Em blocos: String.fromCharCode(...arr) estoura o limite de argumentos com arquivos grandes.
const TAMANHO_BLOCO = 0x8000

export function bytesParaBase64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += TAMANHO_BLOCO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAMANHO_BLOCO))
  }
  return btoa(binario)
}

export function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}
