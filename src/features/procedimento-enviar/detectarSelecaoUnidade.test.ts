import { describe, expect, it } from 'vitest'
import { unidadeDestinoSelecionada } from './detectarSelecaoUnidade'

function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('unidadeDestinoSelecionada', () => {
  it('retorna false quando #selUnidades não existe', () => {
    expect(unidadeDestinoSelecionada(parseDoc('<div></div>'))).toBe(false)
  })

  it('retorna false quando #selUnidades existe mas está vazio', () => {
    const doc = parseDoc('<select id="selUnidades" multiple></select>')
    expect(unidadeDestinoSelecionada(doc)).toBe(false)
  })

  it('retorna true quando #selUnidades tem ao menos uma opção', () => {
    const doc = parseDoc(
      '<select id="selUnidades" multiple><option value="110002746">HMMG-CHPEO</option></select>'
    )
    expect(unidadeDestinoSelecionada(doc)).toBe(true)
  })

  it('retorna false quando o elemento #selUnidades não é um <select>', () => {
    const doc = parseDoc('<div id="selUnidades"></div>')
    expect(unidadeDestinoSelecionada(doc)).toBe(false)
  })
})
