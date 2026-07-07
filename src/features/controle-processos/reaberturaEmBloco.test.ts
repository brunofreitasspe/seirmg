import { describe, expect, it } from 'vitest'
import {
  detectarAcaoDisponivel,
  extrairHrefAcao,
  extrairHrefArvore,
  resolverUrl,
} from './reaberturaEmBloco'

describe('extrairHrefArvore', () => {
  it('extrai a url do nó 0 da árvore do texto do script', () => {
    const texto =
      'Nos[0] = new infraArvoreNo("tipo", "123", null, "controlador.php?acao=arvore_visualizar&id=1")'
    expect(extrairHrefArvore(texto)).toBe('controlador.php?acao=arvore_visualizar&id=1')
  })

  it('retorna null quando o texto não casa com o padrão', () => {
    expect(extrairHrefArvore('texto qualquer')).toBeNull()
  })
})

describe('detectarAcaoDisponivel', () => {
  it('detecta sobrestamento', () => {
    expect(detectarAcaoDisponivel('... Remover Sobrestamento do Processo ...')).toBe('sobrestamento')
  })

  it('detecta reabrir', () => {
    expect(detectarAcaoDisponivel('... Reabrir Processo ...')).toBe('reabrir')
  })

  it('retorna null quando nenhuma ação está disponível', () => {
    expect(detectarAcaoDisponivel('texto qualquer')).toBeNull()
  })
})

describe('extrairHrefAcao', () => {
  it('extrai o href de remover sobrestamento', () => {
    const texto = "location.href = 'controlador.php?acao=procedimento_remover_sobrestamento&id=1'"
    expect(extrairHrefAcao(texto, 'sobrestamento')).toBe(
      'controlador.php?acao=procedimento_remover_sobrestamento&id=1'
    )
  })

  it('extrai o href de reabrir', () => {
    const texto = "location.href = 'controlador.php?acao=procedimento_reabrir&id=1'"
    expect(extrairHrefAcao(texto, 'reabrir')).toBe('controlador.php?acao=procedimento_reabrir&id=1')
  })

  it('retorna null quando o texto não casa com o padrão', () => {
    expect(extrairHrefAcao('texto qualquer', 'reabrir')).toBeNull()
  })
})

describe('resolverUrl', () => {
  it('resolve uma url relativa contra a base', () => {
    expect(resolverUrl('controlador.php?acao=x', 'https://sei.exemplo.br/algum/caminho/')).toBe(
      'https://sei.exemplo.br/algum/caminho/controlador.php?acao=x'
    )
  })

  it('resolve corretamente independente do caminho base', () => {
    expect(
      resolverUrl('controlador.php?acao=x', 'https://outra-instancia.gov.br/outro/caminho/')
    ).toBe('https://outra-instancia.gov.br/outro/caminho/controlador.php?acao=x')
  })
})
