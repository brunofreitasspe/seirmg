import { describe, expect, it } from 'vitest'
import {
  calcularColuna,
  criarLista,
  montarPosicoesAtualizadas,
  ordenarListas,
  removerLista,
  renomearLista,
  extrairAnoProcesso,
  extrairDataHoraLinha,
  extrairNivelAcessoLinha,
  extrairUnidadeGeradoraLinha,
  linhaNaoRecebida,
  linhaTemDocumentoAlterado,
} from './kanban'

function criarLinha(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

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

describe('linhaNaoRecebida', () => {
  it('true quando a linha tem .processoNaoVisualizado', () => {
    expect(linhaNaoRecebida(criarLinha('<td><a class="processoNaoVisualizado">HMMG.1</a></td>'))).toBe(true)
  })

  it('false quando a linha tem .processoVisualizado', () => {
    expect(linhaNaoRecebida(criarLinha('<td><a class="processoVisualizado">HMMG.1</a></td>'))).toBe(false)
  })
})

describe('linhaTemDocumentoAlterado', () => {
  it('true quando há img de exclamação', () => {
    expect(linhaTemDocumentoAlterado(criarLinha('<td><img src="/img/exclamacao.svg"></td>'))).toBe(true)
  })

  it('false quando não há', () => {
    expect(linhaTemDocumentoAlterado(criarLinha('<td>sem imagem</td>'))).toBe(false)
  })
})

describe('extrairNivelAcessoLinha', () => {
  it('reconhece Restrito pelo título da imagem', () => {
    expect(extrairNivelAcessoLinha(criarLinha('<td><img title="Restrito"></td>'))).toBe('Restrito')
  })

  it('reconhece Sigiloso pelo alt da imagem', () => {
    expect(extrairNivelAcessoLinha(criarLinha('<td><img alt="Sigiloso"></td>'))).toBe('Sigiloso')
  })

  it('reconhece Público pelo src da imagem', () => {
    expect(extrairNivelAcessoLinha(criarLinha('<td><img src="/img/publico.svg"></td>'))).toBe('Público')
  })

  it('null quando nenhuma imagem bate', () => {
    expect(extrairNivelAcessoLinha(criarLinha('<td><img src="/img/outracoisa.svg"></td>'))).toBeNull()
  })
})

describe('extrairDataHoraLinha', () => {
  it('acha uma célula no formato dd/mm/yyyy', () => {
    expect(extrairDataHoraLinha(criarLinha('<td>texto</td><td>15/08/2026 14:30</td>'))).toBe('15/08/2026 14:30')
  })

  it('null quando nenhuma célula bate o padrão', () => {
    expect(extrairDataHoraLinha(criarLinha('<td>sem data aqui</td>'))).toBeNull()
  })
})

describe('extrairUnidadeGeradoraLinha', () => {
  it('pega uma célula do meio que não é número de processo nem URL', () => {
    expect(
      extrairUnidadeGeradoraLinha(criarLinha('<td>0021.048213/2025-07</td><td>SEPLAG/SUBSPP</td><td>final</td>'))
    ).toBe('SEPLAG/SUBSPP')
  })

  it('null quando só há a primeira e a última célula', () => {
    expect(extrairUnidadeGeradoraLinha(criarLinha('<td>0021.048213/2025-07</td><td>final</td>'))).toBeNull()
  })
})

describe('extrairAnoProcesso', () => {
  it('extrai o ano entre a barra e o hífen', () => {
    expect(extrairAnoProcesso('0021.042267/2024-10')).toBe('2024')
  })

  it('null quando o número não bate o padrão', () => {
    expect(extrairAnoProcesso('numero-invalido')).toBeNull()
  })
})
