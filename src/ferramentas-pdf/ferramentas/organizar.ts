import { PDFDocument } from 'pdf-lib'
import { organizarPaginas } from '../../features/ferramentas-pdf/organizar'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Organizar páginas</h2>
    <input type="file" id="organizar-arquivo" accept="application/pdf" />
    <ol id="organizar-lista"></ol>
    <button id="organizar-processar" disabled>Salvar PDF reorganizado</button>
  `
  const input = document.getElementById('organizar-arquivo') as HTMLInputElement
  const lista = document.getElementById('organizar-lista') as HTMLOListElement
  const botao = document.getElementById('organizar-processar') as HTMLButtonElement
  let bytesOriginais: Uint8Array | null = null
  let ordem: number[] = []

  function renderizarLista(): void {
    lista.innerHTML = ''
    ordem.forEach((indicePagina, posicao) => {
      const li = document.createElement('li')
      li.textContent = `Página ${indicePagina + 1} `
      const subir = document.createElement('button')
      subir.textContent = '↑'
      subir.disabled = posicao === 0
      subir.addEventListener('click', () => {
        ;[ordem[posicao - 1], ordem[posicao]] = [ordem[posicao], ordem[posicao - 1]]
        renderizarLista()
      })
      const descer = document.createElement('button')
      descer.textContent = '↓'
      descer.disabled = posicao === ordem.length - 1
      descer.addEventListener('click', () => {
        ;[ordem[posicao], ordem[posicao + 1]] = [ordem[posicao + 1], ordem[posicao]]
        renderizarLista()
      })
      const remover = document.createElement('button')
      remover.textContent = '×'
      remover.addEventListener('click', () => {
        ordem = ordem.filter((_, i) => i !== posicao)
        renderizarLista()
      })
      li.append(subir, descer, remover)
      lista.appendChild(li)
    })
    botao.disabled = ordem.length === 0
  }

  input.addEventListener('change', async () => {
    const arquivo = input.files?.[0]
    if (!arquivo) return
    bytesOriginais = new Uint8Array(await arquivo.arrayBuffer())
    const totalPaginas = (await PDFDocument.load(bytesOriginais)).getPageCount()
    ordem = Array.from({ length: totalPaginas }, (_, i) => i)
    renderizarLista()
  })

  botao.addEventListener('click', async () => {
    try {
      if (!bytesOriginais) return
      const resultado = await organizarPaginas(bytesOriginais, ordem)
      const blob = new Blob([resultado as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-organizado.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao organizar páginas:', error)
      alert('Não foi possível salvar o PDF reorganizado.')
    }
  })
}
