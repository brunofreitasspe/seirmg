export function calcularIndicesParaClicar(indiceInicial: number, indiceFinal: number): number[] {
  const menor = Math.min(indiceInicial, indiceFinal)
  const maior = Math.max(indiceInicial, indiceFinal)
  const indices: number[] = []
  for (let i = menor + 1; i < maior; i++) indices.push(i)
  return indices
}
