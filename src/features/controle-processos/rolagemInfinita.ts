export function extrairCamposOcultos(form: HTMLFormElement): Record<string, string> {
  const campos: Record<string, string> = {}
  Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).forEach((input) => {
    if (input.name && input.id.includes('hdn')) {
      campos[input.name] = input.value
    }
  })
  return campos
}

const CLASSES_LINHA_VALIDA = ['infraTrClara', 'infraTrEscura', 'trVermelha']

export function extrairLinhasValidas(doc: Document, idTabela: string): Element[] {
  const tabela = doc.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr')).filter((linha) =>
    CLASSES_LINHA_VALIDA.some((classe) => linha.classList.contains(classe))
  )
}

export function extrairNroItens(doc: Document, tipo: string): number | null {
  const input = doc.querySelector<HTMLInputElement>(`#hdn${tipo}NroItens`)
  if (!input) return null
  const valor = Number(input.value)
  return Number.isNaN(valor) ? null : valor
}
