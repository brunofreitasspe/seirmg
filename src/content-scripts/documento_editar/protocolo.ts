export const EVENTO_PRONTO = 'seirmg:editor-pronto'
export const EVENTO_COMANDO = 'seirmg:comando-editor'
export const EVENTO_RESPOSTA = 'seirmg:resposta-editor'

export type TipoComando = 'getSelectedText' | 'insertHtml' | 'insertText' | 'getTextoCompleto'

export interface DetalheComando {
  id: string
  tipo: TipoComando
  args: unknown[]
}

export interface DetalheResposta {
  id: string
  resultado: unknown
  erro: string | null
}

export interface DetalhePronto {
  nome: string
}
