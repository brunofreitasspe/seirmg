import { comprimirPdf } from '../../features/ferramentas-pdf/comprimir'

function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Comprimir PDF</h2>
    <input type="file" id="comprimir-arquivo" accept="application/pdf" />
    <p id="comprimir-resultado"></p>
    <button id="comprimir-processar" disabled>Comprimir</button>
  `
  const input = document.getElementById('comprimir-arquivo') as HTMLInputElement
  const botao = document.getElementById('comprimir-processar') as HTMLButtonElement
  const resultadoTexto = document.getElementById('comprimir-resultado') as HTMLParagraphElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const resultado = await comprimirPdf(bytes)
      resultadoTexto.textContent = `${formatarBytes(resultado.tamanhoOriginal)} → ${formatarBytes(resultado.tamanhoFinal)}`
      const blob = new Blob([resultado.bytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-comprimido.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao comprimir PDF:', error)
      alert('Não foi possível comprimir o PDF.')
    }
  })
}
