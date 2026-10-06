// pdf.js costuma entregar uma linha inteira como um único item de texto ("Interessado: Fulano,
// CPF 123.456.789-09"). Pra tarja cobrir só o CPF/CNPJ, e não a linha toda, estimamos onde o
// trecho começa e termina dentro do item: a largura real do item (que o pdf.js dá) repartida na
// proporção da largura medida de cada parte do texto. `medir` é injetado (canvas measureText na
// UI) pra função ficar pura e testável.
export function trechoHorizontal(
  texto: string,
  inicio: number,
  fim: number,
  larguraTotal: number,
  medir: (s: string) => number
): { inicio: number; fim: number } {
  const total = medir(texto)
  const proporcao = (indice: number): number =>
    total > 0 ? medir(texto.slice(0, indice)) / total : texto.length > 0 ? indice / texto.length : 0
  return { inicio: larguraTotal * proporcao(inicio), fim: larguraTotal * proporcao(fim) }
}
