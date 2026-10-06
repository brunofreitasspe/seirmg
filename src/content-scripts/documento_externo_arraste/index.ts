import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import loaderIconSvg from 'lucide-static/icons/loader-circle.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import listOrderedIconSvg from 'lucide-static/icons/list-ordered.svg?raw'
import gripIconSvg from 'lucide-static/icons/grip-vertical.svg?raw'
import chevronUpIconSvg from 'lucide-static/icons/chevron-up.svg?raw'
import chevronDownIconSvg from 'lucide-static/icons/chevron-down.svg?raw'
import {
  extrairUrlIncluirDocumento,
  extrairIdSerieDocumentoExterno,
  extrairAcaoFormulario,
  extrairCamposOcultos,
  definirValorCampo,
  montarCorpoCamposOcultos,
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
  formatarDetalheFalhas,
  motivoLegivel,
  extrairFormulario,
  type FalhaComMotivo,
} from '../../features/procedimento-visualizar/dropzone'
import {
  enviarEmSequencia,
  formatarMensagemProgresso,
  moverItem,
  ordenarPorNomeNatural,
} from '../../features/procedimento-visualizar/filaEnvio'
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

  // A opção "Externo" não é mais um link navegável nas versões atuais do SEI — escolher um tipo
  // preenche hdnIdSerie e submete frmDocumentoEscolherTipo via POST (função escolher(idSerie) do
  // próprio SEI). Replicamos essa submissão manualmente.
  const idSerieExterno = extrairIdSerieDocumentoExterno(resposta1.data)
  if (!idSerieExterno) throw new Error('Não foi localizada a opção "Externo" na lista de tipos de documento.')

  const formularioEscolherTipo = extrairFormulario(resposta1.data, 'frmDocumentoEscolherTipo')
  if (!formularioEscolherTipo) throw new Error('Não foi possível localizar o formulário de escolha do tipo de documento.')

  const acaoEscolherTipo = extrairAcaoFormulario(formularioEscolherTipo)
  if (!acaoEscolherTipo) throw new Error('Não foi possível localizar a ação do formulário de escolha do tipo de documento.')

  const camposEscolherTipo = definirValorCampo(extrairCamposOcultos(formularioEscolherTipo), 'hdnIdSerie', idSerieExterno)
  const corpoEscolherTipo = montarCorpoCamposOcultos(camposEscolherTipo)

  const resposta2 = await fetchText(new URL(acaoEscolherTipo, window.location.href).href, {
    method: 'POST',
    bodyRaw: corpoEscolherTipo,
  })
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

type EstadoDropzone = 'arraste' | 'revisao' | 'enviando' | 'sucesso' | 'erro'

const ICONES_POR_ESTADO: Record<EstadoDropzone, string> = {
  arraste: uploadIconSvg,
  revisao: listOrderedIconSvg,
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
  lista: HTMLOListElement
  botaoFechar: HTMLButtonElement
  botaoTentarNovamente: HTMLButtonElement
  botaoCancelarRevisao: HTMLButtonElement
  botaoEnviarRevisao: HTMLButtonElement
}

function criarBotao(texto: string, classe: string): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = classe
  botao.textContent = texto
  return botao
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

  const lista = document.createElement('ol')
  lista.className = 'seirmg-dropzone-fila'

  const acoes = document.createElement('div')
  acoes.className = 'seirmg-dropzone-acoes'
  const botaoFechar = criarBotao('Fechar', 'seirmg-btn-acao')
  const botaoTentarNovamente = criarBotao('Tentar novamente', 'seirmg-btn-acao seirmg-btn-acao-primario')
  acoes.append(botaoFechar, botaoTentarNovamente)

  const acoesRevisao = document.createElement('div')
  acoesRevisao.className = 'seirmg-dropzone-acoes-revisao'
  const botaoCancelarRevisao = criarBotao('Cancelar', 'seirmg-btn-acao')
  const botaoEnviarRevisao = criarBotao('Enviar', 'seirmg-btn-acao seirmg-btn-acao-primario')
  acoesRevisao.append(botaoCancelarRevisao, botaoEnviarRevisao)

  card.append(badge, titulo, sub, lista, falhas, acoes, acoesRevisao)
  raiz.append(card)
  document.body.appendChild(raiz)

  return { raiz, badge, titulo, sub, falhas, lista, botaoFechar, botaoTentarNovamente, botaoCancelarRevisao, botaoEnviarRevisao }
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

function criarBotaoIcone(svg: string, rotulo: string): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'seirmg-dropzone-fila-btn'
  botao.title = rotulo
  botao.setAttribute('aria-label', rotulo)
  botao.innerHTML = svg
  return botao
}

function montarDropzone(): void {
  try {
    const overlay = criarOverlayArraste()
    let enviando = false
    let arquivosPendentes: File[] = []
    // Fila em revisão (2+ arquivos): o usuário ajusta a ordem antes de enviar.
    let fila: File[] = []
    let revisando = false
    let indiceArrastado: number | null = null

    function renderizarFila(): void {
      overlay.lista.replaceChildren()
      fila.forEach((arquivo, indice) => {
        const item = document.createElement('li')
        item.className = 'seirmg-dropzone-fila-item'
        item.draggable = true

        const alca = document.createElement('span')
        alca.className = 'seirmg-dropzone-fila-alca'
        alca.innerHTML = gripIconSvg
        alca.setAttribute('aria-hidden', 'true')
        const posicao = document.createElement('span')
        posicao.className = 'seirmg-dropzone-fila-posicao'
        posicao.textContent = String(indice + 1)
        const nome = document.createElement('span')
        nome.className = 'seirmg-dropzone-fila-nome'
        nome.textContent = arquivo.name
        nome.title = arquivo.name

        const subir = criarBotaoIcone(chevronUpIconSvg, `Mover ${arquivo.name} pra cima`)
        subir.disabled = indice === 0
        subir.addEventListener('click', () => {
          fila = moverItem(fila, indice, indice - 1)
          renderizarFila()
        })
        const descer = criarBotaoIcone(chevronDownIconSvg, `Mover ${arquivo.name} pra baixo`)
        descer.disabled = indice === fila.length - 1
        descer.addEventListener('click', () => {
          fila = moverItem(fila, indice, indice + 1)
          renderizarFila()
        })
        const remover = criarBotaoIcone(xIconSvg, `Tirar ${arquivo.name} da fila`)
        remover.addEventListener('click', () => {
          fila = fila.filter((_, i) => i !== indice)
          if (fila.length === 0) fecharRevisao()
          else renderizarFila()
        })

        item.addEventListener('dragstart', (evento) => {
          indiceArrastado = indice
          item.classList.add('arrastando')
          evento.dataTransfer?.setData('text/plain', String(indice))
          if (evento.dataTransfer) evento.dataTransfer.effectAllowed = 'move'
        })
        item.addEventListener('dragend', () => {
          indiceArrastado = null
          item.classList.remove('arrastando')
        })
        item.addEventListener('dragover', (evento) => {
          if (indiceArrastado === null) return
          evento.preventDefault()
          item.classList.add('alvo')
        })
        item.addEventListener('dragleave', () => item.classList.remove('alvo'))
        item.addEventListener('drop', (evento) => {
          if (indiceArrastado === null) return
          evento.preventDefault()
          evento.stopPropagation()
          fila = moverItem(fila, indiceArrastado, indice)
          indiceArrastado = null
          renderizarFila()
        })

        item.append(alca, posicao, nome, subir, descer, remover)
        overlay.lista.append(item)
      })
      overlay.botaoEnviarRevisao.textContent = fila.length === 1 ? 'Enviar 1 arquivo' : `Enviar ${fila.length} arquivos`
    }

    function abrirRevisao(arquivos: File[]): void {
      revisando = true
      fila = ordenarPorNomeNatural(arquivos)
      definirEstado(overlay, 'revisao', {
        titulo: 'Ordem de envio',
        sub: 'Os documentos entram na árvore nesta ordem. Arraste ou use as setas pra ajustar.',
      })
      renderizarFila()
    }

    function fecharRevisao(): void {
      revisando = false
      fila = []
      overlay.lista.replaceChildren()
      esconderOverlay(overlay)
    }

    // Um por vez, na ordem: em paralelo, a ordem na árvore dependia de qual upload terminava primeiro.
    function enviarFila(arquivos: File[]): void {
      revisando = false
      enviando = true
      overlay.lista.replaceChildren()
      definirEstado(overlay, 'enviando', {
        titulo:
          arquivos.length === 1
            ? formatarMensagemEnviando([arquivos[0].name])
            : formatarMensagemProgresso(0, arquivos.length, arquivos[0].name),
      })

      enviarEmSequencia(
        arquivos,
        (arquivo) => criarDocumentoExternoPorArraste(arquivo),
        (arquivo, indice) => {
          if (arquivos.length > 1) {
            definirEstado(overlay, 'enviando', { titulo: formatarMensagemProgresso(indice, arquivos.length, arquivo.name) })
          }
        }
      )
        .then((resultado) => {
          if (!resultado.falha) {
            arquivosPendentes = []
            definirEstado(overlay, 'sucesso', { titulo: formatarMensagemSucesso(resultado.enviados) })
            setTimeout(() => location.reload(), 900)
            return
          }

          const falha: FalhaComMotivo = { nome: resultado.falha.item.name, motivo: motivoLegivel(resultado.falha.motivo) }
          console.error(`[SEIRMG] Falha ao incluir documento "${falha.nome}" por arraste:`, resultado.falha.motivo)
          arquivosPendentes = resultado.pendentes
          enviando = false
          const restantes = resultado.pendentes.length - 1
          definirEstado(overlay, 'erro', {
            titulo: 'Não foi possível incluir o documento',
            sub:
              (resultado.enviados > 0 ? `${resultado.enviados} enviado(s) antes da falha. ` : '') +
              (restantes > 0 ? `O envio parou pra manter a ordem; ${restantes} arquivo(s) depois deste aguardam.` : ''),
            falhas: formatarDetalheFalhas([falha]),
          })
        })
        .catch((error) => {
          enviando = false
          console.error('[SEIRMG] Falha ao finalizar criação de documentos por arraste:', error)
        })
    }

    function processarArquivos(arquivos: File[]): void {
      if (arquivos.length === 1) enviarFila(arquivos)
      else abrirRevisao(arquivos)
    }

    window.addEventListener('dragover', (evento) => {
      evento.preventDefault()
    })

    window.addEventListener('dragenter', (evento) => {
      evento.preventDefault()
      if (enviando || revisando || !contemArquivos(evento.dataTransfer)) return
      definirEstado(overlay, 'arraste', {
        titulo: 'Solte para incluir como documento externo',
        sub: 'O arquivo será anexado ao processo aberto nesta unidade',
      })
    })

    window.addEventListener('dragleave', (evento) => {
      evento.preventDefault()
      if (enviando || revisando) return
      if (evento.relatedTarget === null) esconderOverlay(overlay)
    })

    window.addEventListener('drop', (evento) => {
      evento.preventDefault()
      if (revisando) {
        // Arquivos soltos com a fila aberta entram no fim dela; arrastos internos (reordenar) são
        // tratados pelos próprios itens.
        if (contemArquivos(evento.dataTransfer)) {
          fila = [...fila, ...ordenarPorNomeNatural(Array.from(evento.dataTransfer?.files ?? []))]
          renderizarFila()
        }
        return
      }
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
      if (arquivosPendentes.length > 0) enviarFila(arquivosPendentes)
    })

    overlay.botaoCancelarRevisao.addEventListener('click', fecharRevisao)
    overlay.botaoEnviarRevisao.addEventListener('click', () => {
      if (fila.length > 0) enviarFila(fila)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar dropzone:', error)
  }
}

montarDropzone()
