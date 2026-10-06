// O contexto do processo (idProcedimento + urlIncluir assinada, quando a página de Ferramentas de
// PDF foi aberta a partir do atalho em procedimento_visualizar) precisa sobreviver à navegação do
// catálogo pra dentro de uma ferramenta específica -- um simples `?ferramenta=x` como href
// substituiria a query string inteira e perderia esses dados, quebrando o botão "Enviar ao
// processo aberto no SEI" (ver ferramentas-pdf/ui/botaoEnviarAoProcesso.ts) na página da ferramenta.
const PARAMETROS_CONTEXTO = ['idProcedimento', 'urlIncluir'] as const

export function montarUrlFerramenta(ferramentaId: string, buscaAtual: string): string {
  const atual = new URLSearchParams(buscaAtual)
  const params = new URLSearchParams()
  params.set('ferramenta', ferramentaId)
  for (const nome of PARAMETROS_CONTEXTO) {
    const valor = atual.get(nome)
    if (valor) params.set(nome, valor)
  }
  return `?${params.toString()}`
}
