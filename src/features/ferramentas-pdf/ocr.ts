import { createWorker } from 'tesseract.js'

export function montarTextoPorPagina(textos: string[]): string {
  return textos.map((texto, indice) => `--- Página ${indice + 1} ---\n${texto}`).join('\n\n')
}

export interface ReconhecedorOcr {
  reconhecer: (imagemBytes: Uint8Array) => Promise<string>
  encerrar: () => Promise<void>
}

// Worker e core (JS+WASM) vêm de dentro da extensão (copiados pro dist/tesseract/ no build, ver
// vite.config.ts): o padrão do tesseract.js é buscá-los no jsdelivr e criar o worker via blob:,
// e a CSP do MV3 bloqueia as duas coisas. O modelo de idioma (.traineddata) é dado, não código --
// continua vindo do CDN na primeira vez e fica em cache (IndexedDB) depois.
//
// Um worker só pro documento inteiro: carregar core + idioma é a parte cara, não o reconhecimento.
// O reconhecimento em si não é testado automaticamente (modelo real, lento e não-determinístico).
export async function criarReconhecedorOcr(
  aoProgredir?: (progresso: number) => void,
  idiomas = 'por'
): Promise<ReconhecedorOcr> {
  const worker = await createWorker(idiomas, undefined, {
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('tesseract/'),
    workerBlobURL: false,
    logger: (mensagem) => {
      if (mensagem.status === 'recognizing text') aoProgredir?.(mensagem.progress)
    },
  })
  return {
    reconhecer: async (imagemBytes) => {
      const { data } = await worker.recognize(new Blob([imagemBytes as BlobPart]))
      return data.text
    },
    encerrar: async () => {
      await worker.terminate()
    },
  }
}
