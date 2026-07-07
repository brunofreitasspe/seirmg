import { beforeEach, describe, expect, it } from 'vitest'
import { parseProcessosControlarTable } from './parser'

function montarLinha(id: string, numero: string, visualizado: boolean): string {
  const classe = visualizado ? 'class="processoVisualizado"' : ''
  return `<tr id="${id}"><td></td><td></td><td><a href="#" ${classe}>${numero}</a></td></tr>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseProcessosControlarTable', () => {
  it('extrai id, numero e visualizado de cada linha', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody>${montarLinha('P1', '00001', false)}</tbody></table>`
    const itens = parseProcessosControlarTable(document.body)
    expect(itens).toEqual([{ id: 'P1', numero: '00001', visualizado: false }])
  })

  it('marca visualizado true quando a linha tem a classe processoVisualizado', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody>${montarLinha('P2', '00002', true)}</tbody></table>`
    const [item] = parseProcessosControlarTable(document.body)
    expect(item.visualizado).toBe(true)
  })

  it('processa múltiplas linhas', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody>${montarLinha('P1', '1', false)}${montarLinha('P2', '2', true)}</tbody></table>`
    expect(parseProcessosControlarTable(document.body)).toHaveLength(2)
  })

  it('retorna lista vazia quando a tabela não existe', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseProcessosControlarTable(document.body)).toEqual([])
  })

  it('ignora linhas sem id', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody><tr><td>sem id</td></tr>${montarLinha('P1', '1', false)}</tbody></table>`
    expect(parseProcessosControlarTable(document.body)).toHaveLength(1)
  })
})
