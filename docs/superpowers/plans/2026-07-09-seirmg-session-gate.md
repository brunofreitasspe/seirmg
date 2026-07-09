# SEIRMG — Session Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitigar o logout automático do SEI causado por chamadas de fetch da extensão concorrendo com a sessão/token da aba real, adicionando serialização, delay pós-navegação e um circuit breaker de detecção de sessão inválida — cobrindo tanto os alarmes de fundo quanto os fetches de content scripts.

**Architecture:** Um único ponto de execução de rede (`fetchTextComGate`, no service worker) recebe tanto as chamadas de fundo quanto — via `chrome.runtime.sendMessage` — as chamadas hoje feitas diretamente por content scripts. Esse ponto único serializa (mutex em memória), aplica um delay se houve navegação real recente, detecta a tela de login na resposta e abre um circuit breaker de 5 min quando isso acontece. A lógica de decisão pura (cálculo de espera, detecção de login, circuit breaker) fica em `src/lib/sessionGate.ts` com testes; a orquestração (storage, mutex, fetch real) fica em `src/background/sessionGate.ts`, sem testes — mesmo padrão do resto de `background/`.

**Tech Stack:** TypeScript, Vite, Bun, Vitest — infraestrutura já existente. Sem dependência nova.

## Global Constraints

- Delay pós-navegação real: 1500 ms (`ATRASO_POS_NAVEGACAO_MS`).
- Duração do circuit breaker: 5 minutos (`DURACAO_CIRCUIT_BREAKER_MINUTOS`).
- Marcador de tela de login: substring `frmLogin` no HTML bruto (mesma técnica do Sei++ original, `seiplus/background/api.js`).
- `fetchTextComGate` e `fetchText` (de `lib/fetchViaBackground.ts`) nunca lançam — sempre retornam `Result<string>` (`{ ok: true, data } | { ok: false, error }`), mesmo contrato já usado em todo o projeto (`src/lib/result.ts`).
- Rodar todos os comandos a partir de `C:\sei\seirmg`.

---

### Task 1: Lógica pura do gate — `src/lib/sessionGate.ts`

**Files:**
- Create: `src/lib/sessionGate.ts`
- Test: `src/lib/sessionGate.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sem dependências de outros arquivos do projeto).
- Produces:
  - `ehPaginaDeLogin(html: string): boolean`
  - `calcularEsperaPosNavegacao(ultimaNavegacaoIso: string | undefined, agoraIso: string, atrasoMs: number): number`
  - `circuitBreakerAberto(sessaoInvalidaAteIso: string | undefined, agoraIso: string): boolean`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/sessionGate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ehPaginaDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from './sessionGate'

describe('ehPaginaDeLogin', () => {
  it('retorna true quando o HTML contém o formulário de login', () => {
    expect(ehPaginaDeLogin('<html><body><form id="frmLogin"></form></body></html>')).toBe(true)
  })

  it('retorna false quando o HTML não contém o formulário de login', () => {
    expect(ehPaginaDeLogin('<html><body><table id="tblProcessosDetalhado"></table></body></html>')).toBe(false)
  })
})

describe('calcularEsperaPosNavegacao', () => {
  it('retorna 0 quando nunca houve navegação registrada', () => {
    expect(calcularEsperaPosNavegacao(undefined, '2026-07-09T10:00:00.000Z', 1500)).toBe(0)
  })

  it('retorna o restante da janela quando a navegação foi recente', () => {
    expect(
      calcularEsperaPosNavegacao('2026-07-09T10:00:00.000Z', '2026-07-09T10:00:00.500Z', 1500)
    ).toBe(1000)
  })

  it('retorna 0 quando a janela de espera já passou', () => {
    expect(
      calcularEsperaPosNavegacao('2026-07-09T10:00:00.000Z', '2026-07-09T10:00:02.000Z', 1500)
    ).toBe(0)
  })

  it('retorna 0 no limite exato da janela', () => {
    expect(
      calcularEsperaPosNavegacao('2026-07-09T10:00:00.000Z', '2026-07-09T10:00:01.500Z', 1500)
    ).toBe(0)
  })
})

describe('circuitBreakerAberto', () => {
  it('retorna false quando não há data de expiração', () => {
    expect(circuitBreakerAberto(undefined, '2026-07-09T10:00:00.000Z')).toBe(false)
  })

  it('retorna true quando a data de expiração está no futuro', () => {
    expect(
      circuitBreakerAberto('2026-07-09T10:05:00.000Z', '2026-07-09T10:00:00.000Z')
    ).toBe(true)
  })

  it('retorna false quando a data de expiração já passou', () => {
    expect(
      circuitBreakerAberto('2026-07-09T10:00:00.000Z', '2026-07-09T10:05:00.000Z')
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/sessionGate.test.ts`
Expected: FAIL — `Cannot find module './sessionGate'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `src/lib/sessionGate.ts`**

```ts
export function ehPaginaDeLogin(html: string): boolean {
  return html.includes('frmLogin')
}

export function calcularEsperaPosNavegacao(
  ultimaNavegacaoIso: string | undefined,
  agoraIso: string,
  atrasoMs: number
): number {
  if (!ultimaNavegacaoIso) return 0
  const decorrido = new Date(agoraIso).getTime() - new Date(ultimaNavegacaoIso).getTime()
  return Math.max(0, atrasoMs - decorrido)
}

export function circuitBreakerAberto(
  sessaoInvalidaAteIso: string | undefined,
  agoraIso: string
): boolean {
  if (!sessaoInvalidaAteIso) return false
  return new Date(sessaoInvalidaAteIso).getTime() > new Date(agoraIso).getTime()
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/lib/sessionGate.test.ts`
Expected: PASS — 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionGate.ts src/lib/sessionGate.test.ts
git commit -m "feat(lib): add pure session gate helpers (login detection, delay, circuit breaker)"
```

---

### Task 2: Novos campos em `LocalConfig`

**Files:**
- Modify: `src/lib/storage.ts:108-120`

**Interfaces:**
- Consumes: nada de novo.
- Produces: `LocalConfig.ultimaNavegacaoRealSei?: string`, `LocalConfig.sessaoInvalidaAte?: string` — usados pela Task 3.

- [ ] **Step 1: Adicionar os campos à interface**

Em `src/lib/storage.ts`, dentro de `LocalConfig` (linha 108), adicionar as duas linhas depois de `linkNeutroControleProcessos?: string`:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  ultimaVerificacaoImediata?: string
  processosNovosNotificado: NotificadoState
  processosNovosBadgeCount: number
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
  atribuicaoSelecionada?: string
  mostrarIndicadorConfiguracao?: boolean
  linkNeutroControleProcessos?: string
  ultimaNavegacaoRealSei?: string
  sessaoInvalidaAte?: string
}
```

Não é preciso adicionar em `DEFAULT_LOCAL_CONFIG` — são opcionais, mesmo padrão de `ultimaVerificacaoImediata`/`baseUrlSei`.

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros novos (o teste de round-trip de `createLocalConfigStore` em `src/lib/storage.test.ts` continua passando automaticamente, pois só testa round-trip do objeto).

- [ ] **Step 3: Rodar o teste de storage existente para confirmar**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(storage): add fields for last real navigation and circuit breaker expiry"
```

---

### Task 3: Orquestração do gate — `src/background/sessionGate.ts`

**Files:**
- Create: `src/background/sessionGate.ts`

**Interfaces:**
- Consumes:
  - `fetchText`, `type FetchWithTimeoutOptions`, `type Result` de `../lib/result` (já existente)
  - `createLocalConfigStore` de `../lib/storage` (já existente)
  - `ehPaginaDeLogin`, `calcularEsperaPosNavegacao`, `circuitBreakerAberto` de `../lib/sessionGate` (Task 1)
- Produces:
  - `registrarNavegacaoReal(): Promise<void>` — usado pela Task 6.
  - `fetchTextComGate(url: string, options?: FetchWithTimeoutOptions): Promise<Result<string>>` — usado pelas Tasks 4, 6 e 7.

Este arquivo não tem teste dedicado (wiring de storage/timers, mesmo padrão de `background/index.ts` — ver spec, seção Testes). A cobertura de comportamento vem dos testes puros da Task 1.

- [ ] **Step 1: Implementar o arquivo**

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

function serializar<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = filaMutex.then(tarefa, tarefa)
  filaMutex = execucao.catch(() => undefined)
  return execucao
}

export async function registrarNavegacaoReal(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    ultimaNavegacaoRealSei: new Date().toISOString(),
    sessaoInvalidaAte: undefined,
  })
}

export function fetchTextComGate(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  return serializar(async () => {
    const config = await createLocalConfigStore().get()
    const agoraIso = new Date().toISOString()

    if (circuitBreakerAberto(config.sessaoInvalidaAte, agoraIso)) {
      return { ok: false, error: 'Sessão do SEI inválida — chamadas de fundo pausadas temporariamente' }
    }

    const espera = calcularEsperaPosNavegacao(config.ultimaNavegacaoRealSei, agoraIso, ATRASO_POS_NAVEGACAO_MS)
    if (espera > 0) await aguardar(espera)

    const resultado = await fetchText(url, options)
    if (resultado.ok && ehPaginaDeLogin(resultado.data)) {
      const store = createLocalConfigStore()
      const configAtual = await store.get()
      await store.set({
        ...configAtual,
        sessaoInvalidaAte: new Date(Date.now() + DURACAO_CIRCUIT_BREAKER_MINUTOS * 60 * 1000).toISOString(),
      })
      console.error(
        '[SEIRMG] Sessão do SEI parece inválida (tela de login detectada) — pausando chamadas por',
        DURACAO_CIRCUIT_BREAKER_MINUTOS,
        'min'
      )
      return { ok: false, error: 'Sessão do SEI inválida (tela de login detectada)' }
    }

    return resultado
  })
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/background/sessionGate.ts
git commit -m "feat(background): add fetchTextComGate orchestration (mutex, delay, circuit breaker)"
```

---

### Task 4: Fetches de fundo passam a usar o gate

**Files:**
- Modify: `src/background/processosNovos/fetchListaProcessos.ts:1,35`
- Modify: `src/background/index.ts:1-11,62-76`

**Interfaces:**
- Consumes: `fetchTextComGate` de `../sessionGate` (Task 3, relativo a `background/processosNovos/` é `../sessionGate`; relativo a `background/index.ts` é `./sessionGate`).
- Produces: nenhuma interface nova — só troca a implementação usada internamente.

- [ ] **Step 1: Trocar o default de `fetchListaProcessos.ts`**

Em `src/background/processosNovos/fetchListaProcessos.ts`, trocar a linha 1:

```ts
import { fetchText as fetchTextReal } from '../../lib/result'
```

por:

```ts
import { fetchTextComGate as fetchTextReal } from '../sessionGate'
```

(o resto do arquivo não muda — `deps.fetchText ?? fetchTextReal` na linha 35 continua igual, só o que `fetchTextReal` aponta para muda.)

- [ ] **Step 2: Trocar a chamada em `background/index.ts`**

Adicionar o import (junto aos demais imports de `background/index.ts`, próximo à linha 5):

```ts
import { fetchTextComGate } from './sessionGate'
```

E trocar, dentro de `verificarBlocoAssinaturaViaFetch` (linha 70):

```ts
    fetchBlocoAssinaturaHtml: () => fetchText(url),
```

por:

```ts
    fetchBlocoAssinaturaHtml: () => fetchTextComGate(url),
```

Manter o import de `fetchText` de `../lib/result` no topo do arquivo — ele continua em uso pelo listener de `seirmg:fetch-sei` **não**, na verdade não é mais usado depois desta troca nesse arquivo específico neste ponto; ele será reintroduzido de outra forma na Task 7. Por ora, se `fetchText` (de `../lib/result`) ficar sem nenhum uso em `background/index.ts` após esta troca, remover o import para não deixar warning de lint (`import { fetchText } from '../lib/result'` na linha 4) — confirmar com um grep antes de remover (ver Step 3).

- [ ] **Step 3: Verificar se `fetchText` ainda é usado em `background/index.ts`**

Run: `cd C:\sei\seirmg && grep -n "fetchText" src/background/index.ts`
Expected: só a linha do import (linha 4) — nenhuma chamada restante. Se for esse o caso, remover a linha `import { fetchText } from '../lib/result'`. (A Task 7 vai precisar de `fetchTextComGate`, não de `fetchText` cru, então o import não volta a ser necessário até lá — e mesmo na Task 7 quem é usado é `fetchTextComGate`, já importado neste Step 2.)

- [ ] **Step 4: Rodar o typecheck e o lint**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit && bun run lint`
Expected: sem erros.

- [ ] **Step 5: Rodar os testes existentes desses dois arquivos**

Run: `bunx vitest run src/background/processosNovos/fetchListaProcessos.test.ts src/background/alarms/blocoAssinaturaCheck.test.ts src/background/alarms/processosNovosCheck.test.ts`
Expected: PASS — nenhum desses testes usa o default de produção (todos injetam `fetchText` mockado via `deps`), então nada deveria quebrar.

- [ ] **Step 6: Commit**

```bash
git add src/background/processosNovos/fetchListaProcessos.ts src/background/index.ts
git commit -m "feat(background): route bloco-assinatura and processos-novos fetches through the session gate"
```

---

### Task 5: `registrarNavegacaoReal()` no listener de navegação real

**Files:**
- Modify: `src/background/index.ts` (listener `seirmg:sei-detectado`, em torno da linha 198-208)

**Interfaces:**
- Consumes: `registrarNavegacaoReal` de `./sessionGate` (Task 3).
- Produces: nenhuma interface nova.

- [ ] **Step 1: Adicionar o import**

Em `src/background/index.ts`, ajustar o import já feito na Task 4 para incluir `registrarNavegacaoReal`:

```ts
import { fetchTextComGate, registrarNavegacaoReal } from './sessionGate'
```

- [ ] **Step 2: Chamar `registrarNavegacaoReal()` no listener**

O listener atual (linhas 198-208):

```ts
chrome.runtime.onMessage.addListener((mensagem, remetente) => {
  if (!ehMensagemSeiDetectado(mensagem)) return
  console.log(
    '[SEIRMG][diagnostico] seirmg:sei-detectado recebido de',
    remetente.tab?.url,
    new Date().toISOString()
  )
  verificarImediatoSeNecessario().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar imediatamente após detectar sessão do SEI:', error)
  })
})
```

passa a ser:

```ts
chrome.runtime.onMessage.addListener((mensagem, remetente) => {
  if (!ehMensagemSeiDetectado(mensagem)) return
  console.log(
    '[SEIRMG][diagnostico] seirmg:sei-detectado recebido de',
    remetente.tab?.url,
    new Date().toISOString()
  )
  registrarNavegacaoReal().catch((error) => {
    console.error('[SEIRMG] Falha ao registrar navegação real:', error)
  })
  verificarImediatoSeNecessario().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar imediatamente após detectar sessão do SEI:', error)
  })
})
```

- [ ] **Step 3: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): record real navigation timestamp on seirmg:sei-detectado"
```

---

### Task 6: Listener `seirmg:fetch-sei` no background

**Files:**
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `fetchTextComGate` de `./sessionGate` (já importado na Task 4).
- Produces: mensagem `{ type: 'seirmg:fetch-sei', url: string, method?: string, body?: string }` respondida com `Result<string>` — consumida pela Task 7 (`src/lib/fetchViaBackground.ts`).

- [ ] **Step 1: Adicionar a interface e o type guard**

Em `src/background/index.ts`, junto às demais interfaces de mensagem (perto de `MensagemSeiDetectado`, linha 30-40), adicionar:

```ts
interface MensagemFetchSei {
  type: 'seirmg:fetch-sei'
  url: string
  method?: string
  body?: string
}

function ehMensagemFetchSei(mensagem: unknown): mensagem is MensagemFetchSei {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:fetch-sei'
  )
}
```

- [ ] **Step 2: Adicionar o listener**

Junto aos demais `chrome.runtime.onMessage.addListener` (final do arquivo, depois do listener de `seirmg:sei-detectado`):

```ts
chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchSei(mensagem)) return false
  fetchTextComGate(mensagem.url, {
    method: mensagem.method,
    body: mensagem.body !== undefined ? new URLSearchParams(mensagem.body) : undefined,
  })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})
```

- [ ] **Step 3: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(background): add seirmg:fetch-sei message listener for content-script fetch relay"
```

---

### Task 7: `src/lib/fetchViaBackground.ts` para content scripts

**Files:**
- Create: `src/lib/fetchViaBackground.ts`

**Interfaces:**
- Consumes: `type Result` de `./result` (já existente).
- Produces: `fetchText(url: string, options?: { method?: string; body?: URLSearchParams }): Promise<Result<string>>` — usado pelas Tasks 8-11 (mesma assinatura de uso que `lib/result.ts`'s `fetchText` nos call sites atuais).

Sem teste dedicado: é wiring de `chrome.runtime.sendMessage`, mesmo padrão de outras pontes de mensageria do projeto (`src/background/offscreenParser.ts`, não testado).

- [ ] **Step 1: Implementar o arquivo**

```ts
import type { Result } from './result'

export async function fetchText(
  url: string,
  options: { method?: string; body?: URLSearchParams } = {}
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-sei',
      url,
      method: options.method,
      body: options.body?.toString(),
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fetchViaBackground.ts
git commit -m "feat(lib): add fetchText relay for content scripts via background message"
```

---

### Task 8: Content script `controle_unidade_gerar` usa o relay

**Files:**
- Modify: `src/content-scripts/controle_unidade_gerar/index.ts:7`

**Interfaces:**
- Consumes: `fetchText` de `../../lib/fetchViaBackground` (Task 7) — mesma assinatura já usada no arquivo.
- Produces: nenhuma.

- [ ] **Step 1: Trocar o import**

Trocar a linha 7:

```ts
import { fetchText } from '../../lib/result'
```

por:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
```

Nenhuma outra linha do arquivo muda — os dois usos de `fetchText(url)` (linhas 35 e 98, dentro de `executarProximaEtapa`) continuam idênticos.

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/controle_unidade_gerar/index.ts
git commit -m "feat(controle-unidade-gerar): route fetch through background session gate"
```

---

### Task 9: Content script `documento_receber` usa o relay

**Files:**
- Modify: `src/content-scripts/documento_receber/index.ts:6`

**Interfaces:**
- Consumes: `fetchText` de `../../lib/fetchViaBackground` (Task 7).
- Produces: nenhuma.

- [ ] **Step 1: Trocar o import**

Trocar a linha 6:

```ts
import { fetchText } from '../../lib/result'
```

por:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/documento_receber/index.ts
git commit -m "feat(documento-receber): route fetch through background session gate"
```

---

### Task 10: Content script `procedimento_visualizar` usa o relay

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts:11`

**Interfaces:**
- Consumes: `fetchText` de `../../lib/fetchViaBackground` (Task 7).
- Produces: nenhuma.

- [ ] **Step 1: Trocar o import**

Trocar a linha 11:

```ts
import { fetchText } from '../../lib/result'
```

por:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
```

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat(procedimento-visualizar): route anotação fetch through background session gate"
```

---

### Task 11: Content script `procedimento_controlar` usa o relay

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:40`

**Interfaces:**
- Consumes: `fetchText` de `../../lib/fetchViaBackground` (Task 7).
- Produces: nenhuma.

- [ ] **Step 1: Trocar o import**

Trocar a linha 40:

```ts
import { fetchText } from '../../lib/result'
```

por:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
```

Os quatro usos existentes no arquivo (filtro por bloco — linhas ~696 e ~720 — e rolagem infinita — linhas ~783 e ~799) continuam idênticos, incluindo os que passam `{ method: 'POST', body: new URLSearchParams(campos) }`.

- [ ] **Step 2: Rodar o typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(procedimento-controlar): route bloco filter and rolagem infinita fetches through background session gate"
```

---

### Task 12: Verificação final completa

**Files:** nenhum arquivo novo — só validação.

- [ ] **Step 1: Rodar toda a suíte de testes**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes passam, incluindo os 9 novos de `src/lib/sessionGate.test.ts` (contagem total deve ser a anterior + 9).

- [ ] **Step 2: Rodar typecheck e lint completos**

Run: `bunx tsc --noEmit && bun run lint`
Expected: sem erros.

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: build completa sem erros — confirma que o manifest gerado pelo CRXJS ainda referencia `src/background/index.ts` como `service_worker` e que nenhum content script ficou com import quebrado.

- [ ] **Step 4: Teste manual (fora do agente, documentar aqui os passos para o usuário)**

Não automatizável neste ambiente — anotar para o usuário testar manualmente:
1. Carregar a extensão (build de desenvolvimento) no Chrome via `chrome://extensions`.
2. Abrir o SEI, navegar por alguns processos.
3. Abrir `chrome://extensions` → "Inspecionar visualizações" → service worker, e observar os `console.log`/`console.error` do gate (`[SEIRMG] Sessão do SEI parece inválida...` só deve aparecer se a sessão realmente cair).
4. Opcional: reduzir temporariamente `periodInMinutes` dos alarmes (via `DEFAULT_SYNC_CONFIG` em `src/lib/storage.ts` ou pela tela de Opções) para acelerar o ciclo durante o teste, sem esquecer de reverter depois.
5. Confirmar que a extensão continua funcionando normalmente (bloco de assinatura, processos novos, rolagem infinita, reabertura em lote, anotação) — nenhuma regressão funcional, só a mudança de timing/roteamento.

- [ ] **Step 5: Commit final (se houver ajustes do Step 4)**

Só necessário se o teste manual revelar ajuste de código. Caso contrário, este task não gera commit — a suíte automatizada já foi commitada task a task.

---

## Self-Review

**Cobertura da spec:** todas as seções da spec (`2026-07-09-seirmg-session-gate-design.md`) têm task correspondente — lógica pura (Task 1), schema de storage (Task 2), orquestração (Task 3), fetches de fundo (Tasks 4-5), listener de relay (Task 6), relay de content script (Task 7), os 4 content scripts (Tasks 8-11), verificação (Task 12). Os itens de "Fora de escopo" da spec (notificação de sessão inválida, retry automático, mudança no delay de 5s existente) não têm task — corretamente, por serem fora de escopo.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código é completo em cada step.

**Consistência de tipos:** `fetchTextComGate(url: string, options?: FetchWithTimeoutOptions): Promise<Result<string>>` (Task 3) é usado com a mesma assinatura nas Tasks 4 e 6. `fetchText` de `fetchViaBackground.ts` (Task 7) usa a assinatura reduzida `{ method?: string; body?: URLSearchParams }` que é exatamente o que os 4 content scripts (Tasks 8-11) já passam hoje — confirmado por leitura de cada um dos call sites antes de escrever o plano.
