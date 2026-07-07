import { describe, expect, it } from 'vitest'
import { calcularVisibilidade, registrarFiltro, removerFiltro } from './filtroTabela'

describe('registrarFiltro', () => {
  it('adiciona um filtro nomeado ao estado', () => {
    const estado = registrarFiltro({}, 'busca', { l1: true, l2: false })
    expect(estado).toEqual({ busca: { l1: true, l2: false } })
  })

  it('substitui o resultado de um filtro já registrado com o mesmo sufixo', () => {
    const estado = registrarFiltro({ busca: { l1: true } }, 'busca', { l1: false, l2: true })
    expect(estado).toEqual({ busca: { l1: false, l2: true } })
  })
})

describe('removerFiltro', () => {
  it('remove o filtro do estado', () => {
    const estado = removerFiltro({ busca: { l1: true }, atribuicao: { l1: false } }, 'busca')
    expect(estado).toEqual({ atribuicao: { l1: false } })
  })

  it('não faz nada quando o filtro não existe', () => {
    const estado = removerFiltro({ atribuicao: { l1: true } }, 'busca')
    expect(estado).toEqual({ atribuicao: { l1: true } })
  })
})

describe('calcularVisibilidade', () => {
  it('sem nenhum filtro ativo, todas as linhas ficam visíveis', () => {
    expect(calcularVisibilidade({}, ['l1', 'l2'])).toEqual({ l1: true, l2: true })
  })

  it('uma linha só fica visível se passar em todos os filtros ativos (AND)', () => {
    const estado = { busca: { l1: true, l2: true }, atribuicao: { l1: true, l2: false } }
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: false })
  })

  it('remover um filtro restaura a visibilidade das linhas que só falhavam nele', () => {
    let estado = registrarFiltro({}, 'busca', { l1: true, l2: false })
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: false })
    estado = removerFiltro(estado, 'busca')
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: true })
  })

  it('trata linha ausente no resultado de um filtro como reprovada', () => {
    const estado = { busca: { l1: true } }
    expect(calcularVisibilidade(estado, ['l1', 'l2'])).toEqual({ l1: true, l2: false })
  })
})
