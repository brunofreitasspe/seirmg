import {
  extrairUrlIncluirDocumento,
  extrairUrlDocumentoExterno,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
  extrairCamposFormularioDocumento,
  escolherOpcaoTipoDocumento,
  montarCorpoDocumentoExterno,
} from '../../features/procedimento-visualizar/dropzone'
import { fetchText } from '../../lib/fetchViaBackground'
import { createSyncConfigStore } from '../../lib/storage'

async function criarDocumentoExternoPorArraste(arquivo: File): Promise<void> {
  const scriptsHtml = Array.from(document.querySelectorAll('script'))
    .map((script) => script.innerHTML)
    .join('\n')
  const urlIncluir = extrairUrlIncluirDocumento(scriptsHtml)
  if (!urlIncluir) throw new Error('Não foi possível encontrar o botão de inserir documento.')

  const resposta1 = await fetchText(new URL(urlIncluir, window.location.href).href)
  if (!resposta1.ok) throw new Error(resposta1.error)

  const urlExterno = extrairUrlDocumentoExterno(resposta1.data)
  if (!urlExterno) throw new Error('Não foi localizado link para o documento tipo externo.')

  const resposta2 = await fetchText(new URL(urlExterno, window.location.href).href)
  if (!resposta2.ok) throw new Error(resposta2.error)

  const urlUpload = extrairUrlUpload(resposta2.data)
  if (!urlUpload) throw new Error('Não foi localizada a URL para enviar o arquivo.')

  const formData = new FormData()
  formData.append('filArquivo', arquivo, arquivo.name)
  const respostaUpload = await fetch(new URL(urlUpload, window.location.href).href, {
    method: 'POST',
    body: formData,
  })
  if (!respostaUpload.ok) throw new Error(`Falha no upload: HTTP ${respostaUpload.status}`)
  const uploadIdentificador = await respostaUpload.text()

  const usuarioEUnidade = extrairUsuarioEUnidade(resposta2.data)
  if (!usuarioEUnidade) throw new Error('Não foram localizados dados de usuário/unidade dentro da página.')
  const hdnAnexos = montarHdnAnexos(usuarioEUnidade, uploadIdentificador)

  const doc2 = new DOMParser().parseFromString(resposta2.data, 'text/html')
  const campos = extrairCamposFormularioDocumento(doc2)
  if (!campos) throw new Error('Não foi possível ler os campos do formulário de documento.')

  const config = await createSyncConfigStore().get()
  const selSerie = escolherOpcaoTipoDocumento(campos.selSerieOpcoes, config.documentoExterno.tipoDocumentoPadraoArrastar)
  const nomeDocumento = obterNomeDocumento(arquivo.name)
  const dataHojeStr = formatarDataHojeDropzone()

  const corpo = montarCorpoDocumentoExterno(campos, selSerie, config.documentoExterno, nomeDocumento, hdnAnexos, dataHojeStr)

  const respostaFinal = await fetchText(new URL(campos.urlEnvio, window.location.href).href, {
    method: 'POST',
    bodyRaw: corpo,
  })
  if (!respostaFinal.ok) throw new Error(respostaFinal.error)
  if (!respostaIndicaSucesso(respostaFinal.data)) {
    throw new Error('A submissão do documento não retornou a página esperada.')
  }
}

function formatarDataHojeDropzone(): string {
  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${hoje.getFullYear()}`
}

function criarOverlayArraste(): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.id = 'seirmg-dropzone-overlay'
  overlay.textContent = 'Arraste aqui para criar documento externo...'
  document.body.appendChild(overlay)
  return overlay
}

function contemArquivos(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && !!dataTransfer.types && dataTransfer.types.includes('Files')
}

function montarDropzone(): void {
  try {
    const overlay = criarOverlayArraste()

    window.addEventListener('dragover', (evento) => {
      evento.preventDefault()
    })

    window.addEventListener('dragenter', (evento) => {
      evento.preventDefault()
      if (!contemArquivos(evento.dataTransfer)) return
      overlay.style.display = 'flex'
    })

    window.addEventListener('dragleave', (evento) => {
      evento.preventDefault()
      if (evento.relatedTarget === null) overlay.style.display = 'none'
    })

    window.addEventListener('drop', (evento) => {
      evento.preventDefault()
      overlay.style.display = 'none'
      if (!contemArquivos(evento.dataTransfer)) return
      const arquivos = Array.from(evento.dataTransfer?.files ?? [])
      if (arquivos.length === 0) return

      overlay.textContent = 'Criando documento(s)...'
      overlay.style.display = 'flex'

      Promise.allSettled(arquivos.map((arquivo) => criarDocumentoExternoPorArraste(arquivo)))
        .then((resultados) => {
          overlay.style.display = 'none'
          const falhas = arquivos.filter((_, indice) => resultados[indice]?.status === 'rejected')
          if (falhas.length > 0) {
            alert(
              `Ocorreu um erro ao incluir documento externo com o(s) seguinte(s) anexo(s): ${falhas
                .map((arquivo) => arquivo.name)
                .join(', ')}. Verifique se o processo encontra-se aberto na unidade.`
            )
          }
          location.reload()
        })
        .catch((error) => {
          console.error('[SEIRMG] Falha ao finalizar criação de documentos por arraste:', error)
        })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar dropzone:', error)
  }
}

montarDropzone()
