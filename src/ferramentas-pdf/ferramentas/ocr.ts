import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { extrairTextoDeImagem, montarTextoPorPagina } from '../../features/ferramentas-pdf/ocr'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

async function paginaParaPng(pdf: Awaited<ReturnType<typeof getDocument>>['promise'] extends Promise<infer T> ? T : never, numero: number): Promise<Uint8Array> {
  const pagina = await pdf.getPage(numero)
  const viewport = pagina.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const contexto = canvas.getContext('2d')!
  await pagina.render({ canvas, canvasContext: contexto, viewport }).promise
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>OCR</h2>
    <input type="file" id="ocr-arquivo" accept="application/pdf" />
    <p id="ocr-progresso"></p>
    <textarea id="ocr-resultado" rows="12" readonly style="width:100%"></textarea>
    <button id="ocr-processar" disabled>Reconhecer texto</button>
  `
  const input = document.getElementById('ocr-arquivo') as HTMLInputElement
  const botao = document.getElementById('ocr-processar') as HTMLButtonElement
  const progresso = document.getElementById('ocr-progresso') as HTMLParagraphElement
  const resultado = document.getElementById('ocr-resultado') as HTMLTextAreaElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      botao.disabled = true
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const pdf = await getDocument({ data: bytes }).promise
      const textos: string[] = []
      for (let numero = 1; numero <= pdf.numPages; numero++) {
        progresso.textContent = `Processando página ${numero} de ${pdf.numPages}...`
        const png = await paginaParaPng(pdf, numero)
        textos.push(await extrairTextoDeImagem(png))
      }
      resultado.value = montarTextoPorPagina(textos)
      progresso.textContent = 'Concluído.'
    } catch (error) {
      console.error('[SEIRMG] Falha no OCR:', error)
      progresso.textContent = 'Falha ao reconhecer o texto. Veja o console.'
    } finally {
      botao.disabled = false
    }
  })
}
