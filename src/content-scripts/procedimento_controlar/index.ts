import {
  calcularDiasAteVencimento,
  classificarPrazo,
  extrairTextoMarcador,
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
  detectarTransicoesParaDisponibilizado,
  parseListaBlocosAssinatura,
} from '../../features/bloco-assinatura/parser'
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
import {
  extrairUrlDeOnclick,
  montarCorpoConfirmacao,
  parseFormularioMarcador,
  parseOpcoesMarcador,
  type OpcaoMarcador,
} from '../../features/controle-processos/marcadorRapido'
import { EVENTO_CLIQUE_MARCADOR_RAPIDO } from './protocoloMarcadorRapido'
import type { DetalheCliqueMarcadorRapido } from './protocoloMarcadorRapido'
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
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
import userIconSvg from 'lucide-static/icons/user.svg?raw'
import bookmarkPlusIconSvg from 'lucide-static/icons/bookmark-plus.svg?raw'
import bookmarkMinusIconSvg from 'lucide-static/icons/bookmark-minus.svg?raw'

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
  .seirmg-favoritos-prazo-data {
    font-size: 11px;
    color: #666;
  }
  .seirmg-favoritos-vazio {
    color: #aaa;
    font-style: italic;
  }
  .seirmg-marcador-rapido-fundo {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .4);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .seirmg-marcador-rapido-popup {
    width: 360px;
    max-width: 90vw;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
    font-family: Arial, sans-serif;
  }
  .seirmg-marcador-rapido-header {
    padding: 20px 22px 12px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .seirmg-marcador-rapido-icone {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #eaf4ff;
    color: #017fff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .seirmg-marcador-rapido-icone svg {
    width: 18px;
    height: 18px;
  }
  .seirmg-marcador-rapido-titulo {
    font-size: 16px;
    font-weight: bold;
  }
  .seirmg-marcador-rapido-subtitulo {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: #777;
  }
  .seirmg-marcador-rapido-corpo {
    padding: 4px 22px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .seirmg-marcador-rapido-erro {
    background: #fff1f0;
    border: 1px solid #f0c9c9;
    color: #a3232b;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12.5px;
  }
  .seirmg-marcador-rapido-select {
    position: relative;
  }
  .seirmg-marcador-rapido-select-atual {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #dbe9fb;
    background: #f5faff;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    font-size: 13.5px;
  }
  .seirmg-marcador-rapido-seta {
    margin-left: auto;
    color: #777;
    font-size: 10px;
  }
  .seirmg-marcador-rapido-select-lista {
    position: absolute;
    z-index: 1;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 230px;
    overflow-y: auto;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: #fff;
    border: 1px solid #dbe9fb;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
  }
  .seirmg-marcador-rapido-opcao {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 6px;
    font-size: 13.5px;
    cursor: pointer;
  }
  .seirmg-marcador-rapido-opcao:hover {
    background: #eaf4ff;
  }
  .seirmg-marcador-rapido-opcao-icone {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .seirmg-marcador-rapido-textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 64px;
    resize: vertical;
    border: 1px solid #dbe9fb;
    background: #f5faff;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    font-size: 13.5px;
  }
  .seirmg-marcador-rapido-rodape {
    padding: 16px 22px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    border-top: 1px solid #e2e2e2;
  }
  .seirmg-marcador-rapido-btn {
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13.5px;
    font-weight: bold;
    cursor: pointer;
    font-family: inherit;
  }
  .seirmg-marcador-rapido-btn-secundario {
    background: transparent;
    color: #777;
  }
  .seirmg-marcador-rapido-btn-secundario:hover {
    color: #1a1a1a;
  }
  .seirmg-marcador-rapido-btn-primario {
    background: #017fff;
    color: #fff;
  }
  .seirmg-marcador-rapido-btn-primario:hover {
    filter: brightness(1.08);
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

// infraEfeitoTabelas() (JS nativo do SEI, chamado em todo carregamento via onload="inicializar()")
// registra um onmouseout na linha que reseta this.className pra só 'infraTrClara'/'infraTrEscura'
// (+ 'infraTrAcessada'/'infraTrMarcada' se já estavam lá antes) -- qualquer classe que o SEI não
// conhece, como a nossa de alerta/crítico, é descartada assim que o mouse SAI da linha (não durante
// o hover, confirmado ao vivo). setTimeout(0) garante que isso roda depois de qualquer handler
// síncrono de mouseout (inclusive o do SEI, independente da ordem de registro dos dois).
function manterClasseDePrazoAposMouseOut(linha: Element, classe: string): void {
  linha.addEventListener('mouseout', () => {
    setTimeout(() => linha.classList.add(classe), 0)
  })
}

function aplicarPrazoNaLinha(linha: Element, config: ControleProcessosConfig['prazos']): void {
  const prazo = obterControleDePrazoDaLinha(linha)
  const dias = prazo ? calcularDiasAteVencimento(prazo.dataTexto, new Date()) : null

  if (config.exibirDias) {
    const td = document.createElement('td')
    td.setAttribute('valign', 'top')
    td.setAttribute('align', 'center')
    td.textContent = dias === null ? '' : String(dias)
    linha.appendChild(td)
  }

  if (config.exibirPrazo) {
    const td = document.createElement('td')
    td.setAttribute('valign', 'top')
    td.setAttribute('align', 'center')
    td.textContent = prazo?.dataTexto ?? ''
    linha.appendChild(td)
  }

  if (dias !== null) {
    const classificacao = classificarPrazo(dias, { alerta: config.alerta, critico: config.critico })
    if (classificacao === 'alerta') {
      linha.classList.add('infraTrseippalerta')
      manterClasseDePrazoAposMouseOut(linha, 'infraTrseippalerta')
    }
    if (classificacao === 'critico') {
      linha.classList.add('infraTrseippcritico')
      manterClasseDePrazoAposMouseOut(linha, 'infraTrseippcritico')
    }
  }
}

function aplicarPrazosEmLinhas(config: ControleProcessosConfig['prazos'], linhas: Element[]): void {
  if (!config.ativo) return
  linhas.forEach((linha) => aplicarPrazoNaLinha(linha, config))
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    const theadRow = tabela.querySelector('thead > tr')
    if (theadRow) {
      if (config.exibirDias) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = 'Dias'
        theadRow.appendChild(th)
      }
      if (config.exibirPrazo) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = 'Prazo'
        theadRow.appendChild(th)
      }
    }

    aplicarPrazosEmLinhas(config, linhasDaTabela(idTabela))
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

interface ControleDePrazoFavorito {
  dataTexto: string
  diasTexto: string
  iconeHtml: string
}

function obterControleDePrazoDaLinha(linha: Element): ControleDePrazoFavorito | null {
  const link = linha.querySelector<HTMLAnchorElement>("td > a[href*='acao=controle_prazo_definir']")
  if (!link) return null

  const onmouseover = link.getAttribute('onmouseover')
  if (!onmouseover) return null

  const texto = extrairTextoMarcador(onmouseover)
  const match = texto.match(/(\d{2}\/\d{2}\/\d{4})\s*\((.+)\)/)
  if (!match) return null

  return { dataTexto: match[1], diasTexto: match[2], iconeHtml: link.innerHTML }
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

function montarCelulaPrazo(linhaNativa: Element): HTMLTableCellElement {
  const td = document.createElement('td')
  const prazo = obterControleDePrazoDaLinha(linhaNativa)
  if (!prazo) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }

  const linhaData = document.createElement('div')
  linhaData.className = 'seirmg-favoritos-prazo'
  const icone = document.createElement('span')
  icone.className = 'seirmg-favoritos-icone'
  icone.innerHTML = prazo.iconeHtml
  linhaData.appendChild(icone)
  linhaData.appendChild(document.createTextNode(prazo.dataTexto))
  td.appendChild(linhaData)

  const linhaDias = document.createElement('div')
  linhaDias.className = 'seirmg-favoritos-prazo-data'
  linhaDias.textContent = `(${prazo.diasTexto})`
  td.appendChild(linhaDias)

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

function montarLinhaPainelFavoritos(item: FavoritoProcesso, linhaNativa: Element | undefined): HTMLTableRowElement {
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
  tr.appendChild(montarCelulaPrazo(linhaNativa))
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
      tbody.appendChild(montarLinhaPainelFavoritos(item, linhasAbertas.get(item.numero)))
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
  larguraColuna: number
  direcao: 'asc' | 'desc'
}

const estadoOrdenacaoPorTabela = new Map<string, EstadoOrdenacao>()
const ordemOriginalPorTabela = new Map<string, string[]>()

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

function extrairValorColuna(linha: Element, indiceColuna: number, larguraColuna: number): string {
  const partes: string[] = []
  for (let i = 0; i < larguraColuna; i++) {
    const texto = linha.children[indiceColuna + i]?.textContent?.trim()
    if (texto) partes.push(texto)
  }
  return partes.join(' ')
}

function calcularOrdemIds(
  linhas: Element[],
  indiceColuna: number,
  larguraColuna: number,
  direcao: 'asc' | 'desc'
): string[] {
  const valores = linhas.map((linha, index) => ({
    id: linha.id || String(index),
    valor: extrairValorColuna(linha, indiceColuna, larguraColuna),
  }))

  const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
  return ordenarIds(valores, tipo, direcao)
}

function reordenarLinhasPorId(idTabela: string, ordemIds: string[]): void {
  const linhas = linhasDaTabela(idTabela)
  const tabela = document.querySelector(idTabela)
  const tbody = tabela?.querySelector('tbody')
  if (!tbody) return

  const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
  ordemIds.forEach((id) => {
    const linha = linhaPorId.get(id)
    if (linha) tbody.appendChild(linha)
  })
}

function aplicarOrdenacaoNaTabela(
  idTabela: string,
  indiceColuna: number,
  larguraColuna: number,
  direcao: 'asc' | 'desc'
): void {
  try {
    const ordemIds = calcularOrdemIds(linhasDaTabela(idTabela), indiceColuna, larguraColuna, direcao)
    reordenarLinhasPorId(idTabela, ordemIds)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function restaurarOrdemOriginal(idTabela: string): void {
  try {
    const ordemOriginal = ordemOriginalPorTabela.get(idTabela)
    if (!ordemOriginal) return
    reordenarLinhasPorId(idTabela, ordemOriginal)
  } catch (error) {
    console.error('[SEIRMG] Falha ao restaurar ordem original da tabela:', error)
  }
}

function ordenarTabelaPelaColuna(
  idTabela: string,
  indiceColuna: number,
  larguraColuna: number,
  th: HTMLTableCellElement,
  headers: HTMLTableCellElement[]
): void {
  try {
    const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
    const mesmaColuna = estadoAtual?.indiceColuna === indiceColuna

    if (mesmaColuna && estadoAtual?.direcao === 'desc') {
      estadoOrdenacaoPorTabela.delete(idTabela)
      limparIndicadoresOrdenacao(headers)
      reaplicarOrdemDaTabela(idTabela)
      return
    }

    const direcao: 'asc' | 'desc' = mesmaColuna && estadoAtual?.direcao === 'asc' ? 'desc' : 'asc'
    estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, larguraColuna, direcao })
    limparIndicadoresOrdenacao(headers)
    aplicarIndicadorOrdenacao(th, direcao)
    reaplicarOrdemDaTabela(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela pela coluna:', error)
  }
}

function reaplicarOrdenacaoAtual(idTabela: string): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  if (estadoAtual) {
    aplicarOrdenacaoNaTabela(idTabela, estadoAtual.indiceColuna, estadoAtual.larguraColuna, estadoAtual.direcao)
    return
  }
  restaurarOrdemOriginal(idTabela)
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

  const ordemIds = calcularOrdemIds(
    linhas,
    estadoOrdenacao.indiceColuna,
    estadoOrdenacao.larguraColuna,
    estadoOrdenacao.direcao
  )
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

      const linhas = linhasDaTabela(idTabela)
      ordemOriginalPorTabela.set(
        idTabela,
        linhas.map((linha, index) => linha.id || String(index))
      )

      const headers = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead > tr > th'))
      let indiceCorpo = 0
      headers.forEach((th) => {
        const indiceColuna = indiceCorpo
        const larguraColuna = th.colSpan || 1
        indiceCorpo += larguraColuna

        if (!th.textContent?.trim()) return

        th.style.cursor = 'pointer'
        th.style.whiteSpace = 'nowrap'
        th.addEventListener('click', () => {
          ordenarTabelaPelaColuna(idTabela, indiceColuna, larguraColuna, th, headers)
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

      // selectBloco.value vem de bloco.href (parseListaBlocos), extraído via getAttribute('href')
      // de um documento do DOMParser -- string crua, relativa. O fetch de verdade roda no service
      // worker de fundo, que não tem "página atual" pra resolver isso sozinho (mesmo motivo do bug
      // corrigido no marcador rápido: sem isso, resolveria contra chrome-extension:// e falharia
      // com "Failed to fetch").
      const urlProcessosDoBloco = new URL(selectBloco.value, window.location.href).href
      fetchText(urlProcessosDoBloco)
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

// Checagem oportunista de bloco de assinatura -- NENHUM alarme/timer novo. Dispara só como efeito
// colateral do bootstrap() já existente de Controle de Processos (a tela mais visitada), no máximo 1x
// a cada checagemOportunistaIntervaloMinutos. Ver spec
// docs/superpowers/specs/2026-07-16-seirmg-bloco-assinatura-checagem-oportunista-design.md pro
// histórico de por que um alarme autônomo não é uma opção aqui (2 tentativas anteriores causaram
// deslogamento real da sessão do SEI).
async function verificarBlocoAssinaturaOportunisticamente(): Promise<void> {
  const syncConfig = await createSyncConfigStore().get()
  const intervaloMinutos = syncConfig.blocoAssinatura.checagemOportunistaIntervaloMinutos
  if (intervaloMinutos <= 0) return

  const localConfig = await createLocalConfigStore().get()
  const agoraMs = Date.now()
  const ultimaChecagemMs = localConfig.blocoAssinaturaUltimaChecagemOportunista
    ? new Date(localConfig.blocoAssinaturaUltimaChecagemOportunista).getTime()
    : 0
  if (agoraMs - ultimaChecagemMs < intervaloMinutos * 60 * 1000) return

  const link = document.querySelector<HTMLAnchorElement>(
    `a[href^="controlador.php?acao=${PREFIXOS_BLOCO.ASSINATURA}"]`
  )
  if (!link) return

  const resultado = await fetchText(link.href)
  if (!resultado.ok) {
    console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', resultado.error)
    return
  }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const blocosAtuais = parseListaBlocosAssinatura(doc)
  const transicoes = detectarTransicoesParaDisponibilizado(
    blocosAtuais,
    localConfig.blocoAssinaturaEstadosConhecidos
  )

  transicoes.forEach((bloco) => {
    chrome.runtime
      .sendMessage({
        type: 'seirmg:bloco-disponibilizado',
        bloco: { numero: bloco.numero, descricao: bloco.descricao },
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao notificar bloco disponibilizado:', error)
      })
  })

  await createLocalConfigStore().set({
    ...localConfig,
    blocoAssinaturaEstadosConhecidos: Object.fromEntries(
      blocosAtuais.map((bloco) => [bloco.numero, bloco.estado ?? ''])
    ),
    blocoAssinaturaUltimaChecagemOportunista: new Date(agoraMs).toISOString(),
  })
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
  const ordemOriginal = ordemOriginalPorTabela.get(idTabela) ?? []
  // Filtra ids que já estavam na ordem (caso de uma linha existente sendo SUBSTITUÍDA, não
  // uma linha genuinamente nova vinda da rolagem infinita) -- sem isso, o id ficava duplicado
  // (uma vez na posição original, outra no fim), e reordenarLinhasPorId (via appendChild, que
  // MOVE o nó já presente na tbody) acabava jogando a linha pro fim da tabela na última
  // ocorrência do id no array.
  const idsExistentes = new Set(ordemOriginal)
  const novosIds = linhas
    .map((linha, index) => linha.id || String(ordemOriginal.length + index))
    .filter((id) => !idsExistentes.has(id))
  ordemOriginalPorTabela.set(idTabela, [...ordemOriginal, ...novosIds])

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

interface AcaoMarcadorRapido {
  tipo: 'adicionar' | 'remover'
  idFormulario: string
  botao: { nome: string; valor: string }
  tituloPopup: string
  mensagemSucesso: string
  iconeSvg: string
}

const ACAO_ADICIONAR_MARCADOR: AcaoMarcadorRapido = {
  tipo: 'adicionar',
  idFormulario: 'frmAndamentoMarcadorCadastro',
  botao: { nome: 'sbmSalvar', valor: 'Salvar' },
  tituloPopup: 'Adicionar Marcador',
  mensagemSucesso: 'Marcador adicionado.',
  iconeSvg: bookmarkPlusIconSvg,
}

const ACAO_REMOVER_MARCADOR: AcaoMarcadorRapido = {
  tipo: 'remover',
  idFormulario: 'frmAndamentoMarcadorRemocao',
  botao: { nome: 'sbmRemover', valor: 'Remover' },
  tituloPopup: 'Remoção de Marcador',
  mensagemSucesso: 'Marcador removido.',
  iconeSvg: bookmarkMinusIconSvg,
}

let popupMarcadorRapidoAtual: HTMLElement | null = null

function fecharPopupMarcadorRapido(): void {
  popupMarcadorRapidoAtual?.remove()
  popupMarcadorRapidoAtual = null
}

async function confirmarMarcador(
  acao: AcaoMarcadorRapido,
  formularioMarcador: { actionUrl: string; campos: Record<string, string> },
  marcadorEscolhido: string,
  texto: string,
  erro: HTMLElement
): Promise<void> {
  try {
    if (!marcadorEscolhido) {
      erro.textContent = 'Selecione um marcador.'
      erro.style.display = ''
      return
    }

    const corpo = montarCorpoConfirmacao(formularioMarcador.campos, marcadorEscolhido, texto, acao.botao)
    // Mesmo motivo do fetch da tela intermediária: actionUrl vem de getAttribute('action') do
    // formulário na tela retornada (string crua, relativa), não da propriedade .action do DOM
    // (que resolveria sozinha) -- precisa ser resolvida contra a página atual antes do fetch.
    const urlConfirmacao = new URL(formularioMarcador.actionUrl, window.location.href).href
    const resultado = await fetchText(urlConfirmacao, { method: 'POST', body: corpo })
    if (!resultado.ok) {
      erro.textContent = 'Falha ao salvar o marcador. Tente novamente.'
      erro.style.display = ''
      return
    }

    // Tentativas de atualizar só a linha ao vivo (adoptNode e depois reconstrução via
    // innerHTML) deixavam o checkbox funcional mas invisível (opacity:0 que nem forçar
    // inline resolvia) -- confirmado ao vivo numa instância SEI real. O SEI provavelmente
    // depende de algum JS de inicialização de página (visto em inicializar(), ex.
    // infraEfeitoTabelas()) que não temos como replicar de forma confiável fora de uma
    // navegação de verdade. Recarregar a página inteira garante que tudo renderiza
    // exatamente como um carregamento normal (decisão do usuário, ver conversa) -- o popup em
    // si, que já evita a tela cheia nativa de escolher o marcador, continua funcionando.
    window.location.reload()
  } catch (error) {
    console.error('[SEIRMG] Falha ao confirmar marcador:', error)
    erro.textContent = 'Falha ao salvar o marcador. Tente novamente.'
    erro.style.display = ''
  }
}

function criarItemSeletorMarcador(opcao: OpcaoMarcador, aoEscolher: (opcao: OpcaoMarcador) => void): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'seirmg-marcador-rapido-opcao'

  if (opcao.icone) {
    const img = document.createElement('img')
    img.className = 'seirmg-marcador-rapido-opcao-icone'
    img.src = opcao.icone
    item.appendChild(img)
  }

  const texto = document.createElement('span')
  texto.textContent = opcao.nome
  item.appendChild(texto)

  item.addEventListener('click', () => aoEscolher(opcao))
  return item
}

interface SeletorMarcador {
  elemento: HTMLElement
  obterValor: () => string
  fecharLista: () => void
}

// #selMarcador na tela real do SEI é um <select> nativo (sem imagem inline possível em
// <option>), mas cada <option> carrega data-imagesrc com o ícone colorido do marcador
// (confirmado ao vivo). Como o popup já não usa um <select> de verdade, esse widget próprio
// mostra o ícone + nome de cada opção na lista, igual ao "dd" nativo do SEI depois que o
// jQuery ddslick monta em cima do <select> (JS que nunca roda no nosso fetch/parse).
function criarSeletorMarcador(
  opcoes: OpcaoMarcador[],
  valorInicial: string,
  rotuloPlaceholder: string | null
): SeletorMarcador {
  let valorAtual = valorInicial

  const container = document.createElement('div')
  container.className = 'seirmg-marcador-rapido-select'

  const botaoAtual = document.createElement('button')
  botaoAtual.type = 'button'
  botaoAtual.className = 'seirmg-marcador-rapido-select-atual'

  const lista = document.createElement('ul')
  lista.className = 'seirmg-marcador-rapido-select-lista'
  lista.hidden = true

  function criarSeta(): HTMLSpanElement {
    const seta = document.createElement('span')
    seta.className = 'seirmg-marcador-rapido-seta'
    seta.textContent = '▾'
    return seta
  }

  function atualizarBotaoAtual(): void {
    botaoAtual.innerHTML = ''
    const opcaoAtual = opcoes.find((opcao) => opcao.id === valorAtual)
    if (!opcaoAtual) {
      const texto = document.createElement('span')
      texto.textContent = rotuloPlaceholder ?? ''
      botaoAtual.appendChild(texto)
      botaoAtual.appendChild(criarSeta())
      return
    }
    if (opcaoAtual.icone) {
      const img = document.createElement('img')
      img.className = 'seirmg-marcador-rapido-opcao-icone'
      img.src = opcaoAtual.icone
      botaoAtual.appendChild(img)
    }
    const texto = document.createElement('span')
    texto.textContent = opcaoAtual.nome
    botaoAtual.appendChild(texto)
    botaoAtual.appendChild(criarSeta())
  }

  function escolher(opcao: OpcaoMarcador): void {
    valorAtual = opcao.id
    atualizarBotaoAtual()
    lista.hidden = true
  }

  opcoes.forEach((opcao) => lista.appendChild(criarItemSeletorMarcador(opcao, escolher)))

  botaoAtual.addEventListener('click', (evento) => {
    evento.stopPropagation()
    lista.hidden = !lista.hidden
  })

  atualizarBotaoAtual()
  container.appendChild(botaoAtual)
  container.appendChild(lista)

  return {
    elemento: container,
    obterValor: () => valorAtual,
    fecharLista: () => {
      lista.hidden = true
    },
  }
}

function textoQuantidadeProcessos(quantidade: number): string {
  return `${quantidade} processo${quantidade === 1 ? '' : 's'} selecionado${quantidade === 1 ? '' : 's'}`
}

function abrirPopupMarcador(
  acao: AcaoMarcadorRapido,
  opcoes: OpcaoMarcador[],
  formularioMarcador: { actionUrl: string; campos: Record<string, string> },
  quantidade: number
): void {
  fecharPopupMarcadorRapido()

  const fundo = document.createElement('div')
  fundo.className = 'seirmg-marcador-rapido-fundo'
  fundo.addEventListener('click', fecharPopupMarcadorRapido)

  const popup = document.createElement('div')
  popup.className = 'seirmg-marcador-rapido-popup'
  popup.addEventListener('click', (evento) => {
    evento.stopPropagation()
    seletor.fecharLista()
  })

  const header = document.createElement('div')
  header.className = 'seirmg-marcador-rapido-header'

  const icone = document.createElement('div')
  icone.className = 'seirmg-marcador-rapido-icone'
  icone.innerHTML = acao.iconeSvg
  header.appendChild(icone)

  const titulos = document.createElement('div')
  const titulo = document.createElement('strong')
  titulo.className = 'seirmg-marcador-rapido-titulo'
  titulo.textContent = acao.tituloPopup
  const subtitulo = document.createElement('p')
  subtitulo.className = 'seirmg-marcador-rapido-subtitulo'
  subtitulo.textContent = textoQuantidadeProcessos(quantidade)
  titulos.append(titulo, subtitulo)
  header.appendChild(titulos)
  popup.appendChild(header)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-marcador-rapido-corpo'

  const erro = document.createElement('div')
  erro.className = 'seirmg-marcador-rapido-erro'
  erro.style.display = 'none'
  corpo.appendChild(erro)

  const rotuloPlaceholder = acao.tipo === 'adicionar' ? 'Selecione um marcador' : null
  const seletor = criarSeletorMarcador(opcoes, formularioMarcador.campos.hdnIdMarcador, rotuloPlaceholder)
  corpo.appendChild(seletor.elemento)

  let textarea: HTMLTextAreaElement | null = null
  if (acao.tipo === 'adicionar') {
    textarea = document.createElement('textarea')
    textarea.className = 'seirmg-marcador-rapido-textarea'
    textarea.placeholder = 'Texto (opcional)'
    corpo.appendChild(textarea)
  }

  popup.appendChild(corpo)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-marcador-rapido-rodape'

  const botaoCancelar = document.createElement('button')
  botaoCancelar.type = 'button'
  botaoCancelar.className = 'seirmg-marcador-rapido-btn seirmg-marcador-rapido-btn-secundario'
  botaoCancelar.textContent = 'Cancelar'
  botaoCancelar.addEventListener('click', fecharPopupMarcadorRapido)
  rodape.appendChild(botaoCancelar)

  const botaoConfirmar = document.createElement('button')
  botaoConfirmar.type = 'button'
  botaoConfirmar.className = 'seirmg-marcador-rapido-btn seirmg-marcador-rapido-btn-primario'
  botaoConfirmar.textContent = acao.botao.valor
  botaoConfirmar.addEventListener('click', () => {
    botaoConfirmar.disabled = true
    confirmarMarcador(acao, formularioMarcador, seletor.obterValor(), textarea?.value ?? '', erro).finally(() => {
      botaoConfirmar.disabled = false
    })
  })
  rodape.appendChild(botaoConfirmar)

  popup.appendChild(rodape)
  fundo.appendChild(popup)
  document.body.appendChild(fundo)

  popupMarcadorRapidoAtual = fundo
}

async function processarClickMarcador(
  acao: AcaoMarcadorRapido,
  link: HTMLAnchorElement,
  quantidade: number
): Promise<void> {
  const urlRelativa = extrairUrlDeOnclick(link.getAttribute('onclick') ?? '')
  if (!urlRelativa) {
    console.error('[SEIRMG] Não foi possível extrair a URL do link de marcador.')
    return
  }
  // A URL vem de dentro de um onclick (string crua, não um atributo href/action refletido
  // pelo DOM) -- por isso precisa ser resolvida contra a página atual antes do fetch, mesmo
  // padrão já usado em documento_externo_arraste/procedimento_visualizar (o fetch de verdade
  // roda no service worker de fundo, que não tem "página atual" nenhuma pra resolver uma URL
  // relativa como controlador.php?acao=... sozinho -- resolveria contra chrome-extension://).
  const url = new URL(urlRelativa, window.location.href).href

  const formPagina = document.getElementById('frmProcedimentoControlar') as HTMLFormElement | null
  if (!formPagina) return

  const resultadoTela = await fetchText(url, {
    method: 'POST',
    body: new URLSearchParams(extrairCamposOcultos(formPagina)),
  })
  if (!resultadoTela.ok) {
    console.error('[SEIRMG] Falha ao buscar tela de marcador:', resultadoTela.error)
    return
  }

  const docTela = new DOMParser().parseFromString(resultadoTela.data, 'text/html')
  const opcoes = parseOpcoesMarcador(docTela)
  const formularioMarcador = parseFormularioMarcador(docTela, acao.idFormulario)
  if (!formularioMarcador) {
    console.error('[SEIRMG] Formulário de marcador não encontrado na tela retornada.')
    return
  }

  abrirPopupMarcador(acao, opcoes, formularioMarcador, quantidade)
}

// A decisão de interceptar (contagem de selecionados) e o preventDefault/
// stopImmediatePropagation do onclick nativo acontecem no main world (pontePrincipal.ts /
// pontePrincipalMain.ts) -- confirmado ao vivo que um listener registrado pelo content
// script isolado (aqui) não consegue impedir o onclick inline de rodar, porque ele é
// compilado/executado no realm da própria página (mesma armadilha do CKEditor, ver
// documento_editar/pontePrincipal.ts). Aqui só se recebe o aviso via CustomEvent e se faz o
// trabalho de verdade (fetch/popup), que precisa das APIs da extensão e por isso não pode
// rodar no main world.
function montarMarcadorRapido(): void {
  try {
    window.addEventListener(EVENTO_CLIQUE_MARCADOR_RAPIDO, (evento) => {
      const { chave, quantidade } = (evento as CustomEvent<DetalheCliqueMarcadorRapido>).detail

      const seletor =
        chave === 'adicionar'
          ? '#divComandos a[onclick*="andamento_marcador_cadastrar"]'
          : '#divComandos a[onclick*="andamento_marcador_remover"]'
      const link = document.querySelector<HTMLAnchorElement>(seletor)
      if (!link) return

      const acao = chave === 'adicionar' ? ACAO_ADICIONAR_MARCADOR : ACAO_REMOVER_MARCADOR

      processarClickMarcador(acao, link, quantidade).catch((error) => {
        console.error('[SEIRMG] Falha ao processar clique de marcador rápido:', error)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar marcador rápido:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    injetarEstilos()
    corrigirTabelasNativas()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)

    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarMarcadorRapido()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
    montarAgrupamento(config)

    favoritosAtivo = config.controleProcessos.favoritos.ativo
    itensFavoritados = config.controleProcessos.favoritos.itens

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

    verificarBlocoAssinaturaOportunisticamente().catch((error) => {
      console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', error)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}

bootstrap()
