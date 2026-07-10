import {
  classificarDivRelacionados,
  extrairTooltipRelacionado,
} from '../../features/procedimento-visualizar/ajustarElementosNativos'
import { montarTituloJanela } from '../../features/procedimento-visualizar/alterarTitulo'
import {
  montarCorpoSalvarAnotacao,
  parseAnotacaoDados,
  type AnotacaoDados,
} from '../../features/procedimento-visualizar/anotacao'
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
  type InteressadoExtraido,
  type DadosAtribuicao,
} from '../../features/procedimento-visualizar/painelLateral'
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
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
import { limparTokenPlanka } from '../shared/plankaToken'
import copyIconSvg from 'lucide-static/icons/copy.svg?raw'

function ajustarElementosNativos(): void {
  try {
    const divRelacionados = document.getElementById('divRelacionados')
    if (divRelacionados) {
      const textoCompleto = divRelacionados.textContent ?? ''
      const textoContents = Array.from(divRelacionados.childNodes)
        .map((no) => no.textContent ?? '')
        .join('')
      const estado = classificarDivRelacionados(textoCompleto, textoContents)

      if (estado === 'vazio') {
        divRelacionados.style.display = 'none'
      } else if (estado === 'apenas-titulo') {
        const separador = document.createElement('div')
        separador.className = 'seirmg-separador'
        const span = document.createElement('span')
        span.textContent = 'Processos relacionados'
        separador.appendChild(span)
        divRelacionados.insertAdjacentElement('afterend', separador)
        divRelacionados.style.display = 'none'
      }
    }

    document.querySelectorAll<HTMLAnchorElement>('.divRelacionadosParcial > a').forEach((link) => {
      const onMouseOver = link.getAttribute('onmouseover')
      if (!onMouseOver) return
      const especificacao = extrairTooltipRelacionado(onMouseOver)
      if (!especificacao) return
      const p = document.createElement('p')
      p.className = 'seirmg-processo-relacionado-especificacao'
      p.textContent = especificacao
      link.insertAdjacentElement('afterend', p)
    })

    document.getElementById('divConsultarAndamento')?.classList.add('seirmg-consultar-andamento')
  } catch (error) {
    console.error('[SEIRMG] Falha ao ajustar elementos nativos:', error)
  }
}

function esperarElemento(
  seletorRaiz: string,
  seletor: string,
  callback: () => void,
  tentativasRestantes = 30
): void {
  const raiz = document.querySelector(seletorRaiz)
  const elementos = raiz?.querySelectorAll(seletor)
  if (elementos && elementos.length > 0) {
    callback()
    return
  }
  if (tentativasRestantes <= 0) return
  setTimeout(() => esperarElemento(seletorRaiz, seletor, callback, tentativasRestantes - 1), 100)
}

function obterNumeroProcesso(): string | null {
  const noSelecionado = document.querySelector('.infraArvoreNoSelecionado')
  const numeroNoSelecionado = noSelecionado?.textContent?.trim()
  if (numeroNoSelecionado) return numeroNoSelecionado

  const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
  if (!link) return null
  return link.textContent?.trim() || null
}

function alterarTitulo(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      try {
        const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
        if (!link) return
        const tipo = link.getAttribute('title') ?? ''
        const numero = obterNumeroProcesso() ?? ''
        window.parent.document.title = montarTituloJanela(numero, tipo)
      } catch (error) {
        console.error('[SEIRMG] Falha ao alterar título da janela:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar alteração de título:', error)
  }
}

function montarPainelAnotacao(): void {
  try {
    const marcador = 'controlador.php?acao=anotacao_registrar&'
    const head = document.head.innerHTML
    const inicio = head.indexOf(marcador)
    if (inicio === -1) return
    const fim = head.indexOf('"', inicio)
    if (fim === -1) return
    const url = new URL(head.substring(inicio, fim), window.location.href).href

    const container = document.getElementById('container') ?? document.body

    const separador = document.createElement('div')
    separador.className = 'seirmg-separador'
    const spanSep = document.createElement('span')
    spanSep.textContent = 'Anotações'
    separador.appendChild(spanSep)

    const divAnotacao = document.createElement('div')
    divAnotacao.id = 'seirmg-anotacao'
    container.append(separador, divAnotacao)

    let dadosAtuais: AnotacaoDados = {
      texto: '',
      prioridade: false,
      idProtocolo: '',
      tipoPagina: '',
      postUrl: '',
    }

    async function carregar(): Promise<void> {
      divAnotacao.innerHTML = ''
      const resultado = await fetchText(url)
      if (!resultado.ok) {
        console.error('[SEIRMG] Falha ao buscar dados da anotação:', resultado.error)
        return
      }
      const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
      dadosAtuais = parseAnotacaoDados(doc)
      montarUI()
    }

    function montarUI(): void {
      const semAnotacao = document.createElement('div')
      semAnotacao.className = 'seirmg-sem-anotacao'
      const pSem = document.createElement('p')
      pSem.textContent = 'Este processo não possui anotações. '
      const aCriar = document.createElement('a')
      aCriar.href = '#'
      aCriar.textContent = 'Clique aqui'
      pSem.append(aCriar, document.createTextNode(' para criar uma nota.'))
      semAnotacao.appendChild(pSem)

      const comAnotacao = document.createElement('div')
      comAnotacao.className = 'seirmg-anotacao'

      const botoes = document.createElement('div')
      const btnRemover = document.createElement('button')
      btnRemover.type = 'button'
      btnRemover.textContent = 'Remover'
      const btnEditar = document.createElement('button')
      btnEditar.type = 'button'
      btnEditar.textContent = 'Editar'
      botoes.append(btnRemover, btnEditar)
      comAnotacao.appendChild(botoes)

      const pTexto = document.createElement('p')
      pTexto.className = 'seirmg-anotacao-texto'
      pTexto.textContent = dadosAtuais.texto
      comAnotacao.appendChild(pTexto)

      const divEditar = document.createElement('div')
      divEditar.style.display = 'none'
      const textarea = document.createElement('textarea')
      textarea.maxLength = 500
      divEditar.appendChild(textarea)

      const chkPrioridade = document.createElement('input')
      chkPrioridade.type = 'checkbox'
      chkPrioridade.checked = dadosAtuais.prioridade
      const lblPrioridade = document.createElement('label')
      lblPrioridade.textContent = 'Prioridade'
      divEditar.append(chkPrioridade, lblPrioridade)

      const btnCancelar = document.createElement('button')
      btnCancelar.type = 'button'
      btnCancelar.textContent = 'Cancelar'
      const btnSalvar = document.createElement('button')
      btnSalvar.type = 'button'
      btnSalvar.textContent = 'Salvar'
      divEditar.append(btnCancelar, btnSalvar)
      comAnotacao.appendChild(divEditar)

      divAnotacao.append(semAnotacao, comAnotacao)

      if (dadosAtuais.texto === '') {
        comAnotacao.style.display = 'none'
        semAnotacao.style.display = 'block'
      } else {
        semAnotacao.style.display = 'none'
        comAnotacao.style.display = 'block'
      }

      const iniciarEdicao = (): void => {
        semAnotacao.style.display = 'none'
        botoes.style.display = 'none'
        pTexto.style.display = 'none'
        textarea.value = pTexto.textContent ?? ''
        divEditar.style.display = 'block'
        textarea.focus()
      }

      aCriar.addEventListener('click', (evento) => {
        evento.preventDefault()
        iniciarEdicao()
      })
      btnEditar.addEventListener('click', () => iniciarEdicao())

      btnCancelar.addEventListener('click', () => {
        botoes.style.display = 'block'
        pTexto.style.display = 'block'
        divEditar.style.display = 'none'
        if (dadosAtuais.texto === '') {
          comAnotacao.style.display = 'none'
          semAnotacao.style.display = 'block'
        }
      })

      btnSalvar.addEventListener('click', () => {
        salvar(textarea.value, chkPrioridade.checked)
      })

      btnRemover.addEventListener('click', () => {
        if (!confirm('Deseja remover a anotação deste processo?')) return
        salvar('', false)
      })
    }

    async function salvar(texto: string, prioridade: boolean): Promise<void> {
      try {
        const corpo = montarCorpoSalvarAnotacao({
          texto,
          prioridade,
          idProtocolo: dadosAtuais.idProtocolo,
          tipoPagina: dadosAtuais.tipoPagina,
        })
        const params = new URLSearchParams(corpo)
        const resultado = await fetchText(new URL(dadosAtuais.postUrl, window.location.href).href, {
          method: 'POST',
          body: params,
        })
        if (!resultado.ok) {
          console.error('[SEIRMG] Falha ao salvar anotação:', resultado.error)
          return
        }
        await carregar()
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar anotação:', error)
      }
    }

    carregar().catch((error) => {
      console.error('[SEIRMG] Falha ao carregar anotação:', error)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de anotação:', error)
  }
}

async function consultarDadosPlanka(numero: string): Promise<RespostaConsultaPlanka | null> {
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const planka = localConfig.planka

  if (!tokenValido(planka?.tokenExp, new Date().toISOString())) return null
  if (!planka?.urlConsulta || !planka.token) return null

  const resposta = await fetch(planka.urlConsulta, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${planka.token}`,
    },
    body: JSON.stringify({ processo: numero }),
  })

  if (resposta.status === 401) {
    await limparTokenPlanka()
    return null
  }
  if (resposta.status === 404) return null
  if (!resposta.ok) {
    console.error('[SEIRMG] Consulta ao Planka falhou:', resposta.status)
    return null
  }

  return (await resposta.json()) as RespostaConsultaPlanka
}

function criarSeparador(titulo: string): HTMLDivElement {
  const separador = document.createElement('div')
  separador.className = 'seirmg-separador'
  const span = document.createElement('span')
  span.textContent = titulo
  separador.appendChild(span)
  return separador
}

function criarIconeCopiar(sigla: string, ancora: HTMLElement): HTMLSpanElement {
  const icone = document.createElement('span')
  icone.innerHTML = copyIconSvg
  icone.title = 'Copiar sigla do interessado'
  icone.className = 'seirmg-copiar-sigla'
  icone.addEventListener('click', (evento) => {
    evento.stopPropagation()
    navigator.clipboard.writeText(sigla).then(() => {
      const tooltip = document.createElement('div')
      tooltip.className = 'seirmg-tooltip-copiado'
      tooltip.textContent = 'Copiado!'
      ancora.appendChild(tooltip)
      setTimeout(() => tooltip.remove(), 1000)
    })
  })
  return icone
}

function renderizarInteressados(container: HTMLElement, interessados: InteressadoExtraido[]): void {
  container.appendChild(criarSeparador('Interessado(s)'))
  const div = document.createElement('div')
  div.id = 'seirmg-interessados'

  if (interessados.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-interessado'
    p.textContent = 'Nenhum interessado especificado.'
    div.appendChild(p)
  } else {
    interessados.forEach((interessado) => {
      const p = document.createElement('p')
      p.className = 'seirmg-interessado'
      const spanNome = document.createElement('span')
      spanNome.textContent = interessado.nome
      p.appendChild(spanNome)
      if (interessado.sigla) {
        const spanSigla = document.createElement('span')
        spanSigla.textContent = ` (${interessado.sigla})`
        p.appendChild(spanSigla)
        p.appendChild(criarIconeCopiar(interessado.sigla, p))
      }
      div.appendChild(p)
    })
  }

  container.appendChild(div)
}

function renderizarAtribuicao(container: HTMLElement, dados: DadosAtribuicao): void {
  container.appendChild(criarSeparador(dados.sigiloso ? 'Credencial para' : 'Atribuído para'))
  const div = document.createElement('div')
  div.id = 'seirmg-atribuicao'

  if (dados.usuarios.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-atribuido-para seirmg-sem-atribuicao'
    p.textContent = '(processo sem atribuição)'
    div.appendChild(p)
  } else {
    dados.usuarios.forEach((usuario) => {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para'
      p.title = dados.sigiloso
        ? `Credencial para ${usuario.nome} (${usuario.login}).`
        : `Atribuído para ${usuario.nome} (${usuario.login}).`
      p.textContent = usuario.login
      div.appendChild(p)
    })
    if (dados.sigiloso && dados.mais) {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para seirmg-atribuido-para-mais'
      p.textContent = `+${dados.mais}`
      p.title = `Mais ${dados.mais} usuário(s) de outra(s) área(s).`
      div.appendChild(p)
    }
  }

  container.appendChild(div)
}

async function montarPainelTipoEInteressados(): Promise<void> {
  const numero = obterNumeroProcesso()
  const headHtml = document.head.innerHTML
  const url = extrairUrlEdicaoProcesso(headHtml)
  if (!url) return

  const resultado = await fetchText(new URL(url, window.location.href).href)
  if (!resultado.ok) {
    console.error('[SEIRMG] Falha ao buscar dados do processo:', resultado.error)
    return
  }
  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')

  const container = document.getElementById('container') ?? document.body

  container.appendChild(criarSeparador('Tipo do processo'))
  const divTipo = document.createElement('div')
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo'
  pTipo.textContent = extrairTipoProcesso(doc)
  divTipo.appendChild(pTipo)
  container.appendChild(divTipo)

  renderizarInteressados(container, extrairInteressados(doc))

  if (numero) {
    consultarDadosPlanka(numero)
      .then((dadosPlanka) => {
        if (!dadosPlanka) return
        montarEstiloPlanka()
        const conteudoPlanka = montarConteudoCardPlanka(dadosPlanka, { mostrarPillTipo: false })
        if (conteudoPlanka) divTipo.appendChild(conteudoPlanka)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao consultar dados do Planka:', error)
      })
  }
}

async function montarPainelAtribuicao(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
  if (!unidadeAtual) return

  const scriptTag = Array.from(document.querySelectorAll('script')).find((elemento) =>
    elemento.textContent?.includes('var objArvore')
  )
  if (!scriptTag) return

  const dados = extrairAtribuicao(scriptTag.innerHTML, unidadeAtual)
  if (!dados) return

  const container = document.getElementById('container') ?? document.body
  renderizarAtribuicao(container, dados)
}

function montarPainelLateral(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      montarPainelTipoEInteressados().catch((error) => {
        console.error('[SEIRMG] Falha ao montar painel de tipo/interessados:', error)
      })
      montarPainelAtribuicao().catch((error) => {
        console.error('[SEIRMG] Falha ao montar painel de atribuição:', error)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel lateral:', error)
  }
}

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
    body: new URLSearchParams(corpo),
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

      Promise.allSettled(arquivos.map((arquivo) => criarDocumentoExternoPorArraste(arquivo))).then((resultados) => {
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
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar dropzone:', error)
  }
}

function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelLateral()
  montarPainelAnotacao()
  montarDropzone()
}

bootstrap()
