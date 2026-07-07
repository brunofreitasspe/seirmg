import { describe, expect, it } from 'vitest'
import { escolherCorProcesso, extrairEspecificacaoParaCor } from './corProcesso'

describe('extrairEspecificacaoParaCor', () => {
  it("extrai a especificação entre ( ' e ) e normaliza para minúsculo", () => {
    expect(extrairEspecificacaoParaCor("mostrarDica('Recursos Humanos')")).toBe('recursos humanos')
  })
})

describe('escolherCorProcesso', () => {
  const configuracoes = [
    { valor: 'orçamento', cor: '#ff0000' },
    { valor: 'pessoal', cor: '#00ff00' },
  ]

  it('escolhe a cor da primeira regra cujo valor aparece na especificação', () => {
    expect(escolherCorProcesso('processo de pessoal ativo', configuracoes)).toBe('#00ff00')
  })

  it('retorna null quando nenhuma regra casa', () => {
    expect(escolherCorProcesso('processo de compras', configuracoes)).toBeNull()
  })

  it('retorna null quando a lista de configurações está vazia', () => {
    expect(escolherCorProcesso('qualquer coisa', [])).toBeNull()
  })

  it('ignora regras com valor vazio', () => {
    expect(escolherCorProcesso('texto qualquer', [{ valor: '', cor: '#000' }])).toBeNull()
  })
})
