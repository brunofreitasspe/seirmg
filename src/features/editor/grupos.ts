// Ordem e agrupamento dos botões da extensão na barra do editor do SEI. Cada grupo vira um bloco
// próprio na barra (mesma estrutura dos grupos nativos do CKEditor 4). O id do botão é o sufixo
// do id DOM (`seirmg-cke-<id>`).
export type IdBotaoEditor =
  | 'checklist'
  | 'qrcode'
  | 'importar'
  | 'latex'
  | 'sumario'
  | 'referencia-interna'
  | 'link-curto'
  | 'nota-rodape'
  | 'alinhar-esquerda'
  | 'alinhar-centro'
  | 'alinhar-direita'
  | 'alinhar-justificado'
  | 'fonte-aumentar'
  | 'fonte-reduzir'
  | 'maiuscula'
  | 'copiar-formatacao'
  | 'quebra-pagina'
  | 'tabela'

export interface GrupoBarra {
  id: string
  titulo: string
  botoes: IdBotaoEditor[]
}

export const GRUPOS_BARRA: GrupoBarra[] = [
  { id: 'inserir', titulo: 'Inserir', botoes: ['checklist', 'qrcode', 'importar', 'latex', 'sumario'] },
  { id: 'referencias', titulo: 'Referências e links', botoes: ['referencia-interna', 'link-curto', 'nota-rodape'] },
  {
    id: 'formatacao',
    titulo: 'Formatação',
    botoes: [
      'alinhar-esquerda',
      'alinhar-centro',
      'alinhar-direita',
      'alinhar-justificado',
      'fonte-aumentar',
      'fonte-reduzir',
      'maiuscula',
      'copiar-formatacao',
      'quebra-pagina',
    ],
  },
  { id: 'tabelas', titulo: 'Tabelas', botoes: ['tabela'] },
]

export function organizarEmGrupos<T>(disponiveis: Map<IdBotaoEditor, T>): Array<{ grupo: GrupoBarra; itens: T[] }> {
  return GRUPOS_BARRA.map((grupo) => ({
    grupo,
    itens: grupo.botoes.flatMap((id) => {
      const item = disponiveis.get(id)
      return item === undefined ? [] : [item]
    }),
  })).filter((bloco) => bloco.itens.length > 0)
}
