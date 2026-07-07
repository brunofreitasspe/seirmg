export type EstadoFiltros = Record<string, Record<string, boolean>>

export function registrarFiltro(
  estado: EstadoFiltros,
  sufixo: string,
  resultadoPorLinha: Record<string, boolean>
): EstadoFiltros {
  return { ...estado, [sufixo]: resultadoPorLinha }
}

export function removerFiltro(estado: EstadoFiltros, sufixo: string): EstadoFiltros {
  const resto = { ...estado }
  delete resto[sufixo]
  return resto
}

export function calcularVisibilidade(
  estado: EstadoFiltros,
  linhaIds: string[]
): Record<string, boolean> {
  const sufixosAtivos = Object.keys(estado)
  const resultado: Record<string, boolean> = {}
  linhaIds.forEach((id) => {
    resultado[id] = sufixosAtivos.every((sufixo) => estado[sufixo]?.[id] === true)
  })
  return resultado
}
