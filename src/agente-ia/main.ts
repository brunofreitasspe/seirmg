// Página do Agente de IA: orquestra o loop de tool use (decisões em features/agente-ia/*, aqui só
// DOM e chamadas). A chave da API nunca vai pro console nem pra mensagens de erro.
import sendIconSvg from 'lucide-static/icons/send.svg?raw'
import sparklesIconSvg from 'lucide-static/icons/sparkles.svg?raw'
import settingsIconSvg from 'lucide-static/icons/settings.svg?raw'
import workflowIconSvg from 'lucide-static/icons/workflow.svg?raw'
import messageSquarePlusIconSvg from 'lucide-static/icons/message-square-plus.svg?raw'
import loaderIconSvg from 'lucide-static/icons/loader-circle.svg?raw'
import shieldAlertIconSvg from 'lucide-static/icons/shield-alert.svg?raw'
import undoIconSvg from 'lucide-static/icons/undo-2.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import trashIconSvg from 'lucide-static/icons/trash-2.svg?raw'
import playIconSvg from 'lucide-static/icons/play.svg?raw'
import infoIconSvg from 'lucide-static/icons/info.svg?raw'
import {
  createLocalConfigStore,
  createSyncConfigStore,
  lerAgenteIAConfig,
  type AgenteIAConfig,
  type FluxoAgenteIA,
  type SkillAgenteIA,
  type UsoModeloAgenteIA,
} from '../lib/storage'
import { listarFerramentasAgente, executarFerramenta, type ContextoFerramenta } from '../features/agente-ia/tools'
import { montarRequisicaoAgente, extrairBlocos, explicarErroApi, type MensagemAgente } from '../features/agente-ia/mensagens'
import {
  decidirProximoPasso,
  historicoAposParada,
  montarMensagemResultados,
  textoDaResposta,
  type ChamadaFerramenta,
  type ResultadoChamada,
} from '../features/agente-ia/loop'
import { encontrarSkillAtiva, ferramentasPermitidasParaSkill } from '../features/agente-ia/skills'
import { acumularUso, custoTotalUsd } from '../features/agente-ia/custo'
import { registrarAcaoParaDesfazer, consumirAcaoParaDesfazer, reverterAcao } from '../features/agente-ia/desfazer'
import { proximoPasso } from '../features/agente-ia/fluxos'
import { criarBotao, criarBotaoIcone, criarElemento, criarIcone } from './ui'

const syncStore = createSyncConfigStore()
const localStore = createLocalConfigStore()
const contextoFerramenta: ContextoFerramenta = { syncStore, localStore }

// Resposta com raciocínio pode passar de 1 min; o relay limita a 5 min.
const TIMEOUT_CHAMADA_MS = 240_000
// Teto de idas e voltas com a API por mensagem do usuário -- evita loop infinito de ferramentas.
const MAX_RODADAS_POR_MENSAGEM = 10

let historico: MensagemAgente[] = []
let ocupado = false
let fluxoAtivo: { fluxo: FluxoAgenteIA; proximoIndice: number } | null = null

const elementos = {
  conversa: document.getElementById('conversa') as HTMLDivElement,
  aprovacao: document.getElementById('aprovacao-pendente') as HTMLDivElement,
  fluxoBarra: document.getElementById('fluxo-em-andamento') as HTMLDivElement,
  form: document.getElementById('form-mensagem') as HTMLFormElement,
  campo: document.getElementById('campo-mensagem') as HTMLTextAreaElement,
  enviar: document.getElementById('botao-enviar') as HTMLButtonElement,
  seletorSkill: document.getElementById('seletor-skill') as HTMLSelectElement,
  seletorFluxo: document.getElementById('seletor-fluxo') as HTMLSelectElement,
  custo: document.getElementById('custo-acumulado') as HTMLSpanElement,
  listaFerramentas: document.getElementById('lista-ferramentas') as HTMLUListElement,
  listaDesfazer: document.getElementById('lista-desfazer') as HTMLUListElement,
  dialogoSkills: document.getElementById('dialogo-skills') as HTMLDialogElement,
  corpoDialogoSkills: document.getElementById('corpo-dialogo-skills') as HTMLDivElement,
}

async function lerConfig(): Promise<AgenteIAConfig> {
  return lerAgenteIAConfig(await syncStore.get())
}

// ------------------------------------------------------------------------------------- conversa

function rolarParaFim(): void {
  elementos.conversa.scrollTop = elementos.conversa.scrollHeight
}

function adicionarBolha(tipo: 'usuario' | 'agente' | 'erro' | 'sistema', texto: string, icone?: string): void {
  elementos.conversa.querySelector('.boas-vindas')?.remove()
  const bolha = criarElemento('div', `bolha bolha-${tipo}`)
  if (icone) bolha.append(criarIcone(icone))
  bolha.append(texto)
  elementos.conversa.append(bolha)
  rolarParaFim()
}

function mostrarBoasVindas(config: AgenteIAConfig): void {
  const caixa = criarElemento('div', 'boas-vindas')
  caixa.append(
    criarIcone(sparklesIconSvg),
    criarElemento('h2', undefined, 'Como posso ajudar?'),
    criarElemento(
      'p',
      undefined,
      'Converse com o agente sobre seus processos. Ações que alteram alguma coisa sempre pedem sua aprovação antes, e podem ser desfeitas no painel ao lado.'
    )
  )
  if (!config.apiKey) {
    const aviso = criarElemento('div', 'aviso')
    aviso.append(criarIcone(shieldAlertIconSvg), criarElemento('span', undefined, 'Falta a chave de API da Anthropic. Cadastre em Opções › Agente de IA.'))
    const abrir = criarBotao('Abrir Opções', { icone: settingsIconSvg })
    abrir.addEventListener('click', () => chrome.runtime.openOptionsPage())
    caixa.append(aviso, criarElemento('br'), abrir)
  }
  elementos.conversa.replaceChildren(caixa)
}

function definirOcupado(valor: boolean): void {
  ocupado = valor
  elementos.enviar.disabled = valor
  elementos.campo.disabled = valor
  elementos.seletorSkill.disabled = valor
  elementos.seletorFluxo.disabled = valor
  elementos.conversa.querySelector('.digitando')?.remove()
  if (valor) {
    const digitando = criarElemento('div', 'digitando')
    digitando.append(criarIcone(loaderIconSvg, 'icone girando'), 'O agente está pensando…')
    elementos.conversa.append(digitando)
    rolarParaFim()
  } else {
    elementos.campo.focus()
  }
}

// ------------------------------------------------------------------------------------- API

async function chamarApi(requisicao: ReturnType<typeof montarRequisicaoAgente>): Promise<string> {
  const resposta = (await chrome.runtime.sendMessage({
    type: 'seirmg:fetch-ia',
    url: requisicao.url,
    method: requisicao.method,
    headers: requisicao.headers,
    body: requisicao.body,
    timeoutMs: TIMEOUT_CHAMADA_MS,
  })) as { ok: boolean; data?: string; error?: string } | undefined
  if (!resposta?.ok || resposta.data === undefined) throw new Error(explicarErroApi(resposta?.error ?? 'sem resposta'))
  return resposta.data
}

async function registrarUso(modelo: string, uso: UsoModeloAgenteIA): Promise<void> {
  const local = await localStore.get()
  await localStore.set({ ...local, agenteIAUsoAcumulado: acumularUso(local.agenteIAUsoAcumulado ?? { porModelo: {} }, modelo, uso) })
  await atualizarCusto()
}

async function atualizarCusto(): Promise<void> {
  const local = await localStore.get()
  const total = custoTotalUsd(local.agenteIAUsoAcumulado ?? { porModelo: {} })
  elementos.custo.textContent = `US$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} gastos`
}

// ------------------------------------------------------------------------------------- ferramentas

function resumirEntrada(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  return Object.entries(input as Record<string, unknown>)
    .map(([chave, valor]) => `${chave}: ${typeof valor === 'string' ? valor : JSON.stringify(valor)}`)
    .join(', ')
}

function nomeFerramenta(id: string): string {
  return listarFerramentasAgente().find((f) => f.id === id)?.nome ?? id
}

async function executarChamada(chamada: ChamadaFerramenta): Promise<ResultadoChamada> {
  if (!chamada.conhecida) {
    return { id: chamada.id, conteudo: `A ferramenta "${chamada.name}" não está disponível nesta skill.`, erro: true }
  }
  try {
    const resultado = await executarFerramenta(chamada.name, chamada.input, contextoFerramenta)
    if (chamada.escrita) await registrarParaDesfazer(chamada, resultado)
    return { id: chamada.id, conteudo: JSON.stringify(resultado) }
  } catch (error) {
    return { id: chamada.id, conteudo: error instanceof Error ? error.message : String(error), erro: true }
  }
}

async function registrarParaDesfazer(chamada: ChamadaFerramenta, resultado: unknown): Promise<void> {
  const descricao = `${nomeFerramenta(chamada.name)} — ${resumirEntrada(chamada.input)}`
  adicionarBolha('sistema', `Executado: ${descricao}`, checkIconSvg)
  const local = await localStore.get()
  await localStore.set({
    ...local,
    agenteIAHistoricoDesfazer: registrarAcaoParaDesfazer(
      local.agenteIAHistoricoDesfazer ?? [],
      { descricao, ferramenta: chamada.name, estadoAnterior: resultado },
      new Date().toISOString()
    ),
  })
  await renderizarDesfazer()
}

// Mostra cada chamada de escrita do turno com Aprovar/Recusar; resolve quando todas foram decididas.
function pedirAprovacao(chamadas: ChamadaFerramenta[]): Promise<Map<string, boolean>> {
  const deEscrita = chamadas.filter((chamada) => chamada.escrita)
  const decisoes = new Map<string, boolean>()
  elementos.conversa.querySelector('.digitando')?.remove()

  return new Promise((resolve) => {
    const painel = elementos.aprovacao
    painel.replaceChildren()
    const titulo = criarElemento('h3')
    titulo.append(criarIcone(shieldAlertIconSvg), deEscrita.length === 1 ? 'O agente quer fazer uma alteração' : `O agente quer fazer ${deEscrita.length} alterações`)
    painel.append(titulo)

    const concluirSeTerminou = (): void => {
      if (decisoes.size < deEscrita.length) return
      painel.hidden = true
      painel.replaceChildren()
      resolve(decisoes)
    }

    deEscrita.forEach((chamada) => {
      const item = criarElemento('div', 'aprovacao-item')
      const descricao = criarElemento('div', 'descricao')
      descricao.append(criarElemento('strong', undefined, nomeFerramenta(chamada.name)), ' ', criarElemento('code', undefined, resumirEntrada(chamada.input) || 'sem parâmetros'))
      const aprovar = criarBotao('Aprovar', { variante: 'primario', icone: checkIconSvg })
      const recusar = criarBotao('Recusar', { icone: xIconSvg })
      const decidir = (aprovada: boolean): void => {
        decisoes.set(chamada.id, aprovada)
        aprovar.remove()
        recusar.remove()
        item.append(criarElemento('span', 'decidido', aprovada ? 'Aprovada' : 'Recusada'))
        concluirSeTerminou()
      }
      aprovar.addEventListener('click', () => decidir(true))
      recusar.addEventListener('click', () => decidir(false))
      item.append(descricao, aprovar, recusar)
      painel.append(item)
    })

    if (deEscrita.length > 1) {
      const todas = criarBotao('Aprovar todas', { variante: 'fantasma', icone: checkIconSvg })
      todas.addEventListener('click', () => {
        painel.querySelectorAll<HTMLButtonElement>('.aprovacao-item .btn-primario').forEach((botao) => botao.click())
      })
      painel.append(todas)
    }
    painel.hidden = false
    painel.querySelector<HTMLButtonElement>('.btn-primario')?.focus()
  })
}

// ------------------------------------------------------------------------------------- loop

async function rodarAgente(tamanhoAntesDaMensagem: number): Promise<void> {
  for (let rodada = 0; rodada < MAX_RODADAS_POR_MENSAGEM; rodada++) {
    const config = await lerConfig()
    const skill = encontrarSkillAtiva(config.skills, config.skillAtivaId)
    const ferramentas = ferramentasPermitidasParaSkill(skill, listarFerramentasAgente())

    const requisicao = montarRequisicaoAgente({
      apiKey: config.apiKey,
      modelo: config.modelo,
      systemPrompt: skill.systemPrompt,
      ferramentas,
      mensagens: historico,
    })
    const extraida = extrairBlocos(await chamarApi(requisicao))
    await registrarUso(extraida.modelo ?? config.modelo, extraida.uso)

    historico = [...historico, { role: 'assistant', content: extraida.blocos }]
    const texto = textoDaResposta(extraida.blocos).trim()
    if (texto) adicionarBolha('agente', texto)
    if (extraida.modelo && extraida.modelo !== config.modelo) {
      adicionarBolha('sistema', `Respondido por ${extraida.modelo} (o modelo escolhido recusou e a API redirecionou).`, infoIconSvg)
    }

    const decisao = decidirProximoPasso(extraida, ferramentas)
    if (decisao.tipo === 'fim') return
    if (decisao.tipo === 'continuar') continue
    if (decisao.tipo === 'parar') {
      historico = historicoAposParada(historico, tamanhoAntesDaMensagem, extraida.stopReason)
      adicionarBolha('erro', decisao.motivo)
      return
    }

    const aprovacoes = decisao.tipo === 'pedir_aprovacao' ? await pedirAprovacao(decisao.chamadas) : new Map<string, boolean>()
    const resultados: ResultadoChamada[] = []
    for (const chamada of decisao.chamadas) {
      if (chamada.escrita && !aprovacoes.get(chamada.id)) {
        resultados.push({ id: chamada.id, conteudo: 'O usuário recusou executar esta ação.', erro: true })
        continue
      }
      resultados.push(await executarChamada(chamada))
    }
    historico = [...historico, montarMensagemResultados(resultados)]
    definirOcupado(true)
  }
  adicionarBolha('erro', `O agente fez ${MAX_RODADAS_POR_MENSAGEM} rodadas seguidas sem concluir e foi interrompido.`)
}

async function enviarMensagem(texto: string): Promise<void> {
  if (ocupado || !texto.trim()) return
  const config = await lerConfig()
  if (!config.apiKey) {
    adicionarBolha('erro', 'Cadastre a chave de API da Anthropic em Opções › Agente de IA antes de conversar.')
    return
  }
  adicionarBolha('usuario', texto.trim())
  const tamanhoAntes = historico.length
  historico = [...historico, { role: 'user', content: [{ type: 'text', text: texto.trim() }] }]
  definirOcupado(true)
  renderizarFluxo()
  try {
    await rodarAgente(tamanhoAntes)
  } catch (error) {
    // Falha no meio: volta o histórico pro ponto antes desta mensagem, pra conversa seguir válida.
    historico = historico.slice(0, tamanhoAntes)
    adicionarBolha('erro', error instanceof Error ? error.message : 'Algo deu errado ao falar com o agente.')
    console.error('[SEIRMG] Falha no turno do Agente de IA:', error instanceof Error ? error.message : error)
  } finally {
    elementos.aprovacao.hidden = true
    definirOcupado(false)
    renderizarFluxo()
  }
}

// ------------------------------------------------------------------------------------- fluxos

function renderizarFluxo(): void {
  const barra = elementos.fluxoBarra
  barra.replaceChildren()
  if (!fluxoAtivo) {
    barra.hidden = true
    return
  }
  const proximo = proximoPasso(fluxoAtivo.fluxo, fluxoAtivo.proximoIndice)
  barra.hidden = false
  barra.append(criarIcone(workflowIconSvg))
  if (!proximo) {
    barra.append(criarElemento('span', undefined, `Fluxo "${fluxoAtivo.fluxo.nome}" concluído.`))
    const fechar = criarBotaoIcone(xIconSvg, 'Fechar')
    fechar.addEventListener('click', () => {
      fluxoAtivo = null
      renderizarFluxo()
    })
    barra.append(fechar)
    return
  }
  const total = fluxoAtivo.fluxo.passos.filter((passo) => passo.instrucao.trim()).length
  const feitos = fluxoAtivo.fluxo.passos.slice(0, proximo.indice).filter((passo) => passo.instrucao.trim()).length
  barra.append(criarElemento('span', undefined, `Fluxo "${fluxoAtivo.fluxo.nome}" — revise a resposta e siga pro passo ${feitos + 1} de ${total}.`))
  const seguir = criarBotao(proximo.ultimo ? 'Rodar último passo' : 'Próximo passo', { variante: 'primario', icone: playIconSvg })
  seguir.disabled = ocupado
  seguir.addEventListener('click', () => {
    if (!fluxoAtivo) return
    fluxoAtivo = { ...fluxoAtivo, proximoIndice: proximo.indice + 1 }
    enviarMensagem(proximo.instrucao).catch(() => undefined)
  })
  const parar = criarBotao('Parar fluxo', { icone: xIconSvg })
  parar.addEventListener('click', () => {
    fluxoAtivo = null
    renderizarFluxo()
  })
  barra.append(seguir, parar)
}

function iniciarFluxo(fluxo: FluxoAgenteIA): void {
  const primeiro = proximoPasso(fluxo, 0)
  if (!primeiro) {
    adicionarBolha('erro', `O fluxo "${fluxo.nome}" não tem passos preenchidos. Edite no Estúdio de Fluxos.`)
    return
  }
  fluxoAtivo = { fluxo, proximoIndice: primeiro.indice + 1 }
  adicionarBolha('sistema', `Iniciando o fluxo "${fluxo.nome}".`, workflowIconSvg)
  enviarMensagem(primeiro.instrucao).catch(() => undefined)
}

// ------------------------------------------------------------------------------------- painéis

async function renderizarSeletores(): Promise<void> {
  const config = await lerConfig()
  const skillAtiva = encontrarSkillAtiva(config.skills, config.skillAtivaId)
  elementos.seletorSkill.replaceChildren(...config.skills.map((skill) => new Option(skill.nome, skill.id, false, skill.id === skillAtiva.id)))

  elementos.seletorFluxo.replaceChildren(new Option(config.fluxos.length ? 'Rodar fluxo…' : 'Nenhum fluxo criado', ''))
  config.fluxos.forEach((fluxo) => elementos.seletorFluxo.add(new Option(fluxo.nome, fluxo.id)))

  elementos.listaFerramentas.replaceChildren()
  const ferramentas = ferramentasPermitidasParaSkill(skillAtiva, listarFerramentasAgente())
  ferramentas.forEach((ferramenta) => {
    const item = criarElemento('li')
    item.append(criarElemento('span', undefined, ferramenta.nome))
    if (ferramenta.escrita) item.append(criarElemento('span', 'tag-escrita', 'pede aprovação'))
    elementos.listaFerramentas.append(item)
  })
  if (ferramentas.length === 0) {
    elementos.listaFerramentas.append(criarElemento('li', 'vazio', 'Nenhuma: esta skill só conversa. Libere ferramentas em "Editar skills".'))
  }
}

async function renderizarDesfazer(): Promise<void> {
  const local = await localStore.get()
  const historicoDesfazer = local.agenteIAHistoricoDesfazer ?? []
  elementos.listaDesfazer.replaceChildren()
  if (historicoDesfazer.length === 0) {
    elementos.listaDesfazer.append(criarElemento('li', 'vazio', 'Nenhuma alteração feita pelo agente.'))
    return
  }
  historicoDesfazer.forEach((acao) => {
    const item = criarElemento('li')
    const texto = criarElemento('span', undefined, acao.descricao)
    texto.title = `${acao.descricao} — ${new Date(acao.criadoEm).toLocaleString('pt-BR')}`
    const desfazer = criarBotaoIcone(undoIconSvg, `Desfazer: ${acao.descricao}`)
    desfazer.addEventListener('click', async () => {
      try {
        const atual = await localStore.get()
        const consumido = consumirAcaoParaDesfazer(atual.agenteIAHistoricoDesfazer ?? [], acao.id)
        if (!consumido.acao) return
        await reverterAcao(consumido.acao, contextoFerramenta)
        await localStore.set({ ...atual, agenteIAHistoricoDesfazer: consumido.historico })
        adicionarBolha('sistema', `Desfeito: ${acao.descricao}`, undoIconSvg)
        await renderizarDesfazer()
      } catch (error) {
        adicionarBolha('erro', `Não foi possível desfazer: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
    item.append(texto, desfazer)
    elementos.listaDesfazer.append(item)
  })
}

// ------------------------------------------------------------------------------------- editor de skills

let skillsEmEdicao: SkillAgenteIA[] = []

function renderizarEditorSkills(): void {
  const corpo = elementos.corpoDialogoSkills
  corpo.replaceChildren()
  const ferramentas = listarFerramentasAgente()
  skillsEmEdicao.forEach((skill, indice) => {
    const caixa = criarElemento('div', 'skill-editor')
    const topo = criarElemento('div', 'skill-editor-topo')
    const nome = criarElemento('input')
    nome.type = 'text'
    nome.value = skill.nome
    nome.setAttribute('aria-label', 'Nome da skill')
    nome.addEventListener('input', () => (skillsEmEdicao[indice] = { ...skillsEmEdicao[indice], nome: nome.value }))
    topo.append(nome)
    if (skillsEmEdicao.length > 1) {
      const remover = criarBotaoIcone(trashIconSvg, `Remover a skill ${skill.nome}`)
      remover.addEventListener('click', () => {
        skillsEmEdicao = skillsEmEdicao.filter((_, i) => i !== indice)
        renderizarEditorSkills()
      })
      topo.append(remover)
    }

    const rotuloPrompt = criarElemento('label', 'rotulo', 'Instruções (system prompt)')
    const prompt = criarElemento('textarea')
    prompt.rows = 4
    prompt.value = skill.systemPrompt
    prompt.addEventListener('input', () => (skillsEmEdicao[indice] = { ...skillsEmEdicao[indice], systemPrompt: prompt.value }))
    rotuloPrompt.append(prompt)

    const checks = criarElemento('div', 'checks')
    checks.append(criarElemento('span', 'rotulo', 'Ferramentas liberadas'))
    ferramentas.forEach((ferramenta) => {
      const linha = criarElemento('label')
      const caixaMarcar = criarElemento('input')
      caixaMarcar.type = 'checkbox'
      caixaMarcar.checked = skill.ferramentasPermitidas.includes(ferramenta.id)
      caixaMarcar.addEventListener('change', () => {
        const atuais = new Set(skillsEmEdicao[indice].ferramentasPermitidas)
        if (caixaMarcar.checked) atuais.add(ferramenta.id)
        else atuais.delete(ferramenta.id)
        skillsEmEdicao[indice] = { ...skillsEmEdicao[indice], ferramentasPermitidas: [...atuais] }
      })
      linha.append(caixaMarcar, ferramenta.nome)
      if (ferramenta.escrita) linha.append(criarElemento('span', 'tag-escrita', 'pede aprovação'))
      checks.append(linha)
    })

    caixa.append(topo, rotuloPrompt, checks)
    corpo.append(caixa)
  })
}

async function abrirEditorSkills(): Promise<void> {
  skillsEmEdicao = structuredClone((await lerConfig()).skills)
  renderizarEditorSkills()
  elementos.dialogoSkills.showModal()
}

async function salvarSkills(): Promise<void> {
  const validas = skillsEmEdicao.map((skill) => ({ ...skill, nome: skill.nome.trim() || 'Skill sem nome' }))
  const atual = await syncStore.get()
  const agenteIA = lerAgenteIAConfig(atual)
  const skillAtivaId = validas.some((skill) => skill.id === agenteIA.skillAtivaId) ? agenteIA.skillAtivaId : validas[0].id
  await syncStore.set({ ...atual, agenteIA: { ...agenteIA, skills: validas, skillAtivaId } })
  elementos.dialogoSkills.close()
  await renderizarSeletores()
}

// ------------------------------------------------------------------------------------- eventos

function ligarEventos(): void {
  elementos.form.addEventListener('submit', (evento) => {
    evento.preventDefault()
    const texto = elementos.campo.value
    elementos.campo.value = ''
    enviarMensagem(texto).catch(() => undefined)
  })
  elementos.campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault()
      elementos.form.requestSubmit()
    }
  })
  elementos.campo.addEventListener('input', () => {
    elementos.campo.style.height = 'auto'
    elementos.campo.style.height = `${elementos.campo.scrollHeight}px`
  })

  elementos.seletorSkill.addEventListener('change', async () => {
    const atual = await syncStore.get()
    await syncStore.set({ ...atual, agenteIA: { ...lerAgenteIAConfig(atual), skillAtivaId: elementos.seletorSkill.value } })
    await renderizarSeletores()
  })
  elementos.seletorFluxo.addEventListener('change', async () => {
    const id = elementos.seletorFluxo.value
    elementos.seletorFluxo.value = ''
    const fluxo = (await lerConfig()).fluxos.find((f) => f.id === id)
    if (fluxo) iniciarFluxo(fluxo)
  })

  document.getElementById('nova-conversa')?.addEventListener('click', async () => {
    if (ocupado) return
    historico = []
    fluxoAtivo = null
    renderizarFluxo()
    mostrarBoasVindas(await lerConfig())
  })
  document.getElementById('editar-skills')?.addEventListener('click', () => {
    abrirEditorSkills().catch((error) => console.error('[SEIRMG] Falha ao abrir editor de skills:', error))
  })
  document.getElementById('nova-skill')?.addEventListener('click', () => {
    skillsEmEdicao = [...skillsEmEdicao, { id: crypto.randomUUID(), nome: 'Nova skill', systemPrompt: '', ferramentasPermitidas: [] }]
    renderizarEditorSkills()
  })
  document.getElementById('cancelar-skills')?.addEventListener('click', () => elementos.dialogoSkills.close())
  document.getElementById('salvar-skills')?.addEventListener('click', () => {
    salvarSkills().catch((error) => console.error('[SEIRMG] Falha ao salvar skills:', error))
  })
  document.getElementById('abrir-opcoes')?.addEventListener('click', () => chrome.runtime.openOptionsPage())

  // Fluxos e skills editados no Estúdio (outra aba) aparecem aqui sem recarregar.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'sync' && 'config' in mudancas) renderizarSeletores().catch(() => undefined)
  })
}

async function iniciar(): Promise<void> {
  const botaoEnviar = elementos.enviar
  botaoEnviar.append(criarIcone(sendIconSvg), 'Enviar')
  document.getElementById('link-estudio')?.append(criarIcone(workflowIconSvg), 'Estúdio de Fluxos')
  document.getElementById('abrir-opcoes')?.append(criarIcone(settingsIconSvg), 'Opções')
  document.getElementById('nova-conversa')?.append(criarIcone(messageSquarePlusIconSvg), 'Nova conversa')

  ligarEventos()
  const config = await lerConfig()
  mostrarBoasVindas(config)
  await Promise.all([renderizarSeletores(), renderizarDesfazer(), atualizarCusto()])
  elementos.campo.focus()
}

iniciar().catch((error) => console.error('[SEIRMG] Falha ao iniciar o Agente de IA:', error))
