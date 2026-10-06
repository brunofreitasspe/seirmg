import { dividirPdf } from '../../features/ferramentas-pdf/dividir'
import { criarBotaoEnviarAoProcesso } from '../ui/botaoEnviarAoProcesso'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Dividir PDF</h2>
    <input type="file" id="dividir-arquivo" accept="application/pdf" />
    <label>Intervalos (ex.: 1-3, 4-4, 5-8): <input type="text" id="dividir-intervalos" placeholder="1-3, 4-8" /></label>
    <button id="dividir-processar" disabled>Dividir</button>
    <div id="dividir-envios"></div>
  `
  const input = document.getElementById('dividir-arquivo') as HTMLInputElement
  const campoIntervalos = document.getElementById('dividir-intervalos') as HTMLInputElement
  const botao = document.getElementById('dividir-processar') as HTMLButtonElement
  // Um botão de envio por parte: cada parte vira um documento externo separado no processo, e o
  // usuário escolhe quais mandar (ex.: só o anexo que interessa). Só aparece com processo aberto.
  const envios = document.getElementById('dividir-envios') as HTMLDivElement

  input.addEventListener('change', () => {
    botao.disabled = !input.files?.[0]
    envios.innerHTML = ''
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
      envios.innerHTML = ''
      // Vira o nome do documento no SEI -- "parte-2" sozinho não diz de onde veio.
      const nomeBase = arquivo.name.replace(/\.pdf$/i, '')
      partes.forEach((parte, indice) => {
        const botaoEnviar = criarBotaoEnviarAoProcesso({
          nomeArquivoPadrao: `${nomeBase}-parte-${indice + 1}.pdf`,
          rotulo: `Enviar parte ${indice + 1} ao processo`,
          obterBytes: () => parte,
        })
        if (botaoEnviar) envios.appendChild(botaoEnviar)

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
