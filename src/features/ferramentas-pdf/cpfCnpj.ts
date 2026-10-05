export interface AchadoDocumento {
  valor: string
  tipo: 'cpf' | 'cnpj'
  indice: number
}

const REGEX_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/g
const REGEX_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g

export function encontrarCpfCnpj(texto: string): AchadoDocumento[] {
  const achados: AchadoDocumento[] = []

  for (const casamento of texto.matchAll(REGEX_CNPJ)) {
    achados.push({ valor: casamento[0], tipo: 'cnpj', indice: casamento.index! })
  }
  // CNPJ contém o padrão de 3 grupos de dígitos que o regex de CPF também casaria como
  // substring -- mas REGEX_CPF exige terminar em "-\d{2}" logo após o 3º grupo, enquanto
  // CNPJ tem "/0001-95" no meio, então não há sobreposição real entre os dois padrões.
  for (const casamento of texto.matchAll(REGEX_CPF)) {
    achados.push({ valor: casamento[0], tipo: 'cpf', indice: casamento.index! })
  }

  return achados.sort((a, b) => a.indice - b.indice)
}
