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
  const linha = document.createElement('div')
  linha.className = concluidaRecente ? 'seirmg-tarefas-linha concluida' : 'seirmg-tarefas-linha'
  linha.dataset.id = tarefa.id

  const ponto = document.createElement('span')
  ponto.className = `seirmg-tarefas-ponto ${tarefa.prioridade}`
  linha.appendChild(ponto)

  const titulo = document.createElement('span')
  titulo.className = 'seirmg-tarefas-linha-titulo'
  titulo.textContent = tarefa.titulo || '(sem título)'
  linha.appendChild(titulo)

  const data = document.createElement('span')
  const vencimento = tarefa.vencimento ? new Date(tarefa.vencimento) : null
  const atrasada = !concluidaRecente && !!vencimento && vencimento < hoje
  data.className = atrasada ? 'seirmg-tarefas-linha-data atrasada' : 'seirmg-tarefas-linha-data'
  data.textContent = concluidaRecente
    ? '✓ concluída'
    : tarefa.vencimento
      ? new Date(tarefa.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—'
  linha.appendChild(data)

  return linha
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
  `
  document.body.appendChild(painel)

  fab.addEventListener('click', () => {
    const aberto = painel.style.display === 'flex'
    painel.style.display = aberto ? 'none' : 'flex'
  })
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
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de tarefas:', error)
  }
}

bootstrap()
