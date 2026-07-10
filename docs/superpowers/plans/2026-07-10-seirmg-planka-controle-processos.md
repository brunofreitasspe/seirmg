# SEIRMG — Planka na tela de Controle de Processos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the SEI "Controle de Processos" screen, show a "📋 Ver Planka" link only on rows whose process already has a matching Planka card, and clicking it opens a popover with the same Tipo de Processo/Localização/Último Comentário shown today on the single-process screen.

**Architecture:** A batch existence-check (one HTTP call per page load / per infinite-scroll page, not one per row) against a new n8n webhook (`infra/planka-auth/roteiro-verificar-processos-lote.md`, built separately by the user in n8n — not part of this plan) decides which rows get the link. Clicking a link fires the existing single-process "Consultar Processo" webhook and renders a popover using a card renderer extracted out of `procedimento_visualizar/index.ts` into a new shared module so both screens use identical markup/styling.

**Tech Stack:** TypeScript, Vite, Bun, Vitest — infrastructure already in place. No new dependency.

## Global Constraints

- Every new/changed function that does `chrome.*` or network I/O must be wrapped in try/catch, log via `console.error('[SEIRMG] ...', error)`, swallow, never rethrow — standing project policy (see memory `project-seirmg`).
- No new manifest permissions — reuses the `optional_host_permissions: ['*://*/*']` + `chrome.permissions.request()` flow already in place for Planka.
- `fetch()` to the n8n backend is called directly (never through `src/background/sessionGate.ts` / `fetchTextComGate` — that gate exists only for SEI session calls, and n8n calls have never gone through it, per `2026-07-09-seirmg-lote-o-planka-extensao-design.md`).
- Card popover markup/CSS class names must stay identical to what `procedimento_visualizar` already renders (`seirmg-planka-pills`, `seirmg-planka-pill`, `seirmg-planka-pill-tipo`, `seirmg-planka-pill-localizacao`, `seirmg-planka-comentario`) — this plan extracts, not rewrites, that rendering.
- Run all commands from `C:\sei\seirmg`.

---

### Task 1: `PlankaConfig.urlVerificarLote` storage field

**Files:**
- Modify: `src/lib/storage.ts:100-107`
- Modify: `src/lib/storage.test.ts:223-239`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PlankaConfig.urlVerificarLote?: string` — consumed by Task 3 (Options) and Task 5 (content script).

- [ ] **Step 1: Add the field**

In `src/lib/storage.ts`, change:

```ts
export interface PlankaConfig {
  urlCadastro?: string
  urlLogin?: string
  urlConsulta?: string
  email?: string
  token?: string
  tokenExp?: number
}
```

to:

```ts
export interface PlankaConfig {
  urlCadastro?: string
  urlLogin?: string
  urlConsulta?: string
  urlVerificarLote?: string
  email?: string
  token?: string
  tokenExp?: number
}
```

- [ ] **Step 2: Extend the existing round-trip test**

In `src/lib/storage.test.ts`, change the `'persiste planka'` test's `planka` object from:

```ts
      planka: {
        urlCadastro: 'https://n8n.exemplo.com/form/abc123',
        urlLogin: 'https://n8n.exemplo.com/webhook/seirmg-login',
        urlConsulta: 'https://n8n.exemplo.com/webhook/seirmg-consultar-processo',
        email: 'usuario@exemplo.com',
        token: 'aaa.bbb.ccc',
        tokenExp: 1799999999,
      },
```

to:

```ts
      planka: {
        urlCadastro: 'https://n8n.exemplo.com/form/abc123',
        urlLogin: 'https://n8n.exemplo.com/webhook/seirmg-login',
        urlConsulta: 'https://n8n.exemplo.com/webhook/seirmg-consultar-processo',
        urlVerificarLote: 'https://n8n.exemplo.com/webhook/seirmg-verificar-processos-lote',
        email: 'usuario@exemplo.com',
        token: 'aaa.bbb.ccc',
        tokenExp: 1799999999,
      },
```

- [ ] **Step 3: Run the test and typecheck**

Run: `bunx vitest run src/lib/storage.test.ts && bunx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add PlankaConfig.urlVerificarLote field"
```

---

### Task 2: Pure logic for the batch check — `src/features/planka/lote.ts`

**Files:**
- Create: `src/features/planka/lote.ts`
- Test: `src/features/planka/lote.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `montarCorpoVerificacaoLote(nups: string[]): { processos: string[] }` — used by Task 5.
  - `extrairEncontrados(resposta: unknown): Set<string>` — used by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `src/features/planka/lote.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarCorpoVerificacaoLote, extrairEncontrados } from './lote'

describe('montarCorpoVerificacaoLote', () => {
  it('monta o corpo com a lista de processos', () => {
    expect(montarCorpoVerificacaoLote(['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02'])).toEqual({
      processos: ['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02'],
    })
  })

  it('remove duplicados', () => {
    expect(montarCorpoVerificacaoLote(['HMMG.2025.00000001-01', 'HMMG.2025.00000001-01'])).toEqual({
      processos: ['HMMG.2025.00000001-01'],
    })
  })

  it('lista vazia gera corpo com lista vazia', () => {
    expect(montarCorpoVerificacaoLote([])).toEqual({ processos: [] })
  })
})

describe('extrairEncontrados', () => {
  it('extrai os processos encontrados de uma resposta válida', () => {
    const resultado = extrairEncontrados({ encontrados: ['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02'] })
    expect(resultado).toEqual(new Set(['HMMG.2025.00000001-01', 'HMMG.2025.00000002-02']))
  })

  it('lista vazia retorna Set vazio', () => {
    expect(extrairEncontrados({ encontrados: [] })).toEqual(new Set())
  })

  it('ignora itens não-string dentro de encontrados', () => {
    const resultado = extrairEncontrados({ encontrados: ['HMMG.2025.00000001-01', 42, null] })
    expect(resultado).toEqual(new Set(['HMMG.2025.00000001-01']))
  })

  it('resposta sem o campo encontrados retorna Set vazio', () => {
    expect(extrairEncontrados({})).toEqual(new Set())
  })

  it('resposta que não é objeto retorna Set vazio', () => {
    expect(extrairEncontrados(null)).toEqual(new Set())
    expect(extrairEncontrados('texto')).toEqual(new Set())
    expect(extrairEncontrados(undefined)).toEqual(new Set())
  })

  it('encontrados que não é array retorna Set vazio', () => {
    expect(extrairEncontrados({ encontrados: 'não é lista' })).toEqual(new Set())
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `bunx vitest run src/features/planka/lote.test.ts`
Expected: FAIL — `Cannot find module './lote'`.

- [ ] **Step 3: Implement `src/features/planka/lote.ts`**

```ts
export function montarCorpoVerificacaoLote(nups: string[]): { processos: string[] } {
  return { processos: [...new Set(nups)] }
}

export function extrairEncontrados(resposta: unknown): Set<string> {
  if (typeof resposta !== 'object' || resposta === null) return new Set()

  const encontrados = (resposta as { encontrados?: unknown }).encontrados
  if (!Array.isArray(encontrados)) return new Set()

  return new Set(encontrados.filter((item): item is string => typeof item === 'string'))
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `bunx vitest run src/features/planka/lote.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/planka/lote.ts src/features/planka/lote.test.ts
git commit -m "feat(planka): add pure helpers for batch existence-check request/response"
```

---

### Task 3: Options — "URL de verificação em lote" field

**Files:**
- Modify: `src/options/index.html:194-201`
- Modify: `src/options/main.ts:334-422`

**Interfaces:**
- Consumes: `PlankaConfig.urlVerificarLote` (Task 1).
- Produces: nothing new for later tasks — this is a leaf UI change.

- [ ] **Step 1: Add the input field to the Options HTML**

In `src/options/index.html`, right after the "URL de consulta de processos" label block (after the `</label>` that closes the `integracoes-planka-url-consulta` field, before the `<br />` + "E-mail" label), insert a new field. The relevant region currently reads:

```html
        <label>
          URL de consulta de processos:
          <input
            type="url"
            id="integracoes-planka-url-consulta"
            placeholder="https://n8n.exemplo.com/webhook/seirmg-consultar-processo"
          />
        </label>
        <br />
        <label>
          E-mail:
          <input type="email" id="integracoes-planka-email" />
        </label>
```

Change it to:

```html
        <label>
          URL de consulta de processos:
          <input
            type="url"
            id="integracoes-planka-url-consulta"
            placeholder="https://n8n.exemplo.com/webhook/seirmg-consultar-processo"
          />
        </label>
        <br />
        <label>
          URL de verificação em lote (opcional — habilita o link "Ver Planka" no
          Controle de Processos):
          <input
            type="url"
            id="integracoes-planka-url-verificar-lote"
            placeholder="https://n8n.exemplo.com/webhook/seirmg-verificar-processos-lote"
          />
        </label>
        <br />
        <label>
          E-mail:
          <input type="email" id="integracoes-planka-email" />
        </label>
```

- [ ] **Step 2: Read/write the new field in `carregarAbaIntegracoes`**

In `src/options/main.ts`, inside `carregarAbaIntegracoes` (around line 335), add the element lookup right after `inputUrlConsulta`:

```ts
    const inputUrlConsulta = document.getElementById(
      'integracoes-planka-url-consulta'
    ) as HTMLInputElement | null
```

becomes:

```ts
    const inputUrlConsulta = document.getElementById(
      'integracoes-planka-url-consulta'
    ) as HTMLInputElement | null
    const inputUrlVerificarLote = document.getElementById(
      'integracoes-planka-url-verificar-lote'
    ) as HTMLInputElement | null
```

In `renderizarEstado()`, add the value assignment right after `urlConsulta`'s:

```ts
      if (inputUrlConsulta) inputUrlConsulta.value = planka?.urlConsulta ?? ''
```

becomes:

```ts
      if (inputUrlConsulta) inputUrlConsulta.value = planka?.urlConsulta ?? ''
      if (inputUrlVerificarLote) inputUrlVerificarLote.value = planka?.urlVerificarLote ?? ''
```

- [ ] **Step 3: Read the field's value and include it in the permission request + saved config**

Inside the `'integracoes-planka-entrar'` click handler, the current code reads:

```ts
        const urlCadastro = inputUrlCadastro?.value.trim() ?? ''
        const urlLogin = (inputUrlLogin?.value.trim() ?? '').replace(/\/+$/, '')
        const urlConsulta = (inputUrlConsulta?.value.trim() ?? '').replace(/\/+$/, '')
        const email = inputEmail?.value.trim() ?? ''
        const senha = inputSenha?.value ?? ''

        if (!urlLogin || !urlConsulta || !email || !senha) {
          if (status) status.textContent = 'Preencha URL de login, URL de consulta, e-mail e senha.'
          return
        }

        const origens = Array.from(
          new Set([`${new URL(urlLogin).origin}/*`, `${new URL(urlConsulta).origin}/*`])
        )
```

Change it to:

```ts
        const urlCadastro = inputUrlCadastro?.value.trim() ?? ''
        const urlLogin = (inputUrlLogin?.value.trim() ?? '').replace(/\/+$/, '')
        const urlConsulta = (inputUrlConsulta?.value.trim() ?? '').replace(/\/+$/, '')
        const urlVerificarLote = (inputUrlVerificarLote?.value.trim() ?? '').replace(/\/+$/, '')
        const email = inputEmail?.value.trim() ?? ''
        const senha = inputSenha?.value ?? ''

        if (!urlLogin || !urlConsulta || !email || !senha) {
          if (status) status.textContent = 'Preencha URL de login, URL de consulta, e-mail e senha.'
          return
        }

        const origens = Array.from(
          new Set(
            [urlLogin, urlConsulta, urlVerificarLote]
              .filter((url) => url.length > 0)
              .map((url) => `${new URL(url).origin}/*`)
          )
        )
```

`urlVerificarLote` stays optional (not required alongside `urlLogin`/`urlConsulta`/`email`/`senha` in the validation) — if left blank, no link ever appears on Controle de Processos, but login still works.

- [ ] **Step 4: Save the field on successful login**

The current save call reads:

```ts
        const config = await store.get()
        await store.set({
          ...config,
          planka: { urlCadastro, urlLogin, urlConsulta, email, token: corpo.token, tokenExp },
        })
```

Change it to:

```ts
        const config = await store.get()
        await store.set({
          ...config,
          planka: { urlCadastro, urlLogin, urlConsulta, urlVerificarLote, email, token: corpo.token, tokenExp },
        })
```

- [ ] **Step 5: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): add Planka batch-check URL field to Integrações tab"
```

---

### Task 4: Extract the Planka card renderer into a shared module

**Files:**
- Create: `src/content-scripts/shared/plankaCard.ts`
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `RespostaConsultaPlanka` (type) — used by Task 5.
  - `montarEstiloPlanka(): void` — used by Task 5.
  - `montarConteudoCardPlanka(dados: RespostaConsultaPlanka): HTMLElement | null` — used by Task 5.

No behavior change in this task — pure refactor, verified by the existing manual-test discipline (no automated test regresses).

- [ ] **Step 1: Create the shared module**

Create `src/content-scripts/shared/plankaCard.ts`:

```ts
export interface RespostaConsultaPlanka {
  tipoProcesso: string | null
  localizacao: string | null
  ultimoComentario: string | null
}

const ESTILO_PLANKA = `
  .seirmg-planka-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .seirmg-planka-pill { border-radius: 12px; padding: 3px 10px; font-size: 12px; }
  .seirmg-planka-pill-tipo { background: #e8f2ff; color: #017fff; font-weight: 600; }
  .seirmg-planka-pill-localizacao { background: #eee; color: #444; }
  .seirmg-planka-comentario { border-left: 3px solid #017fff; padding: 6px 10px; background: #fafafa; font-size: 13px; color: #555; font-style: italic; }
`

export function montarEstiloPlanka(): void {
  if (document.getElementById('seirmg-estilo-planka')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-planka'
  style.textContent = ESTILO_PLANKA
  document.head.appendChild(style)
}

export function montarConteudoCardPlanka(dados: RespostaConsultaPlanka): HTMLElement | null {
  const divConteudo = document.createElement('div')

  const pills = document.createElement('div')
  pills.className = 'seirmg-planka-pills'

  if (dados.tipoProcesso) {
    const pillTipo = document.createElement('span')
    pillTipo.className = 'seirmg-planka-pill seirmg-planka-pill-tipo'
    pillTipo.textContent = `📋 ${dados.tipoProcesso}`
    pills.appendChild(pillTipo)
  }

  if (dados.localizacao) {
    const pillLocalizacao = document.createElement('span')
    pillLocalizacao.className = 'seirmg-planka-pill seirmg-planka-pill-localizacao'
    pillLocalizacao.textContent = `📍 ${dados.localizacao}`
    pills.appendChild(pillLocalizacao)
  }

  if (pills.childElementCount > 0) divConteudo.appendChild(pills)

  if (dados.ultimoComentario) {
    const comentario = document.createElement('div')
    comentario.className = 'seirmg-planka-comentario'
    comentario.textContent = dados.ultimoComentario
    divConteudo.appendChild(comentario)
  }

  if (divConteudo.childElementCount === 0) return null

  return divConteudo
}
```

- [ ] **Step 2: Update `procedimento_visualizar/index.ts` to use the shared module**

Change the import block at the top of the file from:

```ts
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
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore } from '../../lib/storage'
import { tokenValido } from '../../features/planka/token'
```

to:

```ts
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
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore } from '../../lib/storage'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
```

Then delete the now-duplicated local definitions — remove this whole block:

```ts
interface RespostaConsultaPlanka {
  tipoProcesso: string | null
  localizacao: string | null
  ultimoComentario: string | null
}

const ESTILO_PLANKA = `
  .seirmg-planka-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .seirmg-planka-pill { border-radius: 12px; padding: 3px 10px; font-size: 12px; }
  .seirmg-planka-pill-tipo { background: #e8f2ff; color: #017fff; font-weight: 600; }
  .seirmg-planka-pill-localizacao { background: #eee; color: #444; }
  .seirmg-planka-comentario { border-left: 3px solid #017fff; padding: 6px 10px; background: #fafafa; font-size: 13px; color: #555; font-style: italic; }
`

function montarEstiloPlanka(): void {
  if (document.getElementById('seirmg-estilo-planka')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-planka'
  style.textContent = ESTILO_PLANKA
  document.head.appendChild(style)
}

function renderizarCardPlanka(dados: RespostaConsultaPlanka): void {
  montarEstiloPlanka()

  const container = document.getElementById('container') ?? document.body

  const divPainel = document.createElement('div')
  divPainel.id = 'seirmg-planka'

  const pills = document.createElement('div')
  pills.className = 'seirmg-planka-pills'

  if (dados.tipoProcesso) {
    const pillTipo = document.createElement('span')
    pillTipo.className = 'seirmg-planka-pill seirmg-planka-pill-tipo'
    pillTipo.textContent = `📋 ${dados.tipoProcesso}`
    pills.appendChild(pillTipo)
  }

  if (dados.localizacao) {
    const pillLocalizacao = document.createElement('span')
    pillLocalizacao.className = 'seirmg-planka-pill seirmg-planka-pill-localizacao'
    pillLocalizacao.textContent = `📍 ${dados.localizacao}`
    pills.appendChild(pillLocalizacao)
  }

  if (pills.childElementCount > 0) divPainel.appendChild(pills)

  if (dados.ultimoComentario) {
    const comentario = document.createElement('div')
    comentario.className = 'seirmg-planka-comentario'
    comentario.textContent = dados.ultimoComentario
    divPainel.appendChild(comentario)
  }

  if (divPainel.childElementCount === 0) return

  container.appendChild(divPainel)
}
```

and replace it with a much smaller local wrapper that keeps this file's existing placement behavior (appending to `#container`):

```ts
function renderizarCardPlanka(dados: RespostaConsultaPlanka): void {
  montarEstiloPlanka()

  const conteudo = montarConteudoCardPlanka(dados)
  if (!conteudo) return
  conteudo.id = 'seirmg-planka'

  const container = document.getElementById('container') ?? document.body
  container.appendChild(conteudo)
}
```

Nothing else in the file changes — `consultarEExibirPlanka`, `montarPainelPlanka`, and `bootstrap` keep calling `renderizarCardPlanka` exactly as before.

- [ ] **Step 3: Typecheck, lint, run the full test suite, build**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: no errors, all existing tests still pass (this task adds no new automated tests — it's DOM wiring, same policy as the rest of the content scripts), build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/shared/plankaCard.ts src/content-scripts/procedimento_visualizar/index.ts
git commit -m "refactor(planka): extract card renderer into a shared module"
```

---

### Task 5: Batch check + conditional link + popover in `procedimento_controlar`

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes:
  - `montarCorpoVerificacaoLote`, `extrairEncontrados` from `../../features/planka/lote` (Task 2).
  - `montarEstiloPlanka`, `montarConteudoCardPlanka`, `type RespostaConsultaPlanka` from `../shared/plankaCard` (Task 4).
  - `tokenValido` from `../../features/planka/token` (already exists).
  - `PlankaConfig.urlVerificarLote` (Task 1).
- Produces: nothing consumed by later tasks — this is the final feature wiring.

- [ ] **Step 1: Add the new imports**

At the top of `src/content-scripts/procedimento_controlar/index.ts`, the existing import block ends with:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'
```

Change it to:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'
import { montarCorpoVerificacaoLote, extrairEncontrados } from '../../features/planka/lote'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
```

- [ ] **Step 2: Add popover CSS to the existing injected stylesheet**

The file has:

```ts
const ESTILO_FILTROS_E_ESPECIFICACAO = `
  .seirmg-filtro-rotulo {
    font-size: .85em;
    color: #444;
    margin-right: .25em;
  }
  .seirmg-select-filtro {
    font: inherit;
    font-size: .95em;
    margin: 0 .75em 0 0;
    padding: 1px 2px;
    vertical-align: middle;
    cursor: pointer;
  }
  .seirmg-especificacao {
    font-size: .85em;
    color: #666;
    font-style: italic;
    display: block;
    margin-top: 2px;
  }
`
```

Change it to:

```ts
const ESTILO_FILTROS_E_ESPECIFICACAO = `
  .seirmg-filtro-rotulo {
    font-size: .85em;
    color: #444;
    margin-right: .25em;
  }
  .seirmg-select-filtro {
    font: inherit;
    font-size: .95em;
    margin: 0 .75em 0 0;
    padding: 1px 2px;
    vertical-align: middle;
    cursor: pointer;
  }
  .seirmg-especificacao {
    font-size: .85em;
    color: #666;
    font-style: italic;
    display: block;
    margin-top: 2px;
  }
  .seirmg-planka-link {
    font-size: .85em;
    display: block;
    margin-top: 2px;
    color: #017fff;
    text-decoration: none;
  }
  .seirmg-planka-link:hover {
    text-decoration: underline;
  }
  .seirmg-planka-popover {
    position: absolute;
    z-index: 1000;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .15);
    padding: 10px;
    max-width: 320px;
  }
  .seirmg-planka-popover-mensagem {
    font-size: 13px;
    color: #666;
  }
`
```

(`injetarEstilos()`, already in the file, appends this whole constant once — no change needed there.)

- [ ] **Step 3: Add the popover open/close helpers**

Add this block right after the `injetarEstilos` function (which ends around line 75, right before `const LIMITE_PAGINAS_ROLAGEM_INFINITA = 200`):

```ts
let popoverPlankaAtual: HTMLElement | null = null

function fecharPopoverPlanka(): void {
  popoverPlankaAtual?.remove()
  popoverPlankaAtual = null
}

function abrirPopoverPlanka(link: HTMLElement, conteudo: HTMLElement): void {
  fecharPopoverPlanka()

  const popover = document.createElement('div')
  popover.className = 'seirmg-planka-popover'
  popover.appendChild(conteudo)
  document.body.appendChild(popover)

  const retanguloLink = link.getBoundingClientRect()
  popover.style.top = `${window.scrollY + retanguloLink.bottom + 4}px`
  popover.style.left = `${window.scrollX + retanguloLink.left}px`

  popoverPlankaAtual = popover
}

function abrirPopoverMensagemPlanka(link: HTMLElement, mensagem: string): void {
  const p = document.createElement('div')
  p.className = 'seirmg-planka-popover-mensagem'
  p.textContent = mensagem
  abrirPopoverPlanka(link, p)
}

document.addEventListener('click', () => {
  try {
    fecharPopoverPlanka()
  } catch (error) {
    console.error('[SEIRMG] Falha ao fechar popover do Planka:', error)
  }
})
```

This top-level `document.addEventListener('click', ...)` closes any open popover on any click that isn't a "Ver Planka" link click — the link's own click handler (Step 5) calls `evento.stopPropagation()`, so its clicks never reach this listener.

- [ ] **Step 4: Add the individual consulta-on-click function**

Right after the popover helpers from Step 3:

```ts
async function consultarEAbrirPopoverPlanka(
  link: HTMLAnchorElement,
  nup: string,
  urlConsulta: string,
  token: string
): Promise<void> {
  try {
    const resposta = await fetch(urlConsulta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ processo: nup }),
    })

    if (resposta.status === 404) {
      abrirPopoverMensagemPlanka(link, 'Nenhum card encontrado no Planka.')
      return
    }

    if (resposta.status === 401) {
      const localStore = createLocalConfigStore()
      const localConfig = await localStore.get()
      if (localConfig.planka) {
        await localStore.set({
          ...localConfig,
          planka: { ...localConfig.planka, token: undefined, tokenExp: undefined },
        })
      }
      abrirPopoverMensagemPlanka(link, 'Erro ao consultar o Planka.')
      return
    }

    if (!resposta.ok) {
      console.error('[SEIRMG] Consulta ao Planka falhou:', resposta.status)
      abrirPopoverMensagemPlanka(link, 'Erro ao consultar o Planka.')
      return
    }

    const dados = (await resposta.json()) as RespostaConsultaPlanka
    montarEstiloPlanka()
    const conteudo = montarConteudoCardPlanka(dados)
    abrirPopoverPlanka(link, conteudo ?? criarMensagemPlankaVazia())
  } catch (error) {
    console.error('[SEIRMG] Falha ao consultar o Planka:', error)
    abrirPopoverMensagemPlanka(link, 'Erro ao consultar o Planka.')
  }
}

function criarMensagemPlankaVazia(): HTMLElement {
  const p = document.createElement('div')
  p.className = 'seirmg-planka-popover-mensagem'
  p.textContent = 'Nenhum card encontrado no Planka.'
  return p
}
```

(`criarMensagemPlankaVazia` covers the edge case where the 200 response has none of `tipoProcesso`/`localizacao`/`ultimoComentario` set — `montarConteudoCardPlanka` returns `null` in that case, same as the empty-panel guard already used in `procedimento_visualizar`.)

- [ ] **Step 5: Add the batch-check + link-insertion function**

Right after the function from Step 4:

```ts
async function verificarProcessosEmLotePlanka(
  urlVerificarLote: string,
  token: string,
  nups: string[]
): Promise<Set<string>> {
  if (nups.length === 0) return new Set()

  try {
    const resposta = await fetch(urlVerificarLote, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(montarCorpoVerificacaoLote(nups)),
    })

    if (resposta.status === 401) {
      const localStore = createLocalConfigStore()
      const localConfig = await localStore.get()
      if (localConfig.planka) {
        await localStore.set({
          ...localConfig,
          planka: { ...localConfig.planka, token: undefined, tokenExp: undefined },
        })
      }
      return new Set()
    }

    if (!resposta.ok) {
      console.error('[SEIRMG] Verificação em lote do Planka falhou:', resposta.status)
      return new Set()
    }

    return extrairEncontrados(await resposta.json())
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar processos em lote no Planka:', error)
    return new Set()
  }
}

async function aplicarLinksPlankaEmLinhas(linhas: Element[]): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const planka = localConfig.planka
    if (!planka?.urlVerificarLote || !planka.urlConsulta || !planka.token) return
    if (!tokenValido(planka.tokenExp, new Date().toISOString())) return

    const urlVerificarLote = planka.urlVerificarLote
    const urlConsulta = planka.urlConsulta
    const token = planka.token

    const linhasPorNup = new Map<string, HTMLElement>()
    linhas.forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const nup = processo?.textContent?.trim()
      if (processo && nup) linhasPorNup.set(nup, processo)
    })
    if (linhasPorNup.size === 0) return

    const encontrados = await verificarProcessosEmLotePlanka(urlVerificarLote, token, [...linhasPorNup.keys()])

    encontrados.forEach((nup) => {
      const processo = linhasPorNup.get(nup)
      if (!processo) return

      const link = document.createElement('a')
      link.href = '#'
      link.className = 'seirmg-planka-link'
      link.textContent = '📋 Ver Planka'
      link.addEventListener('click', (evento) => {
        evento.preventDefault()
        evento.stopPropagation()
        consultarEAbrirPopoverPlanka(link, nup, urlConsulta, token).catch((error) => {
          console.error('[SEIRMG] Falha ao abrir o card do Planka:', error)
        })
      })

      processo.insertAdjacentElement('afterend', link)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar links do Planka nas linhas:', error)
  }
}
```

- [ ] **Step 6: Wire the initial batch check into `bootstrap()`**

The current `bootstrap` function reads:

```ts
async function bootstrap(): Promise<void> {
  try {
    injetarEstilos()
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
    montarAgrupamento(config)

    if (config.controleProcessos.rolagemInfinita.ativo) {
```

Change it to:

```ts
async function bootstrap(): Promise<void> {
  try {
    injetarEstilos()
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
    montarAgrupamento(config)

    const todasAsLinhas = IDS_TABELAS.flatMap((idTabela) => linhasDaTabela(idTabela))
    aplicarLinksPlankaEmLinhas(todasAsLinhas).catch((error) => {
      console.error('[SEIRMG] Falha ao aplicar links do Planka:', error)
    })

    if (config.controleProcessos.rolagemInfinita.ativo) {
```

(the rest of `bootstrap` — the `rolagemInfinita.ativo` block and its closing — is unchanged.)

- [ ] **Step 7: Wire the infinite-scroll batch check into `reaplicarTratamentosNasLinhasNovas`**

The current function reads:

```ts
function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdemDaTabela(idTabela)
  linhas.forEach((linha) => desabilitarSelecaoNaLinha(linha))
}
```

Change it to:

```ts
function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  aplicarLinksPlankaEmLinhas(linhas).catch((error) => {
    console.error('[SEIRMG] Falha ao aplicar links do Planka nas linhas novas:', error)
  })
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdemDaTabela(idTabela)
  linhas.forEach((linha) => desabilitarSelecaoNaLinha(linha))
}
```

- [ ] **Step 8: Typecheck, lint, run the full test suite, build**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: no type errors, no lint errors, all tests pass (this task adds no new automated tests — DOM/`chrome.*`/`fetch` wiring, same policy as the rest of the content scripts, covered instead by the pure logic tests from Task 2), build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(planka): show Ver Planka link only on rows with a card, via batch check"
```

---

### Task 6: Final verification

**Files:** none new — validation only.

- [ ] **Step 1: Full automated verification**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: all green — typecheck clean, lint clean, full test suite passes (including the 10 new tests from Task 2), production build succeeds.

- [ ] **Step 2: Manual test (outside the agent — document the steps here for the user)**

Not automatable in this environment. Prerequisite: the n8n workflow "SEIRMG - Verificar Processos em Lote" (`infra/planka-auth/roteiro-verificar-processos-lote.md`) must already be built and reachable.

1. Load the extension (dev build) in Chrome via `chrome://extensions`.
2. Options → aba Integrações → preencher também o novo campo "URL de verificação em lote" com a URL do webhook (`.../webhook/seirmg-verificar-processos-lote`) e clicar "Entrar" de novo (para conceder a permissão de host, caso a origem ainda não tenha sido concedida).
3. Abrir a tela de Controle de Processos no SEI. Confirmar que:
   - Só as linhas de processos que têm card no Planka mostram o link "📋 Ver Planka".
   - Processos sem card não mostram link nenhum.
4. Clicar num link "Ver Planka": confirmar que abre um popover perto do link, com as mesmas pills/citação já vistas na tela de processo único.
5. Clicar fora do popover: confirmar que ele fecha. Abrir outro link: confirmar que só um popover fica aberto por vez.
6. Se a tela tiver "Rolagem infinita" ativada (Opções → Controle de Processos): rolar a página para carregar mais processos e confirmar que os links "Ver Planka" também aparecem (só nas linhas com card) nas novas linhas carregadas.
7. Opcional: revogar/expirar o token do Planka (aba Integrações → Sair) e confirmar que nenhum link aparece mais depois de recarregar a página.

- [ ] **Step 3: Commit (only if Step 2 surfaces a fix)**

Only necessary if manual testing reveals an adjustment. Otherwise this task produces no commit — the automated suite was already committed task-by-task.

---

## Self-Review

**Spec coverage:** every section of `2026-07-10-seirmg-planka-controle-processos-design.md` maps to a task — storage (Task 1), Options (Task 3), batch-check architecture + shared card renderer (Tasks 2, 4, 5), popover layout/error handling (Task 5), permission reuse (Task 3, no new task needed), tests (Tasks 1, 2, 6). "Fora de escopo" items (no change to "Consultar Processo", no cache across reloads, no live-update mid-session) have no task — correctly, since they're explicitly excluded.

**Placeholders:** none — every step has complete, pasteable code.

**Type consistency:** `RespostaConsultaPlanka` (Task 4) is the same type consumed in Task 5's `consultarEAbrirPopoverPlanka`. `PlankaConfig.urlVerificarLote` (Task 1) is the exact property name read in both Task 3 (Options) and Task 5 (content script) — confirmed matching across all three. `montarCorpoVerificacaoLote`/`extrairEncontrados` (Task 2) signatures match their call sites in Task 5 exactly (`nups: string[]` in, `{ processos: string[] }` / `Set<string>` out).
