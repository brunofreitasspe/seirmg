// Caixa de seleção no texto do documento. Um caractere (☐ U+2610 / ☑ U+2611) dentro de um span
// com classe própria: sobrevive ao salvar e à impressão do SEI. O &nbsp; depois deixa o cursor
// fora da caixa (o texto digitado não entra nela e o Enter não leva a caixa pro parágrafo seguinte).
export const CLASSE_CHECKLIST = 'seirmg-checklist'

export function montarChecklistHtml(): string {
  return `<span class="${CLASSE_CHECKLIST}" data-marcado="nao">&#9744;</span>&nbsp;`
}

export function alternarChecklist(marcado: boolean): { simbolo: string; marcado: boolean } {
  return marcado ? { simbolo: '☐', marcado: false } : { simbolo: '☑', marcado: true }
}
