import { EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalheResposta, DetalhePronto, TipoComando } from './protocolo'

interface InstanciaCKEditor {
  name: string
  getSelection: () => { getSelectedText: () => string } | null
  insertHtml: (html: string) => void
  insertText: (texto: string) => void
  editable?: () => { getText: () => string } | undefined
  document: { getBody: () => { $: HTMLElement } }
}

interface JanelaComCKEditor {
  CKEDITOR?: { instances: Record<string, InstanciaCKEditor> }
}

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

function executarComando(instancia: InstanciaCKEditor, tipo: TipoComando, args: unknown[]): unknown {
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
      reanunciarPeriodicamente(reanunciosMax)
      return
    }
    if (tentativasRestantes <= 0) return
    temporizador = setTimeout(() => tentarAnunciar(tentativasRestantes - 1), intervaloMs)
  }

  function tratarComando(evento: Event): void {
    const { id, tipo, args } = (evento as CustomEvent<DetalheComando>).detail
    let resultado: unknown = null
    let erro: string | null = null
    try {
      if (!instanciaAtual) throw new Error('Nenhuma instância de CKEditor disponível')
      resultado = executarComando(instanciaAtual, tipo, args)
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
