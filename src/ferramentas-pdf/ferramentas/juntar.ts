import { juntarPdfs } from '../../features/ferramentas-pdf/juntar'
import { criarBotaoEnviarAoProcesso } from '../ui/botaoEnviarAoProcesso'

const NOME_ARQUIVO_RESULTADO = 'processo-unido.pdf'

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

  let ultimoResultado: Uint8Array | null = null

  const botaoEnviar = criarBotaoEnviarAoProcesso({
    nomeArquivoPadrao: NOME_ARQUIVO_RESULTADO,
    obterBytes: () => ultimoResultado,
  })
  if (botaoEnviar) container.appendChild(botaoEnviar)

  input.addEventListener('change', () => {
    const arquivos = Array.from(input.files ?? [])
    lista.textContent = arquivos.map((a) => a.name).join(', ')
    botao.disabled = arquivos.length < 2
    ultimoResultado = null
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivos = Array.from(input.files ?? [])
      const bytes = await Promise.all(arquivos.map(async (a) => new Uint8Array(await a.arrayBuffer())))
      const resultado = await juntarPdfs(bytes)
      ultimoResultado = resultado
      const blob = new Blob([resultado as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = NOME_ARQUIVO_RESULTADO
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao juntar PDFs:', error)
      alert('Não foi possível juntar os PDFs. Veja o console pra detalhes.')
    }
  })
}
