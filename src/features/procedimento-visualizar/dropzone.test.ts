import { describe, expect, it } from 'vitest'
import {
  extrairUrlIncluirDocumento,
  extrairUrlDocumentoExterno,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  formatarTamanhoBytes,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
} from './dropzone'

describe('extrairUrlIncluirDocumento', () => {
  it('extrai a url do link de incluir documento', () => {
    const html = `Nos[0].acoes = '<a href="controlador.php?acao=documento_escolher_tipo&id_procedimento=1" tabindex="451" class="ancoraOpcao"> Incluir Documento</a>';`
    expect(extrairUrlIncluirDocumento(html)).toBe(
      'controlador.php?acao=documento_escolher_tipo&id_procedimento=1'
    )
  })

  it('retorna null quando o padrão não é encontrado', () => {
    expect(extrairUrlIncluirDocumento('sem nada aqui')).toBeNull()
  })
})

describe('extrairUrlDocumentoExterno', () => {
  it('extrai a url do link "Externo"', () => {
    const html = `<a href="controlador.php?acao=documento_gerar&id_tipo=2" tabindex="1003" class="ancoraOpcao"> Externo</a>`
    expect(extrairUrlDocumentoExterno(html)).toBe('controlador.php?acao=documento_gerar&id_tipo=2')
  })

  it('retorna null quando não há link Externo', () => {
    expect(extrairUrlDocumentoExterno('<a href="x" tabindex="1003" class="ancoraOpcao"> Interno</a>')).toBeNull()
  })
})

describe('extrairUrlUpload', () => {
  it('extrai a url do objUpload', () => {
    const html = `  objUpload = new infraUpload('frmAnexos','controlador.php?acao=upload&id=1');`
    expect(extrairUrlUpload(html)).toBe('controlador.php?acao=upload&id=1')
  })

  it('retorna null quando não há objUpload', () => {
    expect(extrairUrlUpload('nada aqui')).toBeNull()
  })
})

describe('extrairUsuarioEUnidade', () => {
  it('extrai usuário e unidade da chamada objTabelaAnexos.adicionar', () => {
    const html = `objTabelaAnexos.adicionar([arr['nome_upload'],arr['nome'],arr['data_hora'],arr['tamanho'],infraFormatarTamanhoBytes(arr['tamanho']),'joao.silva' ,'GAB']);`
    expect(extrairUsuarioEUnidade(html)).toEqual({ usuario: 'joao.silva', unidade: 'GAB' })
  })

  it('retorna null quando o padrão não bate', () => {
    expect(extrairUsuarioEUnidade('nada aqui')).toBeNull()
  })
})

describe('formatarTamanhoBytes', () => {
  it('formata em Kb para valores pequenos', () => {
    expect(formatarTamanhoBytes(2048)).toBe('2 Kb')
  })

  it('formata em Mb acima de 1048576 bytes', () => {
    expect(formatarTamanhoBytes(2097152)).toBe('2 Mb')
  })

  it('formata em Gb acima de 1073741824 bytes', () => {
    expect(formatarTamanhoBytes(2147483648)).toBe('2 Gb')
  })
})

describe('montarHdnAnexos', () => {
  it('monta a string composta a partir do identificador de upload', () => {
    const resultado = montarHdnAnexos(
      { usuario: 'joao.silva', unidade: 'GAB' },
      '123#arquivo.pdf#ignorado#2048#2026-07-10 10:00:00'
    )
    expect(resultado).toBe('123±arquivo.pdf±2026-07-10 10:00:00±2048±2 Kb±joao.silva±GAB')
  })
})

describe('respostaIndicaSucesso', () => {
  it('true quando a resposta contém a div da árvore', () => {
    expect(respostaIndicaSucesso('<div id="divArvoreHtml"></div>')).toBe(true)
  })

  it('false quando a resposta não contém a div da árvore', () => {
    expect(respostaIndicaSucesso('<div id="erro"></div>')).toBe(false)
  })
})

describe('obterNomeDocumento', () => {
  it('remove a extensão do nome do arquivo', () => {
    expect(obterNomeDocumento('relatorio.pdf')).toBe('relatorio')
  })

  it('trunca em 49 caracteres', () => {
    const nomeLongo = 'a'.repeat(60) + '.pdf'
    expect(obterNomeDocumento(nomeLongo)).toBe('a'.repeat(49))
  })

  it('mantém o nome quando não há extensão', () => {
    expect(obterNomeDocumento('semextensao')).toBe('semextensao')
  })
})
