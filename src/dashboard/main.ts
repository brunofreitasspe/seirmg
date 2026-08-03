import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import type { EventoHistorico, FavoritoProcesso } from '../lib/storage'
import { filtrarPorPeriodo, calcularMetricas, agruparPorDia } from '../features/dashboard/historicoEventos'
import { calcularIntervalo, type Periodo } from '../features/dashboard/periodo'
import { montarCsvHistorico, montarHtmlRelatorio } from '../features/dashboard/relatorio'
import { ordenarFavoritosPorData, construirLinkSeguro } from '../features/controle-processos/favoritos'
import {
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
} from '../features/controle-processos/favoritosRender'

const ROTULOS_TIPO: Record<EventoHistorico['tipo'], string> = {
  acesso: 'Acesso',
  enviado: 'Enviado',
  documento: 'Documento',
  assinatura: 'Assinatura',
  concluido: 'Concluído',
}

let periodoAtivo: Periodo = '30dias'

function formatarDataGrupo(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

async function renderizarVisaoGeral(): Promise<void> {
  const view = document.getElementById('view-geral')
  if (!view) return

  const localConfig = await createLocalConfigStore().get()
  const todosOsEventos = localConfig.historicoEventos ?? []
  const intervalo = calcularIntervalo(periodoAtivo, new Date())
  const eventos = filtrarPorPeriodo(todosOsEventos, intervalo.inicio, intervalo.fim)
  const metricas = calcularMetricas(eventos)
  const grupos = agruparPorDia([...eventos].reverse())

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'

  const pills = document.createElement('div')
  pills.className = 'periodo-pills'
  const periodos: Array<{ valor: Periodo; rotulo: string }> = [
    { valor: 'hoje', rotulo: 'Hoje' },
    { valor: '7dias', rotulo: '7 dias' },
    { valor: '30dias', rotulo: '30 dias' },
    { valor: '90dias', rotulo: '90 dias' },
    { valor: 'ano', rotulo: 'Ano' },
  ]
  periodos.forEach(({ valor, rotulo }) => {
    const botao = document.createElement('button')
    botao.className = 'periodo-pill' + (valor === periodoAtivo ? ' ativa' : '')
    botao.textContent = rotulo
    botao.addEventListener('click', () => {
      periodoAtivo = valor
      renderizarVisaoGeral().catch((error) => console.error('[SEIRMG] Falha ao renderizar Visão Geral:', error))
    })
    pills.appendChild(botao)
  })

  const acoes = document.createElement('div')
  acoes.className = 'acoes'
  const btnCsv = document.createElement('button')
  btnCsv.className = 'btn'
  btnCsv.textContent = 'Exportar CSV'
  btnCsv.addEventListener('click', () => exportarCsv(eventos))
  const btnRelatorio = document.createElement('button')
  btnRelatorio.className = 'btn btn-primario'
  btnRelatorio.textContent = 'Gerar Relatório'
  btnRelatorio.addEventListener('click', () => gerarRelatorio(eventos, intervalo))
  acoes.append(btnCsv, btnRelatorio)

  header.append(pills, acoes)
  view.appendChild(header)

  const cards = document.createElement('div')
  cards.className = 'cards-metricas'
  ;(Object.keys(ROTULOS_TIPO) as Array<EventoHistorico['tipo']>).forEach((tipo) => {
    const card = document.createElement('div')
    card.className = 'card-metrica'
    card.style.setProperty('--cor', `var(--tipo-${tipo})`)
    const valor = document.createElement('div')
    valor.className = 'valor'
    valor.textContent = String(metricas[tipo])
    const rotulo = document.createElement('div')
    rotulo.className = 'rotulo'
    rotulo.textContent = ROTULOS_TIPO[tipo]
    card.append(valor, rotulo)
    cards.appendChild(card)
  })
  view.appendChild(cards)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'
  if (grupos.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhum evento registrado neste período.'
    painel.appendChild(vazio)
  } else {
    grupos.forEach((grupo) => {
      const cabecalhoGrupo = document.createElement('div')
      cabecalhoGrupo.className = 'grupo-data'
      cabecalhoGrupo.textContent = formatarDataGrupo(grupo.data)
      painel.appendChild(cabecalhoGrupo)

      grupo.eventos.forEach((evento) => {
        const linha = document.createElement('div')
        linha.className = 'evento-linha'

        const tipoSpan = document.createElement('span')
        tipoSpan.className = 'evento-tipo'
        tipoSpan.style.setProperty('--bg', `var(--tipo-${evento.tipo}-soft)`)
        tipoSpan.style.setProperty('--fg', `var(--tipo-${evento.tipo})`)
        tipoSpan.textContent = ROTULOS_TIPO[evento.tipo]

        const numeroSpan = document.createElement('span')
        numeroSpan.className = 'evento-numero'
        numeroSpan.textContent = evento.numero

        const detalheSpan = document.createElement('span')
        detalheSpan.className = 'evento-detalhe'
        detalheSpan.textContent = [evento.tipoProcesso, evento.especificacao].filter(Boolean).join(' — ')

        const horaSpan = document.createElement('span')
        horaSpan.className = 'evento-hora'
        horaSpan.textContent = new Date(evento.ocorridoEm).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })

        linha.append(tipoSpan, numeroSpan, detalheSpan, horaSpan)
        painel.appendChild(linha)
      })
    })
  }
  view.appendChild(painel)
}

function exportarCsv(eventos: EventoHistorico[]): void {
  const blob = new Blob(['﻿' + montarCsvHistorico(eventos)], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `seirmg_historico_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

function gerarRelatorio(eventos: EventoHistorico[], intervalo: ReturnType<typeof calcularIntervalo>): void {
  const html = montarHtmlRelatorio(eventos, intervalo)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

renderizarVisaoGeral().catch((error) => console.error('[SEIRMG] Falha ao renderizar Visão Geral:', error))

function ativarAba(abaAlvo: string): void {
  document.querySelectorAll('.tab-btn').forEach((botao) => {
    botao.classList.toggle('ativa', botao.getAttribute('data-tab') === abaAlvo)
  })
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('ativa', view.id === `view-${abaAlvo}`)
  })
}

document.querySelectorAll('.tab-btn').forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-tab')
    if (aba) ativarAba(aba)
  })
})

function montarCelulaProcessoFavorito(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')
  td.textContent = item.numero
  if (item.especificacao) {
    const especificacao = document.createElement('div')
    especificacao.style.color = 'var(--seirmg-text-muted)'
    especificacao.style.fontSize = '11.5px'
    especificacao.textContent = item.especificacao
    td.appendChild(especificacao)
  }
  return td
}

function montarCelulaAbrirFavorito(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')
  const url = construirLinkSeguro(item.link)
  if (url) {
    const link = document.createElement('a')
    link.className = 'link-abrir'
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Abrir ↗'
    td.appendChild(link)
  }
  return td
}

async function renderizarFavoritos(): Promise<void> {
  const view = document.getElementById('view-favoritos')
  if (!view) return

  const config = await createSyncConfigStore().get()
  const itens = ordenarFavoritosPorData(config.controleProcessos.favoritos.itens)

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'
  const titulo = document.createElement('h2')
  titulo.textContent = `★ Favoritos (${itens.length})`
  header.appendChild(titulo)
  view.appendChild(header)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'

  if (itens.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhum processo favoritado ainda.'
    painel.appendChild(vazio)
  } else {
    const tabela = document.createElement('table')
    tabela.className = 'tabela-dash'
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Processo</th><th>Marcadores</th><th>Prazo</th><th>Atribuição</th><th></th></tr>'
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    itens.forEach((item) => {
      const tr = document.createElement('tr')
      tr.appendChild(montarCelulaProcessoFavorito(item))
      tr.appendChild(montarCelulaMarcadoresCongelados(item.ultimoSnapshot?.marcadoresNomes ?? []))
      tr.appendChild(montarCelulaPrazoCongelado(item.ultimoSnapshot?.prazoDataTexto ?? null))
      tr.appendChild(montarCelulaAtribuicao(item.ultimoSnapshot?.atribuicao ?? null))
      tr.appendChild(montarCelulaAbrirFavorito(item))
      tbody.appendChild(tr)
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)
  }

  view.appendChild(painel)
}

renderizarFavoritos().catch((error) => console.error('[SEIRMG] Falha ao renderizar Favoritos:', error))
