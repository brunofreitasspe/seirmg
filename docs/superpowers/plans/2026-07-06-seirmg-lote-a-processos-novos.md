# SEIRMG — Lote A: Notificação de Processos Novos + Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar a notificação de processos novos do Sei++ (`background/notifyProcessos.js` + `background/api.js`) para o SEIRMG, com notificação por processo específico (dedup permanente por ID) e um badge no ícone da extensão que soma a cada processo novo e zera ao abrir o popup.

**Architecture:** Ver `docs/superpowers/specs/2026-07-06-seirmg-lote-a-processos-novos-design.md`. Espelha de perto a estrutura já usada pela feature de bloco de assinatura (lógica pura testável em `features/`, orquestração DI-testável em `background/`, wiring fino e não-testado em `background/index.ts`/`popup/`/`options/`), com uma peça própria (`fetchListaProcessos.ts`) que porta a lógica de retentativa de 1 nível do Sei++ original.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Notificação por processo, com dedup **permanente** por ID — nunca re-notifica o mesmo processo (diferente do bloco de assinatura, que agora repete lembretes; essa diferença é intencional).
- Badge do **ícone da extensão** (`chrome.action.setBadgeText`), separado do badge NA PÁGINA do bloco de assinatura — não somar os dois indicadores.
- Badge do ícone é um contador que **soma** a cada processo novo notificado e **zera** ao abrir o popup — não um booleano, não um "total pendente".
- Erro de checagem (rede, autenticação expirada, parse) sempre loga e tenta de novo no próximo ciclo do alarme — nunca desativa a feature automaticamente.
- Sem mudanças em `manifest.config.ts` — nenhuma permissão nova, nenhum content script novo.
- Todo listener/callback assíncrono novo segue o padrão já estabelecido: guard `try/catch` ou `.catch()`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── lib/storage.ts (modificado)
│   ├── features/processos-novos/
│   │   ├── types.ts (novo)
│   │   ├── parser.ts (+ .test.ts, novo)
│   │   └── diffNaoVisualizados.ts (+ .test.ts, novo)
│   ├── background/
│   │   ├── index.ts (modificado)
│   │   ├── processosNovosPipeline.ts (+ .test.ts, novo)
│   │   ├── processosNovos/fetchListaProcessos.ts (+ .test.ts, novo)
│   │   ├── notifications/notify.ts (modificado)
│   │   └── alarms/processosNovosCheck.ts (+ .test.ts, novo)
│   ├── popup/index.html, main.ts (modificados)
│   └── options/index.html, main.ts (modificados)
```

---

### Task 1: `lib/storage.ts` — schema de `processosNovos`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `ProcessosNovosConfig { ativo: boolean; intervaloMinutos: number; tocarSom: boolean }`; `SyncConfig.processosNovos: ProcessosNovosConfig`; `LocalConfig.processosNovosNotificado: NotificadoState`; `LocalConfig.processosNovosBadgeCount: number`; `DEFAULT_SYNC_CONFIG.processosNovos = { ativo: true, intervaloMinutos: 5, tocarSom: true }`; `DEFAULT_LOCAL_CONFIG.processosNovosNotificado = {}`, `processosNovosBadgeCount = 0`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('createSyncConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('inclui processosNovos padrão (ativo, 5 min, som) quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).processosNovos).toEqual({ ativo: true, intervaloMinutos: 5, tocarSom: true })
  })

  it('persiste e recupera alterações de processosNovos', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      processosNovos: { ativo: false, intervaloMinutos: 10, tocarSom: false },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

Adicionar ao final do `describe('createLocalConfigStore', ...)` já existente:

```ts
  it('inclui processosNovosBadgeCount zero por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).processosNovosBadgeCount).toBe(0)
  })

  it('persiste processosNovosNotificado e processosNovosBadgeCount', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      processosNovosNotificado: { p1: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
      processosNovosBadgeCount: 3,
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — os testes de `processosNovos`/`processosNovosBadgeCount` falham porque esses campos ainda não existem em `SyncConfig`/`LocalConfig`/`DEFAULT_SYNC_CONFIG`/`DEFAULT_LOCAL_CONFIG`.

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Adicionar a interface nova (antes de `SyncConfig`):

```ts
export interface ProcessosNovosConfig {
  ativo: boolean
  intervaloMinutos: number
  tocarSom: boolean
}
```

Modificar `SyncConfig` (adicionar o campo `processosNovos` depois de `blocoAssinatura`):

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  processosNovos: ProcessosNovosConfig
}
```

Modificar `LocalConfig` (adicionar os dois campos novos depois de `ultimaVerificacaoImediata`):

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
}
```

Modificar `DEFAULT_SYNC_CONFIG` (adicionar `processosNovos` depois de `blocoAssinatura`):

```ts
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  schemaVersion: 1,
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
  },
  tema: { preset: 'claro' },
  blocoAssinatura: {
    ativo: true,
    intervaloMinutos: 15,
    tocarSom: true,
  },
  processosNovos: {
    ativo: true,
    intervaloMinutos: 5,
    tocarSom: true,
  },
}
```

Modificar `DEFAULT_LOCAL_CONFIG` (adicionar os dois campos novos):

```ts
export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
  processosNovosNotificado: {},
  processosNovosBadgeCount: 0,
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (10 testes — 6 já existentes + 4 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add processosNovos config and local state fields"
```

---

### Task 2: `features/processos-novos/types.ts` + `parser.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\processos-novos\types.ts`
- Create: `C:\sei\seirmg\src\features\processos-novos\parser.ts`
- Test: `C:\sei\seirmg\src\features\processos-novos\parser.test.ts`

**Contexto**: porte de `C:\sei\seiplus\background\api.js`'s `listarProcessos()`, mas deliberadamente reduzido aos únicos campos usados pelo fluxo de notificação (o original extrai um JSON bem mais rico — `atribuido`, `tipoProcesso`, `interessados`, etc. — nenhum desses é lido por `notifyProcessos()`, então não são portados). Lê a tabela `#tblProcessosDetalhado` da tela Controle de Processos (`acao=procedimento_controlar`); cada `<tr id="...">` é um processo; a 3ª célula tem o link com o número do processo e a classe CSS nativa `processoVisualizado` quando o SEI já marcou como visto.

**Interfaces:**
- Consumes: nenhuma
- Produces: `interface ProcessoItem { id: string; numero: string; visualizado: boolean }`; `parseProcessosControlarTable(root: ParentNode): ProcessoItem[]`

- [ ] **Step 1: Criar `src/features/processos-novos/types.ts`**

```ts
export interface ProcessoItem {
  id: string
  numero: string
  visualizado: boolean
}
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/features/processos-novos/parser.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { parseProcessosControlarTable } from './parser'

function montarLinha(id: string, numero: string, visualizado: boolean): string {
  const classe = visualizado ? 'class="processoVisualizado"' : ''
  return `<tr id="${id}"><td></td><td></td><td><a href="#" ${classe}>${numero}</a></td></tr>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseProcessosControlarTable', () => {
  it('extrai id, numero e visualizado de cada linha', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody>${montarLinha('P1', '00001', false)}</tbody></table>`
    const itens = parseProcessosControlarTable(document.body)
    expect(itens).toEqual([{ id: 'P1', numero: '00001', visualizado: false }])
  })

  it('marca visualizado true quando a linha tem a classe processoVisualizado', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody>${montarLinha('P2', '00002', true)}</tbody></table>`
    const [item] = parseProcessosControlarTable(document.body)
    expect(item.visualizado).toBe(true)
  })

  it('processa múltiplas linhas', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody>${montarLinha('P1', '1', false)}${montarLinha('P2', '2', true)}</tbody></table>`
    expect(parseProcessosControlarTable(document.body)).toHaveLength(2)
  })

  it('retorna lista vazia quando a tabela não existe', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseProcessosControlarTable(document.body)).toEqual([])
  })

  it('ignora linhas sem id', () => {
    document.body.innerHTML = `<table id="tblProcessosDetalhado"><tbody><tr><td>sem id</td></tr>${montarLinha('P1', '1', false)}</tbody></table>`
    expect(parseProcessosControlarTable(document.body)).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/processos-novos/parser.test.ts`
Expected: FAIL — `Cannot find module './parser'`

- [ ] **Step 4: Implementar `src/features/processos-novos/parser.ts`**

```ts
import type { ProcessoItem } from './types'

export function parseProcessosControlarTable(root: ParentNode): ProcessoItem[] {
  const linhas = root.querySelectorAll('#tblProcessosDetalhado > tbody > tr[id]')

  return Array.from(linhas).flatMap((linha) => {
    const link = linha.querySelector('td:nth-child(3) > a')
    if (!link) return []

    return [
      {
        id: linha.id,
        numero: link.textContent?.trim() ?? '',
        visualizado: link.classList.contains('processoVisualizado'),
      },
    ]
  })
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/processos-novos/parser.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 6: Commit**

```bash
git add src/features/processos-novos/types.ts src/features/processos-novos/parser.ts src/features/processos-novos/parser.test.ts
git commit -m "feat(processos-novos): add ProcessoItem type and table parser"
```

---

### Task 3: `features/processos-novos/diffNaoVisualizados.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\processos-novos\diffNaoVisualizados.ts`
- Test: `C:\sei\seirmg\src\features\processos-novos\diffNaoVisualizados.test.ts`

**Contexto**: mesma forma de `features/bloco-assinatura/diffPendentes.ts` — dedup **permanente** por ID (nunca re-notifica o mesmo processo, diferente do bloco de assinatura).

**Interfaces:**
- Consumes: `ProcessoItem` (Task 2, `./types`); `NotificadoState` (`../../lib/storage`)
- Produces: `ehNaoVisualizado(item: ProcessoItem): boolean`; `diffNaoVisualizados(itens: ProcessoItem[], jaNotificados: NotificadoState, agoraIso: string): { novos: ProcessoItem[]; estadoAtualizado: NotificadoState }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/features/processos-novos/diffNaoVisualizados.test.ts
import { describe, expect, it } from 'vitest'
import { diffNaoVisualizados, ehNaoVisualizado } from './diffNaoVisualizados'
import type { ProcessoItem } from './types'

const itemNaoVisualizado: ProcessoItem = { id: 'p1', numero: '1', visualizado: false }
const itemVisualizado: ProcessoItem = { id: 'p2', numero: '2', visualizado: true }

describe('ehNaoVisualizado', () => {
  it('considera não visualizado quando visualizado é false', () => {
    expect(ehNaoVisualizado(itemNaoVisualizado)).toBe(true)
  })

  it('considera visualizado quando visualizado é true', () => {
    expect(ehNaoVisualizado(itemVisualizado)).toBe(false)
  })
})

describe('diffNaoVisualizados', () => {
  it('considera novo um item não visualizado ainda não notificado', () => {
    const { novos, estadoAtualizado } = diffNaoVisualizados(
      [itemNaoVisualizado],
      {},
      '2026-07-06T10:00:00.000Z'
    )
    expect(novos).toEqual([itemNaoVisualizado])
    expect(estadoAtualizado).toEqual({ p1: { notificadoEm: '2026-07-06T10:00:00.000Z' } })
  })

  it('não repete notificação para item já notificado', () => {
    const { novos } = diffNaoVisualizados(
      [itemNaoVisualizado],
      { p1: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(novos).toEqual([])
  })

  it('ignora itens já visualizados', () => {
    const { novos } = diffNaoVisualizados([itemVisualizado], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([])
  })

  it('preserva o estado de notificações anteriores não relacionadas', () => {
    const { estadoAtualizado } = diffNaoVisualizados(
      [itemNaoVisualizado],
      { zzz: { notificadoEm: '2026-01-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(estadoAtualizado).toEqual({
      zzz: { notificadoEm: '2026-01-01T00:00:00.000Z' },
      p1: { notificadoEm: '2026-07-06T10:00:00.000Z' },
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/processos-novos/diffNaoVisualizados.test.ts`
Expected: FAIL — `Cannot find module './diffNaoVisualizados'`

- [ ] **Step 3: Implementar `src/features/processos-novos/diffNaoVisualizados.ts`**

```ts
import type { NotificadoState } from '../../lib/storage'
import type { ProcessoItem } from './types'

export interface DiffNaoVisualizadosResultado {
  novos: ProcessoItem[]
  estadoAtualizado: NotificadoState
}

export function ehNaoVisualizado(item: ProcessoItem): boolean {
  return !item.visualizado
}

export function diffNaoVisualizados(
  itens: ProcessoItem[],
  jaNotificados: NotificadoState,
  agoraIso: string
): DiffNaoVisualizadosResultado {
  const naoVisualizados = itens.filter(ehNaoVisualizado)
  const novos = naoVisualizados.filter((item) => !(item.id in jaNotificados))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  novos.forEach((item) => {
    estadoAtualizado[item.id] = { notificadoEm: agoraIso }
  })

  return { novos, estadoAtualizado }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/processos-novos/diffNaoVisualizados.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/processos-novos/diffNaoVisualizados.ts src/features/processos-novos/diffNaoVisualizados.test.ts
git commit -m "feat(processos-novos): add ehNaoVisualizado predicate and diffNaoVisualizados dedup"
```

---

### Task 4: `background/processosNovos/fetchListaProcessos.ts`

**Files:**
- Create: `C:\sei\seirmg\src\background\processosNovos\fetchListaProcessos.ts`
- Test: `C:\sei\seirmg\src\background\processosNovos\fetchListaProcessos.test.ts`

**Contexto**: porte de `C:\sei\seiplus\background\api.js`'s `fetchListaDetalhada()`. A tela de Controle de Processos ocasionalmente responde com um formulário intermediário de redirecionamento (`#hdnTipoVisualizacao` diferente de `'D'`) em vez da tabela real — nesse caso, refaz a requisição **uma vez** com a URL corrigida do `action` do formulário; nunca uma segunda retentativa (evita loop).

**Interfaces:**
- Consumes: `Result`, `fetchText` (`../../lib/result`)
- Produces: `fetchListaProcessos(baseUrlSei: string, deps?: { fetchText?: typeof fetchText }): Promise<Result<Document>>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/background/processosNovos/fetchListaProcessos.test.ts
import { describe, expect, it, vi } from 'vitest'
import { fetchListaProcessos } from './fetchListaProcessos'

function montarHtmlTabela(): string {
  return '<html><body><form id="frmProcedimentoControlar"><input id="hdnTipoVisualizacao" value="D" /></form></body></html>'
}

function montarHtmlRedirecionamento(actionUrl: string): string {
  return `<html><body><form id="frmProcedimentoControlar" action="${actionUrl}"><input id="hdnTipoVisualizacao" value="R" /></form></body></html>`
}

describe('fetchListaProcessos', () => {
  it('retorna o Document direto quando a primeira resposta já é a tabela (tipoVisualizacao=D)', async () => {
    const fetchText = vi.fn().mockResolvedValue({ ok: true, data: montarHtmlTabela() })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })

    expect(resultado.ok).toBe(true)
    expect(fetchText).toHaveBeenCalledTimes(1)
    if (resultado.ok) {
      expect(resultado.data.querySelector('#hdnTipoVisualizacao')?.getAttribute('value')).toBe('D')
    }
  })

  it('refaz a requisição uma vez quando recebe o formulário de redirecionamento', async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: montarHtmlRedirecionamento('/controlador.php?acao=outro') })
      .mockResolvedValueOnce({ ok: true, data: montarHtmlTabela() })

    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })

    expect(resultado.ok).toBe(true)
    expect(fetchText).toHaveBeenCalledTimes(2)
    expect(fetchText).toHaveBeenNthCalledWith(
      2,
      'https://sei.exemplo.br/controlador.php?acao=outro',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('retorna erro quando o fetch inicial falha', async () => {
    const fetchText = vi.fn().mockResolvedValue({ ok: false, error: 'Timeout' })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })
    expect(resultado).toEqual({ ok: false, error: 'Timeout' })
    expect(fetchText).toHaveBeenCalledTimes(1)
  })

  it('retorna erro quando a retentativa também falha', async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: montarHtmlRedirecionamento('/controlador.php?acao=outro') })
      .mockResolvedValueOnce({ ok: false, error: 'Timeout' })

    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })
    expect(resultado).toEqual({ ok: false, error: 'Timeout' })
    expect(fetchText).toHaveBeenCalledTimes(2)
  })

  it('retorna erro quando o formulário de redirecionamento não tem action', async () => {
    const fetchText = vi.fn().mockResolvedValue({
      ok: true,
      data: '<html><body><form id="frmProcedimentoControlar"><input id="hdnTipoVisualizacao" value="R" /></form></body></html>',
    })
    const resultado = await fetchListaProcessos('https://sei.exemplo.br', { fetchText })
    expect(resultado.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/background/processosNovos/fetchListaProcessos.test.ts`
Expected: FAIL — `Cannot find module './fetchListaProcessos'`

- [ ] **Step 3: Implementar `src/background/processosNovos/fetchListaProcessos.ts`**

```ts
import { fetchText as fetchTextReal } from '../../lib/result'
import type { Result } from '../../lib/result'

export interface FetchListaProcessosDeps {
  fetchText?: typeof fetchTextReal
}

export async function fetchListaProcessos(
  baseUrlSei: string,
  deps: FetchListaProcessosDeps = {}
): Promise<Result<Document>> {
  const fetchTextFn = deps.fetchText ?? fetchTextReal
  const url = `${baseUrlSei}/controlador.php?acao=procedimento_controlar`
  const corpo = new URLSearchParams()
  corpo.append('hdnTipoVisualizacao', 'D')

  const primeiraTentativa = await fetchTextFn(url, { method: 'POST', body: corpo })
  if (!primeiraTentativa.ok) return primeiraTentativa

  const doc = new DOMParser().parseFromString(primeiraTentativa.data, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  const tipoVisualizacao = form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value

  if (tipoVisualizacao === 'D') return { ok: true, data: doc }

  const acaoRedirecionamento = form?.getAttribute('action')
  if (!acaoRedirecionamento) {
    return { ok: false, error: 'Formulário de redirecionamento sem action' }
  }

  const segundaTentativa = await fetchTextFn(`${baseUrlSei}${acaoRedirecionamento}`, {
    method: 'POST',
    body: corpo,
  })
  if (!segundaTentativa.ok) return segundaTentativa

  return { ok: true, data: new DOMParser().parseFromString(segundaTentativa.data, 'text/html') }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/processosNovos/fetchListaProcessos.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/background/processosNovos/fetchListaProcessos.ts src/background/processosNovos/fetchListaProcessos.test.ts
git commit -m "feat(processos-novos): add fetchListaProcessos with single-level redirect retry"
```

---

### Task 5: `background/notifications/notify.ts` — `notificarNovoProcesso`

**Files:**
- Modify: `C:\sei\seirmg\src\background\notifications\notify.ts`
- Modify: `C:\sei\seirmg\src\background\notifications\notify.test.ts`

**Interfaces:**
- Consumes: `ProcessoItem` (Task 2, `../../features/processos-novos/types`)
- Produces: `NOTIFICATION_ID_PREFIX_PROCESSO: string`; `buildNotificationIdProcesso(item: ProcessoItem): string`; `notificarNovoProcesso(item: ProcessoItem, tocarSom: boolean): void` — `notificarNovoBloco`/`buildNotificationId`/`NOTIFICATION_ID_PREFIX` continuam inalterados

- [ ] **Step 1: Escrever o teste que falha**

Arquivo atual (`src/background/notifications/notify.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { buildNotificationId } from './notify'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

describe('buildNotificationId', () => {
  it('prefixa o id do item', () => {
    const item: BlocoAssinaturaItem = { id: 'abc123', numero: '10', link: '/x', estado: 'aberto' }
    expect(buildNotificationId(item)).toBe('seirmg-bloco-assinatura-abc123')
  })
})
```

Substituir por:

```ts
import { describe, expect, it } from 'vitest'
import { buildNotificationId, buildNotificationIdProcesso } from './notify'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import type { ProcessoItem } from '../../features/processos-novos/types'

describe('buildNotificationId', () => {
  it('prefixa o id do item', () => {
    const item: BlocoAssinaturaItem = { id: 'abc123', numero: '10', link: '/x', estado: 'aberto' }
    expect(buildNotificationId(item)).toBe('seirmg-bloco-assinatura-abc123')
  })
})

describe('buildNotificationIdProcesso', () => {
  it('prefixa o id do item', () => {
    const item: ProcessoItem = { id: 'abc123', numero: '10', visualizado: false }
    expect(buildNotificationIdProcesso(item)).toBe('seirmg-processo-novo-abc123')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/background/notifications/notify.test.ts`
Expected: FAIL — `buildNotificationIdProcesso` não é exportado por `./notify`

- [ ] **Step 3: Implementar em `src/background/notifications/notify.ts`**

Arquivo atual:

```ts
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

export const NOTIFICATION_ID_PREFIX = 'seirmg-bloco-assinatura-'

export function buildNotificationId(item: BlocoAssinaturaItem): string {
  return `${NOTIFICATION_ID_PREFIX}${item.id}`
}

export function notificarNovoBloco(item: BlocoAssinaturaItem, tocarSom: boolean): void {
  chrome.notifications.create(buildNotificationId(item), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Bloco de assinatura pendente',
    message: `Bloco ${item.numero} está com pendência de assinatura.`,
    priority: 2,
    silent: !tocarSom,
  })
}
```

Substituir por (adiciona as três exportações novas ao final, nada muda no que já existe):

```ts
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import type { ProcessoItem } from '../../features/processos-novos/types'

export const NOTIFICATION_ID_PREFIX = 'seirmg-bloco-assinatura-'

export function buildNotificationId(item: BlocoAssinaturaItem): string {
  return `${NOTIFICATION_ID_PREFIX}${item.id}`
}

export function notificarNovoBloco(item: BlocoAssinaturaItem, tocarSom: boolean): void {
  chrome.notifications.create(buildNotificationId(item), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Bloco de assinatura pendente',
    message: `Bloco ${item.numero} está com pendência de assinatura.`,
    priority: 2,
    silent: !tocarSom,
  })
}

export const NOTIFICATION_ID_PREFIX_PROCESSO = 'seirmg-processo-novo-'

export function buildNotificationIdProcesso(item: ProcessoItem): string {
  return `${NOTIFICATION_ID_PREFIX_PROCESSO}${item.id}`
}

export function notificarNovoProcesso(item: ProcessoItem, tocarSom: boolean): void {
  chrome.notifications.create(buildNotificationIdProcesso(item), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Processo novo',
    message: `Processo ${item.numero} está com pendência de visualização.`,
    priority: 2,
    silent: !tocarSom,
  })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/notifications/notify.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/background/notifications/notify.ts src/background/notifications/notify.test.ts
git commit -m "feat(processos-novos): add notificarNovoProcesso alongside notificarNovoBloco"
```

---

### Task 6: `background/processosNovosPipeline.ts`

**Files:**
- Create: `C:\sei\seirmg\src\background\processosNovosPipeline.ts`
- Test: `C:\sei\seirmg\src\background\processosNovosPipeline.test.ts`

**Interfaces:**
- Consumes: `diffNaoVisualizados` (Task 3); `createSyncConfigStore`, `createLocalConfigStore`, `DEFAULT_SYNC_CONFIG`, `DEFAULT_LOCAL_CONFIG` (`../lib/storage`); `notificarNovoProcesso` (Task 5); `ProcessoItem` (Task 2)
- Produces: `ProcessosNovosPipelineDeps { syncStore?; localStore?; notificar?: typeof notificarNovoProcesso; agoraIso?: string }`; `processarItensProcessosNovos(itens: ProcessoItem[], deps?: ProcessosNovosPipelineDeps): Promise<void>` — usada pelo alarme (Task 7)

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/background/processosNovosPipeline.test.ts
import { describe, expect, it, vi } from 'vitest'
import { processarItensProcessosNovos } from './processosNovosPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../lib/storage'
import type { ProcessoItem } from '../features/processos-novos/types'

const item: ProcessoItem = { id: 'p1', numero: '100', visualizado: false }

describe('processarItensProcessosNovos', () => {
  it('notifica e persiste quando há processo novo não visualizado', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensProcessosNovos([item], {
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

    expect(notificar).toHaveBeenCalledWith(item, DEFAULT_SYNC_CONFIG.processosNovos.tocarSom)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      processosNovosNotificado: { p1: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
      processosNovosBadgeCount: 1,
    })
  })

  it('não notifica quando a feature está desativada nas opções', async () => {
    const notificar = vi.fn()

    await processarItensProcessosNovos([item], {
      syncStore: {
        get: async () => ({
          ...DEFAULT_SYNC_CONFIG,
          processosNovos: { ...DEFAULT_SYNC_CONFIG.processosNovos, ativo: false },
        }),
        set: async () => {},
      },
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('não notifica novamente um processo já registrado como notificado, mas preserva o badgeCount', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensProcessosNovos([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          processosNovosNotificado: { p1: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
          processosNovosBadgeCount: 2,
        }),
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
    expect((localSalvo as { processosNovosBadgeCount: number }).processosNovosBadgeCount).toBe(2)
  })

  it('soma ao badgeCount existente em vez de substituir', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown
    const item2: ProcessoItem = { id: 'p2', numero: '200', visualizado: false }

    await processarItensProcessosNovos([item, item2], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({ ...DEFAULT_LOCAL_CONFIG, processosNovosBadgeCount: 5 }),
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-06T10:00:00.000Z',
    })

    expect((localSalvo as { processosNovosBadgeCount: number }).processosNovosBadgeCount).toBe(7)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/background/processosNovosPipeline.test.ts`
Expected: FAIL — `Cannot find module './processosNovosPipeline'`

- [ ] **Step 3: Implementar `src/background/processosNovosPipeline.ts`**

```ts
import { diffNaoVisualizados } from '../features/processos-novos/diffNaoVisualizados'
import type { ProcessoItem } from '../features/processos-novos/types'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarNovoProcesso } from './notifications/notify'

type SyncStore = ReturnType<typeof createSyncConfigStore>
type LocalStore = ReturnType<typeof createLocalConfigStore>

export interface ProcessosNovosPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoProcesso
  agoraIso?: string
}

export async function processarItensProcessosNovos(
  itens: ProcessoItem[],
  deps: ProcessosNovosPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoProcesso
  const agoraIso = deps.agoraIso ?? new Date().toISOString()

  const config = await syncStore.get()
  if (!config.processosNovos.ativo) return

  const localConfig = await localStore.get()
  const { novos, estadoAtualizado } = diffNaoVisualizados(
    itens,
    localConfig.processosNovosNotificado,
    agoraIso
  )

  novos.forEach((item) => notificar(item, config.processosNovos.tocarSom))

  await localStore.set({
    ...localConfig,
    processosNovosNotificado: estadoAtualizado,
    processosNovosBadgeCount: localConfig.processosNovosBadgeCount + novos.length,
  })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/processosNovosPipeline.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/background/processosNovosPipeline.ts src/background/processosNovosPipeline.test.ts
git commit -m "feat(processos-novos): add pipeline with permanent dedup and summing badge count"
```

---

### Task 7: `background/alarms/processosNovosCheck.ts`

**Files:**
- Create: `C:\sei\seirmg\src\background\alarms\processosNovosCheck.ts`
- Test: `C:\sei\seirmg\src\background\alarms\processosNovosCheck.test.ts`

**Interfaces:**
- Consumes: `Result` (`../../lib/result`); `parseProcessosControlarTable` (Task 2); `processarItensProcessosNovos` (Task 6); `ProcessoItem` (Task 2)
- Produces: `ALARM_NAME_PROCESSOS_NOVOS: string`; `verificarProcessosNovos(deps: ProcessosNovosCheckDeps): Promise<void>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/background/alarms/processosNovosCheck.test.ts
import { describe, expect, it, vi } from 'vitest'
import { verificarProcessosNovos } from './processosNovosCheck'

function montarDocumentoComLinha(): Document {
  return new DOMParser().parseFromString(
    '<table id="tblProcessosDetalhado"><tbody><tr id="P1"><td></td><td></td><td><a href="#">1</a></td></tr></tbody></table>',
    'text/html'
  )
}

describe('verificarProcessosNovos', () => {
  it('interrompe silenciosamente quando o fetch falha', async () => {
    const processarItens = vi.fn()
    await verificarProcessosNovos({
      fetchProcessosDocument: async () => ({ ok: false, error: 'timeout' }),
      processarItens,
    })
    expect(processarItens).not.toHaveBeenCalled()
  })

  it('faz parse do Document retornado e delega os itens para processarItens', async () => {
    const processarItens = vi.fn()

    await verificarProcessosNovos({
      fetchProcessosDocument: async () => ({ ok: true, data: montarDocumentoComLinha() }),
      processarItens,
    })

    expect(processarItens).toHaveBeenCalledWith([{ id: 'P1', numero: '1', visualizado: false }])
  })

  it('não propaga erro quando processarItens rejeita', async () => {
    const processarItens = vi.fn().mockRejectedValue(new Error('boom'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      verificarProcessosNovos({
        fetchProcessosDocument: async () => ({ ok: true, data: montarDocumentoComLinha() }),
        processarItens,
      })
    ).resolves.not.toThrow()

    expect(processarItens).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/background/alarms/processosNovosCheck.test.ts`
Expected: FAIL — `Cannot find module './processosNovosCheck'`

- [ ] **Step 3: Implementar `src/background/alarms/processosNovosCheck.ts`**

```ts
import type { Result } from '../../lib/result'
import { parseProcessosControlarTable } from '../../features/processos-novos/parser'
import type { ProcessoItem } from '../../features/processos-novos/types'
import { processarItensProcessosNovos } from '../processosNovosPipeline'

export const ALARM_NAME_PROCESSOS_NOVOS = 'seirmg-check-processos-novos'

export interface ProcessosNovosCheckDeps {
  fetchProcessosDocument: () => Promise<Result<Document>>
  processarItens?: (itens: ProcessoItem[]) => Promise<void>
}

export async function verificarProcessosNovos(deps: ProcessosNovosCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensProcessosNovos

  const resultado = await deps.fetchProcessosDocument()
  if (!resultado.ok) return

  try {
    const itens = parseProcessosControlarTable(resultado.data)
    await processarItens(itens)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar itens de processos novos:', error)
  }
}
```

Nota: diferente de `blocoAssinaturaCheck.ts`, este guard try/catch já entra na primeira versão (não precisa de um ciclo de correção depois) — mesmo padrão de proteção contra exceção não tratada, aplicado desde já.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/alarms/processosNovosCheck.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/background/alarms/processosNovosCheck.ts src/background/alarms/processosNovosCheck.test.ts
git commit -m "feat(processos-novos): add alarm-triggered check with guarded parse+delegate"
```

---

### Task 8: `background/index.ts` — wiring completo

**Files:**
- Modify: `C:\sei\seirmg\src\background\index.ts`

**Contexto**: esta camada só conecta `chrome.*` (alarms, action, notifications, runtime, tabs) à lógica já testada. Não é coberta por TDD (chrome.* não é mockável de forma útil aqui) — a verificação é a suíte completa (inalterada) + build.

**Ponto de atenção importante**: o listener `chrome.notifications.onClicked` existente hoje trata **toda e qualquer** notificação clicada como se fosse do bloco de assinatura (não filtra por prefixo de id) — ele vai continuar existindo, mas agora precisa distinguir entre notificações de bloco de assinatura (`NOTIFICATION_ID_PREFIX`) e de processo novo (`NOTIFICATION_ID_PREFIX_PROCESSO`), senão clicar numa notificação de processo novo abriria por engano a tela do bloco de assinatura. Este passo extrai um pequeno helper `abrirOuFocarAba` (a lógica de reaproveitar aba existente, hoje duplicada inline) para os dois branches reaproveitarem, em vez de duplicar o bloco de 6 linhas uma terceira vez.

**Interfaces:**
- Consumes: `ALARM_NAME_PROCESSOS_NOVOS`, `verificarProcessosNovos` (Task 7); `fetchListaProcessos` (Task 4); `NOTIFICATION_ID_PREFIX`, `NOTIFICATION_ID_PREFIX_PROCESSO` (Task 5, `./notifications/notify`)

- [ ] **Step 1: Substituir `src/background/index.ts`**

Arquivo atual:

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

let verificacaoImediataEmAndamento = false

async function verificarImediatoSeNecessario(): Promise<void> {
  if (verificacaoImediataEmAndamento) return
  verificacaoImediataEmAndamento = true

  try {
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
  } finally {
    verificacaoImediataEmAndamento = false
  }
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

Substituir por:

```ts
import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS, verificarProcessosNovos } from './alarms/processosNovosCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchText } from '../lib/result'
import { fetchListaProcessos } from './processosNovos/fetchListaProcessos'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { passouIntervalo } from '../lib/throttle'
import { NOTIFICATION_ID_PREFIX, NOTIFICATION_ID_PREFIX_PROCESSO } from './notifications/notify'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'
const ACAO_PROCEDIMENTO_CONTROLAR = 'procedimento_controlar'
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

async function agendarAlarmeProcessosNovos(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME_PROCESSOS_NOVOS, {
    periodInMinutes: config.processosNovos.intervaloMinutos,
  })
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

function atualizarBadgeIcone(count: number): void {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
}

async function verificarProcessosNovosViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarProcessosNovos({
    fetchProcessosDocument: () => fetchListaProcessos(localConfig.baseUrlSei as string),
  })

  const localConfigAtualizado = await createLocalConfigStore().get()
  atualizarBadgeIcone(localConfigAtualizado.processosNovosBadgeCount)
}

let verificacaoImediataEmAndamento = false

async function verificarImediatoSeNecessario(): Promise<void> {
  if (verificacaoImediataEmAndamento) return
  verificacaoImediataEmAndamento = true

  try {
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
  } finally {
    verificacaoImediataEmAndamento = false
  }
}

async function abrirOuFocarAba(baseUrlSei: string, url: string): Promise<void> {
  const [abaExistente] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme do bloco de assinatura:', error)
  })
  agendarAlarmeProcessosNovos().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar alarme de processos novos:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  verificarBlocoAssinaturaViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME_PROCESSOS_NOVOS) return
  verificarProcessosNovosViaFetch().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar processos novos via alarme:', error)
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

    if (notificationId.startsWith(NOTIFICATION_ID_PREFIX)) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
      )
    } else if (notificationId.startsWith(NOTIFICATION_ID_PREFIX_PROCESSO)) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_PROCEDIMENTO_CONTROLAR}`
      )
    }

    chrome.notifications.clear(notificationId)
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar clique em notificação:', error)
  }
})
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (81 testes no total — 53 antes deste plano + 28 das Tasks 1-7: 4+5+6+5+1+4+3 = 28)

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 4: Commit**

```bash
git add src/background/index.ts
git commit -m "feat(processos-novos): wire second alarm, icon badge sync, and disambiguate notification clicks"
```

---

### Task 9: `popup/index.html` + `popup/main.ts`

**Files:**
- Modify: `C:\sei\seirmg\src\popup\index.html`
- Modify: `C:\sei\seirmg\src\popup\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build.

**Interfaces:**
- Consumes: `LocalConfig.processosNovosBadgeCount` (Task 1)

- [ ] **Step 1: Substituir `src/popup/index.html`**

Arquivo atual:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>SEIRMG</title>
    <style>
      body { font-family: system-ui, sans-serif; width: 260px; padding: 12px; }
      #status { font-weight: bold; }
      #abrir-bloco { margin-top: 8px; width: 100%; }
    </style>
  </head>
  <body>
    <div id="status">Carregando...</div>
    <div id="contagem"></div>
    <button id="abrir-bloco">Abrir bloco de assinatura</button>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Substituir por:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>SEIRMG</title>
    <style>
      body { font-family: system-ui, sans-serif; width: 260px; padding: 12px; }
      #status, #status-processos { font-weight: bold; }
      #abrir-bloco, #abrir-processos { margin-top: 8px; width: 100%; }
      hr { margin: 12px 0; border: none; border-top: 1px solid #ddd; }
    </style>
  </head>
  <body>
    <div id="status">Carregando...</div>
    <div id="contagem"></div>
    <button id="abrir-bloco">Abrir bloco de assinatura</button>
    <hr />
    <div id="status-processos">Carregando...</div>
    <div id="contagem-processos"></div>
    <button id="abrir-processos">Abrir Controle de Processos</button>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Substituir `src/popup/main.ts`**

Arquivo atual:

```ts
import { createLocalConfigStore } from '../lib/storage'

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = localConfig.blocoAssinaturaPendenteAtual.length

    const status = document.getElementById('status')
    const contagem = document.getElementById('contagem')
    if (status) status.textContent = total > 0 ? 'Pendências encontradas' : 'Tudo em dia'
    if (contagem) {
      contagem.textContent = total > 0 ? `${total} bloco(s) com pendência de assinatura` : ''
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-bloco')?.addEventListener('click', async () => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return

    const url = `${localConfig.baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`
    const [abaExistente] = await chrome.tabs.query({ url: `${localConfig.baseUrlSei}/*` })

    if (abaExistente?.id) {
      chrome.tabs.update(abaExistente.id, { active: true, url })
      if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
    } else {
      chrome.tabs.create({ url })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao abrir bloco de assinatura:', error)
  }
})

render()
```

Substituir por (extrai `abrirOuFocarAba` compartilhado pelos dois botões, adiciona a seção de processos novos e o zeramento do badge do ícone):

```ts
import { createLocalConfigStore } from '../lib/storage'

async function abrirOuFocarAba(baseUrlSei: string, url: string): Promise<void> {
  const [abaExistente] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
}

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = localConfig.blocoAssinaturaPendenteAtual.length

    const status = document.getElementById('status')
    const contagem = document.getElementById('contagem')
    if (status) status.textContent = total > 0 ? 'Pendências encontradas' : 'Tudo em dia'
    if (contagem) {
      contagem.textContent = total > 0 ? `${total} bloco(s) com pendência de assinatura` : ''
    }

    const totalProcessos = localConfig.processosNovosBadgeCount
    const statusProcessos = document.getElementById('status-processos')
    const contagemProcessos = document.getElementById('contagem-processos')
    if (statusProcessos) {
      statusProcessos.textContent =
        totalProcessos > 0 ? 'Processos novos encontrados' : 'Nenhum processo novo'
    }
    if (contagemProcessos) {
      contagemProcessos.textContent =
        totalProcessos > 0 ? `${totalProcessos} processo(s) não visualizado(s)` : ''
    }

    if (totalProcessos > 0) {
      await createLocalConfigStore().set({ ...localConfig, processosNovosBadgeCount: 0 })
      chrome.action.setBadgeText({ text: '' })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-bloco')?.addEventListener('click', async () => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return
    await abrirOuFocarAba(
      localConfig.baseUrlSei,
      `${localConfig.baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`
    )
  } catch (error) {
    console.error('[SEIRMG] Falha ao abrir bloco de assinatura:', error)
  }
})

document.getElementById('abrir-processos')?.addEventListener('click', async () => {
  try {
    const localConfig = await createLocalConfigStore().get()
    if (!localConfig.baseUrlSei) return
    await abrirOuFocarAba(
      localConfig.baseUrlSei,
      `${localConfig.baseUrlSei}/controlador.php?acao=procedimento_controlar`
    )
  } catch (error) {
    console.error('[SEIRMG] Falha ao abrir Controle de Processos:', error)
  }
})

render()
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (81), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/popup/index.html src/popup/main.ts
git commit -m "feat(processos-novos): add popup section, reset icon badge on render"
```

---

### Task 10: `options/index.html` + `options/main.ts`

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build.

**Interfaces:**
- Consumes: `createSyncConfigStore` (`../lib/storage`); `ALARM_NAME` (`../background/alarms/blocoAssinaturaCheck`); `ALARM_NAME_PROCESSOS_NOVOS` (Task 7, `../background/alarms/processosNovosCheck`)

- [ ] **Step 1: Modificar `src/options/index.html`**

No `<nav id="abas">`, trecho atual:

```html
      <button data-aba="assinatura" class="aba-btn">Bloco de Assinatura e Notificações</button>
```

Substituir por:

```html
      <button data-aba="notificacoes" class="aba-btn">Notificações</button>
```

A seção atual:

```html
    <section id="painel-assinatura" class="painel">
      <h2>Bloco de Assinatura e Notificações</h2>
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
      <br />
      <button id="assinatura-salvar">Salvar</button>
      <span id="assinatura-status"></span>
    </section>
```

Substituir por:

```html
    <section id="painel-notificacoes" class="painel">
      <h2>Notificações</h2>
      <h3>Bloco de Assinatura</h3>
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
      <br />
      <button id="assinatura-salvar">Salvar</button>
      <span id="assinatura-status"></span>

      <h3>Processos Novos</h3>
      <label>
        <input type="checkbox" id="processos-novos-ativo" />
        Ativar notificação de processos novos
      </label>
      <br />
      <label>
        Intervalo de verificação (minutos):
        <input type="number" id="processos-novos-intervalo" min="5" max="120" />
      </label>
      <br />
      <label>
        <input type="checkbox" id="processos-novos-som" />
        Tocar som ao notificar
      </label>
      <br />
      <button id="processos-novos-salvar">Salvar</button>
      <span id="processos-novos-status"></span>
    </section>
```

- [ ] **Step 2: Substituir `src/options/main.ts`**

Arquivo atual:

```ts
import bellIconSvg from 'lucide-static/icons/bell.svg?raw'
import { ativarAba } from './tabs'
import { createSyncConfigStore } from '../lib/storage'
import { ALARM_NAME } from '../background/alarms/blocoAssinaturaCheck'

const botoesAba = document.querySelectorAll('.aba-btn')
const paineis = document.querySelectorAll('.painel')

const botaoAssinatura = document.querySelector('[data-aba="assinatura"]')
if (botaoAssinatura) {
  botaoAssinatura.innerHTML = `${bellIconSvg} Bloco de Assinatura e Notificações`
}

botoesAba.forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-aba')
    if (aba) ativarAba(botoesAba, paineis, aba)
  })
})

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
            intervaloMinutos: Number(inputIntervalo?.value ?? 15),
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        chrome.alarms.create(ALARM_NAME, {
          periodInMinutes: atualizado.blocoAssinatura.intervaloMinutos,
        })
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

carregarAbaAssinatura()
```

Substituir por (renomeia o seletor da aba/rótulo, e adiciona `carregarSecaoProcessosNovos` ao lado de `carregarAbaAssinatura`, sem tocar na lógica desta última):

```ts
import bellIconSvg from 'lucide-static/icons/bell.svg?raw'
import { ativarAba } from './tabs'
import { createSyncConfigStore } from '../lib/storage'
import { ALARM_NAME } from '../background/alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS } from '../background/alarms/processosNovosCheck'

const botoesAba = document.querySelectorAll('.aba-btn')
const paineis = document.querySelectorAll('.painel')

const botaoNotificacoes = document.querySelector('[data-aba="notificacoes"]')
if (botaoNotificacoes) {
  botaoNotificacoes.innerHTML = `${bellIconSvg} Notificações`
}

botoesAba.forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-aba')
    if (aba) ativarAba(botoesAba, paineis, aba)
  })
})

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
            intervaloMinutos: Number(inputIntervalo?.value ?? 15),
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        chrome.alarms.create(ALARM_NAME, {
          periodInMinutes: atualizado.blocoAssinatura.intervaloMinutos,
        })
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

async function carregarSecaoProcessosNovos(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('processos-novos-ativo') as HTMLInputElement | null
    const inputIntervalo = document.getElementById(
      'processos-novos-intervalo'
    ) as HTMLInputElement | null
    const inputSom = document.getElementById('processos-novos-som') as HTMLInputElement | null
    const status = document.getElementById('processos-novos-status')

    if (inputAtivo) inputAtivo.checked = config.processosNovos.ativo
    if (inputIntervalo) inputIntervalo.value = String(config.processosNovos.intervaloMinutos)
    if (inputSom) inputSom.checked = config.processosNovos.tocarSom

    document.getElementById('processos-novos-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          processosNovos: {
            ativo: inputAtivo?.checked ?? true,
            intervaloMinutos: Number(inputIntervalo?.value ?? 5),
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        chrome.alarms.create(ALARM_NAME_PROCESSOS_NOVOS, {
          periodInMinutes: atualizado.processosNovos.intervaloMinutos,
        })
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração de processos novos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar seção de processos novos:', error)
  }
}

carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (81), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(processos-novos): rename Notificações tab and add Processos Novos section"
```

---

### Task 11: Checagem final (typecheck/lint/test/build/manifest)

**Files:** nenhum arquivo novo — checklist de verificação, mesmo padrão dos planos anteriores.

- [ ] **Step 1: Rodar a checagem completa**

Run:
```bash
cd C:\sei\seirmg
bun run typecheck
bun run lint
bun run test
bun run build
```
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 81 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes (nenhuma nova, conforme decisão da spec).

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: dedup permanente por ID (Tasks 3, 6), fetch com retentativa de 1 nível (Task 4), badge do ícone separado e somável, zerado no popup (Tasks 6, 8, 9), sem auto-desativação em erro (Tasks 6, 7 — todo erro cai em log-e-segue), aba "Notificações" renomeada com duas seções (Task 10), sem mudança de manifest (confirmado na Task 11). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `ProcessoItem { id, numero, visualizado }` (Task 2) usado identicamente em `diffNaoVisualizados.ts` (Task 3), `notify.ts` (Task 5), `processosNovosPipeline.ts` (Task 6), `processosNovosCheck.ts` (Task 7). `ProcessosNovosConfig`/`processosNovosNotificado`/`processosNovosBadgeCount` (Task 1) usados com os mesmos nomes em todo lugar. `ALARM_NAME_PROCESSOS_NOVOS` (Task 7) consumido identicamente pela Task 8 (`background/index.ts`) e pela Task 10 (`options/main.ts`). `NOTIFICATION_ID_PREFIX_PROCESSO` (Task 5) consumido pela Task 8 para desambiguar o clique em notificação — verificado que a Task 8 também corrige o bug latente de todo clique em notificação (mesmo de processo novo) cair no branch do bloco de assinatura, algo que a spec não detalhou explicitamente mas que a introdução de uma segunda fonte de notificações torna necessário corrigir.
4. **Contagem de testes**: 53 (baseline antes deste plano) + 4 (Task 1) + 5 (Task 2) + 6 (Task 3) + 5 (Task 4) + 1 (Task 5) + 4 (Task 6) + 3 (Task 7) = 81 testes esperados ao final da Task 8 em diante.
