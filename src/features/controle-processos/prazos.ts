export type TipoCalculoPrazo = 'prazo' | 'qtddias'

export function extrairTextoMarcador(onmouseover: string): string {
  const primeiraAspas = onmouseover.indexOf("'")
  const segundaAspas = onmouseover.indexOf("'", primeiraAspas + 1)
  return onmouseover.substring(primeiraAspas + 1, segundaAspas)
}

export function isValidDate(dataString: string): boolean {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/
  const match = dataString.match(regex)
  if (!match) return false

  const dia = parseInt(match[1], 10)
  const mes = parseInt(match[2], 10) - 1
  const ano = parseInt(match[3], 10)

  const data = new Date(ano, mes, dia)

  return data.getFullYear() === ano && data.getMonth() === mes && data.getDate() === dia
}

function parseDataBr(dataStr: string): Date {
  const [dia, mes, ano] = dataStr.split('/').map(Number)
  return new Date(ano, mes - 1, dia)
}

function calcularDiferencaDias(data: Date, tipo: TipoCalculoPrazo, agora: Date): number {
  const msPorDia = 1000 * 60 * 60 * 24

  if (tipo === 'qtddias') {
    return Math.floor((agora.getTime() - data.getTime()) / msPorDia)
  }
  return Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1
}

export function extrairDataDoMarcador(textosMarcadores: string[], tipo: TipoCalculoPrazo): Date | null {
  for (const textoOriginal of textosMarcadores) {
    const texto = textoOriginal.toLowerCase().replace('é', 'e')
    let dataStr: string

    if (tipo === 'prazo') {
      if (texto.indexOf('ate ') !== 0) continue
      dataStr = texto.substr(4, 10)
    } else {
      dataStr = texto.substr(0, 10)
    }

    if (isValidDate(dataStr)) {
      return parseDataBr(dataStr)
    }
  }
  return null
}

export function calcularDiasDoMarcador(
  textosMarcadores: string[],
  tipo: TipoCalculoPrazo,
  agora: Date
): number | null {
  const data = extrairDataDoMarcador(textosMarcadores, tipo)
  if (!data) return null
  return calcularDiferencaDias(data, tipo, agora)
}

export function formatarDataBr(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}

export interface ConfiguracaoLimites {
  alerta: number
  critico: number
}

export function classificarPrazo(
  valor: number,
  tipo: TipoCalculoPrazo,
  config: ConfiguracaoLimites
): 'alerta' | 'critico' | null {
  if (tipo === 'qtddias') {
    if (valor > config.alerta && valor <= config.critico) return 'alerta'
    if (valor > config.critico) return 'critico'
  } else {
    if (valor >= config.critico && valor < config.alerta) return 'alerta'
    if (valor < config.critico) return 'critico'
  }
  return null
}
