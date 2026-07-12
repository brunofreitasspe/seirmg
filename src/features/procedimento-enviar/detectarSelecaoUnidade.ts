export function unidadeDestinoSelecionada(doc: Document): boolean {
  const select = doc.getElementById('selUnidades')
  if (!(select instanceof HTMLSelectElement)) return false
  return select.options.length > 0
}
