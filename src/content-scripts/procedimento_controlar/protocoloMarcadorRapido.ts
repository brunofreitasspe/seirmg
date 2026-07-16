export const EVENTO_CLIQUE_MARCADOR_RAPIDO = 'seirmg:clique-marcador-rapido'

export type ChaveAcaoMarcadorRapido = 'adicionar' | 'remover'

export interface DetalheCliqueMarcadorRapido {
  chave: ChaveAcaoMarcadorRapido
}
