export const EVENTO_PRONTO = 'seirmg:editor-pronto'
export const EVENTO_COMANDO = 'seirmg:comando-editor'
export const EVENTO_RESPOSTA = 'seirmg:resposta-editor'

// O título dos iframes de campo do SEI (Cabeçalho/Título/Data/Corpo do Texto/Rodapé)
// é um rótulo fixo da UI do SEI, não tem relação com o nome da instância CKEditor
// (confirmado ao vivo — ver memória do projeto). Por isso o main world, que tem a
// referência real da instância CKEditor, marca o iframe correspondente com este
// atributo, e o isolated world localiza o iframe por ele em vez de tentar adivinhar
// a partir de texto visível.
export const ATRIBUTO_EDITOR_ALVO = 'data-seirmg-editor-nome'

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
