export const EVENTO_PRONTO = 'seirmg:editor-pronto'
export const EVENTO_COMANDO = 'seirmg:comando-editor'
export const EVENTO_RESPOSTA = 'seirmg:resposta-editor'
export const ATRIBUTO_EDITOR_ALVO = 'data-seirmg-editor-alvo'

export type TipoComando =
  | 'getSelectedText'
  | 'insertHtml'
  | 'insertText'
  | 'getTextoCompleto'
  | 'aplicarClasseParagrafo'
  | 'aplicarEstiloTexto'

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

export interface DescritorEstiloTexto {
  fontSizePx?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
}
