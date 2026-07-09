# SEIRMG — Checagem do Bloco de Assinatura via Aba Oculta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `fetch()` do service worker (que não se parece com navegação real pro SEI e por isso invalida a sessão) por uma navegação de verdade numa aba oculta, para a checagem periódica do bloco de assinatura.

**Architecture:** O alarme abre uma aba em segundo plano (`chrome.tabs.create({ active: false })`) na URL do bloco de assinatura com um marcador (`&seirmgOrigem=alarme`). O content script `rel_bloco_protocolo_listar` já existente roda normalmente ali, lê o marcador, e inclui `origem: 'alarme'` na mensagem que já manda hoje com os itens parseados. O background espera essa mensagem (ou um timeout), fecha a aba, e — como rede de segurança — confere via `chrome.scripting.executeScript` se a aba caiu na tela de login.

**Tech Stack:** TypeScript, Vite, Bun, Vitest, Chrome Extension APIs (`chrome.tabs`, `chrome.scripting`) — infraestrutura já existente, uma permissão nova (`scripting`).

## Global Constraints

- Timeout de espera pela mensagem da aba oculta: 15000 ms (`TIMEOUT_ABA_OCULTA_MS`).
- `DEFAULT_SYNC_CONFIG.blocoAssinatura.intervaloMinutos`: `15` → `5`.
- A aba oculta é sempre criada com `active: false` (não rouba o foco da janela) e sempre removida ao final, com ou sem sucesso.
- `verificarBlocoAssinaturaViaAbaOculta`/funções relacionadas nunca lançam — absorvem qualquer erro internamente.
- `ALARM_NAME` (export de `src/background/alarms/blocoAssinaturaCheck.ts`) precisa continuar existindo — é usado por `src/options/main.ts` para reagendar o alarme.

---

### Task 1: Extrair helpers reutilizáveis de `background/sessionGate.ts`

**Files:**
- Modify: `src/background/sessionGate.ts`

**Interfaces:**
- Consumes: nada de novo (já usa `createLocalConfigStore`, `circuitBreakerAberto` de `../lib/sessionGate`).
- Produces: `serializar<T>(tarefa: () => Promise<T>): Promise<T>` (agora exportado), `circuitBreakerEstaAberto(): Promise<boolean>`, `abrirCircuitBreaker(): Promise<void>` — usados pela Task 2.

Refatoração pura — sem mudança de comportamento. Sem teste dedicado (wiring, mesmo padrão do resto de `background/`).

- [ ] **Step 1: Reescrever o arquivo com os helpers extraídos**

Substituir o conteúdo de `src/background/sessionGate.ts` inteiro por:

```ts
import { fetchText, type FetchWithTimeoutOptions, type Result } from '../lib/result'
import { createLocalConfigStore } from '../lib/storage'
import { ehPaginaDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from '../lib/sessionGate'

const ATRASO_POS_NAVEGACAO_MS = 1500
const DURACAO_CIRCUIT_BREAKER_MINUTOS = 5

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let filaMutex: Promise<unknown> = Promise.resolve()

export function serializar<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = filaMutex.then(tarefa, tarefa)
  filaMutex = execucao.catch(() => undefined)
  return execucao
}

export async function circuitBreakerEstaAberto(): Promise<boolean> {
  const config = await createLocalConfigStore().get()
  return circuitBreakerAberto(config.sessaoInvalidaAte, new Date().toISOString())
}

export async function abrirCircuitBreaker(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    sessaoInvalidaAte: new Date(Date.now() + DURACAO_CIRCUIT_BREAKER_MINUTOS * 60 * 1000).toISOString(),
  })
  console.error(
    '[SEIRMG] Sessão do SEI parece inválida (tela de login detectada) — pausando chamadas por',
    DURACAO_CIRCUIT_BREAKER_MINUTOS,
    'min'
  )
}

export async function registrarNavegacaoReal(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    ultimaNavegacaoRealSei: new Date().toISOString(),
    sessaoInvalidaAte: undefined,
  })
  console.log('[SEIRMG][diagnostico] registrarNavegacaoReal: navegação real registrada', new Date().toISOString())
}

export function fetchTextComGate(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  return serializar(async () => {
    try {
      if (await circuitBreakerEstaAberto()) {
        console.log('[SEIRMG][diagnostico] fetchTextComGate: circuit breaker aberto — pulando', url)
        return { ok: false, error: 'Sessão do SEI inválida — chamadas de fundo pausadas temporariamente' }
      }

      const config = await createLocalConfigStore().get()
      const agoraIso = new Date().toISOString()
      console.log('[SEIRMG][diagnostico] fetchTextComGate: solicitado', url, agoraIso)

      const espera = calcularEsperaPosNavegacao(config.ultimaNavegacaoRealSei, agoraIso, ATRASO_POS_NAVEGACAO_MS)
      if (espera > 0) {
        console.log('[SEIRMG][diagnostico] fetchTextComGate: aguardando', espera, 'ms pós-navegação antes de', url)
        await aguardar(espera)
      }

      const resultado = await fetchText(url, options)
      if (resultado.ok && ehPaginaDeLogin(resultado.data)) {
        await abrirCircuitBreaker()
        return { ok: false, error: 'Sessão do SEI inválida (tela de login detectada)' }
      }

      console.log(
        '[SEIRMG][diagnostico] fetchTextComGate: concluído',
        url,
        resultado.ok ? 'ok' : `erro: ${resultado.error}`,
        new Date().toISOString()
      )
      return resultado
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
```

Nota: a checagem de circuit breaker foi movida para *antes* da leitura de `config` usada no cálculo de espera — isso muda a ordem de duas leituras de storage (ambas idempotentes, sem efeito colateral), não o comportamento observável. O restante é idêntico ao arquivo anterior, só com `serializar`/`circuitBreakerEstaAberto`/`abrirCircuitBreaker` extraídos e exportados.

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte completa (garante que nada que dependia do comportamento de fetchTextComGate quebrou)**

Run: `bunx vitest run`
Expected: todos os testes continuam passando (nenhum teste dedicado a este arquivo, mas outros módulos o consomem indiretamente via mocks nos próprios testes).

- [ ] **Step 4: Commit**

```bash
git add src/background/sessionGate.ts
git commit -m "refactor(background): export serializar/circuitBreakerEstaAberto/abrirCircuitBreaker from sessionGate"
```

---

### Task 2: Novo módulo `src/background/blocoAssinaturaAbaOculta.ts`

**Files:**
- Create: `src/background/blocoAssinaturaAbaOculta.ts`

**Interfaces:**
- Consumes: `serializar`, `circuitBreakerEstaAberto`, `abrirCircuitBreaker` de `./sessionGate` (Task 1).
- Produces: `verificarBlocoAssinaturaViaAbaOculta(url: string): Promise<void>` — usado pela Task 6.

Sem teste dedicado (wiring de `chrome.tabs`/`chrome.scripting`/`chrome.runtime.onMessage`, mesmo padrão do resto de `background/`).

- [ ] **Step 1: Implementar o arquivo**

```ts
import { serializar, circuitBreakerEstaAberto, abrirCircuitBreaker } from './sessionGate'

const TIMEOUT_ABA_OCULTA_MS = 15000

function ehMensagemItensBlocoDaAba(
  mensagem: unknown,
  remetente: chrome.runtime.MessageSender,
  tabId: number
): boolean {
  return (
    remetente.tab?.id === tabId &&
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

function aguardarMensagemOuTimeout(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    let resolvido = false
    const finalizar = (): void => {
      if (resolvido) return
      resolvido = true
      chrome.runtime.onMessage.removeListener(listener)
      clearTimeout(timer)
      resolve()
    }
    const listener = (mensagem: unknown, remetente: chrome.runtime.MessageSender): void => {
      if (ehMensagemItensBlocoDaAba(mensagem, remetente, tabId)) finalizar()
    }
    chrome.runtime.onMessage.addListener(listener)
    const timer = setTimeout(finalizar, TIMEOUT_ABA_OCULTA_MS)
  })
}

async function paginaEhTelaDeLogin(tabId: number): Promise<boolean> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.getElementById('frmLogin') !== null,
    })
    return result === true
  } catch {
    return false
  }
}

export function verificarBlocoAssinaturaViaAbaOculta(url: string): Promise<void> {
  return serializar(async () => {
    if (await circuitBreakerEstaAberto()) {
      console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: circuit breaker aberto, pulando')
      return
    }

    console.log(
      '[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: abrindo aba oculta',
      url,
      new Date().toISOString()
    )
    const tab = await chrome.tabs.create({ url, active: false })
    if (!tab.id) return

    try {
      await aguardarMensagemOuTimeout(tab.id)
      console.log(
        '[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: aba concluída/timeout',
        new Date().toISOString()
      )

      if (await paginaEhTelaDeLogin(tab.id)) {
        await abrirCircuitBreaker()
      }
    } finally {
      chrome.tabs.remove(tab.id).catch(() => {})
    }
  })
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros. Se `chrome.scripting` não for reconhecido pelos tipos, ver Task 3 (a permissão no manifest não afeta os tipos do `@types/chrome`, que já inclui `chrome.scripting` independente da permissão declarada).

- [ ] **Step 3: Commit**

```bash
git add src/background/blocoAssinaturaAbaOculta.ts
git commit -m "feat(background): add hidden-tab check for bloco de assinatura"
```

---

### Task 3: Permissão `scripting` no manifesto

**Files:**
- Modify: `manifest.config.ts:30`

**Interfaces:**
- Consumes: nada.
- Produces: nada — só habilita `chrome.scripting.executeScript` em runtime (já usado pela Task 2).

- [ ] **Step 1: Adicionar a permissão**

Trocar a linha 30:

```ts
  permissions: ['storage', 'notifications', 'alarms', 'tabs', 'offscreen'],
```

por:

```ts
  permissions: ['storage', 'notifications', 'alarms', 'tabs', 'offscreen', 'scripting'],
```

- [ ] **Step 2: Rodar o build pra confirmar que o manifesto gerado inclui a permissão**

Run: `cd C:\sei\seirmg && bun run build`
Expected: build sem erros. Opcional: `cat dist/manifest.json | grep scripting` deve mostrar a permissão.

- [ ] **Step 3: Commit**

```bash
git add manifest.config.ts
git commit -m "feat: add scripting permission for hidden-tab session checks"
```

---

### Task 4: Intervalo padrão do bloco de assinatura: 15 → 5 minutos

**Files:**
- Modify: `src/lib/storage.ts:133`

**Interfaces:**
- Consumes: nada.
- Produces: nada — só o valor de configuração padrão.

- [ ] **Step 1: Trocar o valor**

Em `src/lib/storage.ts`, dentro de `DEFAULT_SYNC_CONFIG.blocoAssinatura` (linha 133):

```ts
  blocoAssinatura: {
    ativo: true,
    intervaloMinutos: 5,
    tocarSom: true,
  },
```

- [ ] **Step 2: Rodar os testes de storage**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: PASS — nenhum teste hoje afirma o valor `15` (confirmado por grep antes de escrever este plano).

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(storage): default bloco-assinatura check interval to 5 minutes"
```

---

### Task 5: Content script `rel_bloco_protocolo_listar` lê o marcador da URL

**Files:**
- Modify: `src/content-scripts/rel_bloco_protocolo_listar/index.ts:13-28`

**Interfaces:**
- Consumes: nada de novo (`window.location.search`, API nativa).
- Produces: mensagem `{ type: 'seirmg:bloco-assinatura:itens', itens, origem?: 'alarme' }` — consumida pela Task 6.

- [ ] **Step 1: Adicionar a leitura do marcador e incluir no envio da mensagem**

A função `processarPagina()` atual (linhas 13-28):

```ts
async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    chrome.runtime.sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens }).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar itens do bloco de assinatura:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar página de bloco de assinatura:', error)
  }
}
```

passa a ser:

```ts
async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    const ehChecagemViaAlarme = new URLSearchParams(window.location.search).get('seirmgOrigem') === 'alarme'

    chrome.runtime
      .sendMessage({
        type: 'seirmg:bloco-assinatura:itens',
        itens,
        ...(ehChecagemViaAlarme ? { origem: 'alarme' as const } : {}),
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao enviar itens do bloco de assinatura:', error)
      })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar página de bloco de assinatura:', error)
  }
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/rel_bloco_protocolo_listar/index.ts
git commit -m "feat(rel-bloco-protocolo-listar): tag messages sent during alarm-triggered checks"
```

---

### Task 6: `background/index.ts` — nova função de alarme, regra de notificação por origem, remoção do caminho antigo

**Files:**
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `verificarBlocoAssinaturaViaAbaOculta` de `./blocoAssinaturaAbaOculta` (Task 2).
- Produces: nenhuma interface nova — só troca o que o alarme chama e a regra de notificação da mensagem existente.

- [ ] **Step 1: Trocar os imports do topo do arquivo**

Trocar as linhas 1-13:

```ts
import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS, verificarProcessosNovos } from './alarms/processosNovosCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal } from './sessionGate'
import { fetchListaProcessos } from './processosNovos/fetchListaProcessos'
import {
  extrairInfoRedirecionamentoViaOffscreen,
  parseBlocoAssinaturaHtmlViaOffscreen,
  parseProcessosNovosHtmlViaOffscreen,
} from './offscreenParser'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_PREFIX_PROCESSO } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
```

por:

```ts
import { ALARM_NAME } from './alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS, verificarProcessosNovos } from './alarms/processosNovosCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal } from './sessionGate'
import { verificarBlocoAssinaturaViaAbaOculta } from './blocoAssinaturaAbaOculta'
import { fetchListaProcessos } from './processosNovos/fetchListaProcessos'
import { extrairInfoRedirecionamentoViaOffscreen, parseProcessosNovosHtmlViaOffscreen } from './offscreenParser'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_PREFIX_PROCESSO } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
```

- [ ] **Step 2: Adicionar o campo `origem` na interface da mensagem**

Trocar (linhas 18-21):

```ts
interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}
```

por:

```ts
interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
  origem?: 'alarme'
}
```

- [ ] **Step 3: Remover `verificarBlocoAssinaturaViaFetch` e adicionar `checarBlocoAssinaturaViaAlarme`**

Remover a função `verificarBlocoAssinaturaViaFetch` inteira (linhas 96-114):

```ts
async function verificarBlocoAssinaturaViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
  console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaFetch: GET', url, new Date().toISOString())

  await verificarBlocoAssinatura({
    fetchBlocoAssinaturaHtml: () =>
      fetchTextComGate(url, {
        referrer: localConfig.baseUrlSei,
        referrerPolicy: 'strict-origin-when-cross-origin',
      }),
    parseOptions: { seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true },
    parseBlocoAssinaturaHtml: parseBlocoAssinaturaHtmlViaOffscreen,
  })

  console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaFetch: concluído', new Date().toISOString())
}
```

Substituir por:

```ts
async function checarBlocoAssinaturaViaAlarme(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}&seirmgOrigem=alarme`
  console.log('[SEIRMG][diagnostico] checarBlocoAssinaturaViaAlarme: iniciando', url, new Date().toISOString())

  await verificarBlocoAssinaturaViaAbaOculta(url)

  console.log('[SEIRMG][diagnostico] checarBlocoAssinaturaViaAlarme: concluído', new Date().toISOString())
}
```

- [ ] **Step 4: Trocar a chamada no listener do alarme**

Trocar (dentro do `chrome.alarms.onAlarm.addListener` para `ALARM_NAME`):

```ts
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  verificarBlocoAssinaturaViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})
```

por:

```ts
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  checarBlocoAssinaturaViaAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})
```

- [ ] **Step 5: Aplicar a regra de notificação por origem no listener da mensagem**

Trocar:

```ts
chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  processarItensBlocoAssinatura(mensagem.itens).catch((error) => {
    console.error(
      '[SEIRMG] Falha ao processar itens do bloco de assinatura recebidos via mensagem:',
      error
    )
  })
})
```

por:

```ts
chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  const deps = mensagem.origem === 'alarme' ? { sempreNotificarPendentes: true } : undefined
  processarItensBlocoAssinatura(mensagem.itens, deps).catch((error) => {
    console.error(
      '[SEIRMG] Falha ao processar itens do bloco de assinatura recebidos via mensagem:',
      error
    )
  })
})
```

- [ ] **Step 6: Verificar se `fetchTextComGate` ainda é usado no arquivo**

Run: `cd C:\sei\seirmg && grep -n "fetchTextComGate" src/background/index.ts`
Expected: ainda aparece no listener de `seirmg:fetch-sei` (relay de content scripts) — o import continua necessário, não remover.

- [ ] **Step 7: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros. Se aparecer erro de import não utilizado ou tipo incompatível em `processarItensBlocoAssinatura(mensagem.itens, deps)`, conferir a assinatura de `processarItensBlocoAssinatura` em `src/background/blocoAssinaturaPipeline.ts` (aceita `deps?: BlocoAssinaturaPipelineDeps` como segundo parâmetro opcional — já é esse o contrato usado hoje pelo caminho de alarme antigo).

- [ ] **Step 8: Rodar a suíte completa**

Run: `bunx vitest run`
Expected: todos os testes passam (nenhum teste cobre `background/index.ts` diretamente, mas `blocoAssinaturaPipeline.test.ts` cobre `processarItensBlocoAssinatura` e não deveria ser afetado).

- [ ] **Step 9: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): route bloco-assinatura alarm through hidden-tab check"
```

---

### Task 7: Remover código morto (caminho antigo de fetch+parse-offscreen do bloco de assinatura)

**Files:**
- Modify: `src/background/alarms/blocoAssinaturaCheck.ts`
- Delete: `src/background/alarms/blocoAssinaturaCheck.test.ts`
- Modify: `src/background/offscreenParser.ts`
- Modify: `src/offscreen/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ALARM_NAME` continua exportado de `blocoAssinaturaCheck.ts` (único símbolo que resta nesse arquivo) — consumido por `src/options/main.ts` (já existente, não muda) e pela Task 6 (já feita).

- [ ] **Step 1: Reduzir `blocoAssinaturaCheck.ts` a só `ALARM_NAME`**

Substituir o conteúdo inteiro de `src/background/alarms/blocoAssinaturaCheck.ts` por:

```ts
export const ALARM_NAME = 'seirmg-check-bloco-assinatura'
```

- [ ] **Step 2: Remover o arquivo de teste que só cobria a função removida**

Run: `cd C:\sei\seirmg && rm src/background/alarms/blocoAssinaturaCheck.test.ts`

- [ ] **Step 3: Remover `parseBlocoAssinaturaHtmlViaOffscreen` de `offscreenParser.ts`**

Arquivo atual `src/background/offscreenParser.ts`:

```ts
import type { ParseBlocoAssinaturaOptions } from '../features/bloco-assinatura/parser'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
import type { ProcessoItem } from '../features/processos-novos/types'
import type { InfoRedirecionamento } from './processosNovos/fetchListaProcessos'

const OFFSCREEN_URL = 'src/offscreen/index.html'
const TIPO_MENSAGEM_PARSE_HTML = 'seirmg:parse-html'

type MensagemParseHtml =
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'blocoAssinatura'; html: string; options: ParseBlocoAssinaturaOptions }
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'processosNovos'; html: string }
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'infoRedirecionamento'; html: string }

let criandoDocumentoOffscreen: Promise<void> | null = null

async function garantirDocumentoOffscreen(): Promise<void> {
  const contextos = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contextos.length > 0) return

  if (criandoDocumentoOffscreen) {
    await criandoDocumentoOffscreen
    return
  }

  criandoDocumentoOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Fazer parse do HTML retornado pelo SEI — DOMParser não existe no service worker.',
  })
  try {
    await criandoDocumentoOffscreen
  } finally {
    criandoDocumentoOffscreen = null
  }
}

async function enviarParaOffscreen<T>(mensagem: MensagemParseHtml): Promise<T> {
  await garantirDocumentoOffscreen()
  return chrome.runtime.sendMessage(mensagem) as Promise<T>
}

export function parseBlocoAssinaturaHtmlViaOffscreen(
  html: string,
  options: ParseBlocoAssinaturaOptions
): Promise<BlocoAssinaturaItem[]> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'blocoAssinatura', html, options })
}

export function parseProcessosNovosHtmlViaOffscreen(html: string): Promise<ProcessoItem[]> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'processosNovos', html })
}

export function extrairInfoRedirecionamentoViaOffscreen(html: string): Promise<InfoRedirecionamento> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'infoRedirecionamento', html })
}
```

Substituir por (remove o tipo/import de `ParseBlocoAssinaturaOptions`/`BlocoAssinaturaItem` e a função `parseBlocoAssinaturaHtmlViaOffscreen`, e o caso `'blocoAssinatura'` do tipo da mensagem):

```ts
import type { ProcessoItem } from '../features/processos-novos/types'
import type { InfoRedirecionamento } from './processosNovos/fetchListaProcessos'

const OFFSCREEN_URL = 'src/offscreen/index.html'
const TIPO_MENSAGEM_PARSE_HTML = 'seirmg:parse-html'

type MensagemParseHtml =
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'processosNovos'; html: string }
  | { type: typeof TIPO_MENSAGEM_PARSE_HTML; parser: 'infoRedirecionamento'; html: string }

let criandoDocumentoOffscreen: Promise<void> | null = null

async function garantirDocumentoOffscreen(): Promise<void> {
  const contextos = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contextos.length > 0) return

  if (criandoDocumentoOffscreen) {
    await criandoDocumentoOffscreen
    return
  }

  criandoDocumentoOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Fazer parse do HTML retornado pelo SEI — DOMParser não existe no service worker.',
  })
  try {
    await criandoDocumentoOffscreen
  } finally {
    criandoDocumentoOffscreen = null
  }
}

async function enviarParaOffscreen<T>(mensagem: MensagemParseHtml): Promise<T> {
  await garantirDocumentoOffscreen()
  return chrome.runtime.sendMessage(mensagem) as Promise<T>
}

export function parseProcessosNovosHtmlViaOffscreen(html: string): Promise<ProcessoItem[]> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'processosNovos', html })
}

export function extrairInfoRedirecionamentoViaOffscreen(html: string): Promise<InfoRedirecionamento> {
  return enviarParaOffscreen({ type: TIPO_MENSAGEM_PARSE_HTML, parser: 'infoRedirecionamento', html })
}
```

- [ ] **Step 4: Remover o caso `'blocoAssinatura'` de `src/offscreen/index.ts`**

Arquivo atual:

```ts
import { parseBlocoAssinaturaTable, type ParseBlocoAssinaturaOptions } from '../features/bloco-assinatura/parser'
import { parseProcessosControlarTable } from '../features/processos-novos/parser'

function extrairInfoRedirecionamento(html: string): {
  tipoVisualizacao?: string
  acaoRedirecionamento?: string | null
} {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  return {
    tipoVisualizacao: form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value,
    acaoRedirecionamento: form?.getAttribute('action'),
  }
}

interface MensagemParseHtml {
  type: 'seirmg:parse-html'
  parser: 'blocoAssinatura' | 'processosNovos' | 'infoRedirecionamento'
  html: string
  options?: ParseBlocoAssinaturaOptions
}

function ehMensagemParseHtml(mensagem: unknown): mensagem is MensagemParseHtml {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:parse-html'
  )
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemParseHtml(mensagem)) return false

  try {
    const doc = new DOMParser().parseFromString(mensagem.html, 'text/html')

    if (mensagem.parser === 'blocoAssinatura') {
      responder(parseBlocoAssinaturaTable(doc, mensagem.options ?? { seiVersionAtLeast4: true }))
    } else if (mensagem.parser === 'processosNovos') {
      responder(parseProcessosControlarTable(doc))
    } else {
      responder(extrairInfoRedirecionamento(mensagem.html))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar HTML no documento offscreen:', error)
    responder(mensagem.parser === 'infoRedirecionamento' ? {} : [])
  }

  return true
})
```

Substituir por:

```ts
import { parseProcessosControlarTable } from '../features/processos-novos/parser'

function extrairInfoRedirecionamento(html: string): {
  tipoVisualizacao?: string
  acaoRedirecionamento?: string | null
} {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  return {
    tipoVisualizacao: form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value,
    acaoRedirecionamento: form?.getAttribute('action'),
  }
}

interface MensagemParseHtml {
  type: 'seirmg:parse-html'
  parser: 'processosNovos' | 'infoRedirecionamento'
  html: string
}

function ehMensagemParseHtml(mensagem: unknown): mensagem is MensagemParseHtml {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:parse-html'
  )
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemParseHtml(mensagem)) return false

  try {
    const doc = new DOMParser().parseFromString(mensagem.html, 'text/html')

    if (mensagem.parser === 'processosNovos') {
      responder(parseProcessosControlarTable(doc))
    } else {
      responder(extrairInfoRedirecionamento(mensagem.html))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar HTML no documento offscreen:', error)
    responder(mensagem.parser === 'infoRedirecionamento' ? {} : [])
  }

  return true
})
```

- [ ] **Step 5: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Rodar a suíte completa**

Run: `bunx vitest run`
Expected: todos os testes passam (a suíte perde os testes de `blocoAssinaturaCheck.test.ts`, removidos no Step 2 deste task — a contagem total de testes cai em relação ao baseline).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove dead fetch+offscreen-parse path for bloco de assinatura"
```

---

### Task 8: Verificação final completa

**Files:** nenhum arquivo novo — só validação.

- [ ] **Step 1: Rodar toda a suíte de testes**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes passam.

- [ ] **Step 2: Rodar typecheck e lint completos**

Run: `bunx tsc --noEmit && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: build completa sem erros. Conferir que `dist/manifest.json` inclui `"scripting"` em `permissions`.

- [ ] **Step 4: Teste manual (fora do agente — documentar para o usuário)**

Não automatizável neste ambiente. Passos para o usuário:
1. Carregar o build em `chrome://extensions` (recarregar a extensão existente).
2. Abrir o SEI, deixar o alarme do bloco de assinatura disparar (agora a cada 5 min por padrão).
3. Observar: uma aba deve abrir rapidamente em segundo plano (sem roubar o foco), navegando para a tela do bloco de assinatura, e fechar sozinha em poucos segundos.
4. Abrir o console do service worker (`chrome://extensions` → "Inspecionar visualizações: service worker") e conferir os logs `[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: ...` — devem mostrar abertura, conclusão/timeout e fechamento da aba, sem a mensagem de circuit breaker (a menos que a sessão realmente tenha caído por outro motivo).
5. Confirmar que a sessão do SEI continua válida depois de vários ciclos do alarme — esse é o critério de sucesso desta mudança.

- [ ] **Step 5: Commit final (se houver ajustes do Step 4)**

Só necessário se o teste manual revelar algum ajuste de código. Caso contrário, este task não gera commit — a suíte automatizada já foi commitada task a task.

---

## Self-Review

**Cobertura da spec:** todas as seções da spec (`2026-07-09-seirmg-bloco-assinatura-aba-oculta-design.md`) têm task correspondente — extração de helpers (Task 1), novo módulo de aba oculta (Task 2), permissão do manifesto (Task 3), intervalo padrão (Task 4), marcador na URL/content script (Task 5), integração no `background/index.ts` (Task 6), remoção do código morto consequente (Task 7), verificação (Task 8). O item "Fora de escopo" da spec (processos novos, supressão de outros content scripts, aba 100% invisível) não tem task — corretamente, por serem fora de escopo.

**Placeholders:** nenhum "TBD"/"a definir" — todo código é completo em cada step (o nome de função que estava pendente na spec, `checarBlocoAssinaturaViaAlarme`, foi decidido e usado consistentemente nas Tasks 6 e 8).

**Consistência de tipos:** `verificarBlocoAssinaturaViaAbaOculta(url: string): Promise<void>` (Task 2) é chamada com essa assinatura exata na Task 6. `MensagemItensBloco.origem?: 'alarme'` (Task 6) é o mesmo literal enviado pelo content script na Task 5 (`origem: 'alarme' as const`). `ALARM_NAME` continua exportado de `blocoAssinaturaCheck.ts` (Task 7) exatamente como consumido por `src/options/main.ts` (confirmado por leitura antes de escrever o plano) e pela Task 6.
