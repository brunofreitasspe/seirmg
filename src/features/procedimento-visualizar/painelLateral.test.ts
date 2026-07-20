import { describe, expect, it } from 'vitest'
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
  extrairNivelAcesso,
  extrairAssuntos,
  extrairObservacao,
  extrairEspecificacao,
} from './painelLateral'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extrairUrlEdicaoProcesso', () => {
  it('encontra a url de procedimento_alterar no head', () => {
    const head = `<title>SEI</title><a href="controlador.php?acao=procedimento_alterar&id_procedimento=123&infra_hash=abc" tabindex="0"></a>`
    expect(extrairUrlEdicaoProcesso(head)).toBe(
      'controlador.php?acao=procedimento_alterar&id_procedimento=123&infra_hash=abc'
    )
  })

  it('cai para procedimento_consultar quando alterar não existe', () => {
    const head = `<a href="controlador.php?acao=procedimento_consultar&id_procedimento=123&infra_hash=abc"></a>`
    expect(extrairUrlEdicaoProcesso(head)).toBe(
      'controlador.php?acao=procedimento_consultar&id_procedimento=123&infra_hash=abc'
    )
  })

  it('retorna null quando nenhum dos dois marcadores existe', () => {
    expect(extrairUrlEdicaoProcesso('<title>SEI</title>')).toBeNull()
  })
})

describe('extrairTipoProcesso', () => {
  it('extrai o texto da opção selecionada', () => {
    const doc = montarDocumento(`
      <select id="selTipoProcedimento">
        <option value="1">Outro tipo</option>
        <option value="2" selected="selected">Aquisições e ARPs</option>
      </select>
    `)
    expect(extrairTipoProcesso(doc)).toBe('Aquisições e ARPs')
  })

  it('retorna string vazia quando não há select', () => {
    expect(extrairTipoProcesso(montarDocumento('<div></div>'))).toBe('')
  })
})

describe('extrairInteressados', () => {
  it('extrai nome e sigla no formato "Nome (SIGLA)"', () => {
    const doc = montarDocumento(`
      <select id="selInteressadosProcedimento">
        <option value="10">João da Silva (JS)</option>
        <option value="11">Maria Souza (MS)</option>
      </select>
    `)
    expect(extrairInteressados(doc)).toEqual([
      { id: '10', nome: 'João da Silva', sigla: 'JS' },
      { id: '11', nome: 'Maria Souza', sigla: 'MS' },
    ])
  })

  it('usa o texto inteiro como nome quando não bate o formato "(SIGLA)"', () => {
    const doc = montarDocumento(`
      <select id="selInteressadosProcedimento">
        <option value="10">Secretaria de Obras</option>
      </select>
    `)
    expect(extrairInteressados(doc)).toEqual([{ id: '10', nome: 'Secretaria de Obras', sigla: '' }])
  })

  it('retorna lista vazia quando não há select', () => {
    expect(extrairInteressados(montarDocumento('<div></div>'))).toEqual([])
  })
})

describe('obterUnidadeAtual', () => {
  it('lê #lnkInfraUnidade quando a versão do SEI é >= 4', () => {
    const doc = montarDocumento('<a id="lnkInfraUnidade">GAB</a>')
    expect(obterUnidadeAtual(true, doc)).toBe('GAB')
  })

  it('lê o select selInfraUnidades quando a versão é < 4', () => {
    const doc = montarDocumento(`
      <select name="selInfraUnidades">
        <option value="1">OUTRA</option>
        <option value="2" selected>GAB</option>
      </select>
    `)
    expect(obterUnidadeAtual(false, doc)).toBe('GAB')
  })

  it('retorna null quando o elemento esperado não existe', () => {
    expect(obterUnidadeAtual(true, montarDocumento('<div></div>'))).toBeNull()
    expect(obterUnidadeAtual(false, montarDocumento('<div></div>'))).toBeNull()
  })
})

describe('extrairAtribuicao', () => {
  it('retorna null quando o processo não está aberto em nenhuma unidade', () => {
    const script = `Nos[0].html = 'Processo não aberto em nenhuma unidade';`
    expect(extrairAtribuicao(script, 'GAB')).toBeNull()
  })

  it('processo não sigiloso, aberto e atribuído na unidade atual', () => {
    const script =
      `Nos[0].html = 'Processo aberto nas unidades: ` +
      `<a alt="a" title="b" class="ancoraSigla">GAB</a> ` +
      `(atribuído para <a alt="a" title="João Silva" class="ancoraSigla">joao.silva</a>).<br />';`
    expect(extrairAtribuicao(script, 'GAB')).toEqual({
      sigiloso: false,
      usuarios: [{ nome: 'João Silva', login: 'joao.silva' }],
    })
  })

  it('processo não sigiloso, aberto na unidade atual mas sem atribuição', () => {
    const script =
      `Nos[0].html = 'Processo aberto nas unidades: <a alt="a" title="b" class="ancoraSigla">GAB</a>.<br />';`
    expect(extrairAtribuicao(script, 'GAB')).toEqual({ sigiloso: false, usuarios: [] })
  })

  it('processo não sigiloso, aberto só em outra unidade (não a atual) retorna null', () => {
    const script =
      `Nos[0].html = 'Processo aberto nas unidades: <a alt="a" title="b" class="ancoraSigla">OUTRA</a>.<br />';`
    expect(extrairAtribuicao(script, 'GAB')).toBeNull()
  })

  it('processo sigiloso, usuário da unidade atual', () => {
    // Estrutura assumida (não confirmada contra instância real -- ver nota de validação
    // manual no plano, Task 2): pares alternados de âncora (nome/login do usuário) e
    // âncora (unidade), separados por "&nbsp;/&nbsp;".
    const script =
      `Nos[0].html = 'Processo aberto com os usuários: ` +
      `<a alt="a" title="João Silva" class="ancoraSigla">joao.silva</a>&nbsp;/&nbsp;` +
      `<a alt="a" title="Gabinete" class="ancoraSigla">GAB</a>&nbsp;/&nbsp;` +
      `<a alt="a" title="Maria Souza" class="ancoraSigla">maria.souza</a>&nbsp;/&nbsp;` +
      `<a alt="a" title="Outra Unidade" class="ancoraSigla">OUTRA</a>.<br />';`
    const resultado = extrairAtribuicao(script, 'GAB')
    expect(resultado?.sigiloso).toBe(true)
    expect(resultado?.usuarios).toEqual([{ nome: 'João Silva', login: 'joao.silva' }])
    // mais=2 (não 1) porque a regex é totalmente zero-width (só lookaround) e por isso
    // seu lookahead também dispara logo após a âncora de UNIDADE (não só depois de âncoras
    // de usuário), gerando um match espúrio a cada par usuário→unidade real. Comportamento
    // herdado verbatim do Sei++ original (consultarAtribuicao.js) -- não é bug de
    // transcrição, é uma característica conhecida e não corrigida da regex original.
    // Ver task-2-report.md para o diagnóstico completo. Precisa de validação manual
    // contra um processo sigiloso real do SEI antes de confiar neste branch em produção
    // (mesmo tratamento do Lote F).
    expect(resultado?.mais).toBe(2)
  })
})

describe('extrairNivelAcesso', () => {
  it('retorna Público quando rdoNivelAcesso = 0', () => {
    const doc = montarDocumento(`
      <input type="radio" name="rdoNivelAcesso" value="0" checked>
      <input type="radio" name="rdoNivelAcesso" value="1">
    `)
    expect(extrairNivelAcesso(doc)).toEqual({ nivel: 'Público', hipoteseLegal: null })
  })

  it('retorna Restrito com a hipótese legal selecionada quando rdoNivelAcesso = 1', () => {
    const doc = montarDocumento(`
      <input type="radio" name="rdoNivelAcesso" value="1" checked>
      <select id="selHipoteseLegal">
        <option value="1">Outra hipótese</option>
        <option value="2" selected>Informação Pessoal</option>
      </select>
    `)
    expect(extrairNivelAcesso(doc)).toEqual({ nivel: 'Restrito', hipoteseLegal: 'Informação Pessoal' })
  })

  it('retorna Sigiloso quando rdoNivelAcesso = 2', () => {
    const doc = montarDocumento(`<input type="radio" name="rdoNivelAcesso" value="2" checked>`)
    expect(extrairNivelAcesso(doc)).toEqual({ nivel: 'Sigiloso', hipoteseLegal: null })
  })

  it('retorna nível vazio quando não há rádio marcado', () => {
    expect(extrairNivelAcesso(montarDocumento('<div></div>'))).toEqual({ nivel: '', hipoteseLegal: null })
  })
})

describe('extrairAssuntos', () => {
  it('extrai o texto de cada option', () => {
    const doc = montarDocumento(`
      <select id="selAssuntos">
        <option value="1">Recursos Humanos</option>
        <option value="2">Licitação</option>
      </select>
    `)
    expect(extrairAssuntos(doc)).toEqual(['Recursos Humanos', 'Licitação'])
  })

  it('ignora options com texto vazio', () => {
    const doc = montarDocumento(`
      <select id="selAssuntos">
        <option value=""></option>
        <option value="1">Licitação</option>
      </select>
    `)
    expect(extrairAssuntos(doc)).toEqual(['Licitação'])
  })

  it('retorna lista vazia quando não há select', () => {
    expect(extrairAssuntos(montarDocumento('<div></div>'))).toEqual([])
  })
})

describe('extrairObservacao', () => {
  it('extrai o texto da textarea', () => {
    const doc = montarDocumento(`<textarea id="txaObservacoes">Aguardando retorno da unidade.</textarea>`)
    expect(extrairObservacao(doc)).toBe('Aguardando retorno da unidade.')
  })

  it('retorna string vazia quando a textarea está vazia', () => {
    const doc = montarDocumento(`<textarea id="txaObservacoes"></textarea>`)
    expect(extrairObservacao(doc)).toBe('')
  })

  it('retorna string vazia quando não há textarea', () => {
    expect(extrairObservacao(montarDocumento('<div></div>'))).toBe('')
  })
})

describe('extrairEspecificacao', () => {
  it('extrai o valor do campo de texto', () => {
    const doc = montarDocumento(`<input type="text" id="txtDescricao" value="Contrato de manutenção predial">`)
    expect(extrairEspecificacao(doc)).toBe('Contrato de manutenção predial')
  })

  it('retorna string vazia quando o campo está vazio', () => {
    const doc = montarDocumento(`<input type="text" id="txtDescricao" value="">`)
    expect(extrairEspecificacao(doc)).toBe('')
  })

  it('retorna string vazia quando não há o campo', () => {
    expect(extrairEspecificacao(montarDocumento('<div></div>'))).toBe('')
  })
})
