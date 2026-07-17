import type { Tarefa } from '../../lib/storage'

export type GrupoUrgencia = 'atrasadas' | 'hoje' | 'proximas' | 'semPrazo'

export interface TarefasAgrupadas {
  atrasadas: Tarefa[]
  hoje: Tarefa[]
  proximas: Tarefa[]
  semPrazo: Tarefa[]
}

function normalizarData(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 0, 0, 0, 0))
}

export function classificarUrgencia(tarefa: Tarefa, hoje: Date): GrupoUrgencia {
  if (!tarefa.vencimento) return 'semPrazo'

  const vencimento = normalizarData(new Date(tarefa.vencimento + 'T00:00:00.000Z'))
  const hojeNormalizado = normalizarData(hoje)

  if (vencimento.getTime() < hojeNormalizado.getTime()) return 'atrasadas'
  if (vencimento.getTime() === hojeNormalizado.getTime()) return 'hoje'
  return 'proximas'
}

export function agruparPorUrgencia(tarefas: Tarefa[], hoje: Date): TarefasAgrupadas {
  const grupos: TarefasAgrupadas = { atrasadas: [], hoje: [], proximas: [], semPrazo: [] }

  tarefas
    .filter((tarefa) => !tarefa.concluido)
    .forEach((tarefa) => {
      grupos[classificarUrgencia(tarefa, hoje)].push(tarefa)
    })

  return grupos
}

export function contarAtrasadas(tarefas: Tarefa[], hoje: Date): number {
  return tarefas.filter((tarefa) => !tarefa.concluido && classificarUrgencia(tarefa, hoje) === 'atrasadas')
    .length
}

const PESO_PRIORIDADE: Record<Tarefa['prioridade'], number> = { alta: 0, media: 1, baixa: 2 }

export function ordenarDentroDoGrupo(tarefas: Tarefa[]): Tarefa[] {
  return [...tarefas].sort((a, b) => {
    const diffPrioridade = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
    if (diffPrioridade !== 0) return diffPrioridade
    if (!a.vencimento && !b.vencimento) return 0
    if (!a.vencimento) return 1
    if (!b.vencimento) return -1
    return a.vencimento.localeCompare(b.vencimento)
  })
}

export function concluidasRecentes(tarefas: Tarefa[], limite: number): Tarefa[] {
  return tarefas
    .filter((tarefa) => tarefa.concluido)
    .sort((a, b) => (b.concluidoEm ?? '').localeCompare(a.concluidoEm ?? ''))
    .slice(0, limite)
}
