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

function calcularDiferencaDias(dataStr: string, tipo: TipoCalculoPrazo, agora: Date): number {
  const [dia, mes, ano] = dataStr.split('/').map(Number)
  const data = new Date(ano, mes - 1, dia)
  const msPorDia = 1000 * 60 * 60 * 24

  if (tipo === 'qtddias') {
    return Math.floor((agora.getTime() - data.getTime()) / msPorDia)
  }
  return Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1
}

export function calcularDiasDoMarcador(
  textosMarcadores: string[],
  tipo: TipoCalculoPrazo,
  agora: Date
): number | null {
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
      return calcularDiferencaDias(dataStr, tipo, agora)
    }
  }
  return null
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
