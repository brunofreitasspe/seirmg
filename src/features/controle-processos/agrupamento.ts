export type CriterioAgrupamento = 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'

export interface LinhaParaAgrupar {
  id: string
  chaveGrupo: string | null
}

export interface GrupoOrdenado {
  chaveGrupo: string | null
  ids: string[]
}

function extrairSegundoArgumento(onmouseover: string): string {
  return onmouseover.split("'")[3] ?? ''
}

export function extrairNomeMarcador(onmouseover: string): string {
  return extrairSegundoArgumento(onmouseover)
}

export function extrairTipoProcesso(onmouseover: string): string {
  return extrairSegundoArgumento(onmouseover)
}

export function extrairTextoPontoControle(onmouseover: string): string {
  return extrairSegundoArgumento(onmouseover)
}

export function agruparLinhas(
  linhas: LinhaParaAgrupar[],
  ordemDentroDoGrupo?: Map<string, number>
): GrupoOrdenado[] {
  const gruposPorChave = new Map<string | null, string[]>()

  linhas.forEach(({ id, chaveGrupo }) => {
    const chave = chaveGrupo && chaveGrupo !== '' ? chaveGrupo : null
    const idsDoGrupo = gruposPorChave.get(chave) ?? []
    idsDoGrupo.push(id)
    gruposPorChave.set(chave, idsDoGrupo)
  })

  const chavesNomeadas = Array.from(gruposPorChave.keys())
    .filter((chave): chave is string => chave !== null)
    .sort((a, b) => a.localeCompare(b))

  const chavesOrdenadas: Array<string | null> = [...chavesNomeadas]
  if (gruposPorChave.has(null)) chavesOrdenadas.push(null)

  return chavesOrdenadas.map((chaveGrupo) => {
    const ids = gruposPorChave.get(chaveGrupo) ?? []
    const idsOrdenados = ordemDentroDoGrupo
      ? [...ids].sort((a, b) => (ordemDentroDoGrupo.get(a) ?? 0) - (ordemDentroDoGrupo.get(b) ?? 0))
      : ids
    return { chaveGrupo, ids: idsOrdenados }
  })
}
