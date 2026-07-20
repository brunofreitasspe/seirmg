import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DescritorEstiloTexto, DetalheComando, DetalheResposta, DetalhePronto, TipoComando } from './protocolo'

interface ElementoCKEditor {
  setAttribute: (nome: string, valor: string) => void
  getAscendant: (nomes: string[], incluirAtual: boolean) => ElementoCKEditor | null
}

interface SelecaoCKEditor {
  getSelectedText: () => string
  getStartElement: () => ElementoCKEditor | null
}

interface DefinicaoEstiloCKEditor {
  element: string
  styles: Record<string, string>
}

interface InstanciaCKEditor {
  name: string
  getSelection: () => SelecaoCKEditor | null
  insertHtml: (html: string) => void
  insertText: (texto: string) => void
  editable?: () => { getText: () => string } | undefined
  document: { getBody: () => { $: HTMLElement }; getWindow: () => { $: Window } }
  fire: (evento: string) => void
  applyStyle: (estilo: unknown) => void
  execCommand: (nome: string) => void
}

interface JanelaComCKEditor {
  CKEDITOR?: {
    instances: Record<string, InstanciaCKEditor>
    style: new (definicao: DefinicaoEstiloCKEditor) => unknown
  }
}

const NOMES_BLOCO = ['p', 'li', 'td', 'th', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']

// A tela de edição de documento do SEI tem várias instâncias de CKEditor na mesma
// página (cabeçalho/despacho/data/corpo/rodapé), e só uma é de fato editável
// (contentEditable) — pegar "a primeira" pegaria uma arbitrária.
function obterInstanciaEditavel(janelaGlobal: Window): InstanciaCKEditor | null {
  const instances = (janelaGlobal as unknown as JanelaComCKEditor).CKEDITOR?.instances
  if (!instances) return null
  const editores = Object.values(instances)
  const editavel = editores.find((editor) => {
    try {
      return editor.document.getBody().$.contentEditable === 'true'
    } catch {
      return false
    }
  })
  return editavel ?? editores[0] ?? null
}

// Isolated e main world enxergam o mesmo DOM (só a execução JS é isolada), então
// marcar aqui o iframe que o CKEditor realmente usa é confiável — ao contrário de
// tentar re-descobrir esse iframe no isolated world a partir de texto visível
// (title/label), que não tem nenhuma relação garantida com o nome da instância.
// Retorna false quando o iframe da instância ainda não está acessível (ex.: sendo reanexado ao DOM
// pelo próprio SEI nesse instante) ou quando a instância nunca vai ter um (editor inline, fora do
// escopo do Lote R) — tentarAnunciar usa o retorno pra decidir se continua tentando marcar antes de
// anunciar a instância pronta.
function marcarIframeDaInstancia(instancia: InstanciaCKEditor): boolean {
  try {
    const frame = instancia.document.getWindow().$.frameElement
    if (!(frame instanceof HTMLIFrameElement)) return false
    frame.setAttribute(ATRIBUTO_EDITOR_ALVO, instancia.name)
    return true
  } catch {
    return false
  }
}

function aplicarClasseParagrafo(instancia: InstanciaCKEditor, classe: string): void {
  const elemento = instancia.getSelection?.()?.getStartElement()
  const paragrafo = elemento?.getAscendant(NOMES_BLOCO, true)
  if (!paragrafo) throw new Error('Nenhum parágrafo encontrado na seleção atual')
  instancia.fire('saveSnapshot')
  paragrafo.setAttribute('class', classe)
  instancia.fire('saveSnapshot')
}

function montarDefinicaoEstilo(estilo: DescritorEstiloTexto): DefinicaoEstiloCKEditor {
  const styles: Record<string, string> = {}
  if (estilo.fontSizePx !== undefined) styles['font-size'] = `${estilo.fontSizePx}px`
  if (estilo.color !== undefined) styles.color = estilo.color
  return { element: 'span', styles }
}

function aplicarEstiloTexto(
  janelaGlobal: Window,
  instancia: InstanciaCKEditor,
  estilo: DescritorEstiloTexto
): void {
  const ClasseEstilo = (janelaGlobal as unknown as JanelaComCKEditor).CKEDITOR?.style
  instancia.fire('saveSnapshot')
  if (estilo.bold) instancia.execCommand('bold')
  if (estilo.italic) instancia.execCommand('italic')
  if (estilo.underline) instancia.execCommand('underline')
  if (ClasseEstilo && (estilo.fontSizePx !== undefined || estilo.color !== undefined)) {
    instancia.applyStyle(new ClasseEstilo(montarDefinicaoEstilo(estilo)))
  }
  instancia.fire('saveSnapshot')
}

function executarComando(
  janelaGlobal: Window,
  instancia: InstanciaCKEditor,
  tipo: TipoComando,
  args: unknown[]
): unknown {
  switch (tipo) {
    case 'getSelectedText':
      return instancia.getSelection?.()?.getSelectedText() ?? ''
    case 'insertHtml':
      instancia.insertHtml(String(args[0] ?? ''))
      return null
    case 'insertText':
      instancia.insertText(String(args[0] ?? ''))
      return null
    case 'getTextoCompleto':
      return instancia.editable?.()?.getText() ?? ''
    case 'aplicarClasseParagrafo':
      aplicarClasseParagrafo(instancia, String(args[0] ?? ''))
      return null
    case 'aplicarEstiloTexto':
      aplicarEstiloTexto(janelaGlobal, instancia, args[0] as DescritorEstiloTexto)
      return null
    default:
      return null
  }
}

export interface PonteMainWorld {
  destruir: () => void
}

export function criarPonteMainWorld(
  janelaGlobal: Window,
  intervaloMs = 200,
  tentativasMax = 50,
  intervaloReanuncioMs = 1000,
  reanunciosMax = 30
): PonteMainWorld {
  let instanciaAtual: InstanciaCKEditor | null = null
  let temporizador: ReturnType<typeof setTimeout> | undefined
  let temporizadorReanuncio: ReturnType<typeof setTimeout> | undefined

  function anunciar(): void {
    if (!instanciaAtual) return
    const detalhe: DetalhePronto = { nome: instanciaAtual.name }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: detalhe }))
  }

  // Confirmado ao vivo numa instância SEI real: um evento disparado repetidamente
  // (tipo "batimento cardíaco") sempre atravessa isolated↔main world, mas um disparo
  // único do EVENTO_PRONTO real às vezes se perde (o listener do isolated world já
  // está registrado antes, mas mesmo assim não recebe). Causa exata não confirmada —
  // pode ser um período de "aquecimento" da ponte de eventos cross-world do Chrome
  // logo após a injeção dos content scripts. Reanunciar por um tempo em vez de
  // disparar uma vez só é a mitigação robusta: ponteEditor.ts já trata receber o
  // mesmo EVENTO_PRONTO várias vezes como algo inofensivo (idempotente).
  function reanunciarPeriodicamente(reanunciosRestantes: number): void {
    anunciar()
    if (reanunciosRestantes <= 0) return
    temporizadorReanuncio = setTimeout(() => reanunciarPeriodicamente(reanunciosRestantes - 1), intervaloReanuncioMs)
  }

  function tentarAnunciar(tentativasRestantes: number): void {
    const instancia = obterInstanciaEditavel(janelaGlobal)
    if (instancia) {
      instanciaAtual = instancia
      if (marcarIframeDaInstancia(instancia)) {
        reanunciarPeriodicamente(reanunciosMax)
        return
      }
    }
    if (tentativasRestantes <= 0) {
      // Esgotou as tentativas de marcar o iframe (ou nunca achou a instância) -- anuncia mesmo assim
      // se já tiver alguma instância, pra não deixar o isolated world esperando pra sempre; o erro de
      // "iframe não encontrado" (ponteEditor.ts) ainda pode aparecer, mas só depois de tentar de verdade.
      if (instanciaAtual) reanunciarPeriodicamente(reanunciosMax)
      return
    }
    temporizador = setTimeout(() => tentarAnunciar(tentativasRestantes - 1), intervaloMs)
  }

  function tratarComando(evento: Event): void {
    const { id, tipo, args } = (evento as CustomEvent<DetalheComando>).detail
    let resultado: unknown = null
    let erro: string | null = null
    try {
      if (!instanciaAtual) throw new Error('Nenhuma instância de CKEditor disponível')
      resultado = executarComando(janelaGlobal, instanciaAtual, tipo, args)
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e)
    }
    const resposta: DetalheResposta = { id, resultado, erro }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_RESPOSTA, { detail: resposta }))
  }

  janelaGlobal.addEventListener(EVENTO_COMANDO, tratarComando)
  tentarAnunciar(tentativasMax)

  return {
    destruir(): void {
      janelaGlobal.removeEventListener(EVENTO_COMANDO, tratarComando)
      if (temporizador) clearTimeout(temporizador)
      if (temporizadorReanuncio) clearTimeout(temporizadorReanuncio)
    },
  }
}
