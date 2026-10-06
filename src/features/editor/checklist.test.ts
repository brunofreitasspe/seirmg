import { describe, expect, it } from 'vitest'
import { alternarChecklist, CLASSE_CHECKLIST, montarChecklistHtml } from './checklist'

describe('montarChecklistHtml', () => {
  it('caixa vazia seguida de espaço, pra o cursor ficar fora dela', () => {
    expect(montarChecklistHtml()).toBe(`<span class="${CLASSE_CHECKLIST}" data-marcado="nao">&#9744;</span>&nbsp;`)
  })
})

describe('alternarChecklist', () => {
  it('desmarcada vira marcada (☑) e marcada volta a desmarcada (☐)', () => {
    expect(alternarChecklist(false)).toEqual({ simbolo: '☑', marcado: true })
    expect(alternarChecklist(true)).toEqual({ simbolo: '☐', marcado: false })
  })
})
