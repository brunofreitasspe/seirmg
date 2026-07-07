import { describe, expect, it } from 'vitest'
import { classificarDivRelacionados, extrairTooltipRelacionado } from './ajustarElementosNativos'

describe('extrairTooltipRelacionado', () => {
  it('extrai o texto do tooltip', () => {
    expect(extrairTooltipRelacionado("return infraTooltipMostrar('Recursos Humanos')")).toBe(
      'Recursos Humanos'
    )
  })

  it('retorna null quando não casa com o padrão', () => {
    expect(extrairTooltipRelacionado('texto qualquer')).toBeNull()
  })
})

describe('classificarDivRelacionados', () => {
  it('classifica como vazio quando o texto completo está em branco', () => {
    expect(classificarDivRelacionados('   ', '')).toBe('vazio')
  })

  it('classifica como apenas-titulo quando os nós diretos são só o rótulo', () => {
    expect(classificarDivRelacionados('Processos Relacionados: 123', 'Processos Relacionados:')).toBe(
      'apenas-titulo'
    )
  })

  it('classifica como com-conteudo em qualquer outro caso', () => {
    expect(classificarDivRelacionados('Processos Relacionados: 123', 'algo diferente')).toBe(
      'com-conteudo'
    )
  })
})
