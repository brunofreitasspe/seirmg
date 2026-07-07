import { describe, expect, it } from 'vitest'
import { escapeComponentAnotacao, montarCorpoSalvarAnotacao, parseAnotacaoDados } from './anotacao'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('parseAnotacaoDados', () => {
  it('extrai os dados dos campos estáveis', () => {
    const doc = montarDocumento(`
      <form id="frmAnotacaoCadastro" action="controlador.php?acao=anotacao_gravar">
        <textarea id="txaDescricao">Nota importante</textarea>
        <input id="chkSinPrioridade" type="checkbox" checked />
        <input id="hdnIdProtocolo" value="123" />
        <input id="hdnInfraTipoPagina" value="P" />
      </form>
    `)
    expect(parseAnotacaoDados(doc)).toEqual({
      texto: 'Nota importante',
      prioridade: true,
      idProtocolo: '123',
      tipoPagina: 'P',
      postUrl: 'controlador.php?acao=anotacao_gravar',
    })
  })

  it('retorna valores vazios/false quando os campos não existem', () => {
    const doc = montarDocumento('<div></div>')
    expect(parseAnotacaoDados(doc)).toEqual({
      texto: '',
      prioridade: false,
      idProtocolo: '',
      tipoPagina: '',
      postUrl: '',
    })
  })
})

describe('escapeComponentAnotacao', () => {
  it('escapa acentos e espaços no padrão ISO-8859-1', () => {
    expect(escapeComponentAnotacao('ação teste')).toBe(escape('ação teste').replace(/\+/g, '%2B'))
  })

  it('escapa o caractere + corretamente (não vira espaço)', () => {
    expect(escapeComponentAnotacao('a+b')).toBe('a%2Bb')
  })
})

describe('montarCorpoSalvarAnotacao', () => {
  it('monta o corpo com prioridade ligada', () => {
    const corpo = montarCorpoSalvarAnotacao({
      texto: 'nota',
      prioridade: true,
      idProtocolo: '123',
      tipoPagina: 'P',
    })
    expect(corpo).toBe(
      'hdnInfraTipoPagina=P&sbmRegistrarAnotacao=Salvar&txaDescricao=nota&hdnIdProtocolo=123&chkSinPrioridade=on'
    )
  })

  it('força prioridade para off quando o texto fica vazio (remoção)', () => {
    const corpo = montarCorpoSalvarAnotacao({
      texto: '',
      prioridade: true,
      idProtocolo: '123',
      tipoPagina: 'P',
    })
    expect(corpo).toContain('chkSinPrioridade=off')
  })
})
