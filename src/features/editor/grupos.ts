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

// Cor do traço de cada ícone, no estilo colorido dos ícones do SEI: cada um ligado ao que faz
// (verde = marcar/tabela, azul = links/importar, roxo = notas/equação...). O Record obriga todo
// botão novo a ganhar uma cor.
export const CORES_ICONES: Record<IdBotaoEditor, string> = {
  checklist: '#16a34a',
  qrcode: '#4f46e5',
  importar: '#2563eb',
  latex: '#c026d3',
  sumario: '#0d9488',
  'referencia-interna': '#ea580c',
  'link-curto': '#0284c7',
  'nota-rodape': '#7c3aed',
  'alinhar-esquerda': '#1d4ed8',
  'alinhar-centro': '#1d4ed8',
  'alinhar-direita': '#1d4ed8',
  'alinhar-justificado': '#1d4ed8',
  'fonte-aumentar': '#0891b2',
  'fonte-reduzir': '#0891b2',
  maiuscula: '#b45309',
  'copiar-formatacao': '#db2777',
  'quebra-pagina': '#dc2626',
  tabela: '#15803d',
}
