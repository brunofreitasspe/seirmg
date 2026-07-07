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
import { extrairNomesAtribuidos, linhaCasaAtribuicao } from '../../features/controle-processos/filtroAtribuicao'
import {
  linhaCasaBloco,
  parseListaBlocos,
  parseProcessosDoBloco,
} from '../../features/controle-processos/filtroBloco'
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
import { fetchText } from '../../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'

const IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr'))
}

function definirTiposPrazo(
  config: ControleProcessosConfig['prazos']
): Array<{ tipo: TipoCalculoPrazo; exibir: boolean; rotulo: string; limites: { alerta: number; critico: number } }> {
  return [
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
}

function aplicarUmTipoDePrazo(
  linhas: Element[],
  tipo: TipoCalculoPrazo,
  limites: { alerta: number; critico: number }
): void {
  linhas.forEach((linha) => {
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
}

function aplicarPrazosEmLinhas(config: ControleProcessosConfig['prazos'], linhas: Element[]): void {
  if (!config.ativo) return
  definirTiposPrazo(config).forEach(({ tipo, exibir, limites }) => {
    if (!exibir) return
    aplicarUmTipoDePrazo(linhas, tipo, limites)
  })
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    definirTiposPrazo(config).forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      aplicarUmTipoDePrazo(linhasDaTabela(idTabela), tipo, limites)
    })
  })
}

function aplicarCorProcessoEmLinhas(config: ControleProcessosConfig['coresProcesso'], linhas: Element[]): void {
  if (!config.ativo || config.regras.length === 0) return

  linhas.forEach((linha) => {
    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    const onmouseover = processo?.getAttribute('onmouseover')
    if (!processo || !onmouseover) return

    const especificacao = extrairEspecificacaoParaCor(onmouseover)
    const cor = escolherCorProcesso(especificacao, config.regras)
    if (cor) {
      processo.setAttribute('style', `background-color: ${cor}; padding: 0 1em 0 1em`)
    }
  })
}

function aplicarCorProcesso(config: ControleProcessosConfig['coresProcesso']): void {
  IDS_TABELAS.forEach((idTabela) => {
    aplicarCorProcessoEmLinhas(config, linhasDaTabela(idTabela))
  })
}

function aplicarEspecificacaoEmLinhas(config: ControleProcessosConfig['especificacao'], linhas: Element[]): void {
  if (!config.ativo) return

  linhas.forEach((linha) => {
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
}

function aplicarEspecificacao(config: ControleProcessosConfig['especificacao']): void {
  IDS_TABELAS.forEach((idTabela) => {
    aplicarEspecificacaoEmLinhas(config, linhasDaTabela(idTabela))
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
const reaplicarFiltrosAposNovasLinhas: Array<() => void> = []

interface EstadoOrdenacao {
  indiceColuna: number
  direcao: 'asc' | 'desc'
}

const estadoOrdenacaoPorTabela = new Map<string, EstadoOrdenacao>()

function limparIndicadoresOrdenacao(headers: HTMLTableCellElement[]): void {
  headers.forEach((th) => {
    th.querySelector('.seirmg-indicador-ordenacao')?.remove()
  })
}

function aplicarIndicadorOrdenacao(th: HTMLTableCellElement, direcao: 'asc' | 'desc'): void {
  const span = document.createElement('span')
  span.className = 'seirmg-indicador-ordenacao'
  span.textContent = direcao === 'asc' ? ' ▲' : ' ▼'
  th.appendChild(span)
}

function aplicarOrdenacaoNaTabela(
  idTabela: string,
  indiceColuna: number,
  direcao: 'asc' | 'desc',
  headers: HTMLTableCellElement[]
): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const valores = linhas.map((linha, index) => ({
      id: linha.id || String(index),
      valor: linha.children[indiceColuna]?.textContent?.trim() ?? '',
    }))

    const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
    const ordemIds = ordenarIds(valores, tipo, direcao)

    const tabela = document.querySelector(idTabela)
    const tbody = tabela?.querySelector('tbody')
    if (!tbody) return

    const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
    ordemIds.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })

    limparIndicadoresOrdenacao(headers)
    aplicarIndicadorOrdenacao(headers[indiceColuna], direcao)
    ultimoIndicePorTabela.delete(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  const direcao: 'asc' | 'desc' =
    estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
  estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })
  aplicarOrdenacaoNaTabela(idTabela, indiceColuna, direcao, headers)
}

function reaplicarOrdenacaoAtual(idTabela: string): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoAtual) return

  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  const headers = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead > tr > th'))
  aplicarOrdenacaoNaTabela(idTabela, estadoAtual.indiceColuna, estadoAtual.direcao, headers)
}

function montarOrdenacaoTabelas(): void {
  try {
    IDS_TABELAS.forEach((idTabela) => {
      const tabela = document.querySelector(idTabela)
      if (!tabela) return

      const headers = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead > tr > th'))
      headers.forEach((th, indiceColuna) => {
        if (!th.textContent?.trim()) return

        th.style.cursor = 'pointer'
        th.addEventListener('click', () => {
          ordenarTabelaPelaColuna(idTabela, indiceColuna, headers)
        })
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar ordenação de tabelas:', error)
  }
}

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
    reaplicarFiltrosAposNovasLinhas.push(atualizar)
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

function obterTextoAtribuido(linha: Element): string | null {
  const link = linha.querySelector('td:nth-child(4) a')
  return link?.textContent?.trim() ?? null
}

async function montarFiltroAtribuicao(): Promise<void> {
  try {
    const divFiltro = document.getElementById('divFiltro')
    if (!divFiltro) return

    const textos = IDS_TABELAS.flatMap((idTabela) =>
      linhasDaTabela(idTabela).map((linha) => obterTextoAtribuido(linha) ?? '')
    )
    const nomes = extrairNomesAtribuidos(textos)

    const select = document.createElement('select')
    select.id = 'seirmg-filtro-atribuicao'
    select.appendChild(new Option('Ver todos os processos', '*'))
    select.appendChild(new Option('Ver processos não atribuídos', ''))
    nomes.forEach((nome) => {
      select.appendChild(new Option(`Ver processos atribuídos à ${nome}`, nome))
    })

    const localConfig = await createLocalConfigStore().get()
    select.value = localConfig.atribuicaoSelecionada ?? '*'

    const aplicar = (valor: string): void => {
      IDS_TABELAS.forEach((idTabela) => {
        const linhas = linhasDaTabela(idTabela)
        let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

        if (valor === '*') {
          estado = removerFiltro(estado, 'PorAtribuicao')
        } else {
          const resultado: Record<string, boolean> = {}
          linhas.forEach((linha, index) => {
            const id = linha.id || String(index)
            resultado[id] = linhaCasaAtribuicao(obterTextoAtribuido(linha), valor)
          })
          estado = registrarFiltro(estado, 'PorAtribuicao', resultado)
        }

        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicar(select.value))

    select.addEventListener('change', () => {
      aplicar(select.value)
      createLocalConfigStore()
        .get()
        .then((atual) => createLocalConfigStore().set({ ...atual, atribuicaoSelecionada: select.value }))
        .catch((error) => {
          console.error('[SEIRMG] Falha ao salvar preferência de filtro por atribuição:', error)
        })
    })

    divFiltro.prepend(select)
    if (select.value !== '*') aplicar(select.value)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar filtro por atribuição:', error)
  }
}

const PREFIXOS_BLOCO: Record<string, string> = {
  INTERNO: 'bloco_interno_listar',
  ASSINATURA: 'bloco_assinatura_listar',
  REUNIAO: 'bloco_reuniao_listar',
}

function montarFiltroBloco(): void {
  try {
    const divComandos = document.querySelector('#divComandos')
    if (!divComandos) return

    const tipos = [
      { rotulo: 'Blocos Internos', valor: 'INTERNO' },
      { rotulo: 'Blocos de Assinatura', valor: 'ASSINATURA' },
      { rotulo: 'Blocos de Reunião', valor: 'REUNIAO' },
    ].map((tipo) => {
      const link = document.querySelector<HTMLAnchorElement>(
        `a[href^="controlador.php?acao=${PREFIXOS_BLOCO[tipo.valor]}"]`
      )
      return { ...tipo, href: link?.href ?? '' }
    })

    const tiposDisponiveis = tipos.filter((tipo) => tipo.href)
    if (tiposDisponiveis.length === 0) return

    const selectTipo = document.createElement('select')
    selectTipo.id = 'seirmg-filtro-bloco-tipo'
    selectTipo.appendChild(new Option('', ''))
    tiposDisponiveis.forEach((tipo) => selectTipo.appendChild(new Option(tipo.rotulo, tipo.valor)))

    const selectBloco = document.createElement('select')
    selectBloco.id = 'seirmg-filtro-bloco-numero'
    selectBloco.appendChild(new Option('', ''))
    selectBloco.style.display = 'none'

    let ultimoNumerosBloco: string[] | null = null

    const aplicarFiltroBloco = (numeros: string[] | null): void => {
      ultimoNumerosBloco = numeros

      IDS_TABELAS.forEach((idTabela) => {
        const linhas = linhasDaTabela(idTabela)
        let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

        if (!numeros) {
          estado = removerFiltro(estado, 'PorBloco')
        } else {
          const resultado: Record<string, boolean> = {}
          linhas.forEach((linha, index) => {
            const id = linha.id || String(index)
            const numeroProcesso = linha.querySelector('td:nth-child(3) a')?.textContent?.trim() ?? ''
            resultado[id] = linhaCasaBloco(numeroProcesso, numeros)
          })
          estado = registrarFiltro(estado, 'PorBloco', resultado)
        }

        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicarFiltroBloco(ultimoNumerosBloco))

    selectTipo.addEventListener('change', () => {
      selectBloco.innerHTML = ''
      selectBloco.appendChild(new Option('', ''))
      selectBloco.style.display = 'none'
      aplicarFiltroBloco(null)

      const tipoSelecionado = tiposDisponiveis.find((tipo) => tipo.valor === selectTipo.value)
      if (!tipoSelecionado) return

      fetchText(tipoSelecionado.href)
        .then((resultado) => {
          if (!resultado.ok) {
            console.error('[SEIRMG] Falha ao buscar lista de blocos:', resultado.error)
            return
          }

          const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
          parseListaBlocos(doc).forEach((bloco) => {
            selectBloco.appendChild(new Option(`${bloco.numero} - ${bloco.descricao}`, bloco.href))
          })
          selectBloco.style.display = ''
        })
        .catch((error) => {
          console.error('[SEIRMG] Falha ao buscar lista de blocos:', error)
        })
    })

    selectBloco.addEventListener('change', () => {
      if (!selectBloco.value) {
        aplicarFiltroBloco(null)
        return
      }

      fetchText(selectBloco.value)
        .then((resultado) => {
          if (!resultado.ok) {
            console.error('[SEIRMG] Falha ao buscar processos do bloco:', resultado.error)
            return
          }

          const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
          aplicarFiltroBloco(parseProcessosDoBloco(doc))
        })
        .catch((error) => {
          console.error('[SEIRMG] Falha ao buscar processos do bloco:', error)
        })
    })

    divComandos.appendChild(selectTipo)
    divComandos.appendChild(selectBloco)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar filtro por bloco:', error)
  }
}

function desabilitarSelecaoNaLinha(linha: Element): void {
  const checkbox = linha.querySelector<HTMLInputElement>('input.infraCheckbox, input[type="checkbox"]')
  if (!checkbox) return

  checkbox.disabled = true
  const celula = checkbox.closest('td')
  if (!celula) return

  celula.setAttribute(
    'onmouseover',
    "return infraTooltipMostrar('Desative a opção \"Rolagem infinita\" nas Opções do SEIRMG para utilizar esta seleção')"
  )
  celula.setAttribute('onmouseout', 'return infraTooltipOcultar()')
}

function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdenacaoAtual(idTabela)
}

async function buscarProximasPaginas(
  tipo: 'Recebidos' | 'Gerados',
  idTabela: string,
  form: HTMLFormElement,
  config: SyncConfig,
  indice: number
): Promise<void> {
  const campos = extrairCamposOcultos(form)
  campos[`hdn${tipo}PaginaAtual`] = String(indice)

  const resultado = await fetchText(form.action, {
    method: 'POST',
    body: new URLSearchParams(campos),
  })

  if (!resultado.ok) {
    console.error(`[SEIRMG] Falha ao buscar página ${indice} de ${tipo}:`, resultado.error)
    return
  }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const linhasNovas = extrairLinhasValidas(doc, idTabela)

  if (linhasNovas.length === 0) {
    const camposFinais = extrairCamposOcultos(form)
    camposFinais[`hdn${tipo}PaginaAtual`] = '0'
    fetchText(form.action, { method: 'POST', body: new URLSearchParams(camposFinais) }).catch((error) => {
      console.error(`[SEIRMG] Falha ao resetar página de ${tipo}:`, error)
    })
    return
  }

  const tabela = document.querySelector(idTabela)
  const tbody = tabela?.querySelector('tbody')
  if (!tabela || !tbody) return

  const linhasAdotadas = linhasNovas.map((linha) => document.adoptNode(linha))
  linhasAdotadas.forEach((linha) => {
    desabilitarSelecaoNaLinha(linha)
    tbody.appendChild(linha)
  })

  const campoNroItens = document.getElementById(`hdn${tipo}NroItens`) as HTMLInputElement | null
  const nroItensAnterior = Number(campoNroItens?.value ?? '0')
  const nroItensNovo = extrairNroItens(doc, tipo) ?? 0
  const totalItens = nroItensAnterior + nroItensNovo
  if (campoNroItens) campoNroItens.value = String(totalItens)
  atualizarCaption(tabela, totalItens)

  reaplicarTratamentosNasLinhasNovas(idTabela, config, linhasAdotadas)

  await buscarProximasPaginas(tipo, idTabela, form, config, indice + 1)
}

async function iniciarRemocaoPaginacao(
  tipo: 'Recebidos' | 'Gerados',
  idTabela: string,
  config: SyncConfig
): Promise<void> {
  try {
    const linkPaginacao = document.querySelector(`#div${tipo}AreaPaginacaoSuperior a`)
    if (!linkPaginacao) return

    const form = document.getElementById('frmProcedimentoControlar') as HTMLFormElement | null
    if (!form) return

    const campoPagina = document.getElementById(`hdn${tipo}PaginaAtual`) as HTMLInputElement | null
    const paginaAtual = Number(campoPagina?.value ?? '0')

    if (paginaAtual > 0) {
      if (campoPagina) campoPagina.value = '0'
      form.submit()
      return
    }

    document
      .querySelectorAll(`#div${tipo} .infraAreaPaginacao a, #div${tipo} .infraAreaPaginacao select`)
      .forEach((elemento) => {
        (elemento as HTMLElement).style.display = 'none'
      })

    await buscarProximasPaginas(tipo, idTabela, form, config, 1)
  } catch (error) {
    console.error(`[SEIRMG] Falha ao remover paginação (${tipo}):`, error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)

    if (config.controleProcessos.rolagemInfinita.ativo) {
      const tabelasRolagem: Array<{ tipo: 'Recebidos' | 'Gerados'; idTabela: string }> = [
        { tipo: 'Recebidos', idTabela: '#tblProcessosRecebidos' },
        { tipo: 'Gerados', idTabela: '#tblProcessosGerados' },
      ]
      tabelasRolagem.forEach(({ tipo, idTabela }) => {
        iniciarRemocaoPaginacao(tipo, idTabela, config).catch((error) => {
          console.error(`[SEIRMG] Falha ao iniciar remoção de paginação (${tipo}):`, error)
        })
      })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}

bootstrap()
