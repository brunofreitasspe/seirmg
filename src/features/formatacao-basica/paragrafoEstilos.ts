export const CLASSES_ALINHAMENTO = {
  esquerda: 'Texto_Alinhado_Esquerda',
  centro: 'Texto_Alinhado_Centro',
  direita: 'Texto_Alinhado_Direita',
  justificado: 'Texto_Justificado',
} as const

export type AlinhamentoTexto = keyof typeof CLASSES_ALINHAMENTO

const TAMANHO_FONTE_MIN_PX = 8
const TAMANHO_FONTE_MAX_PX = 72
const PASSO_TAMANHO_FONTE_PX = 2

export function proximoTamanhoFontePx(atualPx: number, direcao: 'up' | 'down'): number {
  const delta = direcao === 'up' ? PASSO_TAMANHO_FONTE_PX : -PASSO_TAMANHO_FONTE_PX
  const proximo = atualPx + delta
  return Math.min(TAMANHO_FONTE_MAX_PX, Math.max(TAMANHO_FONTE_MIN_PX, proximo))
}
