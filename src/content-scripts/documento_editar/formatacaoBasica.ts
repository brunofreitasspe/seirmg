import alignLeftIconSvg from 'lucide-static/icons/align-left.svg?raw'
import alignCenterIconSvg from 'lucide-static/icons/align-center.svg?raw'
import alignRightIconSvg from 'lucide-static/icons/align-right.svg?raw'
import alignJustifyIconSvg from 'lucide-static/icons/align-justify.svg?raw'
import zoomInIconSvg from 'lucide-static/icons/zoom-in.svg?raw'
import zoomOutIconSvg from 'lucide-static/icons/zoom-out.svg?raw'
import paintbrushIconSvg from 'lucide-static/icons/paintbrush.svg?raw'
import caseSensitiveIconSvg from 'lucide-static/icons/case-sensitive.svg?raw'
import tableIconSvg from 'lucide-static/icons/table.svg?raw'
import separatorHorizontalIconSvg from 'lucide-static/icons/separator-horizontal.svg?raw'
import listOrderedIconSvg from 'lucide-static/icons/list-ordered.svg?raw'
import superscriptIconSvg from 'lucide-static/icons/superscript.svg?raw'
import sigmaIconSvg from 'lucide-static/icons/sigma.svg?raw'
import { injetarEstiloSeAusente } from './dom'
import { abrirDialogoLatex } from './latex'
import { CLASSES_ALINHAMENTO, proximoTamanhoFontePx } from '../../features/formatacao-basica/paragrafoEstilos'
import type { AlinhamentoTexto } from '../../features/formatacao-basica/paragrafoEstilos'
import { lerEstiloElemento } from '../../features/formatacao-basica/estiloTexto'
import { primeiraLetraMaiuscula } from '../../features/formatacao-basica/maiuscula'
import { CATALOGO_ESTILOS_TABELA, aplicarEstiloTabelaHtml, montarTabelaHtml } from '../../features/formatacao-basica/tabelaRapida'
import { montarQuebraPaginaHtml } from '../../features/formatacao-basica/quebraPagina'
import { CLASSES_PARAGRAFO_NUMERADO } from '../../features/formatacao-basica/numeracaoParagrafos'
import { extrairItensSumario, montarSumarioHtml } from '../../features/formatacao-basica/sumario'
import { montarChamadaHtml, montarEntradaHtml } from '../../features/formatacao-basica/notaRodape'
import type { DescritorEstiloTexto } from './protocolo'
import type { EditorSEI } from './ponteEditor'
import type { AtalhoParagrafo, FormatacaoBasicaConfig } from '../../lib/storage'

const ESTILO_BOTOES = `
  .seirmg-cke-button-icone svg {
    width: 16px;
    height: 16px;
    display: block;
    margin: 0 auto;
  }
`

function localizarToolbox(iframe: HTMLIFrameElement): HTMLElement | null {
  const container = iframe.closest('.cke')
  return container?.querySelector<HTMLElement>('.cke_toolbox') ?? null
}

function aguardarToolbox(iframe: HTMLIFrameElement, intervaloMs: number, tentativasMax: number): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    function tentar(restantes: number): void {
      const toolbox = localizarToolbox(iframe)
      if (toolbox) {
        resolve(toolbox)
        return
      }
      if (restantes <= 0) {
        reject(new Error('Barra de ferramentas do CKEditor não apareceu a tempo'))
        return
      }
      setTimeout(() => tentar(restantes - 1), intervaloMs)
    }
    tentar(tentativasMax)
  })
}

function criarBotaoToolbar(id: string, titulo: string, iconeSvg: string, aoClicar: () => void): HTMLElement {
  const botao = document.createElement('a')
  botao.id = id
  botao.href = '#'
  botao.title = titulo
  botao.className = 'cke_button cke_button_off seirmg-cke-button'
  botao.innerHTML = `<span class="cke_button_icon seirmg-cke-button-icone">${iconeSvg}</span>`
  botao.addEventListener('click', (evento) => {
    evento.preventDefault()
    aoClicar()
  })
  return botao
}

function tratarErro(contexto: string): (erro: unknown) => void {
  return (erro) => console.error(`[SEIRMG] ${contexto}:`, erro)
}

function montarBotoesAlinhamento(editor: EditorSEI): HTMLElement[] {
  const icones: Record<AlinhamentoTexto, string> = {
    esquerda: alignLeftIconSvg,
    centro: alignCenterIconSvg,
    direita: alignRightIconSvg,
    justificado: alignJustifyIconSvg,
  }
  const rotulos: Record<AlinhamentoTexto, string> = {
    esquerda: 'Alinhar à esquerda',
    centro: 'Centralizar',
    direita: 'Alinhar à direita',
    justificado: 'Justificar',
  }

  return (Object.keys(CLASSES_ALINHAMENTO) as AlinhamentoTexto[]).map((alinhamento) =>
    criarBotaoToolbar(`seirmg-cke-alinhar-${alinhamento}`, rotulos[alinhamento], icones[alinhamento], () => {
      editor.aplicarClasseParagrafo(CLASSES_ALINHAMENTO[alinhamento]).catch(tratarErro('Falha ao alinhar texto'))
    })
  )
}

function lerTamanhoFonteAtualPx(editor: EditorSEI): number {
  const selecao = editor.janela.getSelection()
  const no = selecao?.anchorNode
  const elemento = no instanceof Element ? no : no?.parentElement
  if (!elemento) return 14
  const tamanho = Number.parseFloat(editor.janela.getComputedStyle(elemento).fontSize)
  return Number.isNaN(tamanho) ? 14 : Math.round(tamanho)
}

function montarBotoesFonte(editor: EditorSEI): HTMLElement[] {
  const aoClicar = (direcao: 'up' | 'down') => () => {
    const atual = lerTamanhoFonteAtualPx(editor)
    editor
      .aplicarEstiloTexto({ fontSizePx: proximoTamanhoFontePx(atual, direcao) })
      .catch(tratarErro('Falha ao alterar tamanho da fonte'))
  }

  return [
    criarBotaoToolbar('seirmg-cke-fonte-aumentar', 'Aumentar fonte', zoomInIconSvg, aoClicar('up')),
    criarBotaoToolbar('seirmg-cke-fonte-reduzir', 'Reduzir fonte', zoomOutIconSvg, aoClicar('down')),
  ]
}

function elementoDaSelecao(editor: EditorSEI): Element | null {
  const selecao = editor.janela.getSelection()
  const no = selecao?.anchorNode
  if (!no) return null
  return no instanceof Element ? no : no.parentElement
}

function montarBotaoCopiarFormatacao(editor: EditorSEI): HTMLElement {
  let estiloCopiado: DescritorEstiloTexto | null = null

  const botao = criarBotaoToolbar('seirmg-cke-copiar-formatacao', 'Copiar formatação', paintbrushIconSvg, () => {
    if (estiloCopiado) {
      const paraAplicar = estiloCopiado
      estiloCopiado = null
      botao.title = 'Copiar formatação'
      editor.aplicarEstiloTexto(paraAplicar).catch(tratarErro('Falha ao aplicar formatação copiada'))
      return
    }

    const elemento = elementoDaSelecao(editor)
    if (!elemento) return
    estiloCopiado = lerEstiloElemento(elemento)
    botao.title = 'Colar formatação copiada'
  })

  return botao
}

function montarBotaoMaiuscula(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-maiuscula', 'Primeira letra maiúscula', caseSensitiveIconSvg, () => {
    editor
      .obterTextoSelecionado()
      .then((texto) => (texto ? editor.inserirTexto(primeiraLetraMaiuscula(texto)) : undefined))
      .catch(tratarErro('Falha ao aplicar maiúscula automática'))
  })
}

function montarBotaoTabelaRapida(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-tabela', 'Inserir tabela rápida', tableIconSvg, () => {
    const linhas = Number.parseInt(window.prompt('Quantas linhas?', '2') ?? '', 10)
    const colunas = Number.parseInt(window.prompt('Quantas colunas?', '2') ?? '', 10)
    if (!Number.isInteger(linhas) || !Number.isInteger(colunas) || linhas < 1 || colunas < 1) return

    const idsValidos = CATALOGO_ESTILOS_TABELA.map((estilo) => estilo.id).join('/')
    const idEstilo = window.prompt(`Estilo (${idsValidos}) ou deixe em branco pro padrão:`, '') ?? ''
    const estilo = CATALOGO_ESTILOS_TABELA.find((item) => item.id === idEstilo.trim())

    const tabelaHtml = montarTabelaHtml(linhas, colunas)
    const htmlFinal = estilo ? aplicarEstiloTabelaHtml(tabelaHtml, estilo) : tabelaHtml
    editor.inserirHtml(htmlFinal).catch(tratarErro('Falha ao inserir tabela rápida'))
  })
}

function montarBotaoQuebraPagina(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-quebra-pagina', 'Inserir quebra de página', separatorHorizontalIconSvg, () => {
    editor.inserirHtml(montarQuebraPaginaHtml()).catch(tratarErro('Falha ao inserir quebra de página'))
  })
}

function montarBotaoSumario(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-sumario', 'Inserir sumário', listOrderedIconSvg, () => {
    const paragrafos = Array.from(
      editor.corpo.querySelectorAll<HTMLElement>(CLASSES_PARAGRAFO_NUMERADO.map((c) => `.${c}`).join(','))
    )
    if (paragrafos.length === 0) return

    const itens = extrairItensSumario(
      paragrafos.map((p) => ({
        classe: CLASSES_PARAGRAFO_NUMERADO.find((c) => p.classList.contains(c)) ?? '',
        texto: p.textContent ?? '',
      }))
    )
    // Atribuição de id é metadado estrutural invisível (âncora), não conteúdo novo do
    // usuário — mutação direta do DOM, mesma exceção documentada na spec pra nota de
    // rodapé, em vez de passar pela ponte.
    paragrafos.forEach((p, indice) => {
      p.id = itens[indice].id
    })

    editor.inserirHtml(montarSumarioHtml(itens)).catch(tratarErro('Falha ao inserir sumário'))
  })
}

function proximoNumeroNota(corpo: HTMLElement): number {
  return corpo.querySelectorAll('.Nota_Rodape').length + 1
}

function montarBotaoNotaRodape(editor: EditorSEI): HTMLElement {
  // O número é reservado de forma síncrona (fora do .then()) porque inserirHtml faz um
  // round-trip assíncrono real pela ponte: se o usuário inserir uma segunda nota antes da
  // primeira resolver, ler a contagem do DOM nesse momento repetiria o mesmo número (o DOM
  // só ganha a entrada da primeira nota depois que sua Promise resolve). O contador abaixo
  // evita essa corrida sem mudar o escopo documentado (sem renumeração ao excluir).
  let proximoNumero: number | null = null

  return criarBotaoToolbar('seirmg-cke-nota-rodape', 'Inserir nota de rodapé', superscriptIconSvg, () => {
    const texto = window.prompt('Texto da nota de rodapé:')
    if (!texto) return

    if (proximoNumero === null) {
      proximoNumero = proximoNumeroNota(editor.corpo)
    }
    const numero = proximoNumero
    proximoNumero += 1

    const id = `n${Date.now()}`
    editor
      .inserirHtml(montarChamadaHtml(id, numero))
      .then(() => {
        // Entrada é anexada direto no DOM (não passa pela ponte): é bookkeeping
        // estrutural do documento (lista de notas), não texto novo digitado pelo
        // usuário no ponto do cursor — mesma exceção documentada na spec.
        editor.corpo.insertAdjacentHTML('beforeend', montarEntradaHtml(id, numero, texto))
      })
      .catch(tratarErro('Falha ao inserir nota de rodapé'))
  })
}

function montarBotaoLatex(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-latex', 'Inserir equação (LaTeX)', sigmaIconSvg, () => {
    abrirDialogoLatex(editor)
  })
}

function registrarAtalhos(editor: EditorSEI, atalhos: AtalhoParagrafo[]): void {
  if (atalhos.length === 0) return
  const porTecla = new Map(atalhos.map((atalho) => [atalho.tecla.toLowerCase(), atalho]))
  editor.janela.addEventListener('keydown', (evento) => {
    if (!(evento.ctrlKey && evento.altKey && evento.shiftKey)) return
    const atalho = porTecla.get(evento.key.toLowerCase())
    if (!atalho) return
    evento.preventDefault()
    editor.aplicarClasseParagrafo(atalho.classe).catch(tratarErro('Falha ao aplicar atalho de formatação'))
  })
}

export async function iniciarFormatacaoBasica(
  editor: EditorSEI,
  config: FormatacaoBasicaConfig,
  intervaloMs = 200,
  tentativasMax = 30
): Promise<void> {
  const toolbox = await aguardarToolbox(editor.iframe, intervaloMs, tentativasMax)
  injetarEstiloSeAusente(document, 'seirmg-estilo-botoes-formatacao', ESTILO_BOTOES)

  const botoes = [
    ...montarBotoesAlinhamento(editor),
    ...montarBotoesFonte(editor),
    montarBotaoCopiarFormatacao(editor),
    montarBotaoMaiuscula(editor),
    montarBotaoTabelaRapida(editor),
    montarBotaoQuebraPagina(editor),
    montarBotaoSumario(editor),
    montarBotaoNotaRodape(editor),
    montarBotaoLatex(editor),
  ]
  botoes.forEach((botao) => toolbox.appendChild(botao))

  registrarAtalhos(editor, config.atalhos)
}
