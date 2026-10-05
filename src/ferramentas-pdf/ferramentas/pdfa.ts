import { diagnosticarPdfA } from '../../features/ferramentas-pdf/pdfa'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Diagnóstico PDF/A</h2>
    <p>Confere o que falta pro arquivo ser aceito como PDF/A, e explica por quê. Não converte, e não é um laudo de conformidade -- a referência de verdade é o veraPDF, que não roda no navegador.</p>
    <input type="file" id="pdfa-arquivo" accept="application/pdf" />
    <ul id="pdfa-resultado"></ul>
    <button id="pdfa-processar" disabled>Diagnosticar</button>
  `
  const input = document.getElementById('pdfa-arquivo') as HTMLInputElement
  const botao = document.getElementById('pdfa-processar') as HTMLButtonElement
  const resultado = document.getElementById('pdfa-resultado') as HTMLUListElement

  input.addEventListener('change', () => {
    botao.disabled = !input.files?.[0]
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const diagnostico = await diagnosticarPdfA(bytes)
      resultado.innerHTML = ''
      diagnostico.verificacoes.forEach((verificacao) => {
        const li = document.createElement('li')
        li.textContent = `${verificacao.ok ? '✓' : '✗'} ${verificacao.titulo} — ${verificacao.explicacao}`
        resultado.appendChild(li)
      })
    } catch (error) {
      console.error('[SEIRMG] Falha no diagnóstico PDF/A:', error)
      alert('Não foi possível diagnosticar o PDF.')
    }
  })
}
