import { juntarPdfs } from '../../features/ferramentas-pdf/juntar'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Juntar PDFs</h2>
    <input type="file" id="juntar-arquivos" accept="application/pdf" multiple />
    <p id="juntar-lista"></p>
    <button id="juntar-processar" disabled>Juntar</button>
  `
  const input = document.getElementById('juntar-arquivos') as HTMLInputElement
  const botao = document.getElementById('juntar-processar') as HTMLButtonElement
  const lista = document.getElementById('juntar-lista') as HTMLParagraphElement

  input.addEventListener('change', () => {
    const arquivos = Array.from(input.files ?? [])
    lista.textContent = arquivos.map((a) => a.name).join(', ')
    botao.disabled = arquivos.length < 2
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivos = Array.from(input.files ?? [])
      const bytes = await Promise.all(arquivos.map(async (a) => new Uint8Array(await a.arrayBuffer())))
      const resultado = await juntarPdfs(bytes)
      const blob = new Blob([resultado as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'processo-unido.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao juntar PDFs:', error)
      alert('Não foi possível juntar os PDFs. Veja o console pra detalhes.')
    }
  })
}
