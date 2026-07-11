import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairDataDoMarcador,
  extrairTextoMarcador,
  formatarDataBr,
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
import {
  agruparLinhas,
  extrairNomeMarcador,
  extrairTextoPontoControle,
  extrairTipoProcesso,
  type CriterioAgrupamento,
  type LinhaParaAgrupar,
} from '../../features/controle-processos/agrupamento'
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore, DEFAULT_SYNC_CONFIG } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'
import { montarCorpoVerificacaoLote, extrairEncontrados } from '../../features/planka/lote'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
import { limparTokenPlanka } from '../shared/plankaToken'
import {
  extrairFavoritoDaLinha,
  calcularOcultacaoPorFavorito,
  ordenarFavoritosPorData,
} from '../../features/controle-processos/favoritos'
import type { FavoritoProcesso } from '../../lib/storage'
import starIconSvg from 'lucide-static/icons/star.svg?raw'
import starOffIconSvg from 'lucide-static/icons/star-off.svg?raw'
import flagIconSvg from 'lucide-static/icons/flag.svg?raw'
import clockIconSvg from 'lucide-static/icons/clock.svg?raw'
import userIconSvg from 'lucide-static/icons/user.svg?raw'

const IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

const ESTILO_FILTROS_E_ESPECIFICACAO = `
  .seirmg-filtro-rotulo {
    font-size: .85em;
    color: #444;
    margin-right: .25em;
  }
  .seirmg-select-filtro {
    font: inherit;
    font-size: .95em;
    margin: 0 .75em 0 0;
    padding: 1px 2px;
    vertical-align: middle;
    cursor: pointer;
  }
  .seirmg-especificacao {
    font-size: .85em;
    color: #666;
    font-style: italic;
    display: block;
    margin-top: 2px;
  }
  .seirmg-planka-link {
    font-size: .85em;
    display: block;
    margin-top: 2px;
    color: #017fff;
    text-decoration: none;
  }
  .seirmg-planka-link:hover {
    text-decoration: underline;
  }
  .seirmg-planka-popover {
    position: absolute;
    z-index: 1000;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .15);
    padding: 10px;
    max-width: 320px;
  }
  .seirmg-planka-popover-mensagem {
    font-size: 13px;
    color: #666;
  }
  .seirmg-favorito-estrela {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-left: 4px;
    color: #f5a623;
  }
  .seirmg-favorito-estrela svg {
    width: 14px;
    height: 14px;
  }
  .seirmg-favorito-estrela.seirmg-favorito-inativo {
    color: #ccc;
  }
  .seirmg-favoritos-painel {
    margin-top: 12px;
    width: 100%;
    box-sizing: border-box;
    flex: 0 0 100%;
    max-width: 100%;
  }
  .seirmg-favoritos-painel-titulo {
    font-weight: bold;
    padding: 6px 10px;
    background: #fff4e0;
    border: 1px solid #f0d9a0;
    border-bottom: none;
  }
  .seirmg-favoritos-badge {
    display: inline-block;
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 10px;
    margin-left: 6px;
    background: #e8f2ff;
    color: #017fff;
  }
  .seirmg-favoritos-badge-fechado {
    background: #eee;
    color: #777;
  }
  .seirmg-favoritos-detalhes {
    margin-top: 3px;
  }
  .seirmg-favoritos-especificacao {
    color: #666;
    font-size: 11px;
    margin-left: 4px;
  }
  .seirmg-favoritos-icone {
    display: inline-flex;
    vertical-align: -2px;
    margin-right: 3px;
  }
  .seirmg-favoritos-icone svg,
  .seirmg-favoritos-icone img {
    width: 12px;
    height: 12px;
  }
  .seirmg-favoritos-marcador {
    display: inline-flex;
    align-items: center;
    background: #eef2f7;
    color: #445;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 11px;
    margin: 0 4px 2px 0;
  }
  .seirmg-favoritos-prazo {
    font-weight: bold;
  }
  .seirmg-favoritos-prazo-alerta {
    color: #b8860b;
  }
  .seirmg-favoritos-prazo-critico {
    color: #c0392b;
  }
  .seirmg-favoritos-prazo-data {
    font-size: 11px;
    color: #666;
  }
  .seirmg-favoritos-vazio {
    color: #aaa;
    font-style: italic;
  }
`

function injetarEstilos(): void {
  if (document.getElementById('seirmg-estilo-controle-processos')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-controle-processos'
  style.textContent = ESTILO_FILTROS_E_ESPECIFICACAO
  document.head.appendChild(style)
}

let popoverPlankaAtual: HTMLElement | null = null

function fecharPopoverPlanka(): void {
  popoverPlankaAtual?.remove()
  popoverPlankaAtual = null
}

function abrirPopoverPlanka(link: HTMLElement, conteudo: HTMLElement): void {
  fecharPopoverPlanka()

  const popover = document.createElement('div')
  popover.className = 'seirmg-planka-popover'
  popover.addEventListener('click', (evento) => evento.stopPropagation())
  popover.appendChild(conteudo)
  document.body.appendChild(popover)

  const retanguloLink = link.getBoundingClientRect()
  popover.style.top = `${window.scrollY + retanguloLink.bottom + 4}px`
  popover.style.left = `${window.scrollX + retanguloLink.left}px`

  popoverPlankaAtual = popover
}

function abrirPopoverMensagemPlanka(link: HTMLElement, mensagem: string): void {
  const p = document.createElement('div')
  p.className = 'seirmg-planka-popover-mensagem'
  p.textContent = mensagem
  abrirPopoverPlanka(link, p)
}

document.addEventListener('click', () => {
  try {
    fecharPopoverPlanka()
  } catch (error) {
    console.error('[SEIRMG] Falha ao fechar popover do Planka:', error)
  }
})

async function consultarEAbrirPopoverPlanka(
  link: HTMLAnchorElement,
  nup: string,
  urlConsulta: string,
  token: string
): Promise<void> {
  try {
    const resposta = await fetch(urlConsulta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ processo: nup }),
    })

    if (resposta.status === 404) {
      abrirPopoverMensagemPlanka(link, 'Nenhum card encontrado no Planka.')
      return
    }

    if (resposta.status === 401) {
      await limparTokenPlanka()
      abrirPopoverMensagemPlanka(link, 'Erro ao consultar o Planka.')
      return
    }

    if (!resposta.ok) {
      console.error('[SEIRMG] Consulta ao Planka falhou:', resposta.status)
      abrirPopoverMensagemPlanka(link, 'Erro ao consultar o Planka.')
      return
    }

    const dados = (await resposta.json()) as RespostaConsultaPlanka
    montarEstiloPlanka()
    const conteudo = montarConteudoCardPlanka(dados)
    abrirPopoverPlanka(link, conteudo ?? criarMensagemPlankaVazia())
  } catch (error) {
    console.error('[SEIRMG] Falha ao consultar o Planka:', error)
    abrirPopoverMensagemPlanka(link, 'Erro ao consultar o Planka.')
  }
}

function criarMensagemPlankaVazia(): HTMLElement {
  const p = document.createElement('div')
  p.className = 'seirmg-planka-popover-mensagem'
  p.textContent = 'Nenhum card encontrado no Planka.'
  return p
}

async function verificarProcessosEmLotePlanka(
  urlVerificarLote: string,
  token: string,
  nups: string[]
): Promise<Set<string>> {
  if (nups.length === 0) return new Set()

  try {
    const resposta = await fetch(urlVerificarLote, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(montarCorpoVerificacaoLote(nups)),
    })

    if (resposta.status === 401) {
      await limparTokenPlanka()
      return new Set()
    }

    if (!resposta.ok) {
      console.error('[SEIRMG] Verificação em lote do Planka falhou:', resposta.status)
      return new Set()
    }

    return extrairEncontrados(await resposta.json())
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar processos em lote no Planka:', error)
    return new Set()
  }
}

async function aplicarLinksPlankaEmLinhas(linhas: Element[]): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const planka = localConfig.planka
    if (!planka?.urlVerificarLote || !planka.urlConsulta || !planka.token) return
    if (!tokenValido(planka.tokenExp, new Date().toISOString())) return

    const urlVerificarLote = planka.urlVerificarLote
    const urlConsulta = planka.urlConsulta
    const token = planka.token

    const linhasPorNup = new Map<string, HTMLElement[]>()
    linhas.forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const nup = processo?.textContent?.trim()
      if (!processo || !nup) return
      const elementos = linhasPorNup.get(nup) ?? []
      elementos.push(processo)
      linhasPorNup.set(nup, elementos)
    })
    if (linhasPorNup.size === 0) return

    const encontrados = await verificarProcessosEmLotePlanka(urlVerificarLote, token, [...linhasPorNup.keys()])

    encontrados.forEach((nup) => {
      const processos = linhasPorNup.get(nup)
      if (!processos) return

      processos.forEach((processo) => {
        if (processo.nextElementSibling?.classList.contains('seirmg-planka-link')) return

        const link = document.createElement('a')
        link.href = '#'
        link.className = 'seirmg-planka-link'
        link.textContent = '📋 Ver Planka'
        link.addEventListener('click', (evento) => {
          evento.preventDefault()
          evento.stopPropagation()
          consultarEAbrirPopoverPlanka(link, nup, urlConsulta, token).catch((error) => {
            console.error('[SEIRMG] Falha ao abrir o card do Planka:', error)
          })
        })

        processo.insertAdjacentElement('afterend', link)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar links do Planka nas linhas:', error)
  }
}

const LIMITE_PAGINAS_ROLAGEM_INFINITA = 200

function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr:not(.seirmg-cabecalho-grupo)'))
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
      span.className = 'seirmg-especificacao'
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

let favoritosAtivo = false
let itensFavoritados: FavoritoProcesso[] = []
let configPrazosAtual: ControleProcessosConfig['prazos'] = DEFAULT_SYNC_CONFIG.controleProcessos.prazos

interface PrazoFavorito {
  diasTexto: string
  dataTexto: string
  classificacao: 'alerta' | 'critico' | null
}

interface MarcadorFavorito {
  nome: string
  estilo: string | null
  iconeHtml: string
}

function obterMarcadoresDaLinha(linha: Element): MarcadorFavorito[] {
  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  return marcadores
    .map((marcador) => {
      const onmouseover = marcador.getAttribute('onmouseover')
      return {
        nome: onmouseover ? extrairNomeMarcador(onmouseover) : '',
        estilo: marcador.getAttribute('style'),
        iconeHtml: marcador.innerHTML,
      }
    })
    .filter((item) => item.nome !== '')
}

function calcularPrazoFavorito(linha: Element, config: ControleProcessosConfig['prazos']): PrazoFavorito | null {
  if (!config.ativo) return null

  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  const textos = marcadores
    .map((marcador) => marcador.getAttribute('onmouseover'))
    .filter((texto): texto is string => texto !== null)
    .map(extrairTextoMarcador)

  const tentativas: Array<{
    tipo: TipoCalculoPrazo
    exibir: boolean
    limites: { alerta: number; critico: number }
    rotulo: string
  }> = [
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
      rotulo: 'vence',
    },
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
      rotulo: 'desde',
    },
  ]

  const agora = new Date()
  for (const tentativa of tentativas) {
    if (!tentativa.exibir) continue

    const data = extrairDataDoMarcador(textos, tentativa.tipo)
    const dias = calcularDiasDoMarcador(textos, tentativa.tipo, agora)
    if (!data || dias === null) continue

    return {
      diasTexto: `${dias} dia${Math.abs(dias) === 1 ? '' : 's'}`,
      dataTexto: `${tentativa.rotulo} ${formatarDataBr(data)}`,
      classificacao: classificarPrazo(dias, tentativa.tipo, tentativa.limites),
    }
  }
  return null
}

function obterEspecificacaoDaLinha(linha: Element): string | undefined {
  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const onmouseover = processo?.getAttribute('onmouseover')
  if (!onmouseover) return undefined
  return extrairEspecificacaoParaExibicao(onmouseover) || undefined
}

function criarEstrela(favorito: FavoritoProcesso, favoritado: boolean): HTMLElement {
  const estrela = document.createElement('span')
  estrela.dataset.nup = favorito.numero
  estrela.className = favoritado ? 'seirmg-favorito-estrela' : 'seirmg-favorito-estrela seirmg-favorito-inativo'
  estrela.innerHTML = favoritado ? starIconSvg : starOffIconSvg
  estrela.title = favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
  estrela.addEventListener('click', (evento) => {
    evento.preventDefault()
    evento.stopPropagation()
    alternarFavorito(favorito).catch((error) => {
      console.error('[SEIRMG] Falha ao favoritar processo:', error)
    })
  })
  return estrela
}

function aplicarEstrelasEmLinhas(linhas: Element[]): void {
  if (!favoritosAtivo) return

  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  const agoraIso = new Date().toISOString()

  linhas.forEach((linha) => {
    if (linha.querySelector('.seirmg-favorito-estrela')) return

    const favorito = extrairFavoritoDaLinha(linha, agoraIso)
    if (!favorito) return

    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    if (!processo) return

    const favoritado = idsFavoritados.has(favorito.numero)
    processo.insertAdjacentElement('afterend', criarEstrela(favorito, favoritado))
  })
}

function atualizarTodasAsEstrelas(): void {
  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  document.querySelectorAll<HTMLElement>('.seirmg-favorito-estrela').forEach((estrela) => {
    const nup = estrela.dataset.nup
    if (!nup) return

    const favoritado = idsFavoritados.has(nup)
    estrela.innerHTML = favoritado ? starIconSvg : starOffIconSvg
    estrela.className = favoritado ? 'seirmg-favorito-estrela' : 'seirmg-favorito-estrela seirmg-favorito-inativo'
    estrela.title = favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
  })
}

function aplicarFiltroFavoritoNaTabela(idTabela: string): void {
  let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

  if (!favoritosAtivo || itensFavoritados.length === 0) {
    estado = removerFiltro(estado, 'PorFavoritoAberto')
    estadoFiltrosPorTabela.set(idTabela, estado)
    return
  }

  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  const linhas = linhasDaTabela(idTabela).map((linha, index) => {
    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    return { id: linha.id || String(index), nup: processo?.textContent?.trim() ?? null }
  })

  estado = registrarFiltro(estado, 'PorFavoritoAberto', calcularOcultacaoPorFavorito(linhas, idsFavoritados))
  estadoFiltrosPorTabela.set(idTabela, estado)
}

function aplicarFiltroFavoritoEmTodasAsTabelas(): void {
  IDS_TABELAS.forEach((idTabela) => {
    aplicarFiltroFavoritoNaTabela(idTabela)
    reaplicarOrdemDaTabela(idTabela)
  })
}

function mapaLinhasAbertasNaPagina(): Map<string, Element> {
  const linhas = new Map<string, Element>()
  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const nup = processo?.textContent?.trim()
      if (nup) linhas.set(nup, linha)
    })
  })
  return linhas
}

function ultimaTabelaPresente(): Element | null {
  for (let i = IDS_TABELAS.length - 1; i >= 0; i--) {
    const tabela = document.querySelector(IDS_TABELAS[i])
    if (tabela) return tabela
  }
  return null
}

interface ReferenciaPainel {
  elemento: Element
  comoFilho: boolean
}

function referenciaParaPainel(): ReferenciaPainel | null {
  // Em layouts do SEI que organizam Detalhado/Gerados/Recebidos em colunas Bootstrap
  // (col-md-6) lado a lado dentro de #divTabelaProcesso -- esse mesmo container é quem
  // tem o scroll (altura fixa + overflow:auto), não a página. Inserir o painel como
  // filho dele (não como irmão depois) mantém o painel na mesma área rolável; a classe
  // `.row` do Bootstrap já quebra linha automaticamente pra um filho com flex-basis:100%,
  // então ele ocupa a largura toda abaixo das colunas das tabelas.
  const linhaTabelas = document.getElementById('divTabelaProcesso')
  if (linhaTabelas) return { elemento: linhaTabelas, comoFilho: true }

  const tabela = ultimaTabelaPresente()
  return tabela ? { elemento: tabela, comoFilho: false } : null
}

function montarCelulaProcesso(item: FavoritoProcesso, aberto: boolean, especificacao: string | undefined): HTMLTableCellElement {
  const td = document.createElement('td')
  if (item.link) {
    const link = document.createElement('a')
    link.href = item.link
    link.textContent = item.numero
    td.appendChild(link)
  } else {
    td.appendChild(document.createTextNode(item.numero))
  }

  const detalhes = document.createElement('div')
  detalhes.className = 'seirmg-favoritos-detalhes'

  const badge = document.createElement('span')
  badge.className = aberto ? 'seirmg-favoritos-badge' : 'seirmg-favoritos-badge seirmg-favoritos-badge-fechado'
  badge.textContent = aberto ? 'aberto na sua caixa' : 'fechado'
  detalhes.appendChild(badge)

  if (especificacao) {
    const especificacaoEl = document.createElement('span')
    especificacaoEl.className = 'seirmg-favoritos-especificacao'
    especificacaoEl.textContent = `· ${especificacao}`
    detalhes.appendChild(especificacaoEl)
  }

  td.appendChild(detalhes)
  return td
}

function criarIcone(svg: string): HTMLElement {
  const icone = document.createElement('span')
  icone.className = 'seirmg-favoritos-icone'
  icone.innerHTML = svg
  return icone
}

function montarCelulaMarcadores(linhaNativa: Element): HTMLTableCellElement {
  const td = document.createElement('td')
  const marcadores = obterMarcadoresDaLinha(linhaNativa)
  if (marcadores.length === 0) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  marcadores.forEach(({ nome, estilo, iconeHtml }) => {
    const pill = document.createElement('span')
    pill.className = 'seirmg-favoritos-marcador'
    if (estilo) pill.setAttribute('style', estilo)
    if (iconeHtml.trim()) {
      const icone = document.createElement('span')
      icone.className = 'seirmg-favoritos-icone'
      icone.innerHTML = iconeHtml
      pill.appendChild(icone)
    } else {
      pill.appendChild(criarIcone(flagIconSvg))
    }
    pill.appendChild(document.createTextNode(nome))
    td.appendChild(pill)
  })
  return td
}

function montarCelulaPrazo(linhaNativa: Element, config: ControleProcessosConfig['prazos']): HTMLTableCellElement {
  const td = document.createElement('td')
  const prazo = calcularPrazoFavorito(linhaNativa, config)
  if (!prazo) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }

  const linhaDias = document.createElement('div')
  const classesPorClassificacao: Record<'alerta' | 'critico', string> = {
    alerta: 'seirmg-favoritos-prazo seirmg-favoritos-prazo-alerta',
    critico: 'seirmg-favoritos-prazo seirmg-favoritos-prazo-critico',
  }
  linhaDias.className = prazo.classificacao ? classesPorClassificacao[prazo.classificacao] : 'seirmg-favoritos-prazo'
  linhaDias.appendChild(criarIcone(clockIconSvg))
  linhaDias.appendChild(document.createTextNode(prazo.diasTexto))
  td.appendChild(linhaDias)

  const linhaData = document.createElement('div')
  linhaData.className = 'seirmg-favoritos-prazo-data'
  linhaData.textContent = prazo.dataTexto
  td.appendChild(linhaData)

  return td
}

function montarCelulaAtribuicao(linhaNativa: Element): HTMLTableCellElement {
  const td = document.createElement('td')
  const atribuicao = obterTextoAtribuido(linhaNativa)
  if (!atribuicao) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  td.appendChild(criarIcone(userIconSvg))
  td.appendChild(document.createTextNode(atribuicao))
  return td
}

function montarCelulaRemover(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')
  const botaoRemover = document.createElement('span')
  botaoRemover.className = 'seirmg-favorito-estrela'
  botaoRemover.dataset.nup = item.numero
  botaoRemover.innerHTML = starIconSvg
  botaoRemover.title = 'Remover dos favoritos'
  botaoRemover.addEventListener('click', () => {
    alternarFavorito(item).catch((error) => {
      console.error('[SEIRMG] Falha ao remover favorito:', error)
    })
  })
  td.appendChild(botaoRemover)
  return td
}

function montarLinhaPainelFavoritos(
  item: FavoritoProcesso,
  linhaNativa: Element | undefined,
  config: ControleProcessosConfig['prazos']
): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const especificacao = linhaNativa ? (obterEspecificacaoDaLinha(linhaNativa) ?? item.especificacao) : item.especificacao

  if (!linhaNativa) {
    const tdFechado = montarCelulaProcesso(item, false, especificacao)
    tdFechado.colSpan = 4
    tr.appendChild(tdFechado)
    tr.appendChild(montarCelulaRemover(item))
    return tr
  }

  tr.appendChild(montarCelulaProcesso(item, true, especificacao))
  tr.appendChild(montarCelulaMarcadores(linhaNativa))
  tr.appendChild(montarCelulaPrazo(linhaNativa, config))
  tr.appendChild(montarCelulaAtribuicao(linhaNativa))
  tr.appendChild(montarCelulaRemover(item))
  return tr
}

function renderizarPainelFavoritos(): void {
  try {
    document.getElementById('seirmg-favoritos-painel')?.remove()

    if (!favoritosAtivo || itensFavoritados.length === 0) return

    const referencia = referenciaParaPainel()
    if (!referencia) return

    const painel = document.createElement('div')
    painel.id = 'seirmg-favoritos-painel'
    painel.className = 'seirmg-favoritos-painel'

    const titulo = document.createElement('div')
    titulo.className = 'seirmg-favoritos-painel-titulo'
    titulo.textContent = `★ Favoritos (${itensFavoritados.length} registro${itensFavoritados.length === 1 ? '' : 's'})`
    painel.appendChild(titulo)

    const tabela = document.createElement('table')
    tabela.className = 'infraTable'
    tabela.style.tableLayout = 'fixed'
    tabela.style.width = '100%'

    const colgroup = document.createElement('colgroup')
    ;[30, 24, 20, 18, 8].forEach((largura) => {
      const col = document.createElement('col')
      col.style.width = `${largura}%`
      colgroup.appendChild(col)
    })
    tabela.appendChild(colgroup)

    const thead = document.createElement('thead')
    const trHead = document.createElement('tr')
    ;['Processo', 'Marcadores', 'Prazo', 'Atribuição', ''].forEach((rotulo) => {
      const th = document.createElement('th')
      th.className = 'infraTh'
      th.textContent = rotulo
      trHead.appendChild(th)
    })
    thead.appendChild(trHead)
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    const linhasAbertas = mapaLinhasAbertasNaPagina()
    ordenarFavoritosPorData(itensFavoritados).forEach((item) => {
      tbody.appendChild(montarLinhaPainelFavoritos(item, linhasAbertas.get(item.numero), configPrazosAtual))
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)

    if (referencia.comoFilho) {
      referencia.elemento.appendChild(painel)
    } else {
      referencia.elemento.insertAdjacentElement('afterend', painel)
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar painel de favoritos:', error)
  }
}

async function alternarFavorito(favorito: FavoritoProcesso): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const atual = await store.get()
    const itens = atual.controleProcessos.favoritos.itens
    const jaFavoritado = itens.some((item) => item.numero === favorito.numero)
    const novosItens = jaFavoritado
      ? itens.filter((item) => item.numero !== favorito.numero)
      : [...itens, { ...favorito, adicionadoEm: new Date().toISOString() }]

    await store.set({
      ...atual,
      controleProcessos: {
        ...atual.controleProcessos,
        favoritos: { ...atual.controleProcessos.favoritos, itens: novosItens },
      },
    })

    itensFavoritados = novosItens
    aplicarFiltroFavoritoEmTodasAsTabelas()
    atualizarTodasAsEstrelas()
    renderizarPainelFavoritos()
  } catch (error) {
    console.error('[SEIRMG] Falha ao alternar favorito:', error)
  }
}

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

function calcularOrdemIds(linhas: Element[], indiceColuna: number, direcao: 'asc' | 'desc'): string[] {
  const valores = linhas.map((linha, index) => ({
    id: linha.id || String(index),
    valor: linha.children[indiceColuna]?.textContent?.trim() ?? '',
  }))

  const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
  return ordenarIds(valores, tipo, direcao)
}

function aplicarOrdenacaoNaTabela(idTabela: string, indiceColuna: number, direcao: 'asc' | 'desc'): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const ordemIds = calcularOrdemIds(linhas, indiceColuna, direcao)

    const tabela = document.querySelector(idTabela)
    const tbody = tabela?.querySelector('tbody')
    if (!tbody) return

    const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
    ordemIds.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  try {
    const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
    const direcao: 'asc' | 'desc' =
      estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
    estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })
    limparIndicadoresOrdenacao(headers)
    aplicarIndicadorOrdenacao(headers[indiceColuna], direcao)
    reaplicarOrdemDaTabela(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela pela coluna:', error)
  }
}

function reaplicarOrdenacaoAtual(idTabela: string): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoAtual) return
  aplicarOrdenacaoNaTabela(idTabela, estadoAtual.indiceColuna, estadoAtual.direcao)
}

let criterioAgrupamentoAtivo: CriterioAgrupamento = 'nenhum'

const ROTULO_GRUPO_SEM_CHAVE = 'Sem Grupo'

function criarCabecalhoDeGrupo(idTabela: string, rotulo: string, quantidade: number): HTMLTableRowElement {
  const tabela = document.querySelector(idTabela)
  const colunas = tabela?.querySelectorAll('thead > tr > th').length ?? 1
  const tr = document.createElement('tr')
  tr.className = 'tableHeader infraCaption seirmg-cabecalho-grupo'
  const td = document.createElement('td')
  td.colSpan = colunas
  td.textContent = `${rotulo} (${quantidade} processo${quantidade === 1 ? '' : 's'})`
  tr.appendChild(td)
  return tr
}

function removerCabecalhosDeGrupo(idTabela: string): void {
  document.querySelectorAll(`${idTabela} tbody > tr.seirmg-cabecalho-grupo`).forEach((tr) => tr.remove())
}

function calcularOrdemDentroDoGrupo(idTabela: string, linhas: Element[]): Map<string, number> | undefined {
  const estadoOrdenacao = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoOrdenacao) return undefined

  const ordemIds = calcularOrdemIds(linhas, estadoOrdenacao.indiceColuna, estadoOrdenacao.direcao)
  return new Map(ordemIds.map((id, posicao) => [id, posicao]))
}

function extrairChaveDeAgrupamento(linha: Element, criterio: Exclude<CriterioAgrupamento, 'nenhum'>): string | null {
  if (criterio === 'responsavel') {
    return obterTextoAtribuido(linha)
  }

  const seletores: Record<Exclude<CriterioAgrupamento, 'nenhum' | 'responsavel'>, string> = {
    marcador: "td > a[href*='acao=andamento_marcador_gerenciar']",
    tipo: '.processoVisualizado, .processoNaoVisualizado',
    pontoControle: "td > a[href*='acao=andamento_situacao_gerenciar']",
  }
  const extratores: Record<
    Exclude<CriterioAgrupamento, 'nenhum' | 'responsavel'>,
    (onmouseover: string) => string
  > = {
    marcador: extrairNomeMarcador,
    tipo: extrairTipoProcesso,
    pontoControle: extrairTextoPontoControle,
  }

  const elemento = linha.querySelector<HTMLElement>(seletores[criterio])
  const onmouseover = elemento?.getAttribute('onmouseover')
  if (!onmouseover) return null

  return extratores[criterio](onmouseover) || null
}

function aplicarAgrupamento(idTabela: string, criterio: Exclude<CriterioAgrupamento, 'nenhum'>): void {
  removerCabecalhosDeGrupo(idTabela)

  const tabela = document.querySelector(idTabela)
  const tbody = tabela?.querySelector('tbody')
  if (!tabela || !tbody) return

  const linhas = linhasDaTabela(idTabela)
  const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))

  const linhasParaAgrupar: LinhaParaAgrupar[] = linhas.map((linha, index) => ({
    id: linha.id || String(index),
    chaveGrupo: extrairChaveDeAgrupamento(linha, criterio),
  }))

  const grupos = agruparLinhas(linhasParaAgrupar, calcularOrdemDentroDoGrupo(idTabela, linhas))

  grupos.forEach((grupo) => {
    tbody.appendChild(criarCabecalhoDeGrupo(idTabela, grupo.chaveGrupo ?? ROTULO_GRUPO_SEM_CHAVE, grupo.ids.length))
    grupo.ids.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })
  })
}

function ocultarCabecalhosDeGrupoVazios(idTabela: string): void {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  let cabecalhoAtual: HTMLElement | null = null
  let grupoTemLinhaVisivel = false

  const fecharGrupoAnterior = (): void => {
    if (cabecalhoAtual) cabecalhoAtual.style.display = grupoTemLinhaVisivel ? 'table-row' : 'none'
  }

  Array.from(tabela.querySelectorAll('tbody > tr')).forEach((linha) => {
    const linhaEl = linha as HTMLElement
    if (linhaEl.classList.contains('seirmg-cabecalho-grupo')) {
      fecharGrupoAnterior()
      cabecalhoAtual = linhaEl
      grupoTemLinhaVisivel = false
    } else if (linhaEl.style.display !== 'none') {
      grupoTemLinhaVisivel = true
    }
  })
  fecharGrupoAnterior()
}

function reaplicarOrdemDaTabela(idTabela: string): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const estado = estadoFiltrosPorTabela.get(idTabela) ?? {}
    const ids = linhas.map((linha, index) => linha.id || String(index))
    aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))

    const tabelaSuportaAgrupamento = idTabela === '#tblProcessosRecebidos' || idTabela === '#tblProcessosGerados'
    const criterio = criterioAgrupamentoAtivo
    if (tabelaSuportaAgrupamento && criterio !== 'nenhum') {
      aplicarAgrupamento(idTabela, criterio)
    } else {
      removerCabecalhosDeGrupo(idTabela)
      reaplicarOrdenacaoAtual(idTabela)
    }

    ocultarCabecalhosDeGrupoVazios(idTabela)
    ultimoIndicePorTabela.delete(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao reaplicar ordem da tabela:', error)
  }
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
          reaplicarOrdemDaTabela(idTabela)
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

    const rotulo = document.createElement('span')
    rotulo.className = 'seirmg-filtro-rotulo'
    rotulo.textContent = 'Atribuição:'

    const select = document.createElement('select')
    select.id = 'seirmg-filtro-atribuicao'
    select.className = 'seirmg-select-filtro'
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
        reaplicarOrdemDaTabela(idTabela)
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

    divFiltro.prepend(rotulo, select)
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

    const rotuloTipo = document.createElement('span')
    rotuloTipo.className = 'seirmg-filtro-rotulo'
    rotuloTipo.textContent = 'Bloco:'

    const selectTipo = document.createElement('select')
    selectTipo.id = 'seirmg-filtro-bloco-tipo'
    selectTipo.className = 'seirmg-select-filtro'
    selectTipo.appendChild(new Option('', ''))
    tiposDisponiveis.forEach((tipo) => selectTipo.appendChild(new Option(tipo.rotulo, tipo.valor)))

    const selectBloco = document.createElement('select')
    selectBloco.id = 'seirmg-filtro-bloco-numero'
    selectBloco.className = 'seirmg-select-filtro'
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
        reaplicarOrdemDaTabela(idTabela)
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

    divComandos.appendChild(rotuloTipo)
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
  aplicarLinksPlankaEmLinhas(linhas).catch((error) => {
    console.error('[SEIRMG] Falha ao aplicar links do Planka nas linhas novas:', error)
  })
  aplicarEstrelasEmLinhas(linhas)
  aplicarFiltroFavoritoNaTabela(idTabela)
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdemDaTabela(idTabela)
  linhas.forEach((linha) => desabilitarSelecaoNaLinha(linha))
  renderizarPainelFavoritos()
}

async function buscarProximasPaginas(
  tipo: 'Recebidos' | 'Gerados',
  idTabela: string,
  form: HTMLFormElement,
  config: SyncConfig,
  indice: number
): Promise<void> {
  if (indice > LIMITE_PAGINAS_ROLAGEM_INFINITA) {
    console.error(
      `[SEIRMG] Limite de ${LIMITE_PAGINAS_ROLAGEM_INFINITA} páginas atingido ao buscar página ${indice} de ${tipo} (possível loop sem fim na paginação do SEI). Interrompendo busca.`
    )
    return
  }

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

const ROTULOS_OPCAO_AGRUPAMENTO: Array<{ valor: CriterioAgrupamento; rotulo: string }> = [
  { valor: 'nenhum', rotulo: 'Sem agrupamento' },
  { valor: 'marcador', rotulo: 'Por marcador' },
  { valor: 'tipo', rotulo: 'Por tipo' },
  { valor: 'responsavel', rotulo: 'Por responsável' },
  { valor: 'pontoControle', rotulo: 'Por ponto de controle' },
]

const TABELAS_COM_AGRUPAMENTO = ['#tblProcessosRecebidos', '#tblProcessosGerados']

function montarAgrupamento(config: SyncConfig): void {
  try {
    const divFiltro = document.getElementById('divFiltro')
    if (!divFiltro) return

    criterioAgrupamentoAtivo = config.controleProcessos.agrupamento.criterio

    const select = document.createElement('select')
    select.id = 'seirmg-agrupamento-criterio'
    ROTULOS_OPCAO_AGRUPAMENTO.forEach(({ valor, rotulo }) => {
      select.appendChild(new Option(rotulo, valor))
    })
    select.value = criterioAgrupamentoAtivo

    select.addEventListener('change', () => {
      criterioAgrupamentoAtivo = select.value as CriterioAgrupamento
      TABELAS_COM_AGRUPAMENTO.forEach((idTabela) => reaplicarOrdemDaTabela(idTabela))

      createSyncConfigStore()
        .get()
        .then((atual) =>
          createSyncConfigStore().set({
            ...atual,
            controleProcessos: {
              ...atual.controleProcessos,
              agrupamento: { criterio: criterioAgrupamentoAtivo },
            },
          })
        )
        .catch((error) => {
          console.error('[SEIRMG] Falha ao salvar critério de agrupamento:', error)
        })
    })

    divFiltro.prepend(select)

    if (criterioAgrupamentoAtivo !== 'nenhum') {
      TABELAS_COM_AGRUPAMENTO.forEach((idTabela) => reaplicarOrdemDaTabela(idTabela))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar agrupamento:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    injetarEstilos()
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
    montarAgrupamento(config)

    favoritosAtivo = config.controleProcessos.favoritos.ativo
    itensFavoritados = config.controleProcessos.favoritos.itens
    configPrazosAtual = config.controleProcessos.prazos

    const todasAsLinhas = IDS_TABELAS.flatMap((idTabela) => linhasDaTabela(idTabela))
    aplicarEstrelasEmLinhas(todasAsLinhas)
    aplicarFiltroFavoritoEmTodasAsTabelas()
    renderizarPainelFavoritos()

    aplicarLinksPlankaEmLinhas(todasAsLinhas).catch((error) => {
      console.error('[SEIRMG] Falha ao aplicar links do Planka:', error)
    })

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
