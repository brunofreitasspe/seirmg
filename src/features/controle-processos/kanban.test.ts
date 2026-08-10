import { describe, expect, it } from 'vitest'
import { calcularColuna, criarLista, montarPosicoesAtualizadas, ordenarListas, removerLista, renomearLista } from './kanban'

describe('calcularColuna', () => {
  it('cai na origem quando não é favorito e não tem posição manual', () => {
    expect(calcularColuna('recebidos', false, null)).toEqual({ tipo: 'automatica', chave: 'recebidos' })
    expect(calcularColuna('gerados', false, null)).toEqual({ tipo: 'automatica', chave: 'gerados' })
  })

  it('favoritado sobrepõe a origem', () => {
    expect(calcularColuna('recebidos', true, null)).toEqual({ tipo: 'automatica', chave: 'favoritos' })
    expect(calcularColuna('gerados', true, null)).toEqual({ tipo: 'automatica', chave: 'favoritos' })
  })

  it('posição manual sobrepõe favoritado e origem', () => {
    expect(calcularColuna('recebidos', true, 'lista-1')).toEqual({ tipo: 'lista', id: 'lista-1' })
    expect(calcularColuna('gerados', false, 'lista-2')).toEqual({ tipo: 'lista', id: 'lista-2' })
  })
})

describe('montarPosicoesAtualizadas', () => {
  it('adiciona uma posição nova', () => {
    const resultado = montarPosicoesAtualizadas([], 'HMMG.1', 'lista-1')
    expect(resultado).toEqual([{ numero: 'HMMG.1', listaId: 'lista-1' }])
  })

  it('atualiza a posição de um card que já tinha uma', () => {
    const posicoes = [{ numero: 'HMMG.1', listaId: 'lista-1' }]
    const resultado = montarPosicoesAtualizadas(posicoes, 'HMMG.1', 'lista-2')
    expect(resultado).toEqual([{ numero: 'HMMG.1', listaId: 'lista-2' }])
  })

  it('remove a posição quando listaId é null (volta ao automático)', () => {
    const posicoes = [{ numero: 'HMMG.1', listaId: 'lista-1' }, { numero: 'HMMG.2', listaId: 'lista-1' }]
    const resultado = montarPosicoesAtualizadas(posicoes, 'HMMG.1', null)
    expect(resultado).toEqual([{ numero: 'HMMG.2', listaId: 'lista-1' }])
  })

  it('não mexe nas posições de outros cards', () => {
    const posicoes = [{ numero: 'HMMG.1', listaId: 'lista-1' }, { numero: 'HMMG.2', listaId: 'lista-1' }]
    const resultado = montarPosicoesAtualizadas(posicoes, 'HMMG.3', 'lista-2')
    expect(resultado).toEqual([
      { numero: 'HMMG.1', listaId: 'lista-1' },
      { numero: 'HMMG.2', listaId: 'lista-1' },
      { numero: 'HMMG.3', listaId: 'lista-2' },
    ])
  })
})

describe('criarLista', () => {
  it('cria a primeira lista com ordem 0', () => {
    const { lista, listas } = criarLista([], 'Em análise')
    expect(lista.nome).toBe('Em análise')
    expect(lista.ordem).toBe(0)
    expect(lista.id).toBeTruthy()
    expect(listas).toEqual([lista])
  })

  it('a próxima lista nasce com ordem = maior ordem existente + 1', () => {
    const listasAtuais = [{ id: 'a', nome: 'Primeira', ordem: 0 }]
    const { lista } = criarLista(listasAtuais, 'Segunda')
    expect(lista.ordem).toBe(1)
  })

  it('cada lista nasce com um id diferente', () => {
    const { listas } = criarLista(criarLista([], 'A').listas, 'B')
    const ids = listas.map((lista) => lista.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('renomearLista', () => {
  it('renomeia só a lista com o id pedido', () => {
    const listas = [{ id: 'a', nome: 'Velho nome', ordem: 0 }, { id: 'b', nome: 'Outra', ordem: 1 }]
    const resultado = renomearLista(listas, 'a', 'Novo nome')
    expect(resultado).toEqual([{ id: 'a', nome: 'Novo nome', ordem: 0 }, { id: 'b', nome: 'Outra', ordem: 1 }])
  })
})

describe('removerLista', () => {
  it('remove a lista e limpa as posições que apontavam pra ela', () => {
    const listas = [{ id: 'a', nome: 'A', ordem: 0 }, { id: 'b', nome: 'B', ordem: 1 }]
    const posicoes = [{ numero: 'HMMG.1', listaId: 'a' }, { numero: 'HMMG.2', listaId: 'b' }]
    const resultado = removerLista(listas, posicoes, 'a')
    expect(resultado.listas).toEqual([{ id: 'b', nome: 'B', ordem: 1 }])
    expect(resultado.posicoes).toEqual([{ numero: 'HMMG.2', listaId: 'b' }])
  })
})

describe('ordenarListas', () => {
  it('ordena por ordem crescente', () => {
    const listas = [{ id: 'b', nome: 'B', ordem: 2 }, { id: 'a', nome: 'A', ordem: 0 }]
    expect(ordenarListas(listas).map((lista) => lista.id)).toEqual(['a', 'b'])
  })

  it('não modifica o array original', () => {
    const listas = [{ id: 'b', nome: 'B', ordem: 1 }, { id: 'a', nome: 'A', ordem: 0 }]
    const copia = [...listas]
    ordenarListas(listas)
    expect(listas).toEqual(copia)
  })
})
