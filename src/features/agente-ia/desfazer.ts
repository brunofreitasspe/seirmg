// Toda escrita aprovada pelo usuário fica registrada (local, últimas 20) com o necessário pra
// revertê-la depois -- o botão "Desfazer" da página do agente.
import type { AcaoAgenteParaDesfazer } from '../../lib/storage'
import type { ContextoFerramenta } from './tools'

export function registrarAcaoParaDesfazer(
  historico: AcaoAgenteParaDesfazer[],
  acao: Omit<AcaoAgenteParaDesfazer, 'id' | 'criadoEm'>,
  criadoEm: string,
  limite = 20
): AcaoAgenteParaDesfazer[] {
  const completa: AcaoAgenteParaDesfazer = { ...acao, id: crypto.randomUUID(), criadoEm }
  return [completa, ...historico].slice(0, limite)
}

export function consumirAcaoParaDesfazer(
  historico: AcaoAgenteParaDesfazer[],
  id: string
): { acao: AcaoAgenteParaDesfazer | null; historico: AcaoAgenteParaDesfazer[] } {
  const acao = historico.find((item) => item.id === id) ?? null
  if (!acao) return { acao: null, historico }
  return { acao, historico: historico.filter((item) => item.id !== id) }
}

// Operação inversa de cada ferramenta de escrita. Reverte só o efeito da própria ação (não
// restaura uma lista inteira antiga, o que apagaria mudanças feitas pelo usuário depois).
export async function reverterAcao(acao: AcaoAgenteParaDesfazer, contexto: ContextoFerramenta): Promise<void> {
  if (acao.ferramenta === 'adicionar_favorito') {
    const { numero, jaExistia } = (acao.estadoAnterior ?? {}) as { numero?: string; jaExistia?: boolean }
    if (!numero || jaExistia) return
    const atual = await contexto.syncStore.get()
    const itens = atual.controleProcessos.favoritos.itens.filter((item) => item.numero !== numero)
    await contexto.syncStore.set({
      ...atual,
      controleProcessos: { ...atual.controleProcessos, favoritos: { ...atual.controleProcessos.favoritos, itens } },
    })
    return
  }
  throw new Error(`Não há como desfazer "${acao.ferramenta}".`)
}
