import { describe, expect, it } from 'vitest'
import {
  calcularEstiloCelula,
  clarearHex,
  montarTabelaHtml,
  CORES_TABELA,
  PADROES_TABELA,
} from './tabelaRapida'

describe('clarearHex', () => {
  it('não muda a cor com fator 0', () => {
    expect(clarearHex('#017fff', 0)).toBe('#017fff')
  })

  it('vira branco com fator 1', () => {
    expect(clarearHex('#017fff', 1)).toBe('#ffffff')
  })

  it('mistura parcialmente com um fator intermediário', () => {
    expect(clarearHex('#000000', 0.5)).toBe('#808080')
  })
})

describe('calcularEstiloCelula', () => {
  it('simples: borda fina cinza clara, sem cor de fundo', () => {
    const estilo = calcularEstiloCelula('simples', '#017fff', 0)
    expect(estilo).toContain('border:1px solid #dbe1ea')
    expect(estilo).not.toContain('background')
  })

  it('bordas: borda preta', () => {
    expect(calcularEstiloCelula('bordas', '#017fff', 0)).toContain('border:1px solid #000')
  })

  it('bordas-grossas: borda de 2px na cor escolhida', () => {
    expect(calcularEstiloCelula('bordas-grossas', '#b3261e', 3)).toContain('border:2px solid #b3261e')
  })

  it('cabecalho-solido: linha 0 tem fundo sólido e texto branco, outras linhas não', () => {
    const cabecalho = calcularEstiloCelula('cabecalho-solido', '#17875a', 0)
    expect(cabecalho).toContain('background:#17875a')
    expect(cabecalho).toContain('color:#fff')

    const corpo = calcularEstiloCelula('cabecalho-solido', '#17875a', 1)
    expect(corpo).not.toContain('background')
  })

  it('cabecalho-leve: linha 0 tem fundo claro (mistura com branco), sem texto branco', () => {
    const cabecalho = calcularEstiloCelula('cabecalho-leve', '#000000', 0)
    expect(cabecalho).toContain('background:#d9d9d9')
    expect(cabecalho).not.toContain('color:#fff')
  })

  it('zebra: linhas ímpares (índice 1, 3...) têm fundo claro, pares não', () => {
    expect(calcularEstiloCelula('zebra', '#000000', 0)).not.toContain('background')
    expect(calcularEstiloCelula('zebra', '#000000', 1)).toContain('background:#d9d9d9')
    expect(calcularEstiloCelula('zebra', '#000000', 2)).not.toContain('background')
  })

  it('cabecalho-zebra: linha 0 sólida, linhas pares (>0) claras, ímpares sem fundo', () => {
    expect(calcularEstiloCelula('cabecalho-zebra', '#000000', 0)).toContain('color:#fff')
    expect(calcularEstiloCelula('cabecalho-zebra', '#000000', 1)).not.toContain('background')
    expect(calcularEstiloCelula('cabecalho-zebra', '#000000', 2)).toContain('background:#d9d9d9')
  })
})

describe('montarTabelaHtml', () => {
  it('monta uma tabela com o número certo de linhas e células', () => {
    const html = montarTabelaHtml(2, 3)
    expect((html.match(/<tr>/g) ?? []).length).toBe(2)
    expect((html.match(/<td/g) ?? []).length).toBe(6)
  })

  it('usa simples/cinza como padrão quando não informado', () => {
    const html = montarTabelaHtml(1, 1)
    expect(html).toContain('border:1px solid #dbe1ea')
  })

  it('aplica o padrão e a cor escolhidos', () => {
    const html = montarTabelaHtml(2, 1, 'cabecalho-solido', 'vermelho')
    expect(html).toContain('background:#b3261e')
  })
})

describe('CORES_TABELA / PADROES_TABELA', () => {
  it('tem 9 cores e 7 padrões', () => {
    expect(CORES_TABELA).toHaveLength(9)
    expect(PADROES_TABELA).toHaveLength(7)
  })
})
