import { describe, expect, it } from 'vitest'
import { montarPromptComContexto, montarPromptPronto } from './prompts'

describe('montarPromptPronto', () => {
  it('monta o prompt de resumir com o texto selecionado', () => {
    const resultado = montarPromptPronto('resumir', 'Texto de exemplo do processo.')
    expect(resultado).toContain('Resuma')
    expect(resultado).toContain('Texto de exemplo do processo.')
  })

  it('monta o prompt de revisar com o texto selecionado', () => {
    const resultado = montarPromptPronto('revisar', 'Texto com erro de portugues.')
    expect(resultado).toContain('Revise')
    expect(resultado).toContain('Texto com erro de portugues.')
  })

  it('monta o prompt de formal com o texto selecionado', () => {
    const resultado = montarPromptPronto('formal', 'Oi, tudo bem?')
    expect(resultado).toContain('formal')
    expect(resultado).toContain('Oi, tudo bem?')
  })
})

describe('montarPromptComContexto', () => {
  it('inclui o texto selecionado como contexto quando presente', () => {
    const resultado = montarPromptComContexto('Isso está claro?', 'Cláusula terceira do contrato.')
    expect(resultado).toContain('Cláusula terceira do contrato.')
    expect(resultado).toContain('Isso está claro?')
  })

  it('usa só a instrução/pergunta quando não há texto selecionado', () => {
    const resultado = montarPromptComContexto('Redija um parágrafo sobre prazo recursal.', null)
    expect(resultado).toBe('Redija um parágrafo sobre prazo recursal.')
  })
})
