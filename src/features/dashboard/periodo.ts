export type Periodo = 'hoje' | '7dias' | '30dias' | '90dias' | 'ano'

export interface Intervalo {
  inicio: Date
  fim: Date
  rotulo: string
}

function inicioDoDia(data: Date): Date {
  const copia = new Date(data)
  copia.setUTCHours(0, 0, 0, 0)
  return copia
}

function fimDoDia(data: Date): Date {
  const copia = new Date(data)
  copia.setUTCHours(23, 59, 59, 999)
  return copia
}

function subtrairDias(data: Date, dias: number): Date {
  const copia = new Date(data)
  copia.setUTCDate(copia.getUTCDate() - dias)
  return copia
}

export function calcularIntervalo(periodo: Periodo, agora: Date): Intervalo {
  const fim = fimDoDia(agora)

  switch (periodo) {
    case 'hoje':
      return { inicio: inicioDoDia(agora), fim, rotulo: 'Hoje' }
    case '7dias':
      return { inicio: inicioDoDia(subtrairDias(agora, 6)), fim, rotulo: 'Últimos 7 dias' }
    case '30dias':
      return { inicio: inicioDoDia(subtrairDias(agora, 29)), fim, rotulo: 'Últimos 30 dias' }
    case '90dias':
      return { inicio: inicioDoDia(subtrairDias(agora, 89)), fim, rotulo: 'Últimos 90 dias' }
    case 'ano': {
      const ano = agora.getUTCFullYear()
      return {
        inicio: new Date(Date.UTC(ano, 0, 1, 0, 0, 0, 0)),
        fim: new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)),
        rotulo: `Ano ${ano}`,
      }
    }
  }
}
