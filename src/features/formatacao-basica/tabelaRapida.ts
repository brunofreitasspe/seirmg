export interface CorTabela {
  id: string
  nome: string
  hex: string
}

export const CORES_TABELA: CorTabela[] = [
  { id: 'cinza', nome: 'Cinza', hex: '#94a3b8' },
  { id: 'azul', nome: 'Azul', hex: '#017fff' },
  { id: 'verde', nome: 'Verde', hex: '#17875a' },
  { id: 'laranja', nome: 'Laranja', hex: '#b5530a' },
  { id: 'vermelho', nome: 'Vermelho', hex: '#b3261e' },
  { id: 'roxo', nome: 'Roxo', hex: '#7c3aed' },
  { id: 'rosa', nome: 'Rosa', hex: '#c026a3' },
  { id: 'petroleo', nome: 'Petróleo', hex: '#0d9488' },
  { id: 'dourado', nome: 'Dourado', hex: '#ca8a04' },
]

export type PadraoTabelaId =
  | 'simples'
  | 'bordas'
  | 'bordas-grossas'
  | 'cabecalho-solido'
  | 'cabecalho-leve'
  | 'zebra'
  | 'cabecalho-zebra'

export interface PadraoTabela {
  id: PadraoTabelaId
  nome: string
  usaCor: boolean
}

export const PADROES_TABELA: PadraoTabela[] = [
  { id: 'simples', nome: 'Simples', usaCor: false },
  { id: 'bordas', nome: 'Com bordas', usaCor: false },
  { id: 'bordas-grossas', nome: 'Bordas grossas', usaCor: true },
  { id: 'cabecalho-solido', nome: 'Cabeçalho sólido', usaCor: true },
  { id: 'cabecalho-leve', nome: 'Cabeçalho leve', usaCor: true },
  { id: 'zebra', nome: 'Linhas alternadas', usaCor: true },
  { id: 'cabecalho-zebra', nome: 'Cabeçalho + zebra', usaCor: true },
]

export function clarearHex(hex: string, fator: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const misturar = (canal: number): number => Math.round(canal + (255 - canal) * fator)
  const paraHex = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${paraHex(misturar(r))}${paraHex(misturar(g))}${paraHex(misturar(b))}`
}

const ESTILO_BASE_CELULA = 'padding:4px 8px;'

export function calcularEstiloCelula(padraoId: PadraoTabelaId, corHex: string, indiceLinha: number): string {
  const corClara = clarearHex(corHex, 0.85)

  switch (padraoId) {
    case 'simples':
      return `${ESTILO_BASE_CELULA}border:1px solid #dbe1ea;`
    case 'bordas':
      return `${ESTILO_BASE_CELULA}border:1px solid #000;`
    case 'bordas-grossas':
      return `${ESTILO_BASE_CELULA}border:2px solid ${corHex};`
    case 'cabecalho-solido':
      return indiceLinha === 0
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corHex};color:#fff;font-weight:bold;`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
    case 'cabecalho-leve':
      return indiceLinha === 0
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corClara};font-weight:bold;`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
    case 'zebra':
      return indiceLinha % 2 === 1
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corClara};`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
    case 'cabecalho-zebra':
      if (indiceLinha === 0) {
        return `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corHex};color:#fff;font-weight:bold;`
      }
      return indiceLinha % 2 === 0
        ? `${ESTILO_BASE_CELULA}border:1px solid ${corHex};background:${corClara};`
        : `${ESTILO_BASE_CELULA}border:1px solid ${corHex};`
  }
}

export function montarTabelaHtml(
  linhas: number,
  colunas: number,
  padraoId: PadraoTabelaId = 'simples',
  corId = 'cinza'
): string {
  const cor = CORES_TABELA.find((item) => item.id === corId) ?? CORES_TABELA[0]
  const linhasHtml = Array.from({ length: linhas }, (_, indiceLinha) => {
    const estiloCelula = calcularEstiloCelula(padraoId, cor.hex, indiceLinha)
    const celulas = `<td style="${estiloCelula}">&nbsp;</td>`.repeat(colunas)
    return `<tr>${celulas}</tr>`
  }).join('')
  return `<table class="Tabela" style="border-collapse:collapse;width:100%;">${linhasHtml}</table>`
}
