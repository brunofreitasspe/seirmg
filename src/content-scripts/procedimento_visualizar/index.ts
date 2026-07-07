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
import { fetchText } from '../../lib/result'

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

function alterarTitulo(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      try {
        const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
        if (!link) return
        const tipo = link.getAttribute('title') ?? ''
        const numero = link.textContent?.trim() ?? ''
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
        await fetch(new URL(dadosAtuais.postUrl, window.location.href).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: corpo,
        })
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

function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelAnotacao()
}

bootstrap()
