export type ResultadoIntervalos = { ok: true; intervalos: Array<[number, number]> } | { ok: false; erro: string }

const REGEX_TRECHO = /^(\d+)(?:\s*-\s*(\d+))?$/

// "1-3, 4, 6-8" (como o usuário escreve, base 1) -> [[0,2],[3,3],[5,7]] (base 0, como dividirPdf
// espera), com mensagem legível pra cada jeito de errar -- a UI mostra o erro direto.
export function interpretarIntervalos(texto: string, totalPaginas: number): ResultadoIntervalos {
  const trechos = texto
    .split(',')
    .map((trecho) => trecho.trim())
    .filter(Boolean)
  if (trechos.length === 0) return { ok: false, erro: 'Informe pelo menos um intervalo, ex.: 1-3, 4-8.' }

  const intervalos: Array<[number, number]> = []
  for (const trecho of trechos) {
    const achado = REGEX_TRECHO.exec(trecho)
    const inicio = achado ? Number(achado[1]) : 0
    const fim = achado?.[2] !== undefined ? Number(achado[2]) : inicio
    if (!achado || inicio < 1) {
      return { ok: false, erro: `"${trecho}" não é um intervalo válido. Use o formato 1-3 ou 4.` }
    }
    if (inicio > fim) return { ok: false, erro: `Em "${trecho}" o início é maior que o fim.` }
    if (fim > totalPaginas) {
      const paginas = totalPaginas === 1 ? '1 página' : `${totalPaginas} páginas`
      return { ok: false, erro: `A página ${fim} não existe — o PDF tem ${paginas}.` }
    }
    intervalos.push([inicio - 1, fim - 1])
  }
  return { ok: true, intervalos }
}
