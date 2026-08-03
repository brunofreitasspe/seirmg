import { describe, expect, it } from 'vitest'
import { ehLinkConcluirIndividual, ehLinkConcluirEmLote } from './concluirProcesso'

describe('ehLinkConcluirIndividual', () => {
  it('reconhece o onclick de "Concluir Processo" individual', () => {
    expect(ehLinkConcluirIndividual('concluirProcesso();')).toBe(true)
  })

  it('ignora onclick de outras ações', () => {
    expect(ehLinkConcluirIndividual("enviarProcesso();")).toBe(false)
  })

  it('trata null/undefined como não-match', () => {
    expect(ehLinkConcluirIndividual(null)).toBe(false)
  })
})

describe('ehLinkConcluirEmLote', () => {
  it('reconhece o onclick de "Concluir Processo nesta Unidade" em lote', () => {
    const onclick =
      "if (confirm('Deseja mesmo concluir os processos selecionados?')) { return acaoControleProcessos('controlador.php?acao=procedimento_concluir&acao_origem=procedimento_controlar&acao_retorno=procedimento_controlar&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abc', true, true); }"
    expect(ehLinkConcluirEmLote(onclick)).toBe(true)
  })

  it('ignora onclick de outras ações em lote', () => {
    expect(ehLinkConcluirEmLote("acaoControleProcessos('controlador.php?acao=procedimento_enviar', true, true)")).toBe(false)
  })

  it('trata null/undefined como não-match', () => {
    expect(ehLinkConcluirEmLote(undefined)).toBe(false)
  })
})
