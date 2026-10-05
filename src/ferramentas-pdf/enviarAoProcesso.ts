// A página de Ferramentas de PDF roda numa aba própria (chrome-extension://...), sem cookie de
// sessão do SEI no mesmo contexto de aba -- toda chamada precisa passar pelo background
// (mensagem 'seirmg:fetch-sei', já usada por outras features) pra reaproveitar a sessão da aba
// real do SEI. A cadeia de 4 chamadas é a mesma já reverse-engineered em
// features/procedimento-visualizar/dropzone.ts pro recurso de arrastar-e-soltar (ver
// content-scripts/documento_externo_arraste/index.ts pra comparação lado a lado):
//   1. GET  controlador.php?acao=documento_escolher_tipo&id_procedimento=<id>
//   2. POST no action de frmDocumentoEscolherTipo (escolhe o tipo "Externo")
//   3. POST multipart pro endpoint infraUpload (envia o arquivo em si)
//   4. POST no action de frmDocumentoCadastro (grava o documento)
//
// Diferença em relação ao dropzone.ts: lá, o passo 1 lê a URL de um <script> já presente no DOM
// da própria página do processo (extrairUrlIncluirDocumento) -- aqui não há esse DOM disponível,
// então montamos a mesma URL diretamente a partir do id_procedimento (o formato é estável e não
// carrega nenhum hash de sessão, como confirma o teste de extrairUrlIncluirDocumento em
// dropzone.test.ts: 'controlador.php?acao=documento_escolher_tipo&id_procedimento=1'). O passo 3
// também muda de transporte: o dropzone faz um fetch() direto com FormData (mesma aba, mesmos
// cookies); aqui os bytes precisam atravessar o background (enviarArquivoViaBackground), que
// remonta o FormData do lado de lá antes do fetch real.
import {
  extrairIdSerieDocumentoExterno,
  extrairFormulario,
  extrairAcaoFormulario,
  extrairCamposOcultos,
  definirValorCampo,
  montarCorpoCamposOcultos,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  montarHdnAnexos,
  extrairCamposFormularioDocumento,
  escolherOpcaoTipoDocumento,
  montarCorpoDocumentoExterno,
  respostaIndicaSucesso,
  obterNomeDocumento,
  motivoLegivel,
} from '../features/procedimento-visualizar/dropzone'
import { fetchText, enviarArquivoViaBackground } from '../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'

export interface EnvioParaProcesso {
  idProcedimento: string
  nomeArquivo: string
  bytes: Uint8Array
}

export interface ResultadoEnvioAoProcesso {
  ok: boolean
  error?: string
}

// Monta a mesma URL que extrairUrlIncluirDocumento extrairia do DOM do processo -- só que sem
// precisar desse DOM (não disponível na aba standalone). Função pura e testável isoladamente.
export function montarUrlEscolherTipoDocumento(baseUrlSei: string, idProcedimento: string): string {
  const base = baseUrlSei.endsWith('/') ? baseUrlSei : `${baseUrlSei}/`
  return `${base}controlador.php?acao=documento_escolher_tipo&id_procedimento=${encodeURIComponent(idProcedimento)}`
}

function formatarDataHoje(): string {
  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${hoje.getFullYear()}`
}

export async function enviarPdfAoProcesso(envio: EnvioParaProcesso): Promise<ResultadoEnvioAoProcesso> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const baseUrlSei = localConfig.baseUrlSei
    if (!baseUrlSei) {
      return { ok: false, error: 'URL do SEI não configurada. Abra a extensão a partir de uma página do SEI pelo menos uma vez.' }
    }

    const urlIncluir = montarUrlEscolherTipoDocumento(baseUrlSei, envio.idProcedimento)
    const resposta1 = await fetchText(urlIncluir)
    if (!resposta1.ok) return { ok: false, error: resposta1.error }

    const idSerieExterno = extrairIdSerieDocumentoExterno(resposta1.data)
    if (!idSerieExterno) {
      return { ok: false, error: 'Não foi localizada a opção "Externo" na lista de tipos de documento.' }
    }

    const formularioEscolherTipo = extrairFormulario(resposta1.data, 'frmDocumentoEscolherTipo')
    if (!formularioEscolherTipo) {
      return { ok: false, error: 'Não foi possível localizar o formulário de escolha do tipo de documento.' }
    }

    const acaoEscolherTipo = extrairAcaoFormulario(formularioEscolherTipo)
    if (!acaoEscolherTipo) {
      return { ok: false, error: 'Não foi possível localizar a ação do formulário de escolha do tipo de documento.' }
    }

    const camposEscolherTipo = definirValorCampo(extrairCamposOcultos(formularioEscolherTipo), 'hdnIdSerie', idSerieExterno)
    const corpoEscolherTipo = montarCorpoCamposOcultos(camposEscolherTipo)

    const resposta2 = await fetchText(new URL(acaoEscolherTipo, baseUrlSei).href, {
      method: 'POST',
      bodyRaw: corpoEscolherTipo,
    })
    if (!resposta2.ok) return { ok: false, error: resposta2.error }

    const urlUpload = extrairUrlUpload(resposta2.data)
    if (!urlUpload) return { ok: false, error: 'Não foi localizada a URL para enviar o arquivo.' }

    const respostaUpload = await enviarArquivoViaBackground(new URL(urlUpload, baseUrlSei).href, {
      fieldName: 'filArquivo',
      fileName: envio.nomeArquivo,
      bytes: envio.bytes,
    })
    if (!respostaUpload.ok) return { ok: false, error: respostaUpload.error }
    const uploadIdentificador = respostaUpload.data

    const usuarioEUnidade = extrairUsuarioEUnidade(resposta2.data)
    if (!usuarioEUnidade) {
      return { ok: false, error: 'Não foram localizados dados de usuário/unidade dentro da página.' }
    }
    const hdnAnexos = montarHdnAnexos(usuarioEUnidade, uploadIdentificador)

    const doc2 = new DOMParser().parseFromString(resposta2.data, 'text/html')
    const campos = extrairCamposFormularioDocumento(doc2)
    if (!campos) return { ok: false, error: 'Não foi possível ler os campos do formulário de documento.' }

    const syncConfig = await createSyncConfigStore().get()
    const selSerie = escolherOpcaoTipoDocumento(campos.selSerieOpcoes, syncConfig.documentoExterno.tipoDocumentoPadraoArrastar)
    const nomeDocumento = obterNomeDocumento(envio.nomeArquivo)
    const dataHojeStr = formatarDataHoje()

    const corpo = montarCorpoDocumentoExterno(campos, selSerie, syncConfig.documentoExterno, nomeDocumento, hdnAnexos, dataHojeStr)

    const respostaFinal = await fetchText(new URL(campos.urlEnvio, baseUrlSei).href, {
      method: 'POST',
      bodyRaw: corpo,
    })
    if (!respostaFinal.ok) return { ok: false, error: respostaFinal.error }
    if (!respostaIndicaSucesso(respostaFinal.data)) {
      return { ok: false, error: 'A submissão do documento não retornou a página esperada.' }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: motivoLegivel(error) }
  }
}
