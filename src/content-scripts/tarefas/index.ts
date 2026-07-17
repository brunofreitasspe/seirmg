import { createSyncConfigStore } from '../../lib/storage'
import type { Tarefa } from '../../lib/storage'
import {
  agruparPorUrgencia,
  concluidasRecentes,
  contarAtrasadas,
  ordenarDentroDoGrupo,
  type GrupoUrgencia,
} from '../../features/tarefas/urgencia'
import listChecksIconSvg from 'lucide-static/icons/list-checks.svg?raw'
import alertTriangleIconSvg from 'lucide-static/icons/alert-triangle.svg?raw'
import clockIconSvg from 'lucide-static/icons/clock.svg?raw'
import minusIconSvg from 'lucide-static/icons/minus.svg?raw'
import gripVerticalIconSvg from 'lucide-static/icons/grip-vertical.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import trash2IconSvg from 'lucide-static/icons/trash-2.svg?raw'
import plusIconSvg from 'lucide-static/icons/plus.svg?raw'
import { montarExportacao, parseImportacao, tarefasImportadasParaAdicionar } from '../../features/tarefas/exportar'
import downloadIconSvg from 'lucide-static/icons/download.svg?raw'
import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import circleHelpIconSvg from 'lucide-static/icons/circle-help.svg?raw'
import checkCircle2IconSvg from 'lucide-static/icons/check-circle-2.svg?raw'

const ESTILO_TAREFAS = `
  #seirmg-tarefas-fab {
    position: fixed;
    bottom: 25px;
    right: 25px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(1, 127, 255, .4);
    cursor: pointer;
    z-index: 999998;
  }
  #seirmg-tarefas-fab svg {
    width: 19px;
    height: 19px;
  }
  #seirmg-tarefas-fab-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #dc3545;
    color: #fff;
    font-size: 9px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #fff;
  }
  #seirmg-tarefas-painel {
    position: fixed;
    bottom: 70px;
    right: 25px;
    width: 264px;
    max-height: 70vh;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
    border: 1px solid #edf0f2;
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    z-index: 999998;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  #seirmg-tarefas-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid #f0f2f4;
    flex-shrink: 0;
  }
  #seirmg-tarefas-mover {
    color: #cfd4d8;
    cursor: grab;
    background: none;
    border: none;
    padding: 2px;
  }
  #seirmg-tarefas-mover svg {
    width: 13px;
    height: 13px;
  }
  #seirmg-tarefas-titulo {
    font-weight: 700;
    font-size: 13px;
    color: #1a1d1f;
    flex: 1;
  }
  #seirmg-tarefas-contagem {
    color: var(--seirmg-accent-color, #017fff);
    background: #eaf4ff;
    border-radius: 20px;
    font-size: 10.5px;
    padding: 1px 7px;
    margin-left: 5px;
  }
  #seirmg-tarefas-corpo {
    padding: 10px 12px 4px;
    background: #fbfcfd;
    overflow-y: auto;
  }
  .seirmg-tarefas-grupo {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .4px;
    text-transform: uppercase;
    color: #a3232b;
    margin: 12px 0 6px;
  }
  .seirmg-tarefas-grupo:first-child {
    margin-top: 2px;
  }
  .seirmg-tarefas-grupo svg {
    width: 11px;
    height: 11px;
  }
  .seirmg-tarefas-grupo-n {
    color: #c98;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  .seirmg-tarefas-grupo.hoje {
    color: #92720b;
  }
  .seirmg-tarefas-grupo.proximas,
  .seirmg-tarefas-grupo.semPrazo {
    color: #8a919a;
  }
  .seirmg-tarefas-linha {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 4px;
    border-radius: 8px;
    font-size: 12px;
  }
  .seirmg-tarefas-linha:hover {
    background: #f1f6fb;
  }
  .seirmg-tarefas-ponto {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .seirmg-tarefas-ponto.alta { background: #e5484d; }
  .seirmg-tarefas-ponto.media { background: #f5a623; }
  .seirmg-tarefas-ponto.baixa { background: #30a46c; }
  .seirmg-tarefas-linha-titulo {
    flex: 1;
    color: #1a1d1f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seirmg-tarefas-linha.concluida .seirmg-tarefas-linha-titulo {
    color: #adb3b8;
    text-decoration: line-through;
  }
  .seirmg-tarefas-linha-data {
    color: #adb3b8;
    font-size: 10.5px;
    flex-shrink: 0;
  }
  .seirmg-tarefas-linha-data.atrasada {
    color: #e5484d;
    font-weight: 600;
  }
  #seirmg-tarefas-divisor {
    height: 1px;
    background: #f0f2f4;
    margin: 4px 0 2px;
  }
  .seirmg-theme-black #seirmg-tarefas-painel {
    background: #202325;
    border-color: #2c3033;
  }
  .seirmg-theme-black #seirmg-tarefas-header {
    border-color: #2c3033;
  }
  .seirmg-theme-black #seirmg-tarefas-titulo {
    color: #f2f3f5;
  }
  .seirmg-theme-black #seirmg-tarefas-corpo {
    background: #1a1c1e;
  }
  .seirmg-theme-black .seirmg-tarefas-linha-titulo {
    color: #f2f3f5;
  }
  .seirmg-theme-black .seirmg-tarefas-linha:hover {
    background: #262a2d;
  }
  .seirmg-theme-black #seirmg-tarefas-divisor {
    background: #2c3033;
  }
  .seirmg-tarefas-acao {
    display: none;
    gap: 4px;
    color: #adb3b8;
  }
  .seirmg-tarefas-linha:hover .seirmg-tarefas-acao {
    display: flex;
  }
  .seirmg-tarefas-linha:hover .seirmg-tarefas-linha-data {
    display: none;
  }
  .seirmg-tarefas-acao svg {
    width: 12px;
    height: 12px;
  }
  .seirmg-tarefas-acao button {
    background: none;
    border: none;
    padding: 2px;
    color: inherit;
    cursor: pointer;
  }
  .seirmg-tarefas-edicao {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 4px;
    border: 1px solid #dbe9fb;
    background: #f5faff;
    border-radius: 8px;
    margin-bottom: 4px;
  }
  .seirmg-tarefas-input {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 7px;
    font: inherit;
    font-size: 11.5px;
    border: 1px solid #dbe9fb;
    border-radius: 6px;
  }
  .seirmg-tarefas-input:disabled {
    background: #eee;
    color: #888;
  }
  .seirmg-tarefas-btn-fechar-edicao {
    align-self: flex-end;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  #seirmg-tarefas-barra {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 16px;
    border-top: 1px solid #f0f2f4;
    flex-shrink: 0;
  }
  #seirmg-tarefas-add {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 14px rgba(1, 127, 255, .4);
    border: 3px solid #fff;
    cursor: pointer;
  }
  #seirmg-tarefas-add svg {
    width: 18px;
    height: 18px;
  }
  #seirmg-tarefas-popup-historico,
  #seirmg-tarefas-popup-ajuda {
    position: fixed;
    bottom: 70px;
    right: 300px;
    width: 280px;
    max-height: 65vh;
    overflow-y: auto;
    background: #fff;
    border: 1px solid #edf0f2;
    border-radius: 14px;
    padding: 12px;
    z-index: 999999;
    box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
    font-size: 11.5px;
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    color: #1a1d1f;
  }
  .seirmg-tarefas-popup-cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f0f2f4;
  }
  .seirmg-tarefas-popup-vazio {
    color: #adb3b8;
    font-style: italic;
  }
  .seirmg-tarefas-popup-item {
    background: #fbfcfd;
    border: 1px solid #f0f2f4;
    border-radius: 8px;
    padding: 7px 9px;
    margin-bottom: 6px;
  }
  .seirmg-tarefas-popup-item-titulo {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .seirmg-tarefas-popup-item-acoes {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .seirmg-tarefas-popup-item-acoes button {
    font-size: 10px;
    padding: 3px 7px;
    border-radius: 6px;
    border: none;
    background: #eaf4ff;
    color: var(--seirmg-accent-color, #017fff);
    cursor: pointer;
  }
  #seirmg-tarefas-popup-ajuda h2 {
    margin-top: 0;
    font-size: 13.5px;
  }
  #seirmg-tarefas-popup-ajuda h3 {
    font-size: 12px;
    margin: 10px 0 4px;
  }
  #seirmg-tarefas-popup-ajuda ul {
    padding-left: 16px;
    margin: 4px 0;
  }
  #seirmg-tarefas-popup-ajuda button {
    margin-top: 10px;
    padding: 5px 12px;
    border-radius: 6px;
    border: none;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    cursor: pointer;
  }
`

function injetarEstilos(): void {
  if (document.getElementById('seirmg-estilo-tarefas')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-tarefas'
  style.textContent = ESTILO_TAREFAS
  document.head.appendChild(style)
}

let tarefasAtuais: Tarefa[] = []

const ROTULOS_GRUPO: Record<GrupoUrgencia, { texto: string; iconeSvg: string; classe: string }> = {
  atrasadas: { texto: 'Atrasadas', iconeSvg: alertTriangleIconSvg, classe: 'atrasadas' },
  hoje: { texto: 'Hoje', iconeSvg: clockIconSvg, classe: 'hoje' },
  proximas: { texto: 'Próximas', iconeSvg: clockIconSvg, classe: 'proximas' },
  semPrazo: { texto: 'Sem prazo', iconeSvg: minusIconSvg, classe: 'semPrazo' },
}

const ORDEM_GRUPOS: GrupoUrgencia[] = ['atrasadas', 'hoje', 'proximas', 'semPrazo']
const LIMITE_CONCLUIDAS_RECENTES = 3

function montarLinhaTarefa(tarefa: Tarefa, concluidaRecente: boolean, hoje: Date): HTMLElement {
  if (idEmEdicao === tarefa.id) return montarLinhaEdicao(tarefa)

  const linha = document.createElement('div')
  linha.className = concluidaRecente ? 'seirmg-tarefas-linha concluida' : 'seirmg-tarefas-linha'
  linha.dataset.id = tarefa.id
  linha.addEventListener('click', (evento) => {
    if ((evento.target as HTMLElement).closest('.seirmg-tarefas-acao')) return
    if (!concluidaRecente) abrirEdicao(tarefa.id)
  })

  const ponto = document.createElement('span')
  ponto.className = `seirmg-tarefas-ponto ${tarefa.prioridade}`
  linha.appendChild(ponto)

  const titulo = document.createElement('span')
  titulo.className = 'seirmg-tarefas-linha-titulo'
  titulo.textContent = tarefa.titulo || '(sem título)'
  linha.appendChild(titulo)

  const acoes = document.createElement('span')
  acoes.className = 'seirmg-tarefas-acao'
  const botaoConcluir = document.createElement('button')
  botaoConcluir.type = 'button'
  botaoConcluir.title = concluidaRecente ? 'Reabrir' : 'Concluir'
  botaoConcluir.innerHTML = checkIconSvg
  botaoConcluir.addEventListener('click', (evento) => {
    evento.stopPropagation()
    alternarConcluida(tarefa.id)
  })
  acoes.appendChild(botaoConcluir)

  const botaoExcluir = document.createElement('button')
  botaoExcluir.type = 'button'
  botaoExcluir.title = 'Excluir'
  botaoExcluir.innerHTML = trash2IconSvg
  botaoExcluir.addEventListener('click', (evento) => {
    evento.stopPropagation()
    excluirTarefa(tarefa.id)
  })
  acoes.appendChild(botaoExcluir)
  linha.appendChild(acoes)

  const data = document.createElement('span')
  const vencimento = tarefa.vencimento ? new Date(tarefa.vencimento) : null
  const atrasada = !concluidaRecente && !!vencimento && vencimento < hoje
  data.className = atrasada ? 'seirmg-tarefas-linha-data' : 'seirmg-tarefas-linha-data'
  if (atrasada) data.classList.add('atrasada')
  data.textContent = concluidaRecente
    ? '✓ concluída'
    : tarefa.vencimento
      ? new Date(tarefa.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—'
  linha.appendChild(data)

  return linha
}

function montarLinhaEdicao(tarefa: Tarefa): HTMLElement {
  const container = document.createElement('div')
  container.className = 'seirmg-tarefas-edicao'

  const inputTitulo = document.createElement('textarea')
  inputTitulo.className = 'seirmg-tarefas-input'
  inputTitulo.rows = 2
  inputTitulo.placeholder = 'Título...'
  inputTitulo.value = tarefa.titulo
  inputTitulo.disabled = !!tarefa.bloqueada
  inputTitulo.addEventListener('input', () => atualizarCampoTarefa(tarefa.id, { titulo: inputTitulo.value }))
  container.appendChild(inputTitulo)

  const inputProcesso = document.createElement('input')
  inputProcesso.type = 'text'
  inputProcesso.className = 'seirmg-tarefas-input'
  inputProcesso.placeholder = 'Processo SEI...'
  inputProcesso.value = tarefa.processo
  inputProcesso.disabled = !!tarefa.bloqueada
  inputProcesso.addEventListener('input', () =>
    atualizarCampoTarefa(tarefa.id, { processo: inputProcesso.value })
  )
  container.appendChild(inputProcesso)

  const inputVencimento = document.createElement('input')
  inputVencimento.type = 'date'
  inputVencimento.className = 'seirmg-tarefas-input'
  inputVencimento.value = tarefa.vencimento
  inputVencimento.disabled = !!tarefa.bloqueada
  inputVencimento.addEventListener('change', () => {
    atualizarCampoTarefa(tarefa.id, { vencimento: inputVencimento.value })
    renderizarPainel()
  })
  container.appendChild(inputVencimento)

  const selectPrioridade = document.createElement('select')
  selectPrioridade.className = 'seirmg-tarefas-input'
  ;(['baixa', 'media', 'alta'] as const).forEach((valor) => {
    const rotulo = valor === 'baixa' ? 'Baixa' : valor === 'media' ? 'Média' : 'Alta'
    const opcao = new Option(rotulo, valor, false, tarefa.prioridade === valor)
    selectPrioridade.appendChild(opcao)
  })
  selectPrioridade.addEventListener('change', () => {
    atualizarCampoTarefa(tarefa.id, { prioridade: selectPrioridade.value as Tarefa['prioridade'] })
    renderizarPainel()
  })
  container.appendChild(selectPrioridade)

  const botaoFechar = document.createElement('button')
  botaoFechar.type = 'button'
  botaoFechar.textContent = 'Concluído'
  botaoFechar.className = 'seirmg-tarefas-btn-fechar-edicao'
  botaoFechar.addEventListener('click', fecharEdicao)
  container.appendChild(botaoFechar)

  return container
}

function renderizarPainel(): void {
  const corpo = document.getElementById('seirmg-tarefas-corpo')
  const contagem = document.getElementById('seirmg-tarefas-contagem')
  if (!corpo || !contagem) return

  corpo.innerHTML = ''
  const hoje = new Date()
  const grupos = agruparPorUrgencia(tarefasAtuais, hoje)
  const pendentes = tarefasAtuais.filter((tarefa) => !tarefa.concluido)

  contagem.textContent = `${pendentes.length} pendente${pendentes.length === 1 ? '' : 's'}`

  ORDEM_GRUPOS.forEach((chave) => {
    const itensGrupo = ordenarDentroDoGrupo(grupos[chave])
    if (itensGrupo.length === 0) return

    const rotulo = ROTULOS_GRUPO[chave]
    const cabecalho = document.createElement('div')
    cabecalho.className = `seirmg-tarefas-grupo ${rotulo.classe}`
    const iconeSpan = document.createElement('span')
    iconeSpan.innerHTML = rotulo.iconeSvg
    cabecalho.appendChild(iconeSpan)
    cabecalho.appendChild(document.createTextNode(rotulo.texto))
    const contadorSpan = document.createElement('span')
    contadorSpan.className = 'seirmg-tarefas-grupo-n'
    contadorSpan.textContent = ` · ${itensGrupo.length}`
    cabecalho.appendChild(contadorSpan)
    corpo.appendChild(cabecalho)

    itensGrupo.forEach((tarefa) => {
      corpo.appendChild(montarLinhaTarefa(tarefa, false, hoje))
    })
  })

  const recentes = concluidasRecentes(tarefasAtuais, LIMITE_CONCLUIDAS_RECENTES)
  if (recentes.length > 0) {
    const divisor = document.createElement('div')
    divisor.id = 'seirmg-tarefas-divisor'
    corpo.appendChild(divisor)
    recentes.forEach((tarefa) => {
      corpo.appendChild(montarLinhaTarefa(tarefa, true, hoje))
    })
  }
}

function atualizarBadge(): void {
  const badge = document.getElementById('seirmg-tarefas-fab-badge')
  if (!badge) return
  const quantidade = contarAtrasadas(tarefasAtuais, new Date())
  badge.style.display = quantidade > 0 ? 'flex' : 'none'
  badge.textContent = String(quantidade)
}

function montarEsqueleto(): void {
  const fab = document.createElement('div')
  fab.id = 'seirmg-tarefas-fab'
  fab.innerHTML = listChecksIconSvg
  const badge = document.createElement('span')
  badge.id = 'seirmg-tarefas-fab-badge'
  badge.style.display = 'none'
  fab.appendChild(badge)
  document.body.appendChild(fab)

  const painel = document.createElement('div')
  painel.id = 'seirmg-tarefas-painel'
  painel.innerHTML = `
    <div id="seirmg-tarefas-header">
      <button id="seirmg-tarefas-mover" title="Mover">${gripVerticalIconSvg}</button>
      <span id="seirmg-tarefas-titulo">Tarefas<span id="seirmg-tarefas-contagem">0 pendentes</span></span>
    </div>
    <div id="seirmg-tarefas-corpo"></div>
    <div id="seirmg-tarefas-barra">
      <button id="seirmg-tarefas-historico" title="Concluídas">${checkCircle2IconSvg}</button>
      <button id="seirmg-tarefas-exportar" title="Exportar">${downloadIconSvg}</button>
      <button id="seirmg-tarefas-add" title="Nova tarefa">${plusIconSvg}</button>
      <button id="seirmg-tarefas-importar" title="Importar">${uploadIconSvg}</button>
      <button id="seirmg-tarefas-ajuda" title="Ajuda">${circleHelpIconSvg}</button>
    </div>
    <input type="file" id="seirmg-tarefas-input-importar" accept="application/json" style="display:none" />
  `
  document.body.appendChild(painel)

  fab.addEventListener('click', () => {
    const aberto = painel.style.display === 'flex'
    painel.style.display = aberto ? 'none' : 'flex'
  })

  document.getElementById('seirmg-tarefas-add')?.addEventListener('click', criarTarefa)

  document.getElementById('seirmg-tarefas-historico')?.addEventListener('click', abrirPopupHistorico)
  document.getElementById('seirmg-tarefas-exportar')?.addEventListener('click', exportarTarefas)
  document.getElementById('seirmg-tarefas-ajuda')?.addEventListener('click', abrirPopupAjuda)

  const inputImportar = document.getElementById('seirmg-tarefas-input-importar') as HTMLInputElement | null
  document.getElementById('seirmg-tarefas-importar')?.addEventListener('click', () => inputImportar?.click())
  inputImportar?.addEventListener('change', () => {
    const arquivo = inputImportar.files?.[0]
    if (arquivo) importarTarefas(arquivo)
    inputImportar.value = ''
  })

  document.addEventListener('click', (evento) => {
    const alvo = evento.target as HTMLElement
    if (popupHistoricoAtual && !popupHistoricoAtual.contains(alvo) && alvo.id !== 'seirmg-tarefas-historico') {
      fecharPopupHistorico()
    }
  })

  const botaoMover = document.getElementById('seirmg-tarefas-mover')
  let arrastando = false
  let deslocX = 0
  let deslocY = 0

  botaoMover?.addEventListener('mousedown', (evento) => {
    arrastando = true
    const rect = painel.getBoundingClientRect()
    deslocX = evento.clientX - rect.left
    deslocY = evento.clientY - rect.top
    document.body.style.userSelect = 'none'
  })

  document.addEventListener('mousemove', (evento) => {
    if (!arrastando) return
    painel.style.top = `${evento.clientY - deslocY}px`
    painel.style.left = `${evento.clientX - deslocX}px`
    painel.style.right = 'auto'
    painel.style.bottom = 'auto'
  })

  document.addEventListener('mouseup', () => {
    arrastando = false
    document.body.style.userSelect = ''
  })
}

async function salvarTarefas(): Promise<void> {
  const store = createSyncConfigStore()
  const config = await store.get()
  await store.set({ ...config, tarefas: { ...config.tarefas, itens: tarefasAtuais } })
}

function criarTarefa(): void {
  const nova: Tarefa = {
    id: crypto.randomUUID(),
    titulo: '',
    processo: '',
    vencimento: '',
    prioridade: 'media',
    concluido: false,
  }
  tarefasAtuais = [...tarefasAtuais, nova]
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar tarefa nova:', error))
  renderizarPainel()
  atualizarBadge()
  abrirEdicao(nova.id)
}

function alternarConcluida(id: string): void {
  tarefasAtuais = tarefasAtuais.map((tarefa) =>
    tarefa.id === id
      ? {
          ...tarefa,
          concluido: !tarefa.concluido,
          concluidoEm: !tarefa.concluido ? new Date().toISOString() : undefined,
        }
      : tarefa
  )
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar conclusão de tarefa:', error))
  renderizarPainel()
  atualizarBadge()
}

function excluirTarefa(id: string): void {
  tarefasAtuais = tarefasAtuais.filter((tarefa) => tarefa.id !== id)
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar exclusão de tarefa:', error))
  renderizarPainel()
  atualizarBadge()
}

function atualizarCampoTarefa(id: string, campos: Partial<Tarefa>): void {
  tarefasAtuais = tarefasAtuais.map((tarefa) => (tarefa.id === id ? { ...tarefa, ...campos } : tarefa))
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar edição de tarefa:', error))
}

let idEmEdicao: string | null = null

function abrirEdicao(id: string): void {
  idEmEdicao = id
  renderizarPainel()
}

function fecharEdicao(): void {
  idEmEdicao = null
  renderizarPainel()
}

let popupHistoricoAtual: HTMLElement | null = null

function fecharPopupHistorico(): void {
  popupHistoricoAtual?.remove()
  popupHistoricoAtual = null
}

function abrirPopupHistorico(): void {
  fecharPopupHistorico()

  const concluidas = tarefasAtuais.filter((tarefa) => tarefa.concluido)

  const popup = document.createElement('div')
  popup.id = 'seirmg-tarefas-popup-historico'
  popup.addEventListener('click', (evento) => evento.stopPropagation())

  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-tarefas-popup-cabecalho'
  cabecalho.innerHTML = `<span>${checkCircle2IconSvg} Concluídas</span><small>${concluidas.length} item(ns)</small>`
  popup.appendChild(cabecalho)

  if (concluidas.length === 0) {
    const vazio = document.createElement('p')
    vazio.className = 'seirmg-tarefas-popup-vazio'
    vazio.textContent = 'Nenhuma tarefa concluída ainda.'
    popup.appendChild(vazio)
  }

  concluidas.forEach((tarefa) => {
    const item = document.createElement('div')
    item.className = 'seirmg-tarefas-popup-item'

    const titulo = document.createElement('div')
    titulo.className = 'seirmg-tarefas-popup-item-titulo'
    titulo.textContent = tarefa.titulo || '(sem título)'
    item.appendChild(titulo)

    const acoes = document.createElement('div')
    acoes.className = 'seirmg-tarefas-popup-item-acoes'

    const reabrir = document.createElement('button')
    reabrir.type = 'button'
    reabrir.textContent = 'Reabrir'
    reabrir.addEventListener('click', () => {
      alternarConcluida(tarefa.id)
      abrirPopupHistorico()
    })
    acoes.appendChild(reabrir)

    const excluir = document.createElement('button')
    excluir.type = 'button'
    excluir.innerHTML = trash2IconSvg
    excluir.addEventListener('click', () => {
      excluirTarefa(tarefa.id)
      abrirPopupHistorico()
    })
    acoes.appendChild(excluir)

    item.appendChild(acoes)
    popup.appendChild(item)
  })

  document.body.appendChild(popup)
  popupHistoricoAtual = popup
}

function abrirPopupAjuda(): void {
  fecharPopupHistorico()

  if (document.getElementById('seirmg-tarefas-popup-ajuda')) return

  const popup = document.createElement('div')
  popup.id = 'seirmg-tarefas-popup-ajuda'
  popup.innerHTML = `
    <h2>Painel de Tarefas — Guia</h2>
    <p>Checklist pessoal disponível em qualquer tela do SEI. Os dados são salvos na sua conta
    (chrome.storage.sync), sincronizados entre os navegadores em que você estiver logado.</p>
    <h3>Como usar</h3>
    <ul>
      <li>O botão azul abre/fecha o painel.</li>
      <li>Clique numa tarefa pra editar; passe o mouse pra ver os atalhos de concluir/excluir.</li>
      <li>Tarefas são agrupadas por urgência: atrasadas, hoje, próximas e sem prazo.</li>
      <li>As últimas concluídas ficam esmaecidas no fim da lista, pra desfazer rápido.</li>
    </ul>
    <h3>Exportar / Importar</h3>
    <p>Exporte suas tarefas pra um arquivo, e importe em outro perfil ou compartilhe com um
    colega. Tarefas importadas ficam com título/processo/vencimento travados (só prioridade,
    concluir e excluir continuam editáveis).</p>
    <button id="seirmg-tarefas-fechar-ajuda">Fechar</button>
  `
  document.body.appendChild(popup)
  document.getElementById('seirmg-tarefas-fechar-ajuda')?.addEventListener('click', () => {
    popup.remove()
  })
}

function exportarTarefas(): void {
  const exportacao = montarExportacao(tarefasAtuais, chrome.runtime.getManifest().version, new Date())
  const blob = new Blob([JSON.stringify(exportacao, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tarefas-seirmg.json'
  link.click()
  URL.revokeObjectURL(url)
}

function importarTarefas(arquivo: File): void {
  const leitor = new FileReader()
  leitor.onload = (evento) => {
    const conteudo = evento.target?.result
    if (typeof conteudo !== 'string') return

    const exportacao = parseImportacao(conteudo)
    if (!exportacao) {
      window.alert('Arquivo inválido.')
      return
    }

    const novas = tarefasImportadasParaAdicionar(exportacao, () => crypto.randomUUID())
    tarefasAtuais = [...tarefasAtuais, ...novas]
    salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar tarefas importadas:', error))
    renderizarPainel()
    atualizarBadge()
    window.alert(`${novas.length} tarefa(s) importada(s).`)
  }
  leitor.readAsText(arquivo)
}

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.tarefas.ativo) return

    injetarEstilos()
    tarefasAtuais = config.tarefas.itens
    montarEsqueleto()
    renderizarPainel()
    atualizarBadge()

    const hoje = new Date()
    const vencidas = agruparPorUrgencia(tarefasAtuais, hoje).atrasadas.map((tarefa) => ({
      id: tarefa.id,
      titulo: tarefa.titulo,
    }))
    if (vencidas.length > 0) {
      chrome.runtime
        .sendMessage({ type: 'seirmg:tarefas-vencidas', tarefas: vencidas })
        .catch((error) => console.error('[SEIRMG] Falha ao notificar tarefas vencidas:', error))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de tarefas:', error)
  }
}

bootstrap()
