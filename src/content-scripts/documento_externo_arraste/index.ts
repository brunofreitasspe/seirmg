import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import loaderIconSvg from 'lucide-static/icons/loader-circle.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
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
  formatarMensagemEnviando,
  formatarMensagemSucesso,
  formatarListaFalhas,
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

type EstadoDropzone = 'arraste' | 'enviando' | 'sucesso' | 'erro'

const ICONES_POR_ESTADO: Record<EstadoDropzone, string> = {
  arraste: uploadIconSvg,
  enviando: loaderIconSvg,
  sucesso: checkIconSvg,
  erro: xIconSvg,
}

interface OverlayDropzone {
  raiz: HTMLDivElement
  badge: HTMLDivElement
  titulo: HTMLDivElement
  sub: HTMLDivElement
  falhas: HTMLDivElement
  botaoFechar: HTMLButtonElement
  botaoTentarNovamente: HTMLButtonElement
}

function criarOverlayArraste(): OverlayDropzone {
  const raiz = document.createElement('div')
  raiz.id = 'seirmg-dropzone-overlay'

  const card = document.createElement('div')
  card.className = 'seirmg-dropzone-card'

  const badge = document.createElement('div')
  badge.className = 'seirmg-dropzone-badge'

  const titulo = document.createElement('div')
  titulo.className = 'seirmg-dropzone-titulo'

  const sub = document.createElement('div')
  sub.className = 'seirmg-dropzone-sub'

  const falhas = document.createElement('div')
  falhas.className = 'seirmg-dropzone-falhas'

  const acoes = document.createElement('div')
  acoes.className = 'seirmg-dropzone-acoes'

  const botaoFechar = document.createElement('button')
  botaoFechar.type = 'button'
  botaoFechar.className = 'seirmg-btn-acao'
  botaoFechar.textContent = 'Fechar'

  const botaoTentarNovamente = document.createElement('button')
  botaoTentarNovamente.type = 'button'
  botaoTentarNovamente.className = 'seirmg-btn-acao seirmg-btn-acao-primario'
  botaoTentarNovamente.textContent = 'Tentar novamente'

  acoes.append(botaoFechar, botaoTentarNovamente)
  card.append(badge, titulo, sub, falhas, acoes)
  raiz.append(card)
  document.body.appendChild(raiz)

  return { raiz, badge, titulo, sub, falhas, botaoFechar, botaoTentarNovamente }
}

function definirEstado(
  overlay: OverlayDropzone,
  estado: EstadoDropzone,
  opcoes: { titulo: string; sub?: string; falhas?: string }
): void {
  overlay.raiz.dataset.state = estado
  overlay.raiz.style.display = 'flex'
  overlay.badge.innerHTML = ICONES_POR_ESTADO[estado]
  overlay.titulo.textContent = opcoes.titulo
  overlay.sub.textContent = opcoes.sub ?? ''
  overlay.falhas.textContent = opcoes.falhas ?? ''
}

function esconderOverlay(overlay: OverlayDropzone): void {
  overlay.raiz.style.display = 'none'
}

function contemArquivos(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && !!dataTransfer.types && dataTransfer.types.includes('Files')
}

function montarDropzone(): void {
  try {
    const overlay = criarOverlayArraste()
    let enviando = false
    let arquivosPendentes: File[] = []

    function processarArquivos(arquivos: File[]): void {
      enviando = true
      definirEstado(overlay, 'enviando', {
        titulo: formatarMensagemEnviando(arquivos.map((arquivo) => arquivo.name)),
      })

      Promise.allSettled(arquivos.map((arquivo) => criarDocumentoExternoPorArraste(arquivo)))
        .then((resultados) => {
          const falhas = arquivos.filter((_, indice) => resultados[indice]?.status === 'rejected')
          const sucessos = arquivos.length - falhas.length

          if (falhas.length === 0) {
            arquivosPendentes = []
            definirEstado(overlay, 'sucesso', { titulo: formatarMensagemSucesso(sucessos) })
            setTimeout(() => location.reload(), 900)
            return
          }

          arquivosPendentes = falhas
          enviando = false
          definirEstado(overlay, 'erro', {
            titulo: 'Não foi possível incluir o documento',
            sub: 'Verifique se o processo está aberto na sua unidade',
            falhas: formatarListaFalhas(falhas.map((arquivo) => arquivo.name)),
          })
        })
        .catch((error) => {
          enviando = false
          console.error('[SEIRMG] Falha ao finalizar criação de documentos por arraste:', error)
        })
    }

    window.addEventListener('dragover', (evento) => {
      evento.preventDefault()
    })

    window.addEventListener('dragenter', (evento) => {
      evento.preventDefault()
      if (enviando || !contemArquivos(evento.dataTransfer)) return
      definirEstado(overlay, 'arraste', {
        titulo: 'Solte para incluir como documento externo',
        sub: 'O arquivo será anexado ao processo aberto nesta unidade',
      })
    })

    window.addEventListener('dragleave', (evento) => {
      evento.preventDefault()
      if (enviando) return
      if (evento.relatedTarget === null) esconderOverlay(overlay)
    })

    window.addEventListener('drop', (evento) => {
      evento.preventDefault()
      if (enviando || !contemArquivos(evento.dataTransfer)) {
        esconderOverlay(overlay)
        return
      }
      const arquivos = Array.from(evento.dataTransfer?.files ?? [])
      if (arquivos.length === 0) {
        esconderOverlay(overlay)
        return
      }
      processarArquivos(arquivos)
    })

    overlay.botaoFechar.addEventListener('click', () => {
      esconderOverlay(overlay)
      location.reload()
    })

    overlay.botaoTentarNovamente.addEventListener('click', () => {
      if (arquivosPendentes.length > 0) processarArquivos(arquivosPendentes)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar dropzone:', error)
  }
}

montarDropzone()
