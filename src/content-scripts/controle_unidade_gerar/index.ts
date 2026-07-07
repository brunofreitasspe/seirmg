import {
  detectarAcaoDisponivel,
  extrairHrefAcao,
  extrairHrefArvore,
  resolverUrl,
} from '../../features/controle-processos/reaberturaEmBloco'
import { fetchText } from '../../lib/result'

const ID_DIALOG = 'seirmg-reabertura-em-bloco-status'

function obterDialogStatus(): HTMLDialogElement {
  const existente = document.getElementById(ID_DIALOG) as HTMLDialogElement | null
  if (existente) return existente

  const dialog = document.createElement('dialog')
  dialog.id = ID_DIALOG
  const textarea = document.createElement('textarea')
  textarea.rows = 20
  textarea.cols = 70
  textarea.disabled = true
  dialog.appendChild(textarea)
  document.body.appendChild(dialog)
  return dialog
}

function imprimirStatus(mensagem: string): void {
  const dialog = obterDialogStatus()
  const textarea = dialog.querySelector('textarea')
  if (!textarea) return
  textarea.value = textarea.value ? `${textarea.value}\n${mensagem}` : mensagem
  textarea.scrollTop = textarea.scrollHeight
}

async function executarProximaEtapa(url: string): Promise<string | null> {
  const resultado = await fetchText(url)
  return resultado.ok ? resultado.data : null
}

function extrairTextoScripts(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('script'))
    .map((script) => script.textContent ?? '')
    .join('\n')
}

async function reabrirProcesso(numeroProcesso: string, hrefProcesso: string, baseUrl: string): Promise<boolean> {
  imprimirStatus(`${numeroProcesso} (1/4)...`)
  const pagina2 = await executarProximaEtapa(hrefProcesso)
  if (pagina2 === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 1)!`)
    return false
  }

  const doc2 = new DOMParser().parseFromString(pagina2, 'text/html')
  const srcArvore = doc2.querySelector('#ifrArvore')?.getAttribute('src')
  if (!srcArvore) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 2)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (2/4)...`)
  const pagina3 = await executarProximaEtapa(resolverUrl(srcArvore, baseUrl))
  if (pagina3 === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 2)!`)
    return false
  }

  const textoScript3 = extrairTextoScripts(pagina3)
  const acao = detectarAcaoDisponivel(textoScript3)
  if (!acao) {
    imprimirStatus(`${numeroProcesso} (Processo não se encontra sobrestado ou fechado)!`)
    return false
  }

  const hrefPagina4 = extrairHrefArvore(textoScript3)
  if (!hrefPagina4) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 3)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (3/4)...`)
  const pagina4 = await executarProximaEtapa(resolverUrl(hrefPagina4, baseUrl))
  if (pagina4 === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 3)!`)
    return false
  }

  const hrefFinal = extrairHrefAcao(extrairTextoScripts(pagina4), acao)
  if (!hrefFinal) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 4)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (4/4)...`)
  const resultado = await executarProximaEtapa(resolverUrl(hrefFinal, baseUrl))
  if (resultado === null) {
    imprimirStatus(`${numeroProcesso} (Erro na chamada nº 4)!`)
    return false
  }

  imprimirStatus(`${numeroProcesso} (Reaberto com sucesso!)`)
  return true
}

function bootstrap(): void {
  try {
    const barraComandos = document.querySelector('#divInfraBarraComandosSuperior')
    if (!barraComandos) return

    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'infraButton'
    botao.textContent = 'Reabrir Processo'

    botao.addEventListener('click', () => {
      try {
        const checkboxes = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            'input.infraCheckbox:checked, input.infraCheckboxInput:checked'
          )
        )
        const links = checkboxes
          .map((checkbox) =>
            checkbox
              .closest('tr')
              ?.querySelector<HTMLAnchorElement>('a[href*="controlador.php?acao=procedimento_trabalhar"]')
          )
          .filter((link): link is HTMLAnchorElement => link !== null && link !== undefined)

        if (links.length === 0) {
          alert('Nenhum processo para reabrir selecionado.')
          return
        }

        if (!confirm('Confirma a reabertura dos processos selecionados?')) return

        const dialog = obterDialogStatus()
        const textarea = dialog.querySelector('textarea')
        if (textarea) textarea.value = ''
        dialog.showModal()

        const baseUrl = window.location.href
        Promise.all(
          links.map((link) => reabrirProcesso(link.textContent?.trim() ?? '', link.href, baseUrl))
        ).then((resultados) => {
          const sucesso = resultados.filter(Boolean).length
          imprimirStatus(
            `\nExecução finalizada.\nProcessos reabertos: ${sucesso}\nProcessos com erro: ${
              resultados.length - sucesso
            }`
          )
        })
      } catch (error) {
        console.error('[SEIRMG] Falha ao iniciar reabertura em bloco:', error)
      }
    })

    barraComandos.prepend(botao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar reabertura em bloco:', error)
  }
}

bootstrap()
