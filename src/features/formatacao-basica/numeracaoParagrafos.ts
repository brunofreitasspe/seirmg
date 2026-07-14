export const CLASSES_PARAGRAFO_NUMERADO = [
  'Paragrafo_Numerado_Nivel1',
  'Paragrafo_Numerado_Nivel2',
  'Paragrafo_Numerado_Nivel3',
  'Paragrafo_Numerado_Nivel4',
] as const

export type ClasseParagrafoNumerado = (typeof CLASSES_PARAGRAFO_NUMERADO)[number]

export function nivelDaClasse(classe: string): number | null {
  const indice = CLASSES_PARAGRAFO_NUMERADO.indexOf(classe as ClasseParagrafoNumerado)
  return indice === -1 ? null : indice + 1
}
