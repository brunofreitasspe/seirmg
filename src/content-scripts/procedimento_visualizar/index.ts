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

function renderizarNivelAcesso(container: HTMLElement, dados: NivelAcessoExtraido): void {
  container.appendChild(criarSeparador('Nível de Acesso'))
  const p = document.createElement('p')
  p.className = 'seirmg-nivel-acesso'
  if (!dados.nivel) {
    p.textContent = 'Não especificado.'
  } else if (dados.hipoteseLegal) {
    p.textContent = `${dados.nivel}: ${dados.hipoteseLegal}`
  } else {
    p.textContent = dados.nivel
  }
  container.appendChild(p)
}

function renderizarAssuntos(container: HTMLElement, assuntos: string[]): void {
  container.appendChild(criarSeparador('Assuntos'))
  const div = document.createElement('div')
  div.id = 'seirmg-assuntos'

  if (assuntos.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-assunto'
    p.textContent = 'Nenhum assunto especificado.'
    div.appendChild(p)
  } else {
    assuntos.forEach((assunto) => {
      const p = document.createElement('p')
      p.className = 'seirmg-assunto'
      p.textContent = assunto
      div.appendChild(p)
    })
  }

  container.appendChild(div)
}

function renderizarTextoSimples(container: HTMLElement, titulo: string, classe: string, texto: string, vazio: string): void {
  container.appendChild(criarSeparador(titulo))
  const p = document.createElement('p')
  p.className = classe
  p.textContent = texto || vazio
  container.appendChild(p)
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

  const tipo = extrairTipoProcesso(doc)

  container.appendChild(criarSeparador('Tipo do processo'))
  const divTipo = document.createElement('div')
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo'
  pTipo.textContent = tipo
  divTipo.appendChild(pTipo)
  container.appendChild(divTipo)

  registrarHistoricoVisita(numero, tipo).catch((error) => {
    console.error('[SEIRMG] Falha ao registrar processo no histórico:', error)
  })

  renderizarNivelAcesso(container, extrairNivelAcesso(doc))
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', extrairEspecificacao(doc), 'Sem especificação.')
  renderizarAssuntos(container, extrairAssuntos(doc))
  renderizarInteressados(container, extrairInteressados(doc))
  renderizarTextoSimples(container, 'Observação', 'seirmg-observacao', extrairObservacao(doc), 'Sem observação.')

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
