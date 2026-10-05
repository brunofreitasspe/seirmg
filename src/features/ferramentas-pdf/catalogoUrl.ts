// idProcedimento (quando a página de Ferramentas de PDF foi aberta a partir do atalho em
// procedimento_visualizar) precisa sobreviver à navegação do catálogo pra dentro de uma
// ferramenta específica -- um simples `?ferramenta=x` como href substituiria a query string
// inteira e perderia esse dado, quebrando o botão "Enviar ao processo aberto no SEI" (ver
// ferramentas-pdf/ui/botaoEnviarAoProcesso.ts) na página da ferramenta.
export function montarUrlFerramenta(ferramentaId: string, idProcedimento: string | null): string {
  const params = new URLSearchParams()
  params.set('ferramenta', ferramentaId)
  if (idProcedimento) params.set('idProcedimento', idProcedimento)
  return `?${params.toString()}`
}
