import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairTextoMarcador,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
import { escolherCorProcesso, extrairEspecificacaoParaCor } from '../../features/controle-processos/corProcesso'
import {
  extrairEspecificacaoParaExibicao,
  extrairEspecificacaoParaLista,
} from '../../features/controle-processos/especificacao'
import {
  calcularVisibilidade,
  registrarFiltro,
  removerFiltro,
  type EstadoFiltros,
} from '../../features/controle-processos/filtroTabela'
import { linhaCasaBusca, parseTermosBusca } from '../../features/controle-processos/buscaRapida'
import { calcularIndicesParaClicar } from '../../features/controle-processos/selecaoMultipla'
import { createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig } from '../../lib/storage'

const IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr'))
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  const tipos: Array<{
    tipo: TipoCalculoPrazo
    exibir: boolean
    rotulo: string
    limites: { alerta: number; critico: number }
  }> = [
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      rotulo: 'Dias',
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
    },
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      rotulo: 'Prazo',
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
    },
  ]

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    tipos.forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      linhasDaTabela(idTabela).forEach((linha) => {
        const marcadores = Array.from(
          linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
        )
        const textos = marcadores
          .map((marcador) => marcador.getAttribute('onmouseover'))
          .filter((texto): texto is string => texto !== null)
          .map(extrairTextoMarcador)

        const valor = calcularDiasDoMarcador(textos, tipo, new Date())

        const td = document.createElement('td')
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.textContent = valor === null ? '' : String(valor)
        linha.appendChild(td)

        if (valor !== null) {
          const classificacao = classificarPrazo(valor, tipo, limites)
          if (classificacao === 'alerta') linha.classList.add('infraTrseippalerta')
          if (classificacao === 'critico') linha.classList.add('infraTrseippcritico')
        }
      })
    })
  })
}

function aplicarCorProcesso(config: ControleProcessosConfig['coresProcesso']): void {
  if (!config.ativo || config.regras.length === 0) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      const especificacao = extrairEspecificacaoParaCor(onmouseover)
      const cor = escolherCorProcesso(especificacao, config.regras)
      if (cor) {
        processo.setAttribute('style', `background-color: ${cor}; padding: 0 1em 0 1em`)
      }
    })
  })
}

function aplicarEspecificacao(config: ControleProcessosConfig['especificacao']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      if (config.modo === 'mostrar') {
        const especificacao = extrairEspecificacaoParaExibicao(onmouseover)
        const span = document.createElement('span')
        span.textContent = especificacao
        span.style.cssText = 'font-size:.9em;color:darkblue;display:block;'
        span.title = 'Especificação'
        processo.insertAdjacentElement('afterend', span)
      } else {
        const especificacao = extrairEspecificacaoParaLista(onmouseover)
        processo.textContent = especificacao || `${processo.textContent} (sem especificação)`
      }
    })
  })
}

function corrigirTabelasNativas(): void {
  IDS_TABELAS.forEach((idTabela) => {
    try {
      const tabela = document.querySelector(idTabela)
      if (!tabela || tabela.querySelector('thead')) return

      const primeiraLinha = tabela.querySelector('tbody > tr:first-child')
      const caption = tabela.querySelector('caption')
      if (!primeiraLinha || !caption) return

      const thead = document.createElement('thead')
      thead.appendChild(primeiraLinha)
      caption.insertAdjacentElement('afterend', thead)
    } catch (error) {
      console.error(`[SEIRMG] Falha ao corrigir estrutura da tabela ${idTabela}:`, error)
    }
  })
}

const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()

function atualizarCaption(tabela: Element, totalVisivel: number): void {
  const caption = tabela.querySelector('caption')
  if (!caption) return
  caption.textContent = `${totalVisivel} registro${totalVisivel === 1 ? '' : 's'}:`
}

function aplicarVisibilidade(idTabela: string, visibilidade: Record<string, boolean>): void {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  let totalVisivel = 0
  linhasDaTabela(idTabela).forEach((linha, index) => {
    const id = linha.id || String(index)
    const visivel = visibilidade[id] ?? true
    const checkbox = linha.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const linhaEl = linha as HTMLElement

    if (visivel) {
      linhaEl.style.display = 'table-row'
      totalVisivel++
    } else {
      linhaEl.style.display = 'none'
      if (checkbox?.checked) checkbox.click()
    }
    if (checkbox) checkbox.disabled = !visivel
  })

  atualizarCaption(tabela, totalVisivel)
}

function montarBuscaRapida(): void {
  try {
    const inputBusca = document.getElementById('txtPesquisaRapida') as HTMLInputElement | null
    if (!inputBusca) return

    const atualizar = (): void => {
      try {
        const termos = parseTermosBusca(inputBusca.value)

        IDS_TABELAS.forEach((idTabela) => {
          const linhas = linhasDaTabela(idTabela)
          let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

          if (termos.length === 0) {
            estado = removerFiltro(estado, 'PorPesquisa')
          } else {
            const resultado: Record<string, boolean> = {}
            linhas.forEach((linha, index) => {
              const id = linha.id || String(index)
              resultado[id] = linhaCasaBusca(linha.textContent ?? '', termos)
            })
            estado = registrarFiltro(estado, 'PorPesquisa', resultado)
          }

          estadoFiltrosPorTabela.set(idTabela, estado)
          const ids = linhas.map((linha, index) => linha.id || String(index))
          aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
        })
      } catch (error) {
        console.error('[SEIRMG] Falha ao aplicar busca rápida:', error)
      }
    }

    inputBusca.addEventListener('input', atualizar)
    inputBusca.addEventListener('change', atualizar)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar busca rápida:', error)
  }
}

let shiftPressionado = false
const ultimoIndicePorTabela = new Map<string, number>()
let cliqueSinteticoEmAndamento = false

function montarSelecaoMultipla(): void {
  try {
    document.addEventListener('keydown', (evento) => {
      shiftPressionado = evento.shiftKey
    })
    document.addEventListener('keyup', (evento) => {
      shiftPressionado = evento.shiftKey
    })

    IDS_TABELAS.forEach((idTabela) => {
      const tabela = document.querySelector(idTabela)
      if (!tabela) return

      tabela.addEventListener('click', (evento) => {
        if (cliqueSinteticoEmAndamento) return
        const alvo = evento.target
        if (!(alvo instanceof HTMLInputElement) || alvo.type !== 'checkbox') return

        const checkboxes = Array.from(tabela.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        const indiceAtual = checkboxes.indexOf(alvo)
        if (indiceAtual === -1) return

        if (shiftPressionado && ultimoIndicePorTabela.has(idTabela)) {
          const indiceAnterior = ultimoIndicePorTabela.get(idTabela) as number
          const indices = calcularIndicesParaClicar(indiceAnterior, indiceAtual)

          cliqueSinteticoEmAndamento = true
          indices.forEach((indice) => {
            const checkbox = checkboxes[indice]
            if (checkbox && checkbox.offsetParent !== null) checkbox.click()
          })
          cliqueSinteticoEmAndamento = false
        }

        ultimoIndicePorTabela.set(idTabela, indiceAtual)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar seleção múltipla:', error)
  }
}

function montarConfirmarAntesDeConcluir(): void {
  try {
    const botao = document.querySelector<HTMLAnchorElement>(
      '#divComandos > a[onclick*="acao=procedimento_concluir"]'
    )
    if (!botao) return

    const acaoOriginal = botao.getAttribute('onclick')
    if (!acaoOriginal) return

    botao.setAttribute(
      'onclick',
      `if (confirm('Deseja mesmo concluir os processos selecionados?')) { ${acaoOriginal} }`
    )
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar confirmação antes de concluir:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}

bootstrap()
