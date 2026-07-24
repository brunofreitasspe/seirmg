export function injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void {
  if (documentoAlvo.getElementById(id)) return
  const estilo = documentoAlvo.createElement('style')
  estilo.id = id
  estilo.textContent = css
  documentoAlvo.head.appendChild(estilo)
}

export function escaparHtml(texto: string): string {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}
