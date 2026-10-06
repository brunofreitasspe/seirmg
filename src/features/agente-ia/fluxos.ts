// Fluxo = lista ordenada de instruções enviadas ao agente uma de cada vez, com pausa pra revisão
// entre um passo e o próximo (página do agente).
import type { FluxoAgenteIA } from '../../lib/storage'

export interface PassoAExecutar {
  indice: number
  instrucao: string
  ultimo: boolean
}

// A partir de `indiceAtual`, o próximo passo com instrução preenchida (passo em branco no
// Estúdio é pulado, não enviado vazio ao agente).
export function proximoPasso(fluxo: FluxoAgenteIA, indiceAtual: number): PassoAExecutar | null {
  const preenchido = (i: number): boolean => !!fluxo.passos[i]?.instrucao.trim()
  for (let indice = indiceAtual; indice < fluxo.passos.length; indice++) {
    if (!preenchido(indice)) continue
    const restantes = fluxo.passos.slice(indice + 1).some((passo) => passo.instrucao.trim())
    return { indice, instrucao: fluxo.passos[indice].instrucao.trim(), ultimo: !restantes }
  }
  return null
}
