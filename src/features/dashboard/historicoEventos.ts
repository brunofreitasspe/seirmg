import type { EventoHistorico, TipoEventoHistorico } from '../../lib/storage'

export function registrarEvento(
  eventosAtuais: EventoHistorico[],
  novo: EventoHistorico,
  limite = 500
): EventoHistorico[] {
  const proxima = [...eventosAtuais, novo]
  return proxima.length > limite ? proxima.slice(proxima.length - limite) : proxima
}

export function filtrarPorPeriodo(eventos: EventoHistorico[], inicio: Date, fim: Date): EventoHistorico[] {
  return eventos.filter((evento) => {
    const ocorridoEm = new Date(evento.ocorridoEm).getTime()
    return ocorridoEm >= inicio.getTime() && ocorridoEm <= fim.getTime()
  })
}

const TIPOS: TipoEventoHistorico[] = ['acesso', 'enviado', 'documento', 'assinatura', 'concluido']

export function calcularMetricas(eventos: EventoHistorico[]): Record<TipoEventoHistorico, number> {
  const metricas = { acesso: 0, enviado: 0, documento: 0, assinatura: 0, concluido: 0 } as Record<
    TipoEventoHistorico,
    number
  >
  eventos.forEach((evento) => {
    metricas[evento.tipo] += 1
  })
  return metricas
}

export function agruparPorDia(eventos: EventoHistorico[]): Array<{ data: string; eventos: EventoHistorico[] }> {
  const grupos: Array<{ data: string; eventos: EventoHistorico[] }> = []
  const indicePorData = new Map<string, number>()

  eventos.forEach((evento) => {
    const data = evento.ocorridoEm.slice(0, 10)
    const indice = indicePorData.get(data)
    if (indice === undefined) {
      indicePorData.set(data, grupos.length)
      grupos.push({ data, eventos: [evento] })
    } else {
      grupos[indice].eventos.push(evento)
    }
  })

  return grupos
}
