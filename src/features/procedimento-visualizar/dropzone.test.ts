import { describe, expect, it } from 'vitest'
import type { DocumentoExternoConfig } from '../../lib/storage'
import {
  extrairUrlIncluirDocumento,
  extrairUrlDocumentoExterno,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  formatarTamanhoBytes,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
  extrairCamposFormularioDocumento,
  escolherOpcaoTipoDocumento,
  montarCorpoDocumentoExterno,
} from './dropzone'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const CONFIG_BASE: DocumentoExternoConfig = {
  ativo: true,
  formato: 'N',
  tipoConferencia: '',
  nivelAcesso: 'P',
  hipoteseLegal: '',
  tipoDocumentoPadraoArrastar: 'Anexo',
}

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

describe('extrairCamposFormularioDocumento', () => {
  it('extrai todos os campos ocultos e a lista de opções de série', () => {
    const doc = montarDocumento(`
      <form id="frmDocumentoCadastro" action="controlador.php?acao=documento_gravar"></form>
      <input id="hdnInfraTipoPagina" value="D" />
      <input id="hdnStaDocumento" value="E" />
      <input id="hdnIdUnidadeGeradoraProtocolo" value="10" />
      <input id="hdnIdProcedimento" value="20" />
      <input id="hdnIdTipoProcedimento" value="30" />
      <input id="hdnSinBloqueado" value="N" />
      <select id="selSerie">
        <option value="">Selecione</option>
        <option value="5">Anexo</option>
        <option value="6">Ofício</option>
      </select>
      <input id="optPublico" type="radio" name="rdoNivelAcesso" value="0" />
      <input id="optRestrito" type="radio" name="rdoNivelAcesso" value="1" />
      <input id="optSigiloso" type="radio" name="rdoNivelAcesso" value="2" />
    `)
    expect(extrairCamposFormularioDocumento(doc)).toEqual({
      hdnInfraTipoPagina: 'D',
      selSerieOpcoes: [
        { texto: 'Selecione', valor: '' },
        { texto: 'Anexo', valor: '5' },
        { texto: 'Ofício', valor: '6' },
      ],
      hdnStaDocumento: 'E',
      hdnIdUnidadeGeradoraProtocolo: '10',
      hdnIdProcedimento: '20',
      hdnIdTipoProcedimento: '30',
      hdnSinBloqueado: 'N',
      urlEnvio: 'controlador.php?acao=documento_gravar',
      valorNivelAcessoPublico: '0',
      valorNivelAcessoRestrito: '1',
      valorNivelAcessoSigiloso: '2',
    })
  })

  it('retorna null quando o formulário de cadastro não existe', () => {
    expect(extrairCamposFormularioDocumento(montarDocumento('<div></div>'))).toBeNull()
  })

  it('usa 0/1/2 como fallback quando os radios de nível de acesso não existem', () => {
    const doc = montarDocumento(`<form id="frmDocumentoCadastro" action="x"></form>`)
    const campos = extrairCamposFormularioDocumento(doc)
    expect(campos?.valorNivelAcessoPublico).toBe('0')
    expect(campos?.valorNivelAcessoRestrito).toBe('1')
    expect(campos?.valorNivelAcessoSigiloso).toBe('2')
  })
})

describe('escolherOpcaoTipoDocumento', () => {
  const opcoes = [
    { texto: 'Selecione', valor: '' },
    { texto: 'Anexo', valor: '5' },
    { texto: 'Ofício', valor: '6' },
  ]

  it('escolhe a opção cujo texto bate com o tipo padrão configurado', () => {
    expect(escolherOpcaoTipoDocumento(opcoes, 'Ofício')).toBe('6')
  })

  it('cai para a segunda opção (índice 1) quando o tipo padrão não é encontrado', () => {
    expect(escolherOpcaoTipoDocumento(opcoes, 'Inexistente')).toBe('5')
  })

  it('retorna string vazia quando não há opções suficientes', () => {
    expect(escolherOpcaoTipoDocumento([{ texto: 'Selecione', valor: '' }], 'Anexo')).toBe('')
  })
})

describe('montarCorpoDocumentoExterno', () => {
  const campos = {
    hdnInfraTipoPagina: 'D',
    selSerieOpcoes: [],
    hdnStaDocumento: 'E',
    hdnIdUnidadeGeradoraProtocolo: '10',
    hdnIdProcedimento: '20',
    hdnIdTipoProcedimento: '30',
    hdnSinBloqueado: 'N',
    urlEnvio: 'controlador.php?acao=documento_gravar',
    valorNivelAcessoPublico: '0',
    valorNivelAcessoRestrito: '1',
    valorNivelAcessoSigiloso: '2',
  }

  it('monta o corpo com nível de acesso público (padrão)', () => {
    const corpo = montarCorpoDocumentoExterno(campos, '5', CONFIG_BASE, 'relatorio', 'hdn-anexos-valor', '10/07/2026')
    expect(corpo).toContain('rdoNivelAcesso=0')
    expect(corpo).toContain('txtNumero=relatorio')
    expect(corpo).toContain('selSerie=5')
    expect(corpo).toContain('hdnIdProcedimento=20')
    expect(corpo).toContain('hdnAnexos=hdn-anexos-valor')
    expect(corpo).not.toContain('selHipoteseLegal')
  })

  it('inclui selHipoteseLegal quando o nível de acesso é restrito ou sigiloso', () => {
    const configRestrito: DocumentoExternoConfig = { ...CONFIG_BASE, nivelAcesso: 'R', hipoteseLegal: 'Art. 5' }
    const corpo = montarCorpoDocumentoExterno(campos, '5', configRestrito, 'relatorio', 'hdn', '10/07/2026')
    expect(corpo).toContain('rdoNivelAcesso=1')
    expect(corpo).toContain('selHipoteseLegal=Art.%205')
  })

  it('escapa acentos no nome do documento (padrão ISO-8859-1)', () => {
    const corpo = montarCorpoDocumentoExterno(campos, '5', CONFIG_BASE, 'relatório', 'hdn', '10/07/2026')
    expect(corpo).toContain('txtNumero=relat%F3rio')
  })
})
