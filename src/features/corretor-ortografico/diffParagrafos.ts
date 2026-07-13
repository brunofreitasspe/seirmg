export interface ParagrafoAtual {
  id: string
  texto: string
}

export interface ResultadoDiffParagrafos {
  novosOuAlterados: string[]
  removidos: string[]
}

export function diffarParagrafos(
  atuais: ParagrafoAtual[],
  snapshotAnterior: Map<string, string>
): ResultadoDiffParagrafos {
  const idsAtuais = new Set(atuais.map((paragrafo) => paragrafo.id))

  const novosOuAlterados = atuais
    .filter((paragrafo) => snapshotAnterior.get(paragrafo.id) !== paragrafo.texto)
    .map((paragrafo) => paragrafo.id)

  const removidos = Array.from(snapshotAnterior.keys()).filter((id) => !idsAtuais.has(id))

  return { novosOuAlterados, removidos }
}
