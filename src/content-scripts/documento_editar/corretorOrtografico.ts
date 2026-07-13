import { criarCorretor, type Corretor, type ErroOrtografico } from '../../features/corretor-ortografico/corretor'
import { diffarParagrafos, type ParagrafoAtual } from '../../features/corretor-ortografico/diffParagrafos'
import { createSyncConfigStore, type CorretorOrtograficoConfig } from '../../lib/storage'
import type { EditorCKEditor } from './index'

const NOME_HIGHLIGHT = 'seirmg-erro-ortografico'
const ATRASO_DEBOUNCE_MS = 600

interface ErroComRange extends ErroOrtografico {
  range: Range
}

interface JanelaComHighlightApi {
  Highlight: new (...ranges: Range[]) => object
  CSS: { highlights: { set: (nome: string, destaque: object) => void } }
  getSelection: () => Selection | null
}

let corretor: Corretor | null = null
let proximoIdParagrafo = 0
let temporizadorDebounce: ReturnType<typeof setTimeout> | undefined
const textoAnteriorPorParagrafo = new Map<string, string>()
const errosPorParagrafo = new Map<string, ErroComRange[]>()
const idsPorElemento = new WeakMap<HTMLElement, string>()

function obterParagrafos(corpo: HTMLElement): HTMLElement[] {
  const elementos = Array.from(corpo.querySelectorAll<HTMLElement>('p, li, td, th'))
  return elementos.length > 0 ? elementos : [corpo]
}

function obterOuCriarIdParagrafo(elemento: HTMLElement): string {
  const existente = idsPorElemento.get(elemento)
  if (existente) return existente
  const novoId = `p${proximoIdParagrafo++}`
  idsPorElemento.set(elemento, novoId)
  return novoId
}

function localizarPosicao(elemento: HTMLElement, offsetAlvo: number): { node: Text; offset: number } | null {
  const documentoDoElemento = elemento.ownerDocument
  const walker = documentoDoElemento.createTreeWalker(elemento, NodeFilter.SHOW_TEXT)
  let acumulado = 0
  let atual = walker.nextNode() as Text | null
  while (atual) {
    const tamanho = atual.data.length
    if (offsetAlvo <= acumulado + tamanho) {
      return { node: atual, offset: offsetAlvo - acumulado }
    }
    acumulado += tamanho
    atual = walker.nextNode() as Text | null
  }
  return null
}

function criarRangeDaPalavra(elemento: HTMLElement, inicio: number, fim: number): Range | null {
  const posInicio = localizarPosicao(elemento, inicio)
  const posFim = localizarPosicao(elemento, fim)
  if (!posInicio || !posFim) return null
  const range = elemento.ownerDocument.createRange()
  range.setStart(posInicio.node, posInicio.offset)
  range.setEnd(posFim.node, posFim.offset)
  return range
}

function obterJanelaComHighlight(editor: EditorCKEditor): JanelaComHighlightApi {
  return editor.document.getWindow().$ as unknown as JanelaComHighlightApi
}

function atualizarDestaque(editor: EditorCKEditor): void {
  const janela = obterJanelaComHighlight(editor)
  const todosOsRanges = Array.from(errosPorParagrafo.values()).flatMap((erros) =>
    erros.map((erro) => erro.range)
  )
  const destaque = new janela.Highlight(...todosOsRanges)
  janela.CSS.highlights.set(NOME_HIGHLIGHT, destaque)
}

function atualizarIndicador(): void {
  const totalErros = Array.from(errosPorParagrafo.values()).reduce((soma, erros) => soma + erros.length, 0)
  let indicador = document.getElementById('seirmg-indicador-corretor')
  if (!indicador) {
    indicador = document.createElement('div')
    indicador.id = 'seirmg-indicador-corretor'
    document.body.appendChild(indicador)
  }
  indicador.textContent =
    totalErros > 0 ? `Corretor: ${totalErros} erro(s) encontrado(s)` : 'Corretor: nenhum erro encontrado'
}

function reescanearAlterados(editor: EditorCKEditor): void {
  try {
    if (!corretor) return
    const corpo = editor.document.getBody().$
    const elementosParagrafo = obterParagrafos(corpo)

    const atuais = elementosParagrafo.map((elemento) => ({
      elemento,
      id: obterOuCriarIdParagrafo(elemento),
      texto: elemento.textContent ?? '',
    }))

    const paragrafosParaDiff: ParagrafoAtual[] = atuais.map(({ id, texto }) => ({ id, texto }))
    const { novosOuAlterados, removidos } = diffarParagrafos(paragrafosParaDiff, textoAnteriorPorParagrafo)

    removidos.forEach((id) => {
      textoAnteriorPorParagrafo.delete(id)
      errosPorParagrafo.delete(id)
    })

    novosOuAlterados.forEach((id) => {
      const paragrafo = atuais.find((item) => item.id === id)
      if (!paragrafo || !corretor) return
      textoAnteriorPorParagrafo.set(id, paragrafo.texto)

      const erros = corretor.verificarTexto(paragrafo.texto)
      const errosComRange = erros.flatMap((erro) => {
        const range = criarRangeDaPalavra(paragrafo.elemento, erro.inicio, erro.fim)
        return range ? [{ ...erro, range }] : []
      })
      errosPorParagrafo.set(id, errosComRange)
    })

    atualizarDestaque(editor)
    atualizarIndicador()
  } catch (error) {
    console.error('[SEIRMG] Falha ao reescanear parágrafos do corretor ortográfico:', error)
  }
}

function agendarReescaneamento(editor: EditorCKEditor): void {
  if (temporizadorDebounce) clearTimeout(temporizadorDebounce)
  temporizadorDebounce = setTimeout(() => reescanearAlterados(editor), ATRASO_DEBOUNCE_MS)
}

function encontrarErroNoPonto(x: number, y: number): ErroComRange | null {
  for (const erros of errosPorParagrafo.values()) {
    for (const erro of erros) {
      const retangulos = Array.from(erro.range.getClientRects())
      const dentro = retangulos.some(
        (retangulo) => x >= retangulo.left && x <= retangulo.right && y >= retangulo.top && y <= retangulo.bottom
      )
      if (dentro) return erro
    }
  }
  return null
}

function fecharMenuSugestoes(documentoEditor: Document): void {
  documentoEditor.getElementById('seirmg-menu-corretor')?.remove()
}

function removerErroDoMapa(erro: ErroComRange): void {
  errosPorParagrafo.forEach((erros, id) => {
    const filtrados = erros.filter((item) => item !== erro)
    if (filtrados.length !== erros.length) errosPorParagrafo.set(id, filtrados)
  })
}

function aplicarSugestao(erro: ErroComRange, sugestao: string, editor: EditorCKEditor): void {
  const janela = obterJanelaComHighlight(editor)
  const selecao = janela.getSelection()
  if (!selecao) return
  selecao.removeAllRanges()
  selecao.addRange(erro.range.cloneRange())
  editor.insertText(sugestao)
  removerErroDoMapa(erro)
  atualizarDestaque(editor)
  atualizarIndicador()
}

function ignorarOcorrencia(erro: ErroComRange, editor: EditorCKEditor): void {
  removerErroDoMapa(erro)
  atualizarDestaque(editor)
  atualizarIndicador()
}

async function adicionarAoDicionario(palavra: string, editor: EditorCKEditor): Promise<void> {
  if (!corretor) return
  corretor.adicionarPalavra(palavra)

  const store = createSyncConfigStore()
  const config = await store.get()
  if (!config.corretorOrtografico.palavrasIgnoradas.includes(palavra)) {
    await store.set({
      ...config,
      corretorOrtografico: {
        ...config.corretorOrtografico,
        palavrasIgnoradas: [...config.corretorOrtografico.palavrasIgnoradas, palavra],
      },
    })
  }

  errosPorParagrafo.forEach((erros, id) => {
    errosPorParagrafo.set(
      id,
      erros.filter((erro) => erro.palavra !== palavra)
    )
  })
  atualizarDestaque(editor)
  atualizarIndicador()
}

function abrirMenuSugestoes(
  erro: ErroComRange,
  x: number,
  y: number,
  editor: EditorCKEditor,
  documentoEditor: Document
): void {
  fecharMenuSugestoes(documentoEditor)

  const menu = documentoEditor.createElement('div')
  menu.id = 'seirmg-menu-corretor'
  menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px;`

  const tag = documentoEditor.createElement('div')
  tag.className = 'seirmg-menu-corretor-tag'
  tag.textContent = 'SEIRMG · corretor'
  menu.appendChild(tag)

  erro.sugestoes.forEach((sugestao) => {
    const item = documentoEditor.createElement('div')
    item.className = 'seirmg-menu-corretor-item'
    item.textContent = sugestao
    item.addEventListener('click', () => {
      aplicarSugestao(erro, sugestao, editor)
      fecharMenuSugestoes(documentoEditor)
    })
    menu.appendChild(item)
  })

  menu.appendChild(documentoEditor.createElement('hr'))

  const itemIgnorar = documentoEditor.createElement('div')
  itemIgnorar.className = 'seirmg-menu-corretor-item'
  itemIgnorar.textContent = 'Ignorar'
  itemIgnorar.addEventListener('click', () => {
    ignorarOcorrencia(erro, editor)
    fecharMenuSugestoes(documentoEditor)
  })
  menu.appendChild(itemIgnorar)

  const itemAdicionar = documentoEditor.createElement('div')
  itemAdicionar.className = 'seirmg-menu-corretor-item'
  itemAdicionar.textContent = 'Adicionar ao dicionário'
  itemAdicionar.addEventListener('click', () => {
    adicionarAoDicionario(erro.palavra, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao adicionar palavra ao dicionário:', error)
    })
    fecharMenuSugestoes(documentoEditor)
  })
  menu.appendChild(itemAdicionar)

  documentoEditor.body.appendChild(menu)
  documentoEditor.addEventListener('click', () => fecharMenuSugestoes(documentoEditor), { once: true })
}

let ultimoMousedownInterceptado = false

function tentarInterceptarCliqueDireito(
  evento: MouseEvent,
  editor: EditorCKEditor,
  documentoEditor: Document
): boolean {
  const erro = encontrarErroNoPonto(evento.clientX, evento.clientY)
  if (!erro) return false
  evento.preventDefault()
  evento.stopPropagation()
  abrirMenuSugestoes(erro, evento.clientX, evento.clientY, editor, documentoEditor)
  return true
}

// O CKEditor pode suprimir o menu nativo já no mousedown do botão direito (impedindo o
// 'contextmenu' de sequer disparar), então tratamos os dois eventos: o mousedown intercepta
// primeiro na maioria dos casos; o contextmenu fica como reforço para quando o mousedown não
// for suficiente.
function tratarMousedown(evento: MouseEvent, editor: EditorCKEditor, documentoEditor: Document): void {
  try {
    if (evento.button !== 2) return
    ultimoMousedownInterceptado = tentarInterceptarCliqueDireito(evento, editor, documentoEditor)
  } catch (error) {
    console.error('[SEIRMG] Falha ao tratar mousedown do corretor ortográfico:', error)
  }
}

function tratarContextMenu(evento: MouseEvent, editor: EditorCKEditor, documentoEditor: Document): void {
  try {
    if (ultimoMousedownInterceptado) {
      ultimoMousedownInterceptado = false
      evento.preventDefault()
      evento.stopPropagation()
      return
    }
    tentarInterceptarCliqueDireito(evento, editor, documentoEditor)
  } catch (error) {
    console.error('[SEIRMG] Falha ao tratar clique direito do corretor ortográfico:', error)
  }
}

const ESTILO_MENU = `
  #seirmg-menu-corretor {
    min-width: 200px;
    background: #fff;
    border: 1px solid #0f8a6b;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,.2);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    padding: 6px 0;
    z-index: 999999;
  }
  .seirmg-menu-corretor-tag {
    padding: 2px 12px 6px;
    margin-bottom: 4px;
    border-bottom: 1px solid #eee;
    font-size: 10px;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: #0f8a6b;
    font-weight: bold;
  }
  .seirmg-menu-corretor-item {
    padding: 6px 12px;
    cursor: pointer;
  }
  .seirmg-menu-corretor-item:hover {
    background: #e5f6f1;
  }
  #seirmg-menu-corretor hr {
    border: none;
    border-top: 1px solid #eee;
    margin: 4px 0;
  }
`

const ESTILO_DESTAQUE = `::highlight(${NOME_HIGHLIGHT}) { text-decoration: red wavy underline; text-underline-offset: 2px; }`

const ESTILO_INDICADOR = `
  #seirmg-indicador-corretor {
    position: fixed;
    top: 58px;
    right: 20px;
    z-index: 10000;
    font-size: 11px;
    color: #666;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 2px 10px;
  }
`

function injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void {
  if (documentoAlvo.getElementById(id)) return
  const estilo = documentoAlvo.createElement('style')
  estilo.id = id
  estilo.textContent = css
  documentoAlvo.head.appendChild(estilo)
}

export async function iniciarCorretorOrtografico(
  editor: EditorCKEditor,
  config: CorretorOrtograficoConfig
): Promise<void> {
  corretor = await criarCorretor(config.palavrasIgnoradas)

  const documentoEditor = editor.document.$
  const corpo = editor.document.getBody().$
  const janelaEditor = editor.document.getWindow().$

  injetarEstiloSeAusente(documentoEditor, 'seirmg-estilo-destaque-corretor', ESTILO_DESTAQUE)
  injetarEstiloSeAusente(documentoEditor, 'seirmg-estilo-menu-corretor', ESTILO_MENU)
  injetarEstiloSeAusente(document, 'seirmg-estilo-indicador-corretor', ESTILO_INDICADOR)

  corpo.addEventListener('input', () => agendarReescaneamento(editor))
  // Testado em uma instância real do SEI: nem escutar 'contextmenu' no document nem na window
  // (fase de captura) chegou a disparar — sinal de que o CKEditor bloqueia o menu nativo já no
  // 'mousedown' do botão direito, antes do 'contextmenu' sequer existir. Por isso escutamos os
  // dois: 'mousedown' intercepta primeiro (cobre esse caso); 'contextmenu' fica como reforço,
  // e evita abrir os dois menus quando o mousedown já resolveu.
  janelaEditor.addEventListener('mousedown', (evento) => tratarMousedown(evento, editor, documentoEditor), true)
  janelaEditor.addEventListener('contextmenu', (evento) => tratarContextMenu(evento, editor, documentoEditor), true)

  reescanearAlterados(editor)
}
