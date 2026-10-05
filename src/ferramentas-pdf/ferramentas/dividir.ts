import { dividirPdf } from '../../features/ferramentas-pdf/dividir'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Dividir PDF</h2>
    <input type="file" id="dividir-arquivo" accept="application/pdf" />
    <label>Intervalos (ex.: 1-3, 4-4, 5-8): <input type="text" id="dividir-intervalos" placeholder="1-3, 4-8" /></label>
    <button id="dividir-processar" disabled>Dividir</button>
  `
  const input = document.getElementById('dividir-arquivo') as HTMLInputElement
  const campoIntervalos = document.getElementById('dividir-intervalos') as HTMLInputElement
  const botao = document.getElementById('dividir-processar') as HTMLButtonElement

  input.addEventListener('change', () => {
    botao.disabled = !input.files?.[0]
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      // "1-3, 4-8" -> [[0,2],[3,7]] (interface em base 1, função pura em base 0).
      const intervalos = campoIntervalos.value
        .split(',')
        .map((parte) => parte.trim())
        .filter(Boolean)
        .map((parte) => {
          const [inicio, fim] = parte.split('-').map((n) => Number(n.trim()))
          return [inicio - 1, (fim ?? inicio) - 1] as [number, number]
        })
      const partes = await dividirPdf(bytes, intervalos)
      partes.forEach((parte, indice) => {
        const blob = new Blob([parte as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `parte-${indice + 1}.pdf`
        link.click()
        URL.revokeObjectURL(url)
      })
    } catch (error) {
      console.error('[SEIRMG] Falha ao dividir PDF:', error)
      alert('Não foi possível dividir o PDF. Confira os intervalos informados.')
    }
  })
}
