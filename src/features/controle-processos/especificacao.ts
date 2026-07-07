export function extrairEspecificacaoParaExibicao(onmouseover: string): string {
  const inicio = onmouseover.indexOf("('") + 2
  const fim = onmouseover.indexOf(',') - 1
  return onmouseover.substring(inicio, fim)
}

export function extrairEspecificacaoParaLista(onmouseover: string): string {
  return onmouseover.split("'")[1] ?? ''
}
