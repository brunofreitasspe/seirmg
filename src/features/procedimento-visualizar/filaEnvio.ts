// Fila de envio do arrastar-e-soltar na árvore: com vários arquivos, o usuário revisa a ordem antes
// de enviar, e o envio é um por vez -- assim os documentos entram na árvore exatamente nessa ordem
// (em paralelo, a ordem dependia de qual upload terminava primeiro).

const COMPARADOR_NATURAL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

// Ordem inicial da fila: o navegador entrega os arquivos soltos em ordem arbitrária. Por nome, com
// números comparados como números ("Anexo 2" antes de "Anexo 10").
export function ordenarPorNomeNatural<T extends { name: string }>(arquivos: T[]): T[] {
  return [...arquivos].sort((a, b) => COMPARADOR_NATURAL.compare(a.name, b.name))
}

export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length) return lista
  const destino = Math.min(Math.max(para, 0), lista.length - 1)
  const nova = [...lista]
  const [item] = nova.splice(de, 1)
  nova.splice(destino, 0, item)
  return nova
}

export interface ResultadoEnvioSequencial<T> {
  enviados: number
  falha: { item: T; motivo: unknown } | null
  // O que falhou e tudo depois dele, na ordem original -- "Tentar novamente" retoma daqui.
  pendentes: T[]
}

export async function enviarEmSequencia<T>(
  itens: T[],
  enviar: (item: T, indice: number) => Promise<void>,
  aoIniciar?: (item: T, indice: number) => void
): Promise<ResultadoEnvioSequencial<T>> {
  for (let indice = 0; indice < itens.length; indice++) {
    aoIniciar?.(itens[indice], indice)
    try {
      await enviar(itens[indice], indice)
    } catch (motivo) {
      return { enviados: indice, falha: { item: itens[indice], motivo }, pendentes: itens.slice(indice) }
    }
  }
  return { enviados: itens.length, falha: null, pendentes: [] }
}

export function formatarMensagemProgresso(indice: number, total: number, nome: string): string {
  return `Enviando ${indice + 1} de ${total}: ${nome}`
}
