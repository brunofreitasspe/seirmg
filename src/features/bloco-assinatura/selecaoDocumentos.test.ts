import { describe, expect, it } from 'vitest'
import {
  deveSelecionar,
  documentoJaAssinadoPorMim,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  marcarCheckboxComoJaAssinado,
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

describe('documentoJaAssinadoPorMim', () => {
  it('corresponde pelo usuário', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado por João e Maria', { usuario: 'João', unidade: '' })
    ).toBe(true)
  })

  it('corresponde pela unidade', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado por Maria (HMMG-DIR ADM)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
  })

  it('corresponde por usuário OU unidade (não precisa dos dois)', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado por Maria (HMMG-DJUR)', {
        usuario: 'João',
        unidade: 'HMMG-DJUR',
      })
    ).toBe(true)
    expect(
      documentoJaAssinadoPorMim('Assinado por João (HMMG-DJUR)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
  })

  it('não corresponde quando nem usuário nem unidade aparecem', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado por Maria (HMMG-DJUR)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(false)
  })

  it('correspondência é case-insensitive', () => {
    expect(
      documentoJaAssinadoPorMim('ASSINADO POR JOÃO DA SILVA (hmmg-dir adm)', {
        usuario: 'joão da silva',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
    expect(
      documentoJaAssinadoPorMim('Assinado por Maria (hmmg-dir adm)', {
        usuario: 'joão',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
  })

  it('correspondência tolera espaços extras/quebras de linha na célula', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado   por\nJoão    da Silva', {
        usuario: 'João da Silva',
        unidade: '',
      })
    ).toBe(true)
  })

  it('ignora unidade vazia (não seleciona tudo por engano)', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(false)
  })

  it('ignora usuário vazio (não seleciona tudo por engano)', () => {
    expect(
      documentoJaAssinadoPorMim('Assinado por Maria', { usuario: '', unidade: 'HMMG-DJUR' })
    ).toBe(false)
  })

  it('não corresponde quando o texto de assinaturas está vazio', () => {
    expect(documentoJaAssinadoPorMim('', { usuario: 'João', unidade: 'HMMG-DIR ADM' })).toBe(false)
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
})
