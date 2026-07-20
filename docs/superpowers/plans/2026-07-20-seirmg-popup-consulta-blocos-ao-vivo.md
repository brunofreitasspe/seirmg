# Popup consulta blocos de assinatura ao abrir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O popup consulta ao vivo, quando aberto, quantos blocos de assinatura estão disponibilizados pra unidade atual — em vez de mostrar um valor que só atualiza quando o usuário visita a tela de conteúdo de um bloco específico (podendo ficar bem desatualizado).

**Architecture:** Popups não conseguem montar sozinhos uma URL válida do SEI (falta o `infra_hash`, que só existe em HTML de uma página do SEI já carregada). Um novo listener de mensagem no content script `core/index.ts` (roda em toda página do SEI) faz a consulta de verdade — acha o link de Bloco de Assinatura já presente no menu da própria página, busca a listagem, conta blocos disponibilizados — e o popup manda a mensagem via `chrome.tabs.sendMessage` pra uma aba do SEI já aberta.

**Tech Stack:** TypeScript, Vite.

## Global Constraints

- Nenhum alarme/timer novo — a consulta só acontece quando o usuário abre o popup (ação explícita).
- Uma única requisição de rede (a listagem de blocos) — nunca entra em blocos individuais.
- Se não der pra consultar (sem aba do SEI aberta, falha de rede, etc.), mostra um estado neutro — nunca mistura com `LocalConfig.blocoAssinaturaPendenteAtual` (unidade diferente: documentos, não blocos).
- `badge.ts` (indicador nativo perto da logo do SEI) não muda — continua usando `blocoAssinaturaPendenteAtual` como já fazia, fora de escopo aqui.

---

### Task 1: Listener de consulta no content script `core`

**Files:**
- Modify: `src/content-scripts/core/index.ts`

**Interfaces:**
- Consumes: `fetchText` (`../../lib/fetchViaBackground`), `parseListaBlocosAssinatura` (`../../features/bloco-assinatura/parser`, já existe).
- Produces: responde à mensagem `{ type: 'seirmg:consultar-blocos-disponibilizados' }` com `{ ok: true, total: number } | { ok: false, error: string }`. Consumida pela Task 2 (popup).

- [ ] **Step 1: Adicionar os imports**

Em `src/content-scripts/core/index.ts`, adicionar ao topo (junto dos imports existentes):

```ts
import { fetchText } from '../../lib/fetchViaBackground'
import { parseListaBlocosAssinatura } from '../../features/bloco-assinatura/parser'
```

- [ ] **Step 2: Adicionar a função de consulta e o listener**

Adicionar antes de `bootstrap()`:

```ts
interface RespostaBlocosDisponibilizados {
  ok: boolean
  total?: number
  error?: string
}

async function consultarBlocosDisponibilizados(): Promise<RespostaBlocosDisponibilizados> {
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href^="controlador.php?acao=bloco_assinatura_listar"]'
  )
  if (!link) return { ok: false, error: 'Link de Bloco de Assinatura não encontrado nessa página' }

  const resultado = await fetchText(link.href)
  if (!resultado.ok) return { ok: false, error: resultado.error }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const blocos = parseListaBlocosAssinatura(doc)
  const total = blocos.filter((bloco) => bloco.estado === 'disponibilizado_para_area').length
  return { ok: true, total }
}

function ehMensagemConsultarBlocos(
  mensagem: unknown
): mensagem is { type: 'seirmg:consultar-blocos-disponibilizados' } {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:consultar-blocos-disponibilizados'
  )
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemConsultarBlocos(mensagem)) return false
  consultarBlocosDisponibilizados()
    .then(responder)
    .catch((error) => {
      console.error('[SEIRMG] Falha ao consultar blocos de assinatura disponibilizados:', error)
      responder({ ok: false, error: String(error) })
    })
  return true
})
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit` (a partir de `C:\sei\seirmg`)
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS, sem regressão (este arquivo não tem teste próprio).

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/core/index.ts
git commit -m "feat: content script core responde consulta de blocos de assinatura disponibilizados"
```

---

### Task 2: Popup consulta ao vivo e mostra o novo estado "indisponível"

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/main.ts`

**Interfaces:**
- Consumes: mensagem `seirmg:consultar-blocos-disponibilizados` (Task 1), `chrome.tabs.query`/`chrome.tabs.sendMessage` (permissão `tabs` já concedida no manifest).
- Produces: nenhuma interface nova.

- [ ] **Step 1: Adicionar o CSS do estado "indisponível" em `src/popup/index.html`**

Substituir:

```css
      .status { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--ok-soft); }
      .status.pendente { background: var(--warn-soft); }
      .status-icone { flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; display: flex; align-items: center; justify-content: center; background: var(--ok); color: white; }
      .status.pendente .status-icone { background: var(--warn); }
```

por:

```css
      .status { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--ok-soft); }
      .status.pendente { background: var(--warn-soft); }
      .status.indisponivel { background: var(--bg-subtle); }
      .status-icone { flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; display: flex; align-items: center; justify-content: center; background: var(--ok); color: white; }
      .status.pendente .status-icone { background: var(--warn); }
      .status.indisponivel .status-icone { background: var(--text-muted); }
```

- [ ] **Step 2: Substituir `src/popup/main.ts` inteiro**

```ts
import { createLocalConfigStore, type HistoricoProcessoEntry } from '../lib/storage'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import alertIconSvg from 'lucide-static/icons/triangle-alert.svg?raw'
import infoIconSvg from 'lucide-static/icons/info.svg?raw'
import externalLinkIconSvg from 'lucide-static/icons/external-link.svg?raw'
import settingsIconSvg from 'lucide-static/icons/settings.svg?raw'

function montarItemHistorico(entrada: HistoricoProcessoEntry, baseUrlSei: string): HTMLAnchorElement {
  const item = document.createElement('a')
  item.className = 'item-recente'
  item.target = '_blank'
  item.rel = 'noopener'
  item.href = `${baseUrlSei}/controlador.php?acao=procedimento_trabalhar&id_procedimento=${entrada.idProcedimento}`

  const marcador = document.createElement('span')
  marcador.className = 'item-marcador'

  const texto = document.createElement('span')
  texto.className = 'item-texto'
  const numero = document.createElement('span')
  numero.className = 'item-numero'
  numero.textContent = entrada.numero
  const tipo = document.createElement('span')
  tipo.className = 'item-tipo'
  tipo.textContent = entrada.tipo
  texto.append(numero, tipo)

  const seta = document.createElement('span')
  seta.className = 'item-seta'
  seta.innerHTML = externalLinkIconSvg

  item.append(marcador, texto, seta)
  return item
}

type ConsultaBlocos = { ok: true; total: number } | { ok: false }

async function consultarBlocosAoVivo(baseUrlSei: string | undefined): Promise<ConsultaBlocos> {
  if (!baseUrlSei) return { ok: false }
  try {
    const [aba] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
    if (!aba?.id) return { ok: false }
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      type: 'seirmg:consultar-blocos-disponibilizados',
    })
    if (!resposta?.ok || typeof resposta.total !== 'number') return { ok: false }
    return { ok: true, total: resposta.total }
  } catch (error) {
    console.error('[SEIRMG] Falha ao consultar blocos de assinatura ao vivo:', error)
    return { ok: false }
  }
}

function renderizarStatus(consulta: ConsultaBlocos): void {
  const status = document.getElementById('status')
  const statusIcone = document.getElementById('status-icone')
  const statusTitulo = document.getElementById('status-titulo')
  const statusSub = document.getElementById('status-sub')

  status?.classList.remove('pendente', 'indisponivel')
  statusTitulo?.classList.remove('pendente-cor')

  if (!consulta.ok) {
    status?.classList.add('indisponivel')
    if (statusIcone) statusIcone.innerHTML = infoIconSvg
    if (statusTitulo) statusTitulo.textContent = 'Status indisponível'
    if (statusSub) statusSub.textContent = 'Abra o SEI numa aba pra ver o status do bloco de assinatura'
    return
  }

  const pendente = consulta.total > 0
  status?.classList.toggle('pendente', pendente)
  if (statusIcone) statusIcone.innerHTML = pendente ? alertIconSvg : checkIconSvg
  if (statusTitulo) {
    statusTitulo.textContent = pendente ? 'Pendências encontradas' : 'Tudo em dia'
    statusTitulo.classList.toggle('pendente-cor', pendente)
  }
  if (statusSub) {
    statusSub.textContent = pendente
      ? `${consulta.total} bloco(s) disponibilizado(s) pra sua área`
      : 'Nenhum bloco disponibilizado pra sua área'
  }
}

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()

    const consulta = await consultarBlocosAoVivo(localConfig.baseUrlSei)
    renderizarStatus(consulta)

    const historico = localConfig.historicoProcessosVisitados ?? []
    const baseUrlSei = localConfig.baseUrlSei
    const secaoHistorico = document.getElementById('historico')
    const listaRecentes = document.getElementById('lista-recentes')
    if (secaoHistorico && listaRecentes && historico.length > 0 && baseUrlSei) {
      historico.forEach((entradaHistorico) => {
        listaRecentes.appendChild(montarItemHistorico(entradaHistorico, baseUrlSei))
      })
      secaoHistorico.classList.add('visivel')
    }

    const iconeOpcoes = document.getElementById('icone-opcoes')
    if (iconeOpcoes) iconeOpcoes.innerHTML = settingsIconSvg
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-opcoes')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

render()
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/popup/index.html src/popup/main.ts
git commit -m "feat: popup consulta blocos de assinatura ao vivo ao abrir"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real, com pelo menos um bloco de assinatura disponibilizado pra unidade atual: sem
visitar a tela de Bloco de Assinatura antes, abrir o popup da extensão e confirmar que mostra a
contagem certa de blocos (não precisa ter visitado a tela). Testar também sem nenhuma aba do SEI
aberta (deve mostrar "Status indisponível") e com um bloco NÃO disponibilizado (deve mostrar "Tudo em
dia").
