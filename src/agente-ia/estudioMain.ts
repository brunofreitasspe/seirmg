import plusIconSvg from 'lucide-static/icons/plus.svg?raw'
import trashIconSvg from 'lucide-static/icons/trash-2.svg?raw'
import chevronUpIconSvg from 'lucide-static/icons/chevron-up.svg?raw'
import chevronDownIconSvg from 'lucide-static/icons/chevron-down.svg?raw'
import { createSyncConfigStore, lerAgenteIAConfig, type FluxoAgenteIA } from '../lib/storage'
import { criarBotao, criarBotaoIcone, criarElemento } from './ui'

const store = createSyncConfigStore()
let fluxos: FluxoAgenteIA[] = []
let fluxoAConfirmarExclusao: string | null = null

async function salvar(): Promise<void> {
  // Relê antes de gravar: skills/opções podem ter mudado em outra aba.
  const atual = await store.get()
  await store.set({ ...atual, agenteIA: { ...lerAgenteIAConfig(atual), fluxos } })
  const status = document.getElementById('status-salvo')
  if (status) {
    status.textContent = 'Salvo'
    setTimeout(() => (status.textContent = ''), 1500)
  }
}

function salvarComLog(): void {
  salvar().catch((error) => console.error('[SEIRMG] Falha ao salvar fluxos:', error))
}

function atualizarFluxo(id: string, mudar: (fluxo: FluxoAgenteIA) => FluxoAgenteIA): void {
  fluxos = fluxos.map((fluxo) => (fluxo.id === id ? mudar(fluxo) : fluxo))
}

function montarFluxo(fluxo: FluxoAgenteIA): HTMLElement {
  const cartao = criarElemento('section', 'cartao')

  const topo = criarElemento('div', 'fluxo-topo')
  const nome = criarElemento('input')
  nome.type = 'text'
  nome.value = fluxo.nome
  nome.setAttribute('aria-label', 'Nome do fluxo')
  nome.addEventListener('change', () => {
    atualizarFluxo(fluxo.id, (f) => ({ ...f, nome: nome.value.trim() || 'Fluxo sem nome' }))
    salvarComLog()
  })
  topo.append(nome)

  // Exclusão com confirmação na própria tela (sem confirm(), que some em alguns contextos).
  if (fluxoAConfirmarExclusao === fluxo.id) {
    const confirmar = criarBotao('Excluir mesmo', { variante: 'perigo', icone: trashIconSvg })
    confirmar.addEventListener('click', () => {
      fluxos = fluxos.filter((f) => f.id !== fluxo.id)
      fluxoAConfirmarExclusao = null
      renderizar()
      salvarComLog()
    })
    const cancelar = criarBotao('Cancelar')
    cancelar.addEventListener('click', () => {
      fluxoAConfirmarExclusao = null
      renderizar()
    })
    topo.append(confirmar, cancelar)
  } else {
    const excluir = criarBotaoIcone(trashIconSvg, `Excluir o fluxo ${fluxo.nome}`)
    excluir.addEventListener('click', () => {
      fluxoAConfirmarExclusao = fluxo.id
      renderizar()
    })
    topo.append(excluir)
  }
  cartao.append(topo)

  const passos = criarElemento('ol', 'passos')
  fluxo.passos.forEach((passo, indice) => {
    const item = criarElemento('li', 'passo')
    const numero = criarElemento('span', 'passo-numero', String(indice + 1))
    const campo = criarElemento('textarea')
    campo.rows = 2
    campo.value = passo.instrucao
    campo.placeholder = 'Instrução enviada ao agente neste passo'
    campo.setAttribute('aria-label', `Instrução do passo ${indice + 1}`)
    campo.addEventListener('change', () => {
      atualizarFluxo(fluxo.id, (f) => ({ ...f, passos: f.passos.map((p, j) => (j === indice ? { instrucao: campo.value } : p)) }))
      salvarComLog()
    })

    const acoes = criarElemento('div', 'passo-acoes')
    const mover = (destino: number): void => {
      atualizarFluxo(fluxo.id, (f) => {
        const novos = [...f.passos]
        ;[novos[indice], novos[destino]] = [novos[destino], novos[indice]]
        return { ...f, passos: novos }
      })
      renderizar()
      salvarComLog()
    }
    const subir = criarBotaoIcone(chevronUpIconSvg, `Mover passo ${indice + 1} pra cima`)
    subir.disabled = indice === 0
    subir.addEventListener('click', () => mover(indice - 1))
    const descer = criarBotaoIcone(chevronDownIconSvg, `Mover passo ${indice + 1} pra baixo`)
    descer.disabled = indice === fluxo.passos.length - 1
    descer.addEventListener('click', () => mover(indice + 1))
    const remover = criarBotaoIcone(trashIconSvg, `Remover passo ${indice + 1}`)
    remover.addEventListener('click', () => {
      atualizarFluxo(fluxo.id, (f) => ({ ...f, passos: f.passos.filter((_, j) => j !== indice) }))
      renderizar()
      salvarComLog()
    })
    acoes.append(subir, descer, remover)

    item.append(numero, campo, acoes)
    passos.append(item)
  })
  if (fluxo.passos.length === 0) passos.append(criarElemento('li', 'vazio', 'Nenhum passo ainda.'))
  cartao.append(passos)

  const adicionarPasso = criarBotao('Adicionar passo', { variante: 'fantasma', icone: plusIconSvg })
  adicionarPasso.addEventListener('click', () => {
    atualizarFluxo(fluxo.id, (f) => ({ ...f, passos: [...f.passos, { instrucao: '' }] }))
    renderizar()
    salvarComLog()
    const campos = document.querySelectorAll<HTMLTextAreaElement>(`[data-fluxo="${fluxo.id}"] textarea`)
    campos[campos.length - 1]?.focus()
  })
  cartao.append(adicionarPasso)
  cartao.dataset.fluxo = fluxo.id
  return cartao
}

function renderizar(): void {
  const container = document.getElementById('conteudo')
  if (!container) return
  container.replaceChildren()
  const lista = criarElemento('div')
  lista.style.display = 'flex'
  lista.style.flexDirection = 'column'
  lista.style.gap = '16px'
  fluxos.forEach((fluxo) => lista.append(montarFluxo(fluxo)))
  if (fluxos.length === 0) lista.append(criarElemento('p', 'vazio', 'Nenhum fluxo criado ainda.'))

  const novo = criarBotao('Novo fluxo', { variante: 'primario', icone: plusIconSvg })
  novo.addEventListener('click', () => {
    fluxos = [...fluxos, { id: crypto.randomUUID(), nome: 'Novo fluxo', passos: [{ instrucao: '' }] }]
    renderizar()
    salvarComLog()
  })
  container.append(lista, criarElemento('br'), novo)
}

async function iniciar(): Promise<void> {
  fluxos = lerAgenteIAConfig(await store.get()).fluxos
  renderizar()
}

iniciar().catch((error) => console.error('[SEIRMG] Falha ao iniciar Estúdio de Fluxos:', error))
