export function montarChamadaHtml(id: string, numero: number): string {
  return `<sup id="chamada-${id}"><a href="#nota-${id}">${numero}</a></sup>`
}

export function montarEntradaHtml(id: string, numero: number, texto: string): string {
  return `<p id="nota-${id}" class="Nota_Rodape">${numero}. ${texto} <a href="#chamada-${id}">&uarr;</a></p>`
}
