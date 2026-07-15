import { describe, expect, it } from 'vitest'
import {
  contemTermoNasAssinaturas,
  deveSelecionar,
  encontrarCargoAssinante,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  marcarCheckboxComoJaAssinado,
  tituloCheckboxJaAssinadoPorCargo,
} from './selecaoDocumentos'

describe('extrairNomeUsuario', () => {
  it('extrai o nome no formato "NOME - usuário"', () => {
    expect(extrairNomeUsuario('João da Silva - joao.silva')).toBe('João da Silva')
  })

  it('extrai o nome no formato "NOME (usuário/órgão)"', () => {
    expect(extrairNomeUsuario('João da Silva (joao.silva/SEIRMG)')).toBe('João da Silva')
  })

  it('retorna null quando não casa nenhum formato', () => {
    expect(extrairNomeUsuario('joao.silva')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(extrairNomeUsuario('')).toBeNull()
  })
})

describe('encontrarIndiceColunaAssinaturas', () => {
  it('encontra o índice de "Assinaturas" em posição arbitrária', () => {
    expect(encontrarIndiceColunaAssinaturas(['Sequência', 'Protocolo', 'Assinaturas', 'Situação'])).toBe(2)
  })

  it('retorna o default 6 quando não há coluna "Assinaturas"', () => {
    expect(encontrarIndiceColunaAssinaturas(['Sequência', 'Protocolo'])).toBe(6)
  })

  it('retorna o default 6 para lista vazia', () => {
    expect(encontrarIndiceColunaAssinaturas([])).toBe(6)
  })
})

describe('deveSelecionar', () => {
  it('"todos" sempre seleciona', () => {
    expect(deveSelecionar('todos', '', 'joao')).toBe(true)
    expect(deveSelecionar('todos', 'Assinado por João', 'joao')).toBe(true)
  })

  it('"nenhum" nunca seleciona', () => {
    expect(deveSelecionar('nenhum', '', 'joao')).toBe(false)
    expect(deveSelecionar('nenhum', 'Assinado por João', 'joao')).toBe(false)
  })

  it('"sem-assinatura" seleciona só documentos sem nenhuma assinatura', () => {
    expect(deveSelecionar('sem-assinatura', '', 'João')).toBe(true)
    expect(deveSelecionar('sem-assinatura', 'Assinado por Maria', 'João')).toBe(false)
  })

  it('"sem-minha-assinatura" seleciona documentos sem assinatura ou só com a de outro usuário', () => {
    expect(deveSelecionar('sem-minha-assinatura', '', 'João')).toBe(true)
    expect(deveSelecionar('sem-minha-assinatura', 'Assinado por Maria', 'João')).toBe(true)
    expect(deveSelecionar('sem-minha-assinatura', 'Assinado por João', 'João')).toBe(false)
  })

  it('"com-minha-assinatura" seleciona só documentos que incluem a assinatura do usuário', () => {
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por João e Maria', 'João')).toBe(true)
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por Maria', 'João')).toBe(false)
    expect(deveSelecionar('com-minha-assinatura', '', 'João')).toBe(false)
  })

  it('correspondência é case-insensitive', () => {
    expect(deveSelecionar('com-minha-assinatura', 'ASSINADO POR JOÃO DA SILVA', 'joão da silva')).toBe(true)
  })

  it('correspondência tolera espaços extras/quebras de linha na célula', () => {
    expect(deveSelecionar('com-minha-assinatura', 'Assinado   por\nJoão    da Silva', 'João da Silva')).toBe(
      true
    )
  })

  it('ignora usuário vazio (não seleciona tudo por engano)', () => {
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por Maria', '')).toBe(false)
  })
})

describe('marcarCheckboxComoJaAssinado', () => {
  it('desabilita o checkbox e aplica título/classe nele', () => {
    document.body.innerHTML = '<input type="checkbox" id="chkInfraItem0">'
    const checkbox = document.getElementById('chkInfraItem0') as HTMLInputElement

    marcarCheckboxComoJaAssinado(checkbox)

    expect(checkbox.disabled).toBe(true)
    expect(checkbox.title).toBe('Documento já assinado por você')
    expect(checkbox.classList.contains('seirmg-checkbox-ja-assinado')).toBe(true)
  })

  it('aplica título/classe também no <label> associado via for (não aninhado)', () => {
    document.body.innerHTML =
      '<input type="checkbox" id="chkInfraItem0">' +
      '<label class="infraCheckboxLabel" for="chkInfraItem0" title="18099421"></label>'
    const checkbox = document.getElementById('chkInfraItem0') as HTMLInputElement
    const label = document.querySelector('label[for="chkInfraItem0"]') as HTMLLabelElement

    marcarCheckboxComoJaAssinado(checkbox)

    expect(label.title).toBe('Documento já assinado por você')
    expect(label.classList.contains('seirmg-checkbox-ja-assinado')).toBe(true)
  })

  it('não quebra quando o checkbox não tem nenhum label associado', () => {
    document.body.innerHTML = '<input type="checkbox" id="chkSemLabel">'
    const checkbox = document.getElementById('chkSemLabel') as HTMLInputElement

    expect(() => marcarCheckboxComoJaAssinado(checkbox)).not.toThrow()
    expect(checkbox.disabled).toBe(true)
  })

  it('aceita um título customizado (ex.: já assinado por um cargo, não pelo usuário)', () => {
    document.body.innerHTML = '<input type="checkbox" id="chkInfraItem0">'
    const checkbox = document.getElementById('chkInfraItem0') as HTMLInputElement

    marcarCheckboxComoJaAssinado(checkbox, tituloCheckboxJaAssinadoPorCargo('Diretor'))

    expect(checkbox.title).toBe('Documento já assinado por alguém do cargo "Diretor"')
  })
})

describe('contemTermoNasAssinaturas', () => {
  it('encontra o termo de forma case-insensitive e tolerante a espaços', () => {
    expect(contemTermoNasAssinaturas('Assinado por João (Diretor)', 'diretor')).toBe(true)
    expect(contemTermoNasAssinaturas('Assinado   por\nJoão  (Diretor)', 'Diretor')).toBe(true)
  })

  it('retorna false quando o termo não aparece', () => {
    expect(contemTermoNasAssinaturas('Assinado por Maria', 'Diretor')).toBe(false)
  })

  it('ignora termo vazio (não casa tudo por engano)', () => {
    expect(contemTermoNasAssinaturas('Assinado por Maria', '')).toBe(false)
    expect(contemTermoNasAssinaturas('Assinado por Maria', '   ')).toBe(false)
  })

  it('retorna false quando não há assinaturas', () => {
    expect(contemTermoNasAssinaturas('', 'Diretor')).toBe(false)
  })
})

describe('encontrarCargoAssinante', () => {
  it('retorna o primeiro cargo da lista cujo termo aparece nas assinaturas', () => {
    expect(
      encontrarCargoAssinante('Assinado por João (Diretor)', ['Vice-Diretor', 'Diretor'])
    ).toBe('Diretor')
  })

  it('retorna null quando nenhum cargo da lista aparece', () => {
    expect(encontrarCargoAssinante('Assinado por Maria', ['Diretor', 'Vice-Diretor'])).toBeNull()
  })

  it('retorna null para lista de cargos vazia', () => {
    expect(encontrarCargoAssinante('Assinado por Maria (Diretor)', [])).toBeNull()
  })

  it('retorna null quando não há assinaturas', () => {
    expect(encontrarCargoAssinante('', ['Diretor'])).toBeNull()
  })
})
