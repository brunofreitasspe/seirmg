const MIN_DIGITOS = 6
const MAX_DIGITOS = 25

export function extrairDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

// Mesma estratégia do Sei Pro (onlyNumber() em sei-functions-pro.js): extrai só os dígitos antes
// de pesquisar, então a seleção pode manter pontuação (pontos, barra, hífen) sem afetar a busca.
// Limites escolhidos pra evitar falso positivo em números pequenos que aparecem naturalmente num
// texto (ano, item de lista) sem exigir seleção só de dígitos, e pra não disparar numa colagem
// grande de números (ex.: uma tabela) que não seria um número de processo/documento de verdade.
export function candidatoANumeroSei(textoSelecionado: string): boolean {
  const digitos = extrairDigitos(textoSelecionado)
  return digitos.length >= MIN_DIGITOS && digitos.length <= MAX_DIGITOS
}
