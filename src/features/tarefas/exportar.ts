import type { Tarefa } from '../../lib/storage'

export type TarefaExportada = Pick<
  Tarefa,
  'titulo' | 'processo' | 'vencimento' | 'prioridade' | 'concluido'
>

export interface ExportacaoTarefas {
  versaoSeirmg: string
  exportadoEm: string
  tarefas: TarefaExportada[]
}

export function montarExportacao(tarefas: Tarefa[], versaoSeirmg: string, agora: Date): ExportacaoTarefas {
  return {
    versaoSeirmg,
    exportadoEm: agora.toISOString(),
    tarefas: tarefas.map(({ titulo, processo, vencimento, prioridade, concluido }) => ({
      titulo,
      processo,
      vencimento,
      prioridade,
      concluido,
    })),
  }
}

export function parseImportacao(json: string): ExportacaoTarefas | null {
  try {
    const dados: unknown = JSON.parse(json)
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !Array.isArray((dados as { tarefas?: unknown }).tarefas)
    ) {
      return null
    }
    return dados as ExportacaoTarefas
  } catch {
    return null
  }
}

export function tarefasImportadasParaAdicionar(
  exportacao: ExportacaoTarefas,
  gerarId: () => string
): Tarefa[] {
  return exportacao.tarefas.map((tarefaExportada) => ({
    ...tarefaExportada,
    id: gerarId(),
    bloqueada: true,
  }))
}
