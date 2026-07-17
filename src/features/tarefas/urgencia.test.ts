import { describe, expect, it } from 'vitest'
import {
  agruparPorUrgencia,
  classificarUrgencia,
  concluidasRecentes,
  contarAtrasadas,
  ordenarDentroDoGrupo,
} from './urgencia'
import type { Tarefa } from '../../lib/storage'

function montarTarefa(sobrescreve: Partial<Tarefa>): Tarefa {
  return {
    id: '1',
    titulo: 'Tarefa',
    processo: '',
    vencimento: '',
    prioridade: 'media',
    concluido: false,
    ...sobrescreve,
  }
}

const hoje = new Date('2026-07-17T12:00:00.000Z')

describe('classificarUrgencia', () => {
  it('classifica sem vencimento como semPrazo', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '' }), hoje)).toBe('semPrazo')
  })

  it('classifica data anterior a hoje como atrasadas', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '2026-07-10' }), hoje)).toBe('atrasadas')
  })

  it('classifica a data de hoje como hoje', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '2026-07-17' }), hoje)).toBe('hoje')
  })

  it('classifica data futura como proximas', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '2026-08-01' }), hoje)).toBe('proximas')
  })
})

describe('agruparPorUrgencia', () => {
  it('agrupa tarefas pendentes nos 4 grupos', () => {
    const atrasada = montarTarefa({ id: 'a', vencimento: '2026-07-10' })
    const hojeT = montarTarefa({ id: 'b', vencimento: '2026-07-17' })
    const futura = montarTarefa({ id: 'c', vencimento: '2026-08-01' })
    const semPrazoT = montarTarefa({ id: 'd', vencimento: '' })

    const grupos = agruparPorUrgencia([atrasada, hojeT, futura, semPrazoT], hoje)

    expect(grupos.atrasadas).toEqual([atrasada])
    expect(grupos.hoje).toEqual([hojeT])
    expect(grupos.proximas).toEqual([futura])
    expect(grupos.semPrazo).toEqual([semPrazoT])
  })

  it('ignora tarefas concluídas', () => {
    const concluida = montarTarefa({ vencimento: '2026-07-10', concluido: true })
    const grupos = agruparPorUrgencia([concluida], hoje)
    expect(grupos.atrasadas).toEqual([])
  })
})

describe('contarAtrasadas', () => {
  it('conta só as pendentes com vencimento no passado', () => {
    const atrasada = montarTarefa({ id: 'a', vencimento: '2026-07-10' })
    const concluidaAtrasada = montarTarefa({ id: 'b', vencimento: '2026-07-10', concluido: true })
    const futura = montarTarefa({ id: 'c', vencimento: '2026-08-01' })
    expect(contarAtrasadas([atrasada, concluidaAtrasada, futura], hoje)).toBe(1)
  })
})

describe('ordenarDentroDoGrupo', () => {
  it('ordena por prioridade (alta > media > baixa)', () => {
    const baixa = montarTarefa({ id: 'a', prioridade: 'baixa' })
    const alta = montarTarefa({ id: 'b', prioridade: 'alta' })
    const media = montarTarefa({ id: 'c', prioridade: 'media' })
    expect(ordenarDentroDoGrupo([baixa, alta, media]).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('em caso de empate de prioridade, ordena por vencimento crescente', () => {
    const depois = montarTarefa({ id: 'a', prioridade: 'alta', vencimento: '2026-08-01' })
    const antes = montarTarefa({ id: 'b', prioridade: 'alta', vencimento: '2026-07-20' })
    expect(ordenarDentroDoGrupo([depois, antes]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('tarefas sem vencimento vão pro final do grupo', () => {
    const semData = montarTarefa({ id: 'a', prioridade: 'alta', vencimento: '' })
    const comData = montarTarefa({ id: 'b', prioridade: 'alta', vencimento: '2026-07-20' })
    expect(ordenarDentroDoGrupo([semData, comData]).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('concluidasRecentes', () => {
  it('retorna só as concluídas, mais recente primeiro, limitado', () => {
    const c1 = montarTarefa({ id: 'a', concluido: true, concluidoEm: '2026-07-15T10:00:00.000Z' })
    const c2 = montarTarefa({ id: 'b', concluido: true, concluidoEm: '2026-07-16T10:00:00.000Z' })
    const c3 = montarTarefa({ id: 'c', concluido: true, concluidoEm: '2026-07-14T10:00:00.000Z' })
    const pendente = montarTarefa({ id: 'd', concluido: false })

    expect(concluidasRecentes([c1, c2, c3, pendente], 2).map((t) => t.id)).toEqual(['b', 'a'])
  })
})
