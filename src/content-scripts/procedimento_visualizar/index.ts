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
  extrairNivelAcesso,
  extrairAssuntos,
  extrairObservacao,
  extrairEspecificacao,
  type InteressadoExtraido,
  type DadosAtribuicao,
  type NivelAcessoExtraido,
} from '../../features/procedimento-visualizar/painelLateral'
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore, type HistoricoProcessoEntry } from '../../lib/storage'
import { registrarProcessoVisitado } from '../../features/procedimento-visualizar/historico'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
import { limparTokenPlanka } from '../shared/plankaToken'
import copyIconSvg from 'lucide-static/icons/copy.svg?raw'
import stickyNoteIconSvg from 'lucide-static/icons/sticky-note.svg?raw'
import briefcaseIconSvg from 'lucide-static/icons/briefcase.svg?raw'
import globeIconSvg from 'lucide-static/icons/globe.svg?raw'
import lockIconSvg from 'lucide-static/icons/lock.svg?raw'
import shieldAlertIconSvg from 'lucide-static/icons/shield-alert.svg?raw'
import fileTextIconSvg from 'lucide-static/icons/file-text.svg?raw'
import messageSquareIconSvg from 'lucide-static/icons/message-square.svg?raw'
import tagsIconSvg from 'lucide-static/icons/tags.svg?raw'
import usersIconSvg from 'lucide-static/icons/users.svg?raw'
import userCheckIconSvg from 'lucide-static/icons/user-check.svg?raw'
import pencilIconSvg from 'lucide-static/icons/pencil.svg?raw'
import trash2IconSvg from 'lucide-static/icons/trash-2.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'

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

function obterIdProcedimento(): string | null {
  return new URL(window.location.href).searchParams.get('id_procedimento')
}

async function registrarHistoricoVisita(numero: string | null, tipo: string): Promise<void> {
  const idProcedimento = obterIdProcedimento()
  if (!idProcedimento || !numero) return

  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.historicoProcessos?.ativo) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: HistoricoProcessoEntry = {
    idProcedimento,
    numero,
    tipo,
    acessadoEm: new Date().toISOString(),
  }
  const historico = registrarProcessoVisitado(localConfig.historicoProcessosVisitados ?? [], novo)
  await localStore.set({ ...localConfig, historicoProcessosVisitados: historico })
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

    const { secao, corpo: divAnotacao } = criarSecao('Anotações', stickyNoteIconSvg)
    divAnotacao.id = 'seirmg-anotacao'
    container.appendChild(secao)

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

      const pTexto = document.createElement('p')
      pTexto.className = 'seirmg-anotacao-texto'
      pTexto.textContent = dadosAtuais.texto
      comAnotacao.appendChild(pTexto)

      const botoes = document.createElement('div')
      botoes.className = 'seirmg-anotacao-acoes'
      const btnEditar = criarBotaoAcao('Editar', pencilIconSvg)
      const btnRemover = criarBotaoAcao('Remover', trash2IconSvg, 'seirmg-btn-acao-perigo')
      botoes.append(btnEditar, btnRemover)
      comAnotacao.appendChild(botoes)

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

      const rodapeEdicao = document.createElement('div')
      rodapeEdicao.className = 'seirmg-anotacao-edicao-rodape'
      const btnCancelar = criarBotaoAcao('Cancelar', xIconSvg)
      const btnSalvar = criarBotaoAcao('Salvar', checkIconSvg, 'seirmg-btn-acao-primario')
      rodapeEdicao.append(btnCancelar, btnSalvar)
      divEditar.appendChild(rodapeEdicao)
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
        comAnotacao.style.display = 'block'
        botoes.style.display = 'none'
        pTexto.style.display = 'none'
        divEditar.style.display = 'block'
        textarea.value = pTexto.textContent ?? ''
        textarea.focus()
      }

      aCriar.addEventListener('click', (evento) => {
        evento.preventDefault()
        iniciarEdicao()
      })
      btnEditar.addEventListener('click', () => iniciarEdicao())

      btnCancelar.addEventListener('click', () => {
        botoes.style.display = 'flex'
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
        const resultado = await fetchText(new URL(dadosAtuais.postUrl, window.location.href).href, {
          method: 'POST',
          bodyRaw: corpo,
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

function criarSecao(titulo: string, iconeSvg: string): { secao: HTMLDivElement; corpo: HTMLDivElement } {
  const secao = document.createElement('div')
  secao.className = 'seirmg-secao'

  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-secao-cabecalho'
  const icone = document.createElement('span')
  icone.className = 'seirmg-secao-icone'
  icone.innerHTML = iconeSvg
  const rotulo = document.createElement('span')
  rotulo.textContent = titulo
  cabecalho.append(icone, rotulo)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-secao-corpo'

  secao.append(cabecalho, corpo)
  return { secao, corpo }
}

// Componente de botão único, compartilhado por Editar/Remover/Cancelar/Salvar (Anotações) -- mesmo
// padding/tamanho/borda pros quatro, só variando cor por modificador (perigo/primario).
function criarBotaoAcao(texto: string, iconeSvg: string, classesExtras = ''): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = `seirmg-btn-acao ${classesExtras}`.trim()
  const icone = document.createElement('span')
  icone.className = 'seirmg-btn-acao-icone'
  icone.innerHTML = iconeSvg
  botao.append(icone, document.createTextNode(texto))
  return botao
}

function criarIconeCopiar(sigla: string, ancora: HTMLElement): HTMLSpanElement {
  const icone = document.createElement('span')
  icone.innerHTML = copyIconSvg
  icone.title = 'Copiar sigla do interessado'
  icone.className = 'seirmg-copiar-sigla'
  icone.addEventListener('click', (evento) => {
    evento.stopPropagation()
    navigator.clipboard
      .writeText(sigla)
      .then(() => {
        const tooltip = document.createElement('div')
        tooltip.className = 'seirmg-tooltip-copiado'
        tooltip.textContent = 'Copiado!'
        ancora.appendChild(tooltip)
        setTimeout(() => tooltip.remove(), 1000)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao copiar sigla para a área de transferência:', error)
      })
  })
  return icone
}

function renderizarInteressados(container: HTMLElement, interessados: InteressadoExtraido[]): void {
  const { secao, corpo } = criarSecao('Interessado(s)', usersIconSvg)
  corpo.id = 'seirmg-interessados'

  if (interessados.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-interessado seirmg-vazio'
    p.textContent = 'Nenhum interessado especificado.'
    corpo.appendChild(p)
  } else {
    interessados.forEach((interessado) => {
      const p = document.createElement('p')
      p.className = 'seirmg-interessado'
      const marcador = document.createElement('span')
      marcador.className = 'seirmg-interessado-marcador'
      p.appendChild(marcador)
      const spanNome = document.createElement('span')
      spanNome.textContent = interessado.nome
      p.appendChild(spanNome)
      if (interessado.sigla) {
        const spanSigla = document.createElement('span')
        spanSigla.className = 'seirmg-interessado-sigla'
        spanSigla.textContent = `(${interessado.sigla})`
        p.appendChild(spanSigla)
        p.appendChild(criarIconeCopiar(interessado.sigla, p))
      }
      corpo.appendChild(p)
    })
  }

  container.appendChild(secao)
}

const ICONES_NIVEL_ACESSO: Record<'Público' | 'Restrito' | 'Sigiloso', { classe: string; icone: string }> = {
  Público: { classe: 'seirmg-badge-nivel-publico', icone: globeIconSvg },
  Restrito: { classe: 'seirmg-badge-nivel-restrito', icone: lockIconSvg },
  Sigiloso: { classe: 'seirmg-badge-nivel-sigiloso', icone: shieldAlertIconSvg },
}

function renderizarNivelAcesso(container: HTMLElement, dados: NivelAcessoExtraido): void {
  const { secao, corpo } = criarSecao('Nível de Acesso', shieldAlertIconSvg)

  if (!dados.nivel) {
    const p = document.createElement('p')
    p.className = 'seirmg-vazio'
    p.textContent = 'Não especificado.'
    corpo.appendChild(p)
  } else {
    const info = ICONES_NIVEL_ACESSO[dados.nivel]
    const badge = document.createElement('span')
    badge.className = `seirmg-badge-nivel ${info.classe}`
    const icone = document.createElement('span')
    icone.innerHTML = info.icone
    badge.append(icone, document.createTextNode(dados.nivel))
    corpo.appendChild(badge)

    if (dados.hipoteseLegal) {
      const hipotese = document.createElement('p')
      hipotese.className = 'seirmg-hipotese-legal'
      hipotese.textContent = dados.hipoteseLegal
      corpo.appendChild(hipotese)
    }
  }

  container.appendChild(secao)
}

function renderizarAssuntos(container: HTMLElement, assuntos: string[]): void {
  const { secao, corpo } = criarSecao('Assuntos', tagsIconSvg)
  corpo.id = 'seirmg-assuntos'

  if (assuntos.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-assunto seirmg-vazio'
    p.textContent = 'Nenhum assunto especificado.'
    corpo.appendChild(p)
  } else {
    assuntos.forEach((assunto) => {
      const p = document.createElement('p')
      p.className = 'seirmg-assunto'
      p.textContent = assunto
      corpo.appendChild(p)
    })
  }

  container.appendChild(secao)
}

function renderizarTextoSimples(
  container: HTMLElement,
  titulo: string,
  classe: string,
  texto: string,
  vazio: string,
  iconeSvg: string
): void {
  const { secao, corpo } = criarSecao(titulo, iconeSvg)
  const p = document.createElement('p')
  p.className = texto ? classe : `${classe} seirmg-vazio`
  p.textContent = texto || vazio
  corpo.appendChild(p)
  container.appendChild(secao)
}

function renderizarAtribuicao(container: HTMLElement, dados: DadosAtribuicao): void {
  const { secao, corpo } = criarSecao(dados.sigiloso ? 'Credencial para' : 'Atribuído para', userCheckIconSvg)
  corpo.id = 'seirmg-atribuicao'

  if (dados.usuarios.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-atribuido-para seirmg-sem-atribuicao'
    p.textContent = '(processo sem atribuição)'
    corpo.appendChild(p)
  } else {
    dados.usuarios.forEach((usuario) => {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para'
      p.title = dados.sigiloso
        ? `Credencial para ${usuario.nome} (${usuario.login}).`
        : `Atribuído para ${usuario.nome} (${usuario.login}).`
      p.textContent = usuario.login
      corpo.appendChild(p)
    })
    if (dados.sigiloso && dados.mais) {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para seirmg-atribuido-para-mais'
      p.textContent = `+${dados.mais}`
      p.title = `Mais ${dados.mais} usuário(s) de outra(s) área(s).`
      corpo.appendChild(p)
    }
  }

  container.appendChild(secao)
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

  const tipo = extrairTipoProcesso(doc)

  const { secao: secaoTipo, corpo: divTipo } = criarSecao('Tipo do processo', briefcaseIconSvg)
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo-texto'
  pTipo.textContent = tipo
  divTipo.appendChild(pTipo)
  container.appendChild(secaoTipo)

  registrarHistoricoVisita(numero, tipo).catch((error) => {
    console.error('[SEIRMG] Falha ao registrar processo no histórico:', error)
  })

  renderizarNivelAcesso(container, extrairNivelAcesso(doc))
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', extrairEspecificacao(doc), 'Sem especificação.', fileTextIconSvg)
  renderizarAssuntos(container, extrairAssuntos(doc))
  renderizarInteressados(container, extrairInteressados(doc))
  renderizarTextoSimples(container, 'Observação', 'seirmg-observacao', extrairObservacao(doc), 'Sem observação.', messageSquareIconSvg)

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
      montarPainelTipoEInteressados()
        .catch((error) => {
          console.error('[SEIRMG] Falha ao montar painel de tipo/interessados:', error)
        })
        .finally(() => {
          montarPainelAtribuicao().catch((error) => {
            console.error('[SEIRMG] Falha ao montar painel de atribuição:', error)
          })
        })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel lateral:', error)
  }
}

function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelLateral()
  montarPainelAnotacao()
}

bootstrap()
