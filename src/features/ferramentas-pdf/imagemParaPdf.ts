import { PDFDocument } from 'pdf-lib'

export interface ImagemEntrada {
  bytes: Uint8Array
  tipo: 'png' | 'jpg'
}

export async function imagensParaPdf(imagens: ImagemEntrada[]): Promise<Uint8Array> {
  if (imagens.length === 0) throw new Error('Nenhuma imagem informada.')

  const doc = await PDFDocument.create()
  for (const imagem of imagens) {
    const embutida =
      imagem.tipo === 'png' ? await doc.embedPng(imagem.bytes) : await doc.embedJpg(imagem.bytes)
    const pagina = doc.addPage([embutida.width, embutida.height])
    pagina.drawImage(embutida, { x: 0, y: 0, width: embutida.width, height: embutida.height })
  }
  return doc.save()
}
