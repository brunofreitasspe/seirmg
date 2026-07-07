export function detectarSeiVersionAtLeast4(doc: Document): boolean {
  const script = doc.querySelector('script[src*="sei.js?"]')
  const src = script?.getAttribute('src') ?? ''
  const match = src.match(/sei\.js\?(\d+)/)
  if (!match) return true
  const primeiroDigito = Number(match[1][0])
  return primeiroDigito >= 4
}

export function detectarSeiVersaoMajor(doc: Document): number | null {
  const script = doc.querySelector('script[src*="sei.js?"]')
  const src = script?.getAttribute('src') ?? ''
  const match = src.match(/sei\.js\?(\d+)/)
  if (!match) return null
  return Number(match[1][0])
}
