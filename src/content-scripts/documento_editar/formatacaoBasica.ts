import alignLeftIconSvg from 'lucide-static/icons/align-left.svg?raw'
import alignCenterIconSvg from 'lucide-static/icons/align-center.svg?raw'
import alignRightIconSvg from 'lucide-static/icons/align-right.svg?raw'
import alignJustifyIconSvg from 'lucide-static/icons/align-justify.svg?raw'
import zoomInIconSvg from 'lucide-static/icons/zoom-in.svg?raw'
import zoomOutIconSvg from 'lucide-static/icons/zoom-out.svg?raw'
import paintbrushIconSvg from 'lucide-static/icons/paintbrush.svg?raw'
import caseSensitiveIconSvg from 'lucide-static/icons/case-sensitive.svg?raw'
import { injetarEstiloSeAusente } from './dom'
import { CLASSES_ALINHAMENTO, proximoTamanhoFontePx } from '../../features/formatacao-basica/paragrafoEstilos'
import type { AlinhamentoTexto } from '../../features/formatacao-basica/paragrafoEstilos'
import { lerEstiloElemento } from '../../features/formatacao-basica/estiloTexto'
import { primeiraLetraMaiuscula } from '../../features/formatacao-basica/maiuscula'
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
  ]
  botoes.forEach((botao) => toolbox.appendChild(botao))

  registrarAtalhos(editor, config.atalhos)
}
