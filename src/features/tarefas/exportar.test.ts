import { describe, expect, it } from 'vitest'
import { montarExportacao, parseImportacao, tarefasImportadasParaAdicionar } from './exportar'
import type { Tarefa } from '../../lib/storage'

const tarefa: Tarefa = {
  id: '1',
  titulo: 'Analisar parecer',
  processo: '0021.334',
  vencimento: '2026-07-20',
  prioridade: 'alta',
  concluido: false,
}

describe('montarExportacao', () => {
  it('monta o objeto de exportação com só os campos relevantes', () => {
    const agora = new Date('2026-07-17T10:00:00.000Z')
    const exportacao = montarExportacao([tarefa], '5.0', agora)

    expect(exportacao).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [
        {
          titulo: 'Analisar parecer',
          processo: '0021.334',
          vencimento: '2026-07-20',
          prioridade: 'alta',
          concluido: false,
        },
      ],
    })
  })
})

describe('parseImportacao', () => {
  it('faz parse de um JSON válido', () => {
    const json = JSON.stringify({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [tarefa],
    })
    expect(parseImportacao(json)).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [tarefa],
    })
  })

  it('retorna null pra JSON inválido (sintaxe)', () => {
    expect(parseImportacao('{ isso não é json')).toBeNull()
  })

  it('retorna null quando falta o campo tarefas', () => {
    expect(parseImportacao(JSON.stringify({ versaoSeirmg: '5.0' }))).toBeNull()
  })

  it('retorna null quando tarefas não é um array', () => {
    expect(parseImportacao(JSON.stringify({ tarefas: 'não é array' }))).toBeNull()
  })
})

describe('tarefasImportadasParaAdicionar', () => {
  it('gera um novo id e marca como bloqueada', () => {
    const exportacao = {
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [
        {
          titulo: 'Analisar parecer',
          processo: '0021.334',
          vencimento: '2026-07-20',
          prioridade: 'alta' as const,
          concluido: false,
        },
      ],
    }

    const resultado = tarefasImportadasParaAdicionar(exportacao, () => 'novo-id')

    expect(resultado).toEqual([
      {
        id: 'novo-id',
        titulo: 'Analisar parecer',
        processo: '0021.334',
        vencimento: '2026-07-20',
        prioridade: 'alta',
        concluido: false,
        bloqueada: true,
      },
    ])
  })
})
