import { createWorker } from 'tesseract.js'

export function montarTextoPorPagina(textos: string[]): string {
  return textos.map((texto, indice) => `--- Página ${indice + 1} ---\n${texto}`).join('\n\n')
}

// Não testada automaticamente — depende do modelo .traineddata (download + rede neural),
// lento e não-determinístico. Verificação é manual, igual a outras partes do repo que
// dependem de I/O real (ver README, seção "Limitações da verificação desta entrega").
export async function extrairTextoDeImagem(imagemBytes: Uint8Array, idiomas = 'por'): Promise<string> {
  const worker = await createWorker(idiomas)
  try {
    const { data } = await worker.recognize(new Blob([imagemBytes as BlobPart]))
    return data.text
  } finally {
    await worker.terminate()
  }
}
