import { describe, expect, it } from 'vitest'
import { montarReferenciaHtml, numerarParagrafos } from './referenciaInterna'

describe('numerarParagrafos', () => {
  it('numera de forma hierárquica e reinicia os níveis abaixo', () => {
    expect(numerarParagrafos([1, 2, 2, 3, 1, 2])).toEqual(['1', '1.1', '1.2', '1.2.1', '2', '2.1'])
  })
})

describe('montarReferenciaHtml', () => {
  const a = { id: 'seirmg-ref-a', numero: '3' }
  const b = { id: 'seirmg-ref-b', numero: '5' }
  const c = { id: 'seirmg-ref-c', numero: '7' }
  const link = (alvo: { id: string; numero: string }): string =>
    `<a href="#${alvo.id}" class="seirmg-ref-interna">${alvo.numero}</a>`

  it('uma referência com prefixo', () => {
    expect(montarReferenciaHtml([a], 'item')).toBe(`item ${link(a)}`)
  })
  it('duas e três referências, com prefixo no plural quando conhecido', () => {
    expect(montarReferenciaHtml([a, b], 'item')).toBe(`itens ${link(a)} e ${link(b)}`)
    expect(montarReferenciaHtml([a, b, c], 'art.')).toBe(`arts. ${link(a)}, ${link(b)} e ${link(c)}`)
  })
  it('prefixo desconhecido fica como digitado; sem prefixo, só os números', () => {
    expect(montarReferenciaHtml([a, b], 'cláusula')).toBe(`cláusula ${link(a)} e ${link(b)}`)
    expect(montarReferenciaHtml([a], '')).toBe(link(a))
  })
  it('escapa o prefixo', () => {
    expect(montarReferenciaHtml([a], '<b>')).toBe(`&lt;b&gt; ${link(a)}`)
  })
})
