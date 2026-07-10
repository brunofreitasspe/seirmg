# SEIRMG — Checagem proativa do bloco de assinatura via injeção na aba real: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reintroduce periodic proactive checking of the bloco de assinatura (removed earlier today, commit `100ca33`, for causing auto-logout), this time running the check via `chrome.scripting.executeScript` injected into a SEI tab the user already has open and authenticated — never creating a new tab/navigation context — and fixing the `ativo` toggle gating bug that caused the original incident.

**Architecture:** `chrome.alarms` fires periodically (configurable interval); the handler (gated on `blocoAssinatura.ativo`, checked both at scheduling time and at fire time) finds an already-open SEI tab via `chrome.tabs.query`, injects a `fetch()` into it via `chrome.scripting.executeScript` (isolated world, inherits the tab's cookies/session automatically), and hands the returned HTML to the existing parse/notify pipeline. If no SEI tab is open, or a login page is detected in the response, the cycle aborts cleanly (existing circuit breaker reused unchanged).

**Tech Stack:** TypeScript, Vite, Bun, Vitest — infrastructure already in place. No new dependency.

## Global Constraints

- Every new/changed function that does `chrome.*` or network I/O must be wrapped in try/catch, log via `console.error('[SEIRMG] ...', error)`, swallow, never rethrow — standing project policy.
- Both the alarm's scheduling (`agendarAlarme`) AND its handler must check `config.blocoAssinatura.ativo` — this is the exact bug that caused the auto-logout incident fixed earlier today; do not repeat it.
- The injected `chrome.scripting.executeScript` function must run in an already-open, real SEI tab found via `chrome.tabs.query` — never `chrome.tabs.create`. If no matching tab exists, abort the cycle silently (no error, no notification, just skip).
- Reuse the existing `serializar`/`circuitBreakerEstaAberto`/`abrirCircuitBreaker` from `src/background/sessionGate.ts` and `ehPaginaDeLogin` from `src/lib/sessionGate.ts` unchanged — do not modify those files.
- Run all commands from `C:\sei\seirmg`.
- **Manual validation flag:** this whole mechanism (like Lote F) cannot be verified without a live SEI instance. The plan's final task documents manual test steps for the user — do not claim this fixes the auto-logout problem until manually confirmed.

---

### Task 1: Manifest permission + storage schema + Options UI

**Files:**
- Modify: `manifest.config.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BlocoAssinaturaConfig.intervaloMinutos: number` — consumed by Task 5. `chrome.scripting` permission available — consumed by Task 4.

- [ ] **Step 1: Add the `scripting` permission**

In `manifest.config.ts`, change:

```ts
  permissions: ['storage', 'notifications', 'tabs'],
```

to:

```ts
  permissions: ['storage', 'notifications', 'tabs', 'scripting'],
```

- [ ] **Step 2: Add `intervaloMinutos` back to `BlocoAssinaturaConfig`**

In `src/lib/storage.ts`, change:

```ts
export interface BlocoAssinaturaConfig {
  ativo: boolean
  tocarSom: boolean
}
```

to:

```ts
export interface BlocoAssinaturaConfig {
  ativo: boolean
  intervaloMinutos: number
  tocarSom: boolean
}
```

And change `DEFAULT_SYNC_CONFIG`'s `blocoAssinatura` block from:

```ts
  blocoAssinatura: {
    ativo: true,
    tocarSom: true,
  },
```

to:

```ts
  blocoAssinatura: {
    ativo: true,
    intervaloMinutos: 5,
    tocarSom: true,
  },
```

- [ ] **Step 3: Run typecheck to find fallout**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: errors in `src/options/main.ts` (the save handler builds the whole `blocoAssinatura` object from scratch) and possibly `src/lib/storage.test.ts` (a round-trip test may construct the full object). Fixed in the next steps — this is expected, not a sign of a mistake.

- [ ] **Step 4: Add the input field to Options HTML**

In `src/options/index.html`, inside `<section id="painel-notificacoes">`, the current content reads:

```html
      <label>
        <input type="checkbox" id="assinatura-ativo" />
        Ativar notificação de bloco de assinatura pendente
      </label>
      <br />
      <label>
        <input type="checkbox" id="assinatura-som" />
        Tocar som ao notificar
      </label>
```

Change it to:

```html
      <label>
        <input type="checkbox" id="assinatura-ativo" />
        Ativar notificação de bloco de assinatura pendente
      </label>
      <br />
      <label>
        Intervalo de verificação (minutos):
        <input type="number" id="assinatura-intervalo" min="5" max="120" />
      </label>
      <br />
      <label>
        <input type="checkbox" id="assinatura-som" />
        Tocar som ao notificar
      </label>
```

- [ ] **Step 5: Read/write the field in `carregarAbaAssinatura`**

In `src/options/main.ts`, the current function reads:

```ts
async function carregarAbaAssinatura(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('assinatura-ativo') as HTMLInputElement | null
    const inputSom = document.getElementById('assinatura-som') as HTMLInputElement | null
    const status = document.getElementById('assinatura-status')

    if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
    if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom

    document.getElementById('assinatura-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          blocoAssinatura: {
            ativo: inputAtivo?.checked ?? true,
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração do bloco de assinatura:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba de bloco de assinatura:', error)
  }
}
```

Change it to (adds the field's element lookup, its load, and its save — the `chrome.alarms.create`/`clear` call is added in Task 5, not here, since `agendarAlarme` doesn't exist yet at this point in the plan):

```ts
async function carregarAbaAssinatura(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('assinatura-ativo') as HTMLInputElement | null
    const inputIntervalo = document.getElementById('assinatura-intervalo') as HTMLInputElement | null
    const inputSom = document.getElementById('assinatura-som') as HTMLInputElement | null
    const status = document.getElementById('assinatura-status')

    if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
    if (inputIntervalo) inputIntervalo.value = String(config.blocoAssinatura.intervaloMinutos)
    if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom

    document.getElementById('assinatura-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          blocoAssinatura: {
            ativo: inputAtivo?.checked ?? true,
            intervaloMinutos: Number(inputIntervalo?.value ?? 5),
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração do bloco de assinatura:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba de bloco de assinatura:', error)
  }
}
```

- [ ] **Step 6: Fix any `storage.test.ts` fallout**

Run: `bunx tsc --noEmit`. If it reports an error in `src/lib/storage.test.ts` about a `blocoAssinatura` object literal missing `intervaloMinutos`, add the field to that literal with an explicit value (e.g. `intervaloMinutos: 5`), matching the style already used for other fields in that same test. If there is no such error, skip this step — do not add a field to a test that doesn't need it.

- [ ] **Step 7: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add manifest.config.ts src/lib/storage.ts src/options/index.html src/options/main.ts
git commit -m "feat(bloco-assinatura): restore intervaloMinutos config and scripting permission"
```

(If Step 6 touched `src/lib/storage.test.ts`, include it in this `git add` too.)

---

### Task 2: Pure helper — `montarUrlBlocoAssinatura`

**Files:**
- Create: `src/features/bloco-assinatura/verificacaoProativa.ts`
- Test: `src/features/bloco-assinatura/verificacaoProativa.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `montarUrlBlocoAssinatura(baseUrlSei: string): string` — used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/features/bloco-assinatura/verificacaoProativa.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarUrlBlocoAssinatura } from './verificacaoProativa'

describe('montarUrlBlocoAssinatura', () => {
  it('monta a url do bloco de assinatura a partir da url base do SEI', () => {
    expect(montarUrlBlocoAssinatura('https://sei.exemplo.gov.br/sei')).toBe(
      'https://sei.exemplo.gov.br/sei/controlador.php?acao=bloco_assinatura_listar'
    )
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bunx vitest run src/features/bloco-assinatura/verificacaoProativa.test.ts`
Expected: FAIL — `Cannot find module './verificacaoProativa'`.

- [ ] **Step 3: Implement**

Create `src/features/bloco-assinatura/verificacaoProativa.ts`:

```ts
export function montarUrlBlocoAssinatura(baseUrlSei: string): string {
  return `${baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bunx vitest run src/features/bloco-assinatura/verificacaoProativa.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/features/bloco-assinatura/verificacaoProativa.ts src/features/bloco-assinatura/verificacaoProativa.test.ts
git commit -m "feat(bloco-assinatura): add pure helper to build the bloco de assinatura URL"
```

---

### Task 3: Restore `sempreNotificarPendentes` in the pipeline

**Files:**
- Modify: `src/background/blocoAssinaturaPipeline.ts`
- Modify: `src/background/blocoAssinaturaPipeline.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BlocoAssinaturaPipelineDeps.sempreNotificarPendentes?: boolean` — used by Task 4 (the periodic-check path passes `true`, so every still-pending item re-notifies each cycle, not just newly-appeared ones — this is deliberate, pre-existing behavior being restored, not a new design decision).

- [ ] **Step 1: Write the failing test**

In `src/background/blocoAssinaturaPipeline.test.ts`, add this test right after the `'não notifica novamente (modo padrão) um item já registrado como notificado'` test (before `'persiste blocoAssinaturaPendenteAtual mesmo quando não há item novo para notificar'`):

```ts
  it('com sempreNotificarPendentes, notifica de novo um item já registrado como notificado', async () => {
    const notificar = vi.fn()

    await processarItensBlocoAssinatura([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
        }),
        set: async () => {},
      },
      notificar,
      sempreNotificarPendentes: true,
    })

    expect(notificar).toHaveBeenCalledWith(item, DEFAULT_SYNC_CONFIG.blocoAssinatura.tocarSom)
  })

```

- [ ] **Step 2: Run tests and confirm the new one fails**

Run: `bunx vitest run src/background/blocoAssinaturaPipeline.test.ts`
Expected: FAIL — the new test's `notificar` is not called (since `sempreNotificarPendentes` isn't read yet), all other existing tests still pass.

- [ ] **Step 3: Implement**

In `src/background/blocoAssinaturaPipeline.ts`, change:

```ts
export interface BlocoAssinaturaPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoBloco
  agoraIso?: string
}

export async function processarItensBlocoAssinatura(
  itens: BlocoAssinaturaItem[],
  deps: BlocoAssinaturaPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoBloco
  const agoraIso = deps.agoraIso ?? new Date().toISOString()

  const config = await syncStore.get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await localStore.get()
  const pendentesAgora = itens.filter(ehPendente)
  const { novos, estadoAtualizado } = diffPendentes(
    itens,
    localConfig.blocoAssinaturaNotificado,
    agoraIso
  )

  novos.forEach((item) => notificar(item, config.blocoAssinatura.tocarSom))
```

to:

```ts
export interface BlocoAssinaturaPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoBloco
  agoraIso?: string
  sempreNotificarPendentes?: boolean
}

export async function processarItensBlocoAssinatura(
  itens: BlocoAssinaturaItem[],
  deps: BlocoAssinaturaPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoBloco
  const agoraIso = deps.agoraIso ?? new Date().toISOString()
  const sempreNotificarPendentes = deps.sempreNotificarPendentes ?? false

  const config = await syncStore.get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await localStore.get()
  const pendentesAgora = itens.filter(ehPendente)
  const { novos, estadoAtualizado } = diffPendentes(
    itens,
    localConfig.blocoAssinaturaNotificado,
    agoraIso
  )

  const quemNotificar = sempreNotificarPendentes ? pendentesAgora : novos
  quemNotificar.forEach((item) => notificar(item, config.blocoAssinatura.tocarSom))
```

(The rest of the function — the `localStore.set(...)` call at the end — is unchanged.)

- [ ] **Step 4: Run tests and confirm they pass**

Run: `bunx vitest run src/background/blocoAssinaturaPipeline.test.ts`
Expected: PASS — 6 tests (5 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/background/blocoAssinaturaPipeline.ts src/background/blocoAssinaturaPipeline.test.ts
git commit -m "feat(bloco-assinatura): restore sempreNotificarPendentes for the periodic-check path"
```

---

### Task 4: Orchestration — inject the fetch into the real SEI tab

**Files:**
- Create: `src/background/verificacaoProativaBlocoAssinatura.ts`

**Interfaces:**
- Consumes:
  - `serializar`, `circuitBreakerEstaAberto`, `abrirCircuitBreaker` from `./sessionGate` (already exist, unchanged).
  - `ehPaginaDeLogin` from `../lib/sessionGate` (already exists, unchanged).
  - `montarUrlBlocoAssinatura` from `../features/bloco-assinatura/verificacaoProativa` (Task 2).
  - `parseBlocoAssinaturaTable` from `../features/bloco-assinatura/parser` (already exists, unchanged — signature: `(root: ParentNode, options: { seiVersionAtLeast4: boolean }) => BlocoAssinaturaItem[]`).
  - `processarItensBlocoAssinatura` from `./blocoAssinaturaPipeline` (Task 3 added `sempreNotificarPendentes`).
  - `createLocalConfigStore` from `../lib/storage` (already exists, unchanged).
- Produces: `verificarBlocoAssinaturaNaAbaReal(baseUrlSei: string): Promise<void>` — used by Task 5.

No test for this task — orchestration of `chrome.tabs`/`chrome.scripting`, same policy as the rest of `background/`. The pure logic it depends on (`montarUrlBlocoAssinatura`, `parseBlocoAssinaturaTable`, `ehPaginaDeLogin`) is already tested elsewhere.

- [ ] **Step 1: Implement**

Create `src/background/verificacaoProativaBlocoAssinatura.ts`:

```ts
import { serializar, circuitBreakerEstaAberto, abrirCircuitBreaker } from './sessionGate'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { parseBlocoAssinaturaTable } from '../features/bloco-assinatura/parser'
import { ehPaginaDeLogin } from '../lib/sessionGate'
import { montarUrlBlocoAssinatura } from '../features/bloco-assinatura/verificacaoProativa'
import { createLocalConfigStore } from '../lib/storage'

export function verificarBlocoAssinaturaNaAbaReal(baseUrlSei: string): Promise<void> {
  return serializar(async () => {
    try {
      if (await circuitBreakerEstaAberto()) return

      const [abaSei] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
      if (!abaSei?.id) return

      const url = montarUrlBlocoAssinatura(baseUrlSei)
      const [{ result: html }] = await chrome.scripting.executeScript({
        target: { tabId: abaSei.id },
        func: (urlFetch: string) => fetch(urlFetch).then((r) => r.text()),
        args: [url],
      })

      if (typeof html !== 'string') return

      if (ehPaginaDeLogin(html)) {
        await abrirCircuitBreaker()
        return
      }

      const localConfig = await createLocalConfigStore().get()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const itens = parseBlocoAssinaturaTable(doc, {
        seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
      })

      await processarItensBlocoAssinatura(itens, { sempreNotificarPendentes: true })
    } catch (error) {
      console.error('[SEIRMG] Falha ao verificar bloco de assinatura na aba real:', error)
    }
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: no errors. (If `chrome.scripting.executeScript`'s return type doesn't narrow `result` to `string` automatically, the `typeof html !== 'string'` guard already handles that at runtime — this should typecheck fine since `result` is typed `unknown`/`any` depending on `@types/chrome`'s definitions, and the guard narrows it before use.)

- [ ] **Step 3: Commit**

```bash
git add src/background/verificacaoProativaBlocoAssinatura.ts
git commit -m "feat(bloco-assinatura): add orchestration to check via injection into the real SEI tab"
```

---

### Task 5: Wire the alarm into `background/index.ts` and Options

**Files:**
- Create: `src/background/alarms/blocoAssinaturaCheck.ts`
- Modify: `src/background/index.ts`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `verificarBlocoAssinaturaNaAbaReal` from `./verificacaoProativaBlocoAssinatura` (Task 4).
- Produces: nothing consumed by later tasks — this is the final wiring.

- [ ] **Step 1: Recreate the alarm name constant**

Create `src/background/alarms/blocoAssinaturaCheck.ts`:

```ts
export const ALARM_NAME = 'seirmg-check-bloco-assinatura'
```

- [ ] **Step 2: Add imports to `background/index.ts`**

Change the top of `src/background/index.ts` from:

```ts
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
import { createLocalConfigStore } from '../lib/storage'
import { NOTIFICATION_ID_PREFIX } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
```

to:

```ts
import { ALARM_NAME } from './alarms/blocoAssinaturaCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
import { verificarBlocoAssinaturaNaAbaReal } from './verificacaoProativaBlocoAssinatura'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { NOTIFICATION_ID_PREFIX } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
```

- [ ] **Step 3: Add `agendarAlarme` and the alarm handler**

Add this block right after the existing `marcarIndicadorConfiguracao` function (before `chrome.runtime.onInstalled.addListener`):

```ts
async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  if (!config.blocoAssinatura.ativo) {
    chrome.alarms.clear(ALARM_NAME)
    return
  }
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function checarBlocoAssinaturaViaAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarBlocoAssinaturaNaAbaReal(localConfig.baseUrlSei)
}
```

- [ ] **Step 4: Wire `agendarAlarme()` into `onInstalled`**

Change:

```ts
chrome.runtime.onInstalled.addListener(() => {
  marcarIndicadorConfiguracao().catch((error) => {
    console.error('[SEIRMG] Falha ao marcar indicador de configuração pendente:', error)
  })
})
```

to:

```ts
chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
  marcarIndicadorConfiguracao().catch((error) => {
    console.error('[SEIRMG] Falha ao marcar indicador de configuração pendente:', error)
  })
})
```

- [ ] **Step 5: Add the `chrome.alarms.onAlarm` listener**

Add this right after the `onInstalled` listener block:

```ts
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  checarBlocoAssinaturaViaAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})
```

- [ ] **Step 6: Typecheck**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Re-schedule the alarm when Options are saved**

In `src/options/main.ts`, add the import at the top (alongside the other imports):

```ts
import { ALARM_NAME } from '../background/alarms/blocoAssinaturaCheck'
```

In `carregarAbaAssinatura`'s save handler (added in Task 1, Step 5), change:

```ts
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração do bloco de assinatura:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba de bloco de assinatura:', error)
  }
}
```

to:

```ts
        await store.set(atualizado)
        if (atualizado.blocoAssinatura.ativo) {
          chrome.alarms.create(ALARM_NAME, {
            periodInMinutes: atualizado.blocoAssinatura.intervaloMinutos,
          })
        } else {
          chrome.alarms.clear(ALARM_NAME)
        }
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração do bloco de assinatura:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba de bloco de assinatura:', error)
  }
}
```

This is the fix for the actual bug from the original incident: saving the Options page now explicitly creates OR clears the alarm depending on `ativo`, instead of always unconditionally recreating it.

- [ ] **Step 8: Typecheck, lint, run the full test suite, build**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: no errors, all tests pass (this task adds no new automated tests — `chrome.alarms`/`chrome.scripting` wiring — covered instead by Tasks 2-3's pure-logic tests), build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/background/alarms/blocoAssinaturaCheck.ts src/background/index.ts src/options/main.ts
git commit -m "feat(bloco-assinatura): wire periodic alarm to check via real-tab injection, gated on ativo"
```

---

### Task 6: Final verification

**Files:** none new — validation only.

- [ ] **Step 1: Full automated verification**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: all green — typecheck clean, lint clean, full test suite passes (including the 2 new tests from Tasks 2-3), production build succeeds. Confirm `dist/manifest.json` includes `"scripting"` in `permissions`.

- [ ] **Step 2: Manual test (outside the agent — document the steps here for the user)**

Not automatable in this environment — this mechanism has never been tried before in this project and cannot be verified without a live SEI instance, same treatment as Lote F.

1. Load the extension (dev build) in Chrome via `chrome://extensions`.
2. Open a SEI tab and log in normally.
3. Options → aba Notificações → confirm "Ativar notificação de bloco de assinatura pendente" is on, set "Intervalo de verificação" to a low value (e.g. 5, the minimum) temporarily to speed up testing, save.
4. Navigate to `chrome://extensions` → "Inspecionar visualizações" → service worker, watch the console for `[SEIRMG]` logs. Wait for the alarm interval to elapse (or use `chrome.alarms.getAll()` in that console to confirm the alarm is scheduled).
5. Confirm a notification appears if there's a pending bloco de assinatura item, WITHOUT the SEI tab reloading, navigating, or showing any visible activity — the check should be invisible to the user.
6. **Critical check:** use SEI normally for an extended period (at least 30-60 minutes of real work) with the alarm active, and confirm the session does NOT drop unexpectedly. This is the actual test of whether this approach solves the original problem — everything else in this task list can pass while this one thing still fails, and if it does, the mechanism needs to be reconsidered (not just re-tuned).
7. Close all SEI tabs, wait for an alarm cycle to fire, confirm nothing breaks (check the service worker console for a clean, silent skip — no error).
8. Turn "Ativar notificação de bloco de assinatura pendente" off in Options, save, and confirm (via `chrome.alarms.getAll()`) that the alarm is actually cleared — this specifically re-tests the bug that caused the original incident.

- [ ] **Step 3: Commit (only if Step 2 surfaces a fix)**

Only necessary if manual testing reveals an adjustment. Otherwise this task produces no commit.

---

## Self-Review

**Spec coverage:** every section of `2026-07-10-seirmg-bloco-assinatura-injecao-aba-real-design.md` maps to a task — manifest/storage/Options (Task 1), pure URL helper (Task 2), `sempreNotificarPendentes` restoration (Task 3), orchestration via `chrome.scripting.executeScript` (Task 4), alarm wiring with the `ativo` gating fix (Task 5), verification + mandatory manual test (Task 6). The spec's "Fora de escopo" (keep-alive ping replication, processos-novos reintroduction) have no task — correctly, since they're explicitly excluded.

**Placeholders:** none — every step has complete, pasteable code.

**Type consistency:** `montarUrlBlocoAssinatura(baseUrlSei: string): string` (Task 2) matches its call in Task 4. `BlocoAssinaturaPipelineDeps.sempreNotificarPendentes?: boolean` (Task 3) matches Task 4's `processarItensBlocoAssinatura(itens, { sempreNotificarPendentes: true })` call. `verificarBlocoAssinaturaNaAbaReal(baseUrlSei: string): Promise<void>` (Task 4) matches Task 5's `checarBlocoAssinaturaViaAlarme`'s call. `ALARM_NAME` (Task 5, Step 1) is imported identically in both `background/index.ts` and `options/main.ts`.
