import type { AgenteIAUsoAcumulado, UsoModeloAgenteIA } from '../../lib/storage'

// Tabela oficial da Anthropic (US$ por milhão de tokens), conferida em 2026-09. É a única fonte
// de verdade do cálculo -- revisar quando os preços mudarem ou um modelo novo entrar nas opções.
// Modelos anteriores ficam na tabela pra quem ainda tem um deles salvo na configuração.
export const PRECO_POR_MODELO: Record<string, { inputUsdPorMilhao: number; outputUsdPorMilhao: number }> = {
  'claude-opus-5-5': { inputUsdPorMilhao: 4, outputUsdPorMilhao: 20 },
  'claude-sonnet-5-5': { inputUsdPorMilhao: 2, outputUsdPorMilhao: 10 },
  'claude-haiku-4-5': { inputUsdPorMilhao: 1, outputUsdPorMilhao: 5 },
  'claude-opus-5': { inputUsdPorMilhao: 5, outputUsdPorMilhao: 25 },
  'claude-sonnet-5': { inputUsdPorMilhao: 2, outputUsdPorMilhao: 10 },
}

const MULTIPLICADOR_CACHE_CRIACAO = 1.25
const MULTIPLICADOR_CACHE_LEITURA = 0.1

export function calcularCustoUsd(modelo: string, uso: UsoModeloAgenteIA): number {
  const preco = PRECO_POR_MODELO[modelo]
  if (!preco) return 0
  const entrada =
    uso.inputTokens +
    (uso.cacheCriacaoTokens ?? 0) * MULTIPLICADOR_CACHE_CRIACAO +
    (uso.cacheLeituraTokens ?? 0) * MULTIPLICADOR_CACHE_LEITURA
  return (entrada * preco.inputUsdPorMilhao + uso.outputTokens * preco.outputUsdPorMilhao) / 1_000_000
}

export function acumularUso(atual: AgenteIAUsoAcumulado, modelo: string, uso: UsoModeloAgenteIA): AgenteIAUsoAcumulado {
  const anterior = atual.porModelo[modelo] ?? { inputTokens: 0, outputTokens: 0 }
  return {
    porModelo: {
      ...atual.porModelo,
      [modelo]: {
        inputTokens: anterior.inputTokens + uso.inputTokens,
        outputTokens: anterior.outputTokens + uso.outputTokens,
        cacheCriacaoTokens: (anterior.cacheCriacaoTokens ?? 0) + (uso.cacheCriacaoTokens ?? 0),
        cacheLeituraTokens: (anterior.cacheLeituraTokens ?? 0) + (uso.cacheLeituraTokens ?? 0),
      },
    },
  }
}

export function custoTotalUsd(acumulado: AgenteIAUsoAcumulado): number {
  return Object.entries(acumulado.porModelo).reduce((soma, [modelo, uso]) => soma + calcularCustoUsd(modelo, uso), 0)
}
