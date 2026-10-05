import { numerarPaginas } from '../../features/ferramentas-pdf/numerarPaginas'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Numerar páginas</h2>
    <input type="file" id="numerar-arquivo" accept="application/pdf" />
    <label>Começar em: <input type="number" id="numerar-inicio" value="1" min="1" /></label>
    <button id="numerar-processar" disabled>Numerar</button>
  `
  const input = document.getElementById('numerar-arquivo') as HTMLInputElement
  const inicio = document.getElementById('numerar-inicio') as HTMLInputElement
  const botao = document.getElementById('numerar-processar') as HTMLButtonElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const resultado = await numerarPaginas(bytes, { inicioEm: Number(inicio.value) || 1 })
      const blob = new Blob([resultado as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-numerado.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao numerar páginas:', error)
      alert('Não foi possível numerar o PDF.')
    }
  })
}
