# SEIRMG — Correção do Bloco de Assinatura (checagem imediata + notificação recorrente + badge correto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir três problemas de uso real na feature de notificação de bloco de assinatura (já entregue): sem checagem imediata ao acessar o SEI, notificação só uma vez por bloco (mesmo que continue pendente por dias), e badge/popup que nunca diminuem.

**Architecture:** Ver `docs/superpowers/specs/2026-07-06-seirmg-bloco-assinatura-correcao-design.md`. O pipeline (`processarItensBlocoAssinatura`) ganha um parâmetro `sempreNotificarPendentes` para diferenciar o caminho de alarme (re-notifica tudo que ainda está pendente) do caminho de mensagem/visita real (notifica só a primeira vez, comportamento inalterado). Um novo campo `blocoAssinaturaPendenteAtual` em `LocalConfig` é sobrescrito a cada execução do pipeline e passa a alimentar o badge/popup. Um novo listener de mensagem, com throttle de 2 minutos via um helper puro testável, dispara a checagem em segundo plano imediatamente ao detectar qualquer acesso a uma tela do SEI, sem esperar o próximo tick do `chrome.alarms`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente no projeto. Nenhuma dependência nova.

## Global Constraints

- Não porta nenhuma funcionalidade nova do Sei++/Sei Pro nesta entrega — é só correção de comportamento já implementado na feature de bloco de assinatura.
- Caminho de mensagem (content script, incluindo cada disparo do `MutationObserver`) mantém notificação única e permanente por item (via `blocoAssinaturaNotificado`) — não deve repetir a cada disparo.
- Caminho de alarme/checagem imediata deve notificar **todos** os itens atualmente pendentes a cada execução, independentemente de já terem sido notificados antes.
- Checagem imediata ao detectar qualquer acesso a uma tela do SEI, limitada a **no mínimo 2 minutos entre execuções** (throttle).
- Badge (`content-scripts/core/badge.ts`) e popup (`popup/main.ts`) devem contar `LocalConfig.blocoAssinaturaPendenteAtual` (sobrescrito a cada execução do pipeline), nunca mais `Object.keys(blocoAssinaturaNotificado).length`.
- Toda chamada/listener novo segue o padrão já estabelecido no projeto: guard `try/catch` ou `.catch()`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada através de uma fronteira de mensageria/callback de plataforma.
- Sem mudanças em `manifest.config.ts` — nenhuma permissão nova é necessária para esta correção.

---

### Task 1: `lib/storage.ts` — novos campos em `LocalConfig`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `LocalConfig.blocoAssinaturaPendenteAtual: string[]`; `LocalConfig.ultimaVerificacaoImediata?: string`; `DEFAULT_LOCAL_CONFIG` atualizado com `blocoAssinaturaPendenteAtual: []`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/lib/storage.test.ts` (dentro do `describe('createLocalConfigStore', ...)` já existente):

```ts
  it('inclui blocoAssinaturaPendenteAtual vazio por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).blocoAssinaturaPendenteAtual).toEqual([])
  })

  it('persiste blocoAssinaturaPendenteAtual e ultimaVerificacaoImediata', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaPendenteAtual: ['abc', 'def'],
      ultimaVerificacaoImediata: '2026-07-06T10:00:00.000Z',
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `blocoAssinaturaPendenteAtual` é `undefined` no primeiro teste novo (não existe ainda em `DEFAULT_LOCAL_CONFIG`), e o segundo teste falha na comparação por causa do campo ausente.

- [ ] **Step 3: Implementar os campos novos em `src/lib/storage.ts`**

Modificar a interface `LocalConfig` (atualmente):

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
}
```

Para:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  ultimaVerificacaoImediata?: string
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
}
```

Modificar `DEFAULT_LOCAL_CONFIG` (atualmente):

```ts
export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
}
```

Para:

```ts
export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (6 testes — 4 já existentes + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add blocoAssinaturaPendenteAtual and ultimaVerificacaoImediata fields"
```

---

### Task 2: `features/bloco-assinatura/diffPendentes.ts` — extrair helper `ehPendente`

**Files:**
- Modify: `C:\sei\seirmg\src\features\bloco-assinatura\diffPendentes.ts`
- Modify: `C:\sei\seirmg\src\features\bloco-assinatura\diffPendentes.test.ts`

**Interfaces:**
- Consumes: `BlocoAssinaturaItem`, `EstadoBloco` (de `./types`)
- Produces: `ehPendente(item: BlocoAssinaturaItem): boolean` (novo export; `diffPendentes` mantém a mesma assinatura e comportamento de antes)

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao início de `src/features/bloco-assinatura/diffPendentes.test.ts` (após os imports e as constantes `itemPendente`/`itemAberto`/`itemPelaArea`/`itemRetornado` já existentes, antes do `describe('diffPendentes', ...)`):

```ts
describe('ehPendente', () => {
  it('considera pendente um item disponibilizado para a área', () => {
    expect(ehPendente(itemPendente)).toBe(true)
  })

  it('considera pendente um item aberto', () => {
    expect(ehPendente(itemAberto)).toBe(true)
  })

  it('não considera pendente um item disponibilizado pela área', () => {
    expect(ehPendente(itemPelaArea)).toBe(false)
  })

  it('não considera pendente um item retornado', () => {
    expect(ehPendente(itemRetornado)).toBe(false)
  })
})
```

E atualizar a linha de import no topo do arquivo de:

```ts
import { diffPendentes } from './diffPendentes'
```

Para:

```ts
import { diffPendentes, ehPendente } from './diffPendentes'
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/bloco-assinatura/diffPendentes.test.ts`
Expected: FAIL — `ehPendente` não é exportado por `./diffPendentes` (erro de import/`undefined is not a function`)

- [ ] **Step 3: Implementar `ehPendente` em `src/features/bloco-assinatura/diffPendentes.ts`**

Arquivo atual:

```ts
import type { NotificadoState } from '../../lib/storage'
import type { BlocoAssinaturaItem } from './types'

export interface DiffResultado {
  novos: BlocoAssinaturaItem[]
  estadoAtualizado: NotificadoState
}

export function diffPendentes(
  itens: BlocoAssinaturaItem[],
  jaNotificados: NotificadoState,
  agoraIso: string
): DiffResultado {
  const pendentes = itens.filter(
    (item) => item.estado === 'disponibilizado_para_area' || item.estado === 'aberto'
  )
  const novos = pendentes.filter((item) => !(item.id in jaNotificados))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  novos.forEach((item) => {
    estadoAtualizado[item.id] = { notificadoEm: agoraIso }
  })

  return { novos, estadoAtualizado }
}
```

Substituir por:

```ts
import type { NotificadoState } from '../../lib/storage'
import type { BlocoAssinaturaItem } from './types'

export interface DiffResultado {
  novos: BlocoAssinaturaItem[]
  estadoAtualizado: NotificadoState
}

export function ehPendente(item: BlocoAssinaturaItem): boolean {
  return item.estado === 'disponibilizado_para_area' || item.estado === 'aberto'
}

export function diffPendentes(
  itens: BlocoAssinaturaItem[],
  jaNotificados: NotificadoState,
  agoraIso: string
): DiffResultado {
  const pendentes = itens.filter(ehPendente)
  const novos = pendentes.filter((item) => !(item.id in jaNotificados))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  novos.forEach((item) => {
    estadoAtualizado[item.id] = { notificadoEm: agoraIso }
  })

  return { novos, estadoAtualizado }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/bloco-assinatura/diffPendentes.test.ts`
Expected: PASS (10 testes — 6 já existentes + 4 novos)

- [ ] **Step 5: Commit**

```bash
git add src/features/bloco-assinatura/diffPendentes.ts src/features/bloco-assinatura/diffPendentes.test.ts
git commit -m "refactor(bloco-assinatura): extract ehPendente predicate from diffPendentes"
```

---

### Task 3: `background/blocoAssinaturaPipeline.ts` — `sempreNotificarPendentes` + `blocoAssinaturaPendenteAtual` persistente

**Files:**
- Modify: `C:\sei\seirmg\src\background\blocoAssinaturaPipeline.ts`
- Modify: `C:\sei\seirmg\src\background\blocoAssinaturaPipeline.test.ts`

**Interfaces:**
- Consumes: `ehPendente`, `diffPendentes` (Task 2, `../features/bloco-assinatura/diffPendentes`)
- Produces: `BlocoAssinaturaPipelineDeps.sempreNotificarPendentes?: boolean` (novo campo); `processarItensBlocoAssinatura` mantém a mesma assinatura pública, mas passa a sempre persistir `blocoAssinaturaPendenteAtual` e a notificar todos os pendentes quando `sempreNotificarPendentes` é `true`

- [ ] **Step 1: Escrever os testes que falham**

Substituir o conteúdo de `src/background/blocoAssinaturaPipeline.test.ts` (arquivo atual tem 3 testes; a versão nova tem 6 — os 3 antigos ficam com pequenos ajustes de expectativa, mais 3 novos) por:

```ts
import { describe, expect, it, vi } from 'vitest'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../lib/storage'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const item: BlocoAssinaturaItem = { id: 'x', numero: '9', link: '/x', estado: 'aberto' }
const itemResolvido: BlocoAssinaturaItem = { id: 'y', numero: '8', link: '/y', estado: 'retornado' }

describe('processarItensBlocoAssinatura', () => {
  it('notifica e persiste quando há item novo pendente', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensBlocoAssinatura([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => DEFAULT_LOCAL_CONFIG,
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-06T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith(item, DEFAULT_SYNC_CONFIG.blocoAssinatura.tocarSom)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
      blocoAssinaturaPendenteAtual: ['x'],
    })
  })

  it('não notifica quando a feature está desativada nas opções', async () => {
    const notificar = vi.fn()

    await processarItensBlocoAssinatura([item], {
      syncStore: {
        get: async () => ({
          ...DEFAULT_SYNC_CONFIG,
          blocoAssinatura: { ...DEFAULT_SYNC_CONFIG.blocoAssinatura, ativo: false },
        }),
        set: async () => {},
      },
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('não notifica novamente (modo padrão) um item já registrado como notificado', async () => {
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
    })

    expect(notificar).not.toHaveBeenCalled()
  })

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

  it('persiste blocoAssinaturaPendenteAtual mesmo quando não há item novo para notificar', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensBlocoAssinatura([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
        }),
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
    })

    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
      blocoAssinaturaPendenteAtual: ['x'],
    })
  })

  it('blocoAssinaturaPendenteAtual reflete só os itens atualmente pendentes', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensBlocoAssinatura([item, itemResolvido], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => DEFAULT_LOCAL_CONFIG,
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-06T10:00:00.000Z',
    })

    expect((localSalvo as { blocoAssinaturaPendenteAtual: string[] }).blocoAssinaturaPendenteAtual).toEqual([
      'x',
    ])
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/background/blocoAssinaturaPipeline.test.ts`
Expected: FAIL — o teste 1 falha porque `localSalvo` ainda não tem `blocoAssinaturaPendenteAtual`; os testes 4, 5 e 6 falham porque `sempreNotificarPendentes` não existe e `localStore.set` não é chamado quando `novos.length === 0`.

- [ ] **Step 3: Implementar `src/background/blocoAssinaturaPipeline.ts`**

Arquivo atual:

```ts
import { diffPendentes } from '../features/bloco-assinatura/diffPendentes'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarNovoBloco } from './notifications/notify'

type SyncStore = ReturnType<typeof createSyncConfigStore>
type LocalStore = ReturnType<typeof createLocalConfigStore>

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
  const { novos, estadoAtualizado } = diffPendentes(
    itens,
    localConfig.blocoAssinaturaNotificado,
    agoraIso
  )
  if (novos.length === 0) return

  novos.forEach((item) => notificar(item, config.blocoAssinatura.tocarSom))
  await localStore.set({ ...localConfig, blocoAssinaturaNotificado: estadoAtualizado })
}
```

Substituir por:

```ts
import { diffPendentes, ehPendente } from '../features/bloco-assinatura/diffPendentes'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarNovoBloco } from './notifications/notify'

type SyncStore = ReturnType<typeof createSyncConfigStore>
type LocalStore = ReturnType<typeof createLocalConfigStore>

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

  await localStore.set({
    ...localConfig,
    blocoAssinaturaNotificado: estadoAtualizado,
    blocoAssinaturaPendenteAtual: pendentesAgora.map((item) => item.id),
  })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/blocoAssinaturaPipeline.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/background/blocoAssinaturaPipeline.ts src/background/blocoAssinaturaPipeline.test.ts
git commit -m "feat(bloco-assinatura): add sempreNotificarPendentes and persist blocoAssinaturaPendenteAtual"
```

---

### Task 4: `background/alarms/blocoAssinaturaCheck.ts` — passar `sempreNotificarPendentes: true`

**Files:**
- Modify: `C:\sei\seirmg\src\background\alarms\blocoAssinaturaCheck.ts`
- Modify: `C:\sei\seirmg\src\background\alarms\blocoAssinaturaCheck.test.ts`

**Interfaces:**
- Consumes: `BlocoAssinaturaPipelineDeps` (Task 3, `../blocoAssinaturaPipeline`)
- Produces: `BlocoAssinaturaCheckDeps.processarItens` passa a aceitar um segundo parâmetro opcional (`deps?: BlocoAssinaturaPipelineDeps`), mantendo `ALARM_NAME` e a assinatura de `verificarBlocoAssinatura` inalteradas

- [ ] **Step 1: Atualizar o teste que precisa da nova expectativa**

Em `src/background/alarms/blocoAssinaturaCheck.test.ts`, o teste `'faz parse do HTML retornado e delega os itens para processarItens'` (segundo teste do arquivo) tem hoje:

```ts
    expect(processarItens).toHaveBeenCalledWith([
      { id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'aberto' },
    ])
```

Substituir por:

```ts
    expect(processarItens).toHaveBeenCalledWith(
      [{ id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'aberto' }],
      { sempreNotificarPendentes: true }
    )
```

O restante do arquivo (os outros dois testes) não muda.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/background/alarms/blocoAssinaturaCheck.test.ts`
Expected: FAIL no teste editado — `processarItens` foi chamado só com 1 argumento (a implementação ainda não passa o segundo)

- [ ] **Step 3: Implementar em `src/background/alarms/blocoAssinaturaCheck.ts`**

Arquivo atual:

```ts
import type { Result } from '../../lib/result'
import {
  parseBlocoAssinaturaTable,
  type ParseBlocoAssinaturaOptions,
} from '../../features/bloco-assinatura/parser'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import { processarItensBlocoAssinatura } from '../blocoAssinaturaPipeline'

export const ALARM_NAME = 'seirmg-check-bloco-assinatura'

export interface BlocoAssinaturaCheckDeps {
  fetchBlocoAssinaturaHtml: () => Promise<Result<string>>
  parseOptions: ParseBlocoAssinaturaOptions
  processarItens?: (itens: BlocoAssinaturaItem[]) => Promise<void>
}

export async function verificarBlocoAssinatura(deps: BlocoAssinaturaCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensBlocoAssinatura

  const resultado = await deps.fetchBlocoAssinaturaHtml()
  if (!resultado.ok) return

  try {
    const dom = new DOMParser().parseFromString(resultado.data, 'text/html')
    const itens = parseBlocoAssinaturaTable(dom, deps.parseOptions)
    await processarItens(itens)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens do bloco de assinatura:', error)
  }
}
```

Substituir por:

```ts
import type { Result } from '../../lib/result'
import {
  parseBlocoAssinaturaTable,
  type ParseBlocoAssinaturaOptions,
} from '../../features/bloco-assinatura/parser'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import {
  processarItensBlocoAssinatura,
  type BlocoAssinaturaPipelineDeps,
} from '../blocoAssinaturaPipeline'

export const ALARM_NAME = 'seirmg-check-bloco-assinatura'

export interface BlocoAssinaturaCheckDeps {
  fetchBlocoAssinaturaHtml: () => Promise<Result<string>>
  parseOptions: ParseBlocoAssinaturaOptions
  processarItens?: (itens: BlocoAssinaturaItem[], deps?: BlocoAssinaturaPipelineDeps) => Promise<void>
}

export async function verificarBlocoAssinatura(deps: BlocoAssinaturaCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensBlocoAssinatura

  const resultado = await deps.fetchBlocoAssinaturaHtml()
  if (!resultado.ok) return

  try {
    const dom = new DOMParser().parseFromString(resultado.data, 'text/html')
    const itens = parseBlocoAssinaturaTable(dom, deps.parseOptions)
    await processarItens(itens, { sempreNotificarPendentes: true })
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens do bloco de assinatura:', error)
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/alarms/blocoAssinaturaCheck.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/background/alarms/blocoAssinaturaCheck.ts src/background/alarms/blocoAssinaturaCheck.test.ts
git commit -m "feat(bloco-assinatura): pass sempreNotificarPendentes:true from the alarm-triggered check"
```

---

### Task 5: `lib/throttle.ts` — helper puro `passouIntervalo`

**Files:**
- Create: `C:\sei\seirmg\src\lib\throttle.ts`
- Test: `C:\sei\seirmg\src\lib\throttle.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `passouIntervalo(desde: string | undefined, agoraIso: string, minMinutos: number): boolean`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/throttle.test.ts
import { describe, expect, it } from 'vitest'
import { passouIntervalo } from './throttle'

describe('passouIntervalo', () => {
  it('retorna true quando nunca verificou antes (desde é undefined)', () => {
    expect(passouIntervalo(undefined, '2026-07-06T10:00:00.000Z', 2)).toBe(true)
  })

  it('retorna false quando o intervalo mínimo ainda não passou', () => {
    expect(
      passouIntervalo('2026-07-06T10:00:00.000Z', '2026-07-06T10:01:00.000Z', 2)
    ).toBe(false)
  })

  it('retorna true quando o intervalo mínimo já passou', () => {
    expect(
      passouIntervalo('2026-07-06T10:00:00.000Z', '2026-07-06T10:02:01.000Z', 2)
    ).toBe(true)
  })

  it('retorna true no limite exato do intervalo', () => {
    expect(
      passouIntervalo('2026-07-06T10:00:00.000Z', '2026-07-06T10:02:00.000Z', 2)
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/throttle.test.ts`
Expected: FAIL — `Cannot find module './throttle'`

- [ ] **Step 3: Implementar `src/lib/throttle.ts`**

```ts
export function passouIntervalo(
  desde: string | undefined,
  agoraIso: string,
  minMinutos: number
): boolean {
  if (!desde) return true
  const diffMs = new Date(agoraIso).getTime() - new Date(desde).getTime()
  return diffMs >= minMinutos * 60 * 1000
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/throttle.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/throttle.ts src/lib/throttle.test.ts
git commit -m "feat(lib): add passouIntervalo throttle helper"
```

---

### Task 6: `background/index.ts` — listener `seirmg:sei-detectado` com checagem imediata

**Files:**
- Modify: `C:\sei\seirmg\src\background\index.ts`

**Contexto**: esta camada só conecta `chrome.*` (runtime, storage) à lógica já testada nas tasks anteriores. Não é coberta por TDD (chrome.* não é mockável de forma útil aqui) — a verificação é a suíte completa + build, igual às outras tasks de wiring do plano anterior.

**Interfaces:**
- Consumes: `passouIntervalo` (Task 5, `../lib/throttle`); `createLocalConfigStore` (`../lib/storage`, já usado neste arquivo)

- [ ] **Step 1: Substituir `src/background/index.ts`**

Arquivo atual:

```ts
import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchText } from '../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}

function ehMensagemItensBloco(mensagem: unknown): mensagem is MensagemItensBloco {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function verificarBlocoAssinaturaViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarBlocoAssinatura({
    fetchBlocoAssinaturaHtml: () =>
      fetchText(`${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`),
    parseOptions: { seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true },
  })
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  verificarBlocoAssinaturaViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  processarItensBlocoAssinatura(mensagem.itens).catch((error) => {
    console.error(
      '[SEIRMG] Falha ao processar itens do bloco de assinatura recebidos via mensagem:',
      error
    )
  })
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return

    const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
    const [abaExistente] = await chrome.tabs.query({ url: `${localConfig.baseUrlSei}/*` })

    if (abaExistente?.id) {
      chrome.tabs.update(abaExistente.id, { active: true, url })
      if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
    } else {
      chrome.tabs.create({ url })
    }
    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique na notificação do bloco de assinatura:', error)
  }
})
```

Substituir por (adiciona `MensagemSeiDetectado`/`ehMensagemSeiDetectado`, a função `verificarImediatoSeNecessario`, e um novo `chrome.runtime.onMessage.addListener`; nada mais muda):

```ts
import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchText } from '../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { passouIntervalo } from '../lib/throttle'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'
const INTERVALO_MINIMO_VERIFICACAO_IMEDIATA_MINUTOS = 2

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}

interface MensagemSeiDetectado {
  type: 'seirmg:sei-detectado'
}

function ehMensagemItensBloco(mensagem: unknown): mensagem is MensagemItensBloco {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

function ehMensagemSeiDetectado(mensagem: unknown): mensagem is MensagemSeiDetectado {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:sei-detectado'
  )
}

async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function verificarBlocoAssinaturaViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarBlocoAssinatura({
    fetchBlocoAssinaturaHtml: () =>
      fetchText(`${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`),
    parseOptions: { seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true },
  })
}

async function verificarImediatoSeNecessario(): Promise<void> {
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const agoraIso = new Date().toISOString()

  if (
    !passouIntervalo(
      localConfig.ultimaVerificacaoImediata,
      agoraIso,
      INTERVALO_MINIMO_VERIFICACAO_IMEDIATA_MINUTOS
    )
  ) {
    return
  }

  await localStore.set({ ...localConfig, ultimaVerificacaoImediata: agoraIso })
  await verificarBlocoAssinaturaViaFetch()
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  verificarBlocoAssinaturaViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  processarItensBlocoAssinatura(mensagem.itens).catch((error) => {
    console.error(
      '[SEIRMG] Falha ao processar itens do bloco de assinatura recebidos via mensagem:',
      error
    )
  })
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemSeiDetectado(mensagem)) return
  verificarImediatoSeNecessario().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar imediatamente após detectar sessão do SEI:', error)
  })
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return

    const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
    const [abaExistente] = await chrome.tabs.query({ url: `${localConfig.baseUrlSei}/*` })

    if (abaExistente?.id) {
      chrome.tabs.update(abaExistente.id, { active: true, url })
      if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
    } else {
      chrome.tabs.create({ url })
    }
    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique na notificação do bloco de assinatura:', error)
  }
})
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes passam, 0 falhas. Contagem esperada: 53 testes no total (40 já existentes antes desta correção, +2 na Task 1, +4 na Task 2, +3 na Task 3, +0 na Task 4 — só mudou uma expectativa de teste já existente —, +4 na Task 5).

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck` para ver o detalhe.

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(bloco-assinatura): trigger immediate background check on SEI session detection"
```

---

### Task 7: `content-scripts/core/index.ts` — enviar mensagem `seirmg:sei-detectado`

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\core\index.ts`

**Contexto**: mesmo padrão da Task 6 — wiring de content script, não coberto por TDD, verificado via build.

**Interfaces:**
- Consumes: nenhuma nova (usa `chrome.runtime.sendMessage`, já disponível)
- Produces: nenhuma nova (efeito colateral: envia a mensagem `{ type: 'seirmg:sei-detectado' }`)

- [ ] **Step 1: Modificar `bootstrap()` em `src/content-scripts/core/index.ts`**

Arquivo atual:

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { applyTheme } from '../../lib/theme'
import { detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

Substituir por (só adiciona o `chrome.runtime.sendMessage` dentro do `try` existente, antes do `renderBadge()`):

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { applyTheme } from '../../lib/theme'
import { detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)

    chrome.runtime.sendMessage({ type: 'seirmg:sei-detectado' }).catch((error) => {
      console.error('[SEIRMG] Falha ao notificar sessão do SEI detectada:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

**Nota de segurança contra exceção não tratada:** `chrome.runtime.sendMessage` não é `await`ado (é *fire-and-forget*, não queremos bloquear o resto do `bootstrap()` esperando a resposta do background) — por isso precisa do seu próprio `.catch()` explícito, já que o `try/catch` da função ao redor não pega uma rejeição de uma Promise não aguardada. Mesmo padrão já estabelecido no restante do projeto.

- [ ] **Step 2: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando, build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/core/index.ts
git commit -m "feat(bloco-assinatura): send seirmg:sei-detectado on every core bootstrap"
```

---

### Task 8: `content-scripts/core/badge.ts` — contar `blocoAssinaturaPendenteAtual`

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\core\badge.ts`

**Contexto**: DOM-heavy, não coberto por TDD (mesmo padrão das demais tasks de content script), verificado via build.

**Interfaces:**
- Consumes: `LocalConfig.blocoAssinaturaPendenteAtual` (Task 1)
- Produces: `renderBadge(): Promise<void>` mantém a mesma assinatura, só troca a fonte da contagem

- [ ] **Step 1: Modificar `src/content-scripts/core/badge.ts`**

Arquivo atual:

```ts
import { createLocalConfigStore } from '../../lib/storage'

const BADGE_ID = 'seirmg-badge-pendencias'

export async function renderBadge(): Promise<void> {
  const existente = document.getElementById(BADGE_ID)
  if (existente) existente.remove()

  const localConfig = await createLocalConfigStore().get()
  // conta itens rastreados como pendentes; remoção ao assinar/resolver fica para um plano futuro
  const totalPendente = Object.keys(localConfig.blocoAssinaturaNotificado).length
  if (totalPendente === 0) return

  const logo = document.querySelector('#lnkInfraLogo, #divLogoSEI, .infraLogo')
  const container = logo?.parentElement ?? document.body

  const badge = document.createElement('span')
  badge.id = BADGE_ID
  badge.textContent = String(totalPendente)
  badge.title = `${totalPendente} pendência(s) de assinatura`
  badge.style.cssText =
    'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;' +
    'background:#e46e64;color:#fff;font-size:11px;font-weight:bold;vertical-align:top;'

  container.appendChild(badge)
}
```

Substituir por:

```ts
import { createLocalConfigStore } from '../../lib/storage'

const BADGE_ID = 'seirmg-badge-pendencias'

export async function renderBadge(): Promise<void> {
  const existente = document.getElementById(BADGE_ID)
  if (existente) existente.remove()

  const localConfig = await createLocalConfigStore().get()
  const totalPendente = localConfig.blocoAssinaturaPendenteAtual.length
  if (totalPendente === 0) return

  const logo = document.querySelector('#lnkInfraLogo, #divLogoSEI, .infraLogo')
  const container = logo?.parentElement ?? document.body

  const badge = document.createElement('span')
  badge.id = BADGE_ID
  badge.textContent = String(totalPendente)
  badge.title = `${totalPendente} pendência(s) de assinatura`
  badge.style.cssText =
    'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;' +
    'background:#e46e64;color:#fff;font-size:11px;font-weight:bold;vertical-align:top;'

  container.appendChild(badge)
}
```

- [ ] **Step 2: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando, build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/core/badge.ts
git commit -m "fix(badge): count blocoAssinaturaPendenteAtual instead of the ever-notified map"
```

---

### Task 9: `popup/main.ts` — contar `blocoAssinaturaPendenteAtual`

**Files:**
- Modify: `C:\sei\seirmg\src\popup\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build.

**Interfaces:**
- Consumes: `LocalConfig.blocoAssinaturaPendenteAtual` (Task 1)
- Produces: nenhuma nova (só troca a fonte da contagem exibida)

- [ ] **Step 1: Modificar a função `render()` em `src/popup/main.ts`**

Trecho atual (início do arquivo):

```ts
import { createLocalConfigStore } from '../lib/storage'

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = Object.keys(localConfig.blocoAssinaturaNotificado).length
```

Substituir por:

```ts
import { createLocalConfigStore } from '../lib/storage'

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = localConfig.blocoAssinaturaPendenteAtual.length
```

O restante do arquivo (mensagens de status, botão "Abrir bloco de assinatura", tratamento de erro) não muda.

- [ ] **Step 2: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando, build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/popup/main.ts
git commit -m "fix(popup): count blocoAssinaturaPendenteAtual instead of the ever-notified map"
```

---

### Task 10: Checagem final (typecheck/lint/test/build)

**Files:** nenhum arquivo novo — checklist de verificação, mesmo padrão da Task 20 do plano anterior.

- [ ] **Step 1: Rodar a checagem completa**

Run:
```bash
cd C:\sei\seirmg
bun run typecheck
bun run lint
bun run test
bun run build
```
Expected: os 4 comandos terminam com código de saída 0 (sem erros de tipo, sem erros de lint, todos os testes passando, build gerado em `dist/`).

- [ ] **Step 2: Validar o `manifest.json` gerado (confirma que nenhuma mudança acidental de manifest aconteceu)**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes desta correção (nenhuma nova).

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: checagem imediata com throttle de 2 min (Tasks 5-7), notificação recorrente no caminho do alarme via `sempreNotificarPendentes` (Tasks 3-4), badge/popup contando `blocoAssinaturaPendenteAtual` (Tasks 8-9), novos campos de storage (Task 1), helper `ehPendente` extraído sem quebrar `diffPendentes` (Task 2). Todas as decisões da spec têm uma task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO" nos passos; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `BlocoAssinaturaPipelineDeps.sempreNotificarPendentes` (Task 3) é consumido identicamente pela Task 4 (`blocoAssinaturaCheck.ts`, tipo `deps?: BlocoAssinaturaPipelineDeps`) e pela Task 6 (`background/index.ts`, que não precisa da opção — usa o default `false` do listener de mensagem existente). `LocalConfig.blocoAssinaturaPendenteAtual`/`ultimaVerificacaoImediata` (Task 1) usados com o mesmo nome em `blocoAssinaturaPipeline.ts` (Task 3), `background/index.ts` (Task 6), `badge.ts` (Task 8) e `popup/main.ts` (Task 9). `passouIntervalo` (Task 5) consumido com a mesma assinatura `(string | undefined, string, number) => boolean` na Task 6.
