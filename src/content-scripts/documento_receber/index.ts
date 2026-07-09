import { formatarDataHoje } from '../../features/documento-receber/autopreencher'
import {
  extrairUrlUnidadeSelecionarReabertura,
  processoFechadoEmTodasUnidades,
} from '../../features/documento-receber/forcarReabertura'
import { fetchText } from '../../lib/fetchViaBackground'
import { createSyncConfigStore } from '../../lib/storage'
import type { DocumentoExternoConfig } from '../../lib/storage'

function criarAvisoPreenchimento(): HTMLSpanElement {
  const aviso = document.createElement('span')
  aviso.style.backgroundColor = 'red'
  aviso.textContent =
    'Houve preenchimento de valores pré configurados nesta tela. Verifique se estão corretos!'
  return aviso
}

function autopreencherDocumentoExterno(config: DocumentoExternoConfig): void {
  try {
    if (!config.ativo) return

    const inputData = document.getElementById('txtDataElaboracao') as HTMLInputElement | null
    if (!inputData) return

    inputData.value = formatarDataHoje(new Date())

    setTimeout(() => {
      try {
        if (config.formato === 'N') {
          document.querySelector<HTMLInputElement>('#optNato')?.click()
        } else if (config.formato === 'D') {
          document.querySelector<HTMLInputElement>('#optDigitalizado')?.click()
          const selectConferencia = document.getElementById(
            'selTipoConferencia'
          ) as HTMLSelectElement | null
          if (selectConferencia) selectConferencia.value = config.tipoConferencia
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao preencher formato do documento:', error)
      }
    }, 500)

    if (config.nivelAcesso === 'R') {
      document.querySelector<HTMLInputElement>('#optRestrito')?.click()
    } else if (config.nivelAcesso === 'S') {
      document.querySelector<HTMLInputElement>('#optSigiloso')?.click()
    } else {
      document.querySelector<HTMLInputElement>('#optPublico')?.click()
    }

    if (config.nivelAcesso === 'S' || config.nivelAcesso === 'R') {
      setTimeout(() => {
        const selectHipotese = document.getElementById('selHipoteseLegal') as HTMLSelectElement | null
        if (selectHipotese) selectHipotese.value = config.hipoteseLegal
      }, 500)
    }

    document
      .querySelector('#divInfraBarraComandosInferior #btnSalvar')
      ?.insertAdjacentElement('beforebegin', criarAvisoPreenchimento())
    document
      .querySelector('#divInfraBarraComandosSuperior #btnSalvar')
      ?.insertAdjacentElement('beforebegin', criarAvisoPreenchimento())
  } catch (error) {
    console.error('[SEIRMG] Falha ao autopreencher documento externo:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    autopreencherDocumentoExterno(syncConfig.documentoExterno)
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar configuração de documento externo:', error)
  }

  try {
    const divAlerta = document.getElementById('divUnidadesReabertura')
    if (!divAlerta || getComputedStyle(divAlerta).display !== 'block') return

    const botoesSalvar = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '#divInfraBarraComandosSuperior > #btnSalvar, #divInfraBarraComandosInferior > #btnSalvar'
      )
    )
    botoesSalvar.forEach((botao) => {
      botao.disabled = true
    })

    const url = extrairUrlUnidadeSelecionarReabertura(document.head.innerHTML, window.location.href)
    if (!url) {
      botoesSalvar.forEach((botao) => {
        botao.disabled = false
      })
      return
    }

    const resultado = await fetchText(url)
    if (!resultado.ok) {
      botoesSalvar.forEach((botao) => {
        botao.disabled = false
      })
      return
    }

    const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
    const linhas = doc.querySelectorAll('#divInfraAreaTabela > table > tbody > tr')
    const totalUnidades = Math.max(linhas.length - 1, 0)
    const totalFechadas = doc.querySelectorAll('#divInfraAreaTabela > table > tbody > tr > td > input').length

    if (processoFechadoEmTodasUnidades(totalUnidades, totalFechadas)) {
      const aviso = document.createElement('span')
      aviso.id = 'seirmg-alerta-unidades-reabertura'
      aviso.style.cssText = 'background-color: yellow; color: black; padding: 5px; float: left;'
      aviso.textContent = 'O processo não está aberto em nenhuma unidade! Favor verificar.'
      document.querySelector('#divInfraBarraComandosSuperior')?.appendChild(aviso)

      botoesSalvar.forEach((botao) => {
        botao.addEventListener('click', (evento) => {
          const selectDisponivel = document.querySelector('#selUnidadesReabertura option')
          if (!selectDisponivel) {
            evento.preventDefault()
            alert('O processo não está aberto em nenhuma unidade! Favor verificar')
            document
              .getElementById('selUnidadesReabertura')
              ?.style.setProperty('background-color', 'red', 'important')
          }
        })
      })
    }

    botoesSalvar.forEach((botao) => {
      botao.disabled = false
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar reabertura de processo:', error)
  }
}

bootstrap()
