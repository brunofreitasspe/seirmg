export type TipoColuna = 'texto' | 'numero' | 'data'

const REGEX_NUMERO = /^-?\d+([.,]\d+)?$/
const REGEX_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/

export function detectarTipoColuna(valores: string[]): TipoColuna {
  const naoVazios = valores.map((valor) => valor.trim()).filter((valor) => valor !== '')
  if (naoVazios.length === 0) return 'texto'

  if (naoVazios.every((valor) => REGEX_NUMERO.test(valor))) return 'numero'
  if (naoVazios.every((valor) => REGEX_DATA.test(valor))) return 'data'
  return 'texto'
}

function normalizarNumero(valor: string): number {
  return Number(valor.replace(',', '.'))
}

function normalizarData(valor: string): string {
  const match = valor.match(REGEX_DATA)
  if (!match) return valor
  const [, dia, mes, ano] = match
  return `${ano}-${mes}-${dia}`
}

export function compararValores(a: string, b: string, tipo: TipoColuna): number {
  const aVazio = a.trim() === ''
  const bVazio = b.trim() === ''
  if (aVazio && bVazio) return 0
  if (aVazio) return 1
  if (bVazio) return -1

  switch (tipo) {
    case 'numero':
      return normalizarNumero(a) - normalizarNumero(b)
    case 'data':
      return normalizarData(a).localeCompare(normalizarData(b))
    case 'texto':
      return a.localeCompare(b, 'pt-BR')
  }
}

export function ordenarIds(
  linhas: Array<{ id: string; valor: string }>,
  tipo: TipoColuna,
  direcao: 'asc' | 'desc'
): string[] {
  const ordenadas = [...linhas].sort((x, y) => compararValores(x.valor, y.valor, tipo))

  if (direcao === 'desc') {
    const vazias = ordenadas.filter((linha) => linha.valor.trim() === '')
    const naoVazias = ordenadas.filter((linha) => linha.valor.trim() !== '').reverse()
    return [...naoVazias, ...vazias].map((linha) => linha.id)
  }

  return ordenadas.map((linha) => linha.id)
}
