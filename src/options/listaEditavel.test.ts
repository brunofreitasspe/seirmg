import { beforeEach, describe, expect, it } from 'vitest'
import { montarListaEditavel } from './listaEditavel'

const campos = [
  { chave: 'valor', rotulo: 'Especificação contém', tipo: 'text' as const },
  { chave: 'cor', rotulo: 'Cor', tipo: 'color' as const },
]

describe('montarListaEditavel', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>'
    container = document.getElementById('container') as HTMLElement
  })

  it('renderiza uma linha por item inicial, com os valores preenchidos', () => {
    montarListaEditavel(container, campos, [{ valor: 'orçamento', cor: '#ff0000' }])

    const inputs = container.querySelectorAll('input')
    expect(inputs).toHaveLength(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('orçamento')
    expect((inputs[1] as HTMLInputElement).value).toBe('#ff0000')
  })

  it('adiciona uma linha vazia ao clicar em Adicionar', () => {
    montarListaEditavel(container, campos, [])
    const botaoAdicionar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Adicionar'
    )
    botaoAdicionar?.click()

    expect(container.querySelectorAll('.seirmg-lista-editavel-linha')).toHaveLength(1)
  })

  it('remove a linha ao clicar em Remover', () => {
    montarListaEditavel(container, campos, [{ valor: 'orçamento', cor: '#ff0000' }])
    const botaoRemover = container.querySelector('button') as HTMLButtonElement
    botaoRemover.click()

    expect(container.querySelectorAll('.seirmg-lista-editavel-linha')).toHaveLength(0)
  })

  it('obterItens reflete o estado atual, ignorando linhas com o campo de texto vazio', () => {
    const controle = montarListaEditavel(container, campos, [{ valor: 'orçamento', cor: '#ff0000' }])
    const botaoAdicionar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Adicionar'
    )
    botaoAdicionar?.click()

    expect(controle.obterItens()).toEqual([{ valor: 'orçamento', cor: '#ff0000' }])
  })

  it('obterItens reflete edições feitas nos inputs', () => {
    const controle = montarListaEditavel(container, campos, [{ valor: 'x', cor: '#000000' }])
    const inputValor = container.querySelector('input[name="valor"]') as HTMLInputElement
    inputValor.value = 'pessoal'

    expect(controle.obterItens()).toEqual([{ valor: 'pessoal', cor: '#000000' }])
  })
})
