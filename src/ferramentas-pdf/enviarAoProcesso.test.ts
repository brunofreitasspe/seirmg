import { describe, expect, it, vi, beforeEach } from 'vitest'
import { enviarPdfAoProcesso, validarUrlIncluir } from './enviarAoProcesso'
import { fetchText, enviarArquivoViaBackground } from '../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore, DEFAULT_SYNC_CONFIG, DEFAULT_LOCAL_CONFIG } from '../lib/storage'

vi.mock('../lib/fetchViaBackground', () => ({
  fetchText: vi.fn(),
  enviarArquivoViaBackground: vi.fn(),
}))

vi.mock('../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage')>()
  return {
    ...actual,
    createLocalConfigStore: vi.fn(),
    createSyncConfigStore: vi.fn(),
  }
})

// Formato real de baseUrlSei (detectarUrlBaseSei): origem + caminho até antes de /controlador,
// sem barra final -- resolver URLs relativas contra isso perderia o /sei.
const BASE_URL = 'https://sei.exemplo.gov.br/sei'
const URL_INCLUIR = `${BASE_URL}/controlador.php?acao=documento_escolher_tipo&id_procedimento=123&infra_sistema=100000100&infra_unidade_atual=110000001&infra_hash=abc123`

const HTML_ESCOLHER_TIPO = `
  <a href="#" onclick="escolher(-1)" tabindex="1003" class="ancoraOpcao"> Externo</a>
  <form id="frmDocumentoEscolherTipo" method="post" action="controlador.php?acao=documento_escolher_tipo&id_procedimento=123">
    <input type="hidden" name="hdnIdSerie" value="" />
    <input type="hidden" name="hdnIdProcedimento" value="123" />
  </form>
`

const HTML_FORM_DOCUMENTO = `
  objUpload = new infraUpload('frmAnexos','controlador.php?acao=upload&id=1');
  objTabelaAnexos.adicionar([arr['nome_upload'],arr['nome'],arr['data_hora'],arr['tamanho'],infraFormatarTamanhoBytes(arr['tamanho']),'joao.silva' ,'GAB']);
  <form id="frmDocumentoCadastro" action="controlador.php?acao=documento_gravar"></form>
  <input id="hdnInfraTipoPagina" value="2" />
  <input id="hdnStaDocumento" value="E" />
  <input id="hdnIdUnidadeGeradoraProtocolo" value="10" />
  <input id="hdnIdProcedimento" value="123" />
  <input id="hdnIdTipoProcedimento" value="30" />
  <input id="hdnSinBloqueado" value="N" />
  <select id="selSerie">
    <option value="">Selecione</option>
    <option value="5">Anexo</option>
  </select>
  <input id="optPublico" type="radio" name="rdoNivelAcesso" value="0" />
  <input id="optRestrito" type="radio" name="rdoNivelAcesso" value="1" />
  <input id="optSigiloso" type="radio" name="rdoNivelAcesso" value="2" />
`

const HTML_SUCESSO = '<html><head><title>SEI - Visualizar Árvore</title></head></html>'

function configurarMocksFeliz(): void {
  vi.mocked(createLocalConfigStore).mockReturnValue({
    get: async () => ({ ...DEFAULT_LOCAL_CONFIG, baseUrlSei: BASE_URL }),
    set: async () => {},
  })
  vi.mocked(createSyncConfigStore).mockReturnValue({
    get: async () => ({
      ...DEFAULT_SYNC_CONFIG,
      documentoExterno: { ...DEFAULT_SYNC_CONFIG.documentoExterno, tipoDocumentoPadraoArrastar: 'Anexo' },
    }),
    set: async () => {},
  })

  vi.mocked(fetchText)
    .mockResolvedValueOnce({ ok: true, data: HTML_ESCOLHER_TIPO })
    .mockResolvedValueOnce({ ok: true, data: HTML_FORM_DOCUMENTO })
    .mockResolvedValueOnce({ ok: true, data: HTML_SUCESSO })

  vi.mocked(enviarArquivoViaBackground).mockResolvedValue({
    ok: true,
    data: '123#relatorio.pdf#ignorado#2048#2026-07-10 10:00:00',
  })
}

describe('validarUrlIncluir', () => {
  it('aceita a URL assinada de documento_escolher_tipo do mesmo SEI', () => {
    expect(validarUrlIncluir(URL_INCLUIR, BASE_URL)?.href).toBe(URL_INCLUIR)
  })

  it('recusa URL de outra origem', () => {
    expect(validarUrlIncluir('https://malicioso.com/sei/controlador.php?acao=documento_escolher_tipo', BASE_URL)).toBeNull()
  })

  it('recusa outra ação do SEI', () => {
    expect(validarUrlIncluir(`${BASE_URL}/controlador.php?acao=procedimento_excluir&id_procedimento=1`, BASE_URL)).toBeNull()
  })

  it('recusa valor que não é URL', () => {
    expect(validarUrlIncluir('lixo', BASE_URL)).toBeNull()
  })
})

describe('enviarPdfAoProcesso', () => {
  beforeEach(() => {
    // resetAllMocks (não clearAllMocks) -- precisa também descartar filas de
    // mockResolvedValueOnce não consumidas por um teste anterior que saiu mais cedo da cadeia
    // (ex.: um teste que falha no upload nunca chega a consumir o 3º fetchText enfileirado).
    vi.resetAllMocks()
  })

  it('percorre a cadeia completa (escolher tipo -> upload -> gravar) e retorna ok quando tudo dá certo', async () => {
    configurarMocksFeliz()

    const resultado = await enviarPdfAoProcesso({
      urlIncluir: URL_INCLUIR,
      nomeArquivo: 'relatorio.pdf',
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    })

    expect(resultado).toEqual({ ok: true })
    expect(vi.mocked(fetchText)).toHaveBeenCalledTimes(3)
    // usa a URL assinada como veio (com infra_hash), sem remontar
    expect(vi.mocked(fetchText).mock.calls[0][0]).toBe(URL_INCLUIR)
    // ações relativas resolvidas mantendo o /sei do caminho
    expect(vi.mocked(fetchText).mock.calls[1][0]).toBe(
      `${BASE_URL}/controlador.php?acao=documento_escolher_tipo&id_procedimento=123`
    )
    expect(vi.mocked(fetchText).mock.calls[2][0]).toBe(`${BASE_URL}/controlador.php?acao=documento_gravar`)
    expect(vi.mocked(enviarArquivoViaBackground)).toHaveBeenCalledWith(
      `${BASE_URL}/controlador.php?acao=upload&id=1`,
      { fieldName: 'filArquivo', fileName: 'relatorio.pdf', bytes: expect.any(Uint8Array) }
    )
  })

  it('retorna erro quando baseUrlSei não está configurado', async () => {
    vi.mocked(createLocalConfigStore).mockReturnValue({
      get: async () => ({ ...DEFAULT_LOCAL_CONFIG, baseUrlSei: undefined }),
      set: async () => {},
    })

    const resultado = await enviarPdfAoProcesso({ urlIncluir: URL_INCLUIR, nomeArquivo: 'a.pdf', bytes: new Uint8Array() })

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/URL do SEI não configurada/)
    expect(vi.mocked(fetchText)).not.toHaveBeenCalled()
  })

  it('retorna erro sem fazer nenhuma chamada quando urlIncluir não é válida', async () => {
    vi.mocked(createLocalConfigStore).mockReturnValue({
      get: async () => ({ ...DEFAULT_LOCAL_CONFIG, baseUrlSei: BASE_URL }),
      set: async () => {},
    })

    const resultado = await enviarPdfAoProcesso({ urlIncluir: '', nomeArquivo: 'a.pdf', bytes: new Uint8Array() })

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/atalho na árvore do processo/)
    expect(vi.mocked(fetchText)).not.toHaveBeenCalled()
  })

  it('retorna erro quando a opção "Externo" não é encontrada na lista de tipos', async () => {
    vi.mocked(createLocalConfigStore).mockReturnValue({
      get: async () => ({ ...DEFAULT_LOCAL_CONFIG, baseUrlSei: BASE_URL }),
      set: async () => {},
    })
    vi.mocked(fetchText).mockResolvedValueOnce({ ok: true, data: '<p>sem opção externo aqui</p>' })

    const resultado = await enviarPdfAoProcesso({ urlIncluir: URL_INCLUIR, nomeArquivo: 'a.pdf', bytes: new Uint8Array() })

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/Externo/)
  })

  it('propaga o erro quando o upload do arquivo falha', async () => {
    configurarMocksFeliz()
    vi.mocked(enviarArquivoViaBackground).mockReset().mockResolvedValue({ ok: false, error: 'Falha no upload: HTTP 500' })

    const resultado = await enviarPdfAoProcesso({ urlIncluir: URL_INCLUIR, nomeArquivo: 'a.pdf', bytes: new Uint8Array() })

    expect(resultado).toEqual({ ok: false, error: 'Falha no upload: HTTP 500' })
  })

  it('retorna erro quando a página final não indica sucesso', async () => {
    vi.mocked(createLocalConfigStore).mockReturnValue({
      get: async () => ({ ...DEFAULT_LOCAL_CONFIG, baseUrlSei: BASE_URL }),
      set: async () => {},
    })
    vi.mocked(createSyncConfigStore).mockReturnValue({
      get: async () => ({
        ...DEFAULT_SYNC_CONFIG,
        documentoExterno: { ...DEFAULT_SYNC_CONFIG.documentoExterno, tipoDocumentoPadraoArrastar: 'Anexo' },
      }),
      set: async () => {},
    })
    vi.mocked(fetchText)
      .mockResolvedValueOnce({ ok: true, data: HTML_ESCOLHER_TIPO })
      .mockResolvedValueOnce({ ok: true, data: HTML_FORM_DOCUMENTO })
      .mockResolvedValueOnce({ ok: true, data: '<html><head><title>SEI - Erro</title></head></html>' })
    vi.mocked(enviarArquivoViaBackground).mockResolvedValue({
      ok: true,
      data: '123#relatorio.pdf#ignorado#2048#2026-07-10 10:00:00',
    })

    const resultado = await enviarPdfAoProcesso({ urlIncluir: URL_INCLUIR, nomeArquivo: 'relatorio.pdf', bytes: new Uint8Array() })

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/não retornou a página esperada/)
  })
})
