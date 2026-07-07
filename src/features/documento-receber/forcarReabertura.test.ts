import { describe, expect, it } from 'vitest'
import { extrairUrlUnidadeSelecionarReabertura, processoFechadoEmTodasUnidades } from './forcarReabertura'

describe('extrairUrlUnidadeSelecionarReabertura', () => {
  const base = 'https://sei.exemplo.br/algum/caminho/'

  it('extrai e resolve a url quando presente no head', () => {
    const head =
      "<script>var x = 'controlador.php?acao=unidade_selecionar_reabertura_processo&id=1';</script>"
    expect(extrairUrlUnidadeSelecionarReabertura(head, base)).toBe(
      'https://sei.exemplo.br/algum/caminho/controlador.php?acao=unidade_selecionar_reabertura_processo&id=1'
    )
  })

  it('retorna null quando o marcador não está presente', () => {
    expect(extrairUrlUnidadeSelecionarReabertura('<script>nada aqui</script>', base)).toBeNull()
  })
})

describe('processoFechadoEmTodasUnidades', () => {
  it('true quando o total de fechadas é igual ao total de unidades', () => {
    expect(processoFechadoEmTodasUnidades(3, 3)).toBe(true)
  })

  it('false quando há unidades abertas', () => {
    expect(processoFechadoEmTodasUnidades(3, 2)).toBe(false)
  })
})
