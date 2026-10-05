import { imagensParaPdf, type ImagemEntrada } from '../../features/ferramentas-pdf/imagemParaPdf'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Imagem → PDF</h2>
    <input type="file" id="imagem-arquivos" accept="image/png,image/jpeg" multiple />
    <button id="imagem-processar" disabled>Converter</button>
  `
  const input = document.getElementById('imagem-arquivos') as HTMLInputElement
  const botao = document.getElementById('imagem-processar') as HTMLButtonElement

  input.addEventListener('change', () => {
    botao.disabled = (input.files?.length ?? 0) === 0
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivos = Array.from(input.files ?? [])
      const imagens: ImagemEntrada[] = await Promise.all(
        arquivos.map(async (arquivo) => ({
          bytes: new Uint8Array(await arquivo.arrayBuffer()),
          tipo: arquivo.type === 'image/png' ? ('png' as const) : ('jpg' as const),
        }))
      )
      const resultado = await imagensParaPdf(imagens)
      const blob = new Blob([resultado as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'imagens-convertidas.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao converter imagens em PDF:', error)
      alert('Não foi possível converter as imagens.')
    }
  })
}
