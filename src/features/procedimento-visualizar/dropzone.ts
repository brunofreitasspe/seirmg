import { escapeComponentAnotacao } from './anotacao'
import type { DocumentoExternoConfig } from '../../lib/storage'

export function extrairUrlIncluirDocumento(scriptsHtml: string): string | null {
  const regex = /^Nos\[0\]\.acoes = '<a href="(.*?)" tabindex="451"/m
  const resultado = regex.exec(scriptsHtml)
  return resultado ? resultado[1] : null
}

export function extrairUrlDocumentoExterno(respostaHtml: string): string | null {
  const regex = /<a\s+(?:[^>]*?\s+)?href="(.*?)" tabindex="1003" class="ancoraOpcao"> Externo<\/a>/m
  const resultado = regex.exec(respostaHtml)
  return resultado ? resultado[1] : null
}

export function extrairUrlUpload(respostaHtml: string): string | null {
  const regex = /^\s*objUpload = new infraUpload\('frmAnexos','(.+?)'\);/m
  const resultado = regex.exec(respostaHtml)
  return resultado ? resultado[1] : null
}

export interface UsuarioEUnidade {
  usuario: string
  unidade: string
}

export function extrairUsuarioEUnidade(respostaHtml: string): UsuarioEUnidade | null {
  const regex =
    /objTabelaAnexos\.adicionar\(\[arr\['nome_upload'\],arr\['nome'\],arr\['data_hora'\],arr\['tamanho'\],infraFormatarTamanhoBytes\(arr\['tamanho'\]\),'(.+?)' ,'(.+?)'\]\);/m
  const resultado = regex.exec(respostaHtml)
  if (!resultado) return null
  return { usuario: resultado[1], unidade: resultado[2] }
}

export function formatarTamanhoBytes(numBytes: number): string {
  if (numBytes > 1099511627776) return `${Math.round((numBytes / 1099511627776) * 100) / 100} Tb`
  if (numBytes > 1073741824) return `${Math.round((numBytes / 1073741824) * 100) / 100} Gb`
  if (numBytes > 1048576) return `${Math.round((numBytes / 1048576) * 100) / 100} Mb`
  return `${Math.round((numBytes / 1024) * 100) / 100} Kb`
}

export function montarHdnAnexos(usuarioEUnidade: UsuarioEUnidade, uploadIdentificador: string): string {
  const partes = uploadIdentificador.split('#')
  const id = partes[0] ?? ''
  const nome = partes[1] ?? ''
  const dthora = partes[4] ?? ''
  const tamanho = partes[3] ?? '0'
  const tamanhoFormatado = formatarTamanhoBytes(Number.parseInt(tamanho, 10))
  return `${id}±${nome}±${dthora}±${tamanho}±${tamanhoFormatado}±${usuarioEUnidade.usuario}±${usuarioEUnidade.unidade}`
}

export function respostaIndicaSucesso(respostaHtml: string): boolean {
  return /id="divArvoreHtml"/m.test(respostaHtml)
}

export function obterNomeDocumento(nomeArquivo: string): string {
  return nomeArquivo.replace(/\.[^/.]+$/, '').slice(0, 49)
}

export interface CamposOcultosDocumento {
  hdnInfraTipoPagina: string
  selSerieOpcoes: Array<{ texto: string; valor: string }>
  hdnStaDocumento: string
  hdnIdUnidadeGeradoraProtocolo: string
  hdnIdProcedimento: string
  hdnIdTipoProcedimento: string
  hdnSinBloqueado: string
  urlEnvio: string
  valorNivelAcessoPublico: string
  valorNivelAcessoRestrito: string
  valorNivelAcessoSigiloso: string
}

export function extrairCamposFormularioDocumento(doc: Document): CamposOcultosDocumento | null {
  const urlEnvio = doc.querySelector('form#frmDocumentoCadastro')?.getAttribute('action')
  if (!urlEnvio) return null

  const selSerie = doc.querySelector<HTMLSelectElement>('#selSerie')
  const selSerieOpcoes = selSerie
    ? Array.from(selSerie.options).map((opcao) => ({ texto: opcao.textContent?.trim() ?? '', valor: opcao.value }))
    : []

  const valor = (id: string): string => doc.getElementById(id)?.getAttribute('value') ?? ''

  return {
    hdnInfraTipoPagina: valor('hdnInfraTipoPagina'),
    selSerieOpcoes,
    hdnStaDocumento: valor('hdnStaDocumento'),
    hdnIdUnidadeGeradoraProtocolo: valor('hdnIdUnidadeGeradoraProtocolo'),
    hdnIdProcedimento: valor('hdnIdProcedimento'),
    hdnIdTipoProcedimento: valor('hdnIdTipoProcedimento'),
    hdnSinBloqueado: valor('hdnSinBloqueado'),
    urlEnvio,
    valorNivelAcessoPublico: doc.getElementById('optPublico')?.getAttribute('value') ?? '0',
    valorNivelAcessoRestrito: doc.getElementById('optRestrito')?.getAttribute('value') ?? '1',
    valorNivelAcessoSigiloso: doc.getElementById('optSigiloso')?.getAttribute('value') ?? '2',
  }
}

export function escolherOpcaoTipoDocumento(
  opcoes: Array<{ texto: string; valor: string }>,
  tipoPadrao: string
): string {
  const encontrada = opcoes.find((opcao) => opcao.texto === tipoPadrao)
  if (encontrada) return encontrada.valor
  return opcoes[1]?.valor ?? ''
}

export function montarCorpoDocumentoExterno(
  campos: CamposOcultosDocumento,
  selSerie: string,
  config: DocumentoExternoConfig,
  nomeDocumento: string,
  hdnAnexos: string,
  dataHojeStr: string
): string {
  const valorNivelAcesso =
    config.nivelAcesso === 'R'
      ? campos.valorNivelAcessoRestrito
      : config.nivelAcesso === 'S'
        ? campos.valorNivelAcessoSigiloso
        : campos.valorNivelAcessoPublico

  const postFields: Record<string, string> = {
    hdnInfraTipoPagina: campos.hdnInfraTipoPagina,
    selSerie,
    txtDataElaboracao: dataHojeStr,
    txtProtocoloDocumentoTextoBase: '',
    rdoTextoInicial: 'N',
    hdnIdDocumentoTextoBase: '',
    txtNumero: nomeDocumento,
    rdoFormato: config.formato,
    selTipoConferencia: config.formato === 'D' ? config.tipoConferencia : 'null',
    txtDescricao: '',
    txtRemetente: '',
    hdnIdRemetente: '',
    txtInteressado: '',
    hdnIdInteressado: '',
    txtDestinatario: '',
    hdnIdDestinatario: '',
    txtAssunto: '',
    hdnIdAssunto: '',
    txaObservacoes: '',
    selGrauSigilo: 'null',
    rdoNivelAcesso: valorNivelAcesso,
    hdnFlagDocumentoCadastro: '2',
    hdnAssuntos: '',
    hdnInteressados: '',
    hdnDestinatarios: '',
    hdnIdSerie: selSerie,
    hdnIdUnidadeGeradoraProtocolo: campos.hdnIdUnidadeGeradoraProtocolo,
    hdnStaDocumento: campos.hdnStaDocumento,
    hdnIdTipoConferencia: '',
    hdnIdDocumento: '',
    hdnIdProcedimento: campos.hdnIdProcedimento,
    hdnAnexos,
    hdnIdHipoteseLegalSugestao: '',
    hdnIdTipoProcedimento: campos.hdnIdTipoProcedimento,
    hdnUnidadesReabertura: '',
    hdnSinBloqueado: campos.hdnSinBloqueado,
    hdnContatoObject: '',
    hdnContatoIdentificador: '',
    hdnAssuntoIdentificador: '',
  }

  if (config.nivelAcesso === 'R' || config.nivelAcesso === 'S') {
    postFields.selHipoteseLegal = config.hipoteseLegal
  }

  return Object.entries(postFields)
    .map(([chave, valor]) => `${chave}=${escapeComponentAnotacao(valor)}`)
    .join('&')
}

export function formatarMensagemEnviando(nomesArquivos: string[]): string {
  if (nomesArquivos.length === 1) return `Enviando ${nomesArquivos[0]}`
  return `Enviando ${nomesArquivos.length} arquivos`
}

export function formatarMensagemSucesso(quantidade: number): string {
  if (quantidade === 1) return 'Documento incluído com sucesso'
  return `${quantidade} documentos incluídos com sucesso`
}

// Ajuda a diagnosticar falhas de extração (regex que não bate mais com o HTML real do SEI) sem
// precisar que o usuário abra o DevTools — a página em questão nem é navegada por ele, é buscada
// em segundo plano (fetch), então não tem "Inspecionar" pra consultar. Identifica qual página foi
// de fato retornada (título) e quais dos marcadores conhecidos desse fluxo estão presentes/
// ausentes, embutido na própria mensagem de erro exibida no overlay.
const MARCADORES_DOCUMENTO_EXTERNO = ['frmDocumentoCadastro', 'selSerie', 'infraUpload', 'frmAnexos']

export function resumoPagina(html: string): string {
  const tituloMatch = /<title[^>]*>(.*?)<\/title>/is.exec(html)
  const titulo = tituloMatch ? tituloMatch[1].trim() : '(sem <title>)'
  const encontrados = MARCADORES_DOCUMENTO_EXTERNO.filter((marcador) => html.includes(marcador))
  const ausentes = MARCADORES_DOCUMENTO_EXTERNO.filter((marcador) => !html.includes(marcador))
  return `título: "${titulo}"; encontrados: [${encontrados.join(', ') || 'nenhum'}]; ausentes: [${ausentes.join(', ') || 'nenhum'}]`
}

// Extrai o corpo completo (com chaves balanceadas) de uma função JS nomeada, de dentro de um
// bloco de <script> ou HTML bruto — usado pra ver o que um onclick="funcao(...)" realmente faz,
// sem precisar que o usuário navegue até o frame/popup certo no DevTools pra copiar manualmente.
export function extrairFuncaoJs(html: string, nomeFuncao: string): string | null {
  const marcador = `function ${nomeFuncao}(`
  const inicio = html.indexOf(marcador)
  if (inicio === -1) return null

  const inicioChave = html.indexOf('{', inicio)
  if (inicioChave === -1) return null

  let profundidade = 0
  for (let i = inicioChave; i < html.length; i++) {
    if (html[i] === '{') profundidade++
    else if (html[i] === '}') {
      profundidade--
      if (profundidade === 0) return html.slice(inicio, i + 1)
    }
  }
  return null
}

// Extrai a tag <form id="ID">...</form> inteira de um HTML — <form> não aninha em HTML válido,
// então basta achar o próximo </form> depois da tag de abertura com esse id (sem precisar de
// balanceamento de chaves como extrairFuncaoJs).
export function extrairFormulario(html: string, id: string): string | null {
  const regexAbertura = new RegExp(`<form\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i')
  const abertura = regexAbertura.exec(html)
  if (!abertura) return null

  const inicio = abertura.index
  const fimTag = html.indexOf('</form>', inicio)
  if (fimTag === -1) return null

  return html.slice(inicio, fimTag + '</form>'.length)
}

export interface CampoFormulario {
  nome: string
  valor: string
}

// Extrai só os <input type="hidden"> de um trecho de HTML (nome+valor) — usado como diagnóstico
// compacto quando o formulário inteiro (extrairFormulario) é grande demais pra caber no console
// (ex.: uma tabela enorme de opções no meio dele).
export function extrairCamposOcultos(html: string): CampoFormulario[] {
  const campos: CampoFormulario[] = []
  const regexInput = /<input\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = regexInput.exec(html)) !== null) {
    const tag = match[0]
    if (!/\btype=["']hidden["']/i.test(tag)) continue
    const nome = /\bname=["']([^"']*)["']/i.exec(tag)?.[1]
    if (!nome) continue
    const valor = /\bvalue=["']([^"']*)["']/i.exec(tag)?.[1] ?? ''
    campos.push({ nome, valor })
  }
  return campos
}

export function motivoLegivel(motivo: unknown): string {
  if (motivo instanceof Error) return motivo.message
  if (typeof motivo === 'string') return motivo
  return 'Motivo desconhecido'
}

export interface FalhaComMotivo {
  nome: string
  motivo: string
}

export function formatarDetalheFalhas(falhas: FalhaComMotivo[]): string {
  return falhas.map(({ nome, motivo }) => `${nome}: ${motivo}`).join('\n')
}
