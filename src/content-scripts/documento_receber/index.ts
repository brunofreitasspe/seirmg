import {
  extrairUrlUnidadeSelecionarReabertura,
  processoFechadoEmTodasUnidades,
} from '../../features/documento-receber/forcarReabertura'
import { fetchText } from '../../lib/result'

async function bootstrap(): Promise<void> {
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
