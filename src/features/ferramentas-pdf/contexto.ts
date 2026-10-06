// Contexto do processo de onde as Ferramentas de PDF foram abertas (atalho na árvore, ver
// content-scripts/procedimento_visualizar). Sem ele a página funciona em "modo avulso": só baixa.
export interface ContextoProcesso {
  idProcedimento: string
  // URL assinada de "Incluir Documento" -- sem ela não dá pra enviar (ver enviarAoProcesso.ts).
  urlIncluir: string | null
  // Só pra exibição ("Vinculado ao processo 1234...").
  numeroProcesso: string | null
}

export const PARAMETROS_CONTEXTO = ['idProcedimento', 'urlIncluir', 'numeroProcesso'] as const

export function lerContextoProcesso(busca: string): ContextoProcesso | null {
  const params = new URLSearchParams(busca)
  const idProcedimento = params.get('idProcedimento')
  if (!idProcedimento) return null
  return { idProcedimento, urlIncluir: params.get('urlIncluir'), numeroProcesso: params.get('numeroProcesso') }
}
