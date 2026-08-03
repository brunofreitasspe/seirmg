const REGEX_NUMERO_PROCESSO = /\d{4,}-\d{2}\.\d{4}|\d{4,}\/\d{5,}-\d{2}/

export function obterNumeroProcesso(doc: Document): string | null {
  const noSelecionado = doc.querySelector('.infraArvoreNoSelecionado')
  const numeroNoSelecionado = noSelecionado?.textContent?.trim()
  if (numeroNoSelecionado) return numeroNoSelecionado

  const link = doc.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
  if (!link) return null
  return link.textContent?.trim() || null
}

export function extrairNumeroProcessoDaBarra(doc: Document): string | null {
  const barra = doc.getElementById('divInfraBarraLocalizacao')
  const textoBarra = barra?.textContent?.match(REGEX_NUMERO_PROCESSO)?.[0]
  if (textoBarra) return textoBarra

  return doc.body?.textContent?.match(REGEX_NUMERO_PROCESSO)?.[0] ?? null
}
