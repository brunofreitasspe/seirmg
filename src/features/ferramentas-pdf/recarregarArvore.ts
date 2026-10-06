// Depois de enviar um PDF ao processo pela aba de Ferramentas de PDF, a árvore do processo (outra
// aba, do SEI) não sabe que ganhou um documento novo. A aba das ferramentas manda esta mensagem
// pras abas do SEI e o frame da árvore do mesmo processo se recarrega -- igual ao que o
// arrastar-e-soltar já faz com location.reload() depois de incluir um documento.
export const TIPO_RECARREGAR_ARVORE = 'seirmg:recarregar-arvore'

export interface MensagemRecarregarArvore {
  type: typeof TIPO_RECARREGAR_ARVORE
  idProcedimento: string
}

export function ehPedidoRecarregarArvore(mensagem: unknown, idProcedimentoAtual: string | null): boolean {
  if (!idProcedimentoAtual || typeof mensagem !== 'object' || mensagem === null) return false
  const { type, idProcedimento } = mensagem as Partial<MensagemRecarregarArvore>
  return type === TIPO_RECARREGAR_ARVORE && idProcedimento === idProcedimentoAtual
}
