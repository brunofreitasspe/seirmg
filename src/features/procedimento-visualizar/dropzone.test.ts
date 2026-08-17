import { describe, expect, it } from 'vitest'
import type { DocumentoExternoConfig } from '../../lib/storage'
import {
  extrairUrlIncluirDocumento,
  extrairIdSerieDocumentoExterno,
  extrairAcaoFormulario,
  montarCorpoCamposOcultos,
  definirValorCampo,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  formatarTamanhoBytes,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
  extrairCamposFormularioDocumento,
  escolherOpcaoTipoDocumento,
  montarCorpoDocumentoExterno,
  formatarMensagemEnviando,
  formatarMensagemSucesso,
  formatarDetalheFalhas,
  motivoLegivel,
  extrairFormulario,
  extrairCamposOcultos,
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

describe('extrairIdSerieDocumentoExterno', () => {
  it('extrai o argumento numérico de escolher(...) na opção "Externo" (formato real do SEI)', () => {
    const html = `<a style="width:100%;" href="#" onclick="escolher(-1)" tabindex="1003" class="ancoraOpcao"> Externo</a>`
    expect(extrairIdSerieDocumentoExterno(html)).toBe('-1')
  })

  it('funciona mesmo com outras opções (não-Externo) antes na página', () => {
    const html = `
      <a href="#" onclick="escolher(40)" tabindex="1005" class="ancoraOpcao">Acesso / Revogação ao SEI</a>
      <a href="#" onclick="escolher(-1)" tabindex="1003" class="ancoraOpcao"> Externo</a>
    `
    expect(extrairIdSerieDocumentoExterno(html)).toBe('-1')
  })

  it('retorna null quando não há opção "Externo" na página', () => {
    expect(extrairIdSerieDocumentoExterno('<a href="#" onclick="escolher(40)" class="ancoraOpcao">Interno</a>')).toBeNull()
  })
})

describe('extrairAcaoFormulario', () => {
  it('extrai o action de uma tag <form>', () => {
    const html = `<form id="frmDocumentoEscolherTipo" method="post" onsubmit="return false;" action="controlador.php?acao=documento_escolher_tipo&id_procedimento=123">`
    expect(extrairAcaoFormulario(html)).toBe('controlador.php?acao=documento_escolher_tipo&id_procedimento=123')
  })

  it('retorna null quando não há atributo action', () => {
    expect(extrairAcaoFormulario('<form id="x" method="post">')).toBeNull()
  })
})

describe('definirValorCampo', () => {
  it('substitui o valor do campo com o nome pedido, mantendo os demais intactos', () => {
    const campos = [
      { nome: 'hdnInfraTipoPagina', valor: '2' },
      { nome: 'hdnIdSerie', valor: '' },
    ]
    expect(definirValorCampo(campos, 'hdnIdSerie', '-1')).toEqual([
      { nome: 'hdnInfraTipoPagina', valor: '2' },
      { nome: 'hdnIdSerie', valor: '-1' },
    ])
  })

  it('não altera nada quando o campo não existe na lista', () => {
    const campos = [{ nome: 'a', valor: '1' }]
    expect(definirValorCampo(campos, 'inexistente', 'x')).toEqual(campos)
  })
})

describe('montarCorpoCamposOcultos', () => {
  it('monta o corpo url-encoded a partir dos campos', () => {
    const campos = [
      { nome: 'hdnInfraTipoPagina', valor: '2' },
      { nome: 'hdnIdSerie', valor: '-1' },
    ]
    expect(montarCorpoCamposOcultos(campos)).toBe('hdnInfraTipoPagina=2&hdnIdSerie=-1')
  })

  it('escapa valores com caracteres especiais', () => {
    expect(montarCorpoCamposOcultos([{ nome: 'hdnInfraItensHash', valor: 'a&b=c' }])).toBe('hdnInfraItensHash=a%26b%3Dc')
  })

  it('retorna string vazia pra lista vazia', () => {
    expect(montarCorpoCamposOcultos([])).toBe('')
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

describe('formatarMensagemEnviando', () => {
  it('menciona o nome do arquivo quando há só um', () => {
    expect(formatarMensagemEnviando(['relatorio.pdf'])).toBe('Enviando relatorio.pdf')
  })

  it('menciona a quantidade quando há mais de um arquivo', () => {
    expect(formatarMensagemEnviando(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('Enviando 3 arquivos')
  })
})

describe('formatarMensagemSucesso', () => {
  it('usa singular para 1 documento', () => {
    expect(formatarMensagemSucesso(1)).toBe('Documento incluído com sucesso')
  })

  it('usa plural com a quantidade para mais de 1 documento', () => {
    expect(formatarMensagemSucesso(3)).toBe('3 documentos incluídos com sucesso')
  })
})

describe('motivoLegivel', () => {
  it('usa a mensagem de um Error', () => {
    expect(motivoLegivel(new Error('Falha no upload: HTTP 500'))).toBe('Falha no upload: HTTP 500')
  })

  it('usa o valor direto quando é uma string', () => {
    expect(motivoLegivel('algo deu errado')).toBe('algo deu errado')
  })

  it('cai num texto genérico pra motivo desconhecido (ex.: undefined, objeto sem mensagem)', () => {
    expect(motivoLegivel(undefined)).toBe('Motivo desconhecido')
    expect(motivoLegivel({})).toBe('Motivo desconhecido')
  })
})

describe('formatarDetalheFalhas', () => {
  it('junta nome e motivo de cada falha, uma por linha', () => {
    const falhas = [
      { nome: 'a.pdf', motivo: 'Falha no upload: HTTP 500' },
      { nome: 'b.pdf', motivo: 'Não foi possível ler os campos do formulário de documento.' },
    ]
    expect(formatarDetalheFalhas(falhas)).toBe(
      'a.pdf: Falha no upload: HTTP 500\nb.pdf: Não foi possível ler os campos do formulário de documento.'
    )
  })

  it('retorna string vazia para lista vazia', () => {
    expect(formatarDetalheFalhas([])).toBe('')
  })
})

describe('extrairFormulario', () => {
  it('extrai a tag <form> inteira, do início até o </form> correspondente', () => {
    const html = `<body>
      <form id="frmOutro" action="x"><input name="a"></form>
      <form id="frmDocumentoEscolherTipo" action="controlador.php?acao=y" method="post">
        <input type="hidden" id="hdnIdSerie" name="hdnIdSerie" value="">
        <input type="hidden" name="hdnIdProcedimento" value="21467757">
      </form>
      <form id="frmMaisOutro"></form>
    </body>`
    const resultado = extrairFormulario(html, 'frmDocumentoEscolherTipo')
    expect(resultado).toContain('action="controlador.php?acao=y"')
    expect(resultado).toContain('method="post"')
    expect(resultado).toContain('hdnIdSerie')
    expect(resultado).toContain('hdnIdProcedimento')
    expect(resultado).not.toContain('frmOutro')
    expect(resultado).not.toContain('frmMaisOutro')
    expect(resultado?.trim().endsWith('</form>')).toBe(true)
  })

  it('retorna null quando o formulário não existe na página', () => {
    expect(extrairFormulario('<body><form id="outro"></form></body>', 'frmDocumentoEscolherTipo')).toBeNull()
  })
})

describe('extrairCamposOcultos', () => {
  it('extrai nome e valor de cada input hidden, ignorando os que não são hidden', () => {
    const html = `
      <input type="hidden" id="hdnInfraTipoPagina" name="hdnInfraTipoPagina" value="2"/>
      <input type="text" id="txtFiltro" name="txtFiltro" value="deveria ser ignorado"/>
      <input class="infraCheckbox" name="chkInfraItem0" type="checkbox" value="-1"/>
      <input name="hdnIdSerie" type="hidden" value=""/>
    `
    const resultado = extrairCamposOcultos(html)
    expect(resultado).toEqual([
      { nome: 'hdnInfraTipoPagina', valor: '2' },
      { nome: 'hdnIdSerie', valor: '' },
    ])
  })

  it('retorna lista vazia quando não há nenhum input hidden', () => {
    expect(extrairCamposOcultos('<input type="text" name="a" value="b"/>')).toEqual([])
  })
})
