# Favoritos — Lembrete e Lixeira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Favoritos (hoje só estrela/cor/prazo/export-import) duas funcionalidades do SEI Pro novo que faltam: **lembrete** (notificação nativa numa data escolhida por favorito) e **lixeira** (desfazer exclusão de favorito).

**Architecture:** Lembrete reaproveita o pipeline já usado por Tarefas vencidas (`background/tarefasPipeline.ts` + `diffVencidas`), mas disparado por `chrome.alarms` diário em vez de checagem reativa — é seguro porque só lê `chrome.storage` local, nunca faz fetch pro SEI (a restrição contra alarme autônomo em `lib/storage.ts:23-27` é especificamente sobre alarme que *busca dados do SEI*; aqui não há rede nenhuma). Lixeira é um buffer local (`LocalConfig`, não sincroniza entre dispositivos) alimentado no mesmo lugar que já remove um favorito (`alternarFavorito`).

**Tech Stack:** TypeScript, Vitest, `chrome.storage`, `chrome.alarms`, `chrome.notifications` — tudo já em uso no repo, nenhuma dependência nova.

**Spec:** Sem spec prévia — nasceu de comparação ad-hoc com `C:\sei\seipro\sei-pro\favoritos\` nesta conversa. Os requisitos abaixo são a spec.

## Global Constraints

- Nenhum fetch de rede em background a partir de um alarme autônomo — só leitura/escrita local (ver comentário em `lib/storage.ts:23-27` sobre os dois incidentes reais de deslogamento).
- Toda decisão (quem notificar, o que vai pra lixeira, o que sai da lixeira) é função pura testada em `features/*.ts`, igual ao padrão de `features/tarefas/diffVencidas.ts`.
- IDs de notificação seguem o padrão `seirmg-<assunto>-<identificador>`, já estabelecido em `background/notifications/notify.ts`.
- `bun run test`, `bun run typecheck`, `bun run lint` passam a cada tarefa antes do commit.

---

## File Structure

- Modify: `src/lib/storage.ts` — `FavoritoProcesso` ganha `lembreteData?`/`lembreteNota?`; novo tipo `FavoritoRemovido`; `LocalConfig` ganha `favoritosLembretesNotificados` e `favoritosLixeira`.
- Create: `src/features/controle-processos/lembretesFavoritos.ts` (+ `.test.ts`) — `diffLembretesFavoritos`.
- Modify: `src/features/controle-processos/favoritos.ts` (+ `.test.ts`) — `moverParaLixeira`, `podarLixeiraPorJanela`, `restaurarDaLixeira`, `removerDefinitivamenteDaLixeira`.
- Modify: `src/background/notifications/notify.ts` (+ `.test.ts`) — `notificarLembreteFavorito`.
- Create: `src/background/lembreteFavoritosAlarme.ts` — agendamento do alarme diário.
- Create: `src/background/lembreteFavoritosPipeline.ts` (+ `.test.ts`) — `processarLembretesFavoritos`.
- Modify: `src/background/index.ts` — liga alarme, listener e clique de notificação.
- Modify: `src/content-scripts/procedimento_controlar/index.ts` — coluna de lembrete na tabela de favoritos, `alternarFavorito` alimenta a lixeira, seção de lixeira no painel.

---

### Task 1: Storage — campos de lembrete e lixeira

**Files:**
- Modify: `src/lib/storage.ts:72-78,254-267`

**Interfaces:**
- Produces: `FavoritoProcesso.lembreteData?: string` (yyyy-mm-dd), `FavoritoProcesso.lembreteNota?: string`
- Produces: `FavoritoRemovido` (= `FavoritoProcesso` + `removidoEm: string`)
- Produces: `LocalConfig.favoritosLembretesNotificados: NotificadoState`, `LocalConfig.favoritosLixeira: FavoritoRemovido[]`

- [ ] **Step 1: Editar os tipos**

Em `src/lib/storage.ts`, estender `FavoritoProcesso` (linha 72-78):

```typescript
export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
  ultimoSnapshot?: SnapshotFavorito
  // Data (yyyy-mm-dd) em que o lembrete deve notificar. Ausente = sem lembrete.
  lembreteData?: string
  lembreteNota?: string
}

export interface FavoritoRemovido extends FavoritoProcesso {
  removidoEm: string
}
```

E `LocalConfig` (linha 268-296), acrescentando os dois campos novos e seus defaults correspondentes em `DEFAULT_LOCAL_CONFIG` (linha 391-402):

```typescript
  favoritosLembretesNotificados: NotificadoState
  favoritosLixeira: FavoritoRemovido[]
```

```typescript
  favoritosLembretesNotificados: {},
  favoritosLixeira: [],
```

- [ ] **Step 2: Verificar tipos**

Run: `bun run typecheck`
Expected: sem erros (campos novos são opcionais em `FavoritoProcesso` e têm default em `LocalConfig`; nenhum literal existente precisa mudar)

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(storage): campos de lembrete e lixeira de favoritos"
```

---

### Task 2: Função pura — quem notificar hoje (`diffLembretesFavoritos`)

**Files:**
- Create: `src/features/controle-processos/lembretesFavoritos.ts`
- Create: `src/features/controle-processos/lembretesFavoritos.test.ts`

**Interfaces:**
- Consumes: `FavoritoProcesso`, `NotificadoState` (`lib/storage.ts`)
- Produces: `diffLembretesFavoritos(favoritos: FavoritoProcesso[], jaNotificados: NotificadoState, hojeIso: string): { devidos: FavoritoParaNotificar[]; estadoAtualizado: NotificadoState }`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { diffLembretesFavoritos } from './lembretesFavoritos'
import type { FavoritoProcesso } from '../../lib/storage'

function favorito(numero: string, lembreteData?: string): FavoritoProcesso {
  return { numero, link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', lembreteData }
}

describe('diffLembretesFavoritos', () => {
  const hoje = '2026-07-20T10:00:00.000Z'

  it('notifica favorito cuja data de lembrete já chegou', () => {
    const { devidos } = diffLembretesFavoritos([favorito('1', '2026-07-20')], {}, hoje)
    expect(devidos).toEqual([{ numero: '1', lembreteNota: undefined }])
  })

  it('notifica favorito cuja data de lembrete já passou', () => {
    const { devidos } = diffLembretesFavoritos([favorito('1', '2026-07-01')], {}, hoje)
    expect(devidos.map((d) => d.numero)).toEqual(['1'])
  })

  it('não notifica favorito sem lembrete ou com data futura', () => {
    const { devidos } = diffLembretesFavoritos([favorito('1'), favorito('2', '2026-08-01')], {}, hoje)
    expect(devidos).toEqual([])
  })

  it('não notifica de novo no mesmo dia', () => {
    const { devidos } = diffLembretesFavoritos(
      [favorito('1', '2026-07-20')],
      { '1': { notificadoEm: '2026-07-20T08:00:00.000Z' } },
      hoje
    )
    expect(devidos).toEqual([])
  })

  it('notifica de novo em outro dia (lembrete recorrente até ser removido)', () => {
    const { devidos } = diffLembretesFavoritos(
      [favorito('1', '2026-07-20')],
      { '1': { notificadoEm: '2026-07-19T08:00:00.000Z' } },
      hoje
    )
    expect(devidos.map((d) => d.numero)).toEqual(['1'])
  })

  it('estadoAtualizado registra a notificação de hoje', () => {
    const { estadoAtualizado } = diffLembretesFavoritos([favorito('1', '2026-07-20')], {}, hoje)
    expect(estadoAtualizado).toEqual({ '1': { notificadoEm: hoje } })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test lembretesFavoritos.test.ts`
Expected: FAIL — arquivo `lembretesFavoritos.ts` não existe

- [ ] **Step 3: Implementar**

```typescript
import type { FavoritoProcesso, NotificadoState } from '../../lib/storage'

export interface FavoritoParaNotificar {
  numero: string
  lembreteNota?: string
}

export interface DiffLembretesFavoritosResultado {
  devidos: FavoritoParaNotificar[]
  estadoAtualizado: NotificadoState
}

function mesmoDia(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10)
}

export function diffLembretesFavoritos(
  favoritos: FavoritoProcesso[],
  jaNotificados: NotificadoState,
  hojeIso: string
): DiffLembretesFavoritosResultado {
  const hojeData = hojeIso.slice(0, 10)

  const devidos = favoritos
    .filter((favorito) => {
      if (!favorito.lembreteData || favorito.lembreteData > hojeData) return false
      const ultimaNotificacao = jaNotificados[favorito.numero]?.notificadoEm
      return !ultimaNotificacao || !mesmoDia(ultimaNotificacao, hojeIso)
    })
    .map((favorito) => ({ numero: favorito.numero, lembreteNota: favorito.lembreteNota }))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  devidos.forEach((favorito) => {
    estadoAtualizado[favorito.numero] = { notificadoEm: hojeIso }
  })

  return { devidos, estadoAtualizado }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test lembretesFavoritos.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/lembretesFavoritos.ts src/features/controle-processos/lembretesFavoritos.test.ts
git commit -m "feat(favoritos): diffLembretesFavoritos (quem notificar hoje)"
```

---

### Task 3: Notificação nativa + pipeline + alarme diário

**Files:**
- Modify: `src/background/notifications/notify.ts` (+ `notify.test.ts`)
- Create: `src/background/lembreteFavoritosAlarme.ts`
- Create: `src/background/lembreteFavoritosPipeline.ts`
- Create: `src/background/lembreteFavoritosPipeline.test.ts`
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `diffLembretesFavoritos` (Task 2)
- Produces: `notificarLembreteFavorito(favorito: FavoritoParaNotificar): void`, `NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX`
- Produces: `agendarChecagemLembretesFavoritos(ativo: boolean): void`, `ALARME_CHECAGEM_LEMBRETES_FAVORITOS`
- Produces: `processarLembretesFavoritos(deps?: LembreteFavoritosPipelineDeps): Promise<void>`

- [ ] **Step 1: Escrever o teste que falha (notificação)**

Adicionar em `src/background/notifications/notify.test.ts` (seguir o padrão dos testes já existentes nesse arquivo — mockar `chrome.notifications.create`):

```typescript
import { notificarLembreteFavorito, NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX } from './notify'

describe('notificarLembreteFavorito', () => {
  it('cria notificação com o id prefixado pelo número do processo', () => {
    notificarLembreteFavorito({ numero: '1234.001/2026' })
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      `${NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX}1234.001/2026`,
      expect.objectContaining({ title: 'SEIRMG — Lembrete de favorito' })
    )
  })

  it('usa a nota do lembrete na mensagem quando houver', () => {
    notificarLembreteFavorito({ numero: '1234.001/2026', lembreteNota: 'Cobrar resposta' })
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: '1234.001/2026: Cobrar resposta' })
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test notify.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar a notificação**

Acrescentar ao fim de `src/background/notifications/notify.ts`:

```typescript
export const NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX = 'seirmg-lembrete-favorito-'

export function notificarLembreteFavorito(favorito: { numero: string; lembreteNota?: string }): void {
  chrome.notifications.create(`${NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX}${favorito.numero}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Lembrete de favorito',
    message: favorito.lembreteNota
      ? `${favorito.numero}: ${favorito.lembreteNota}`
      : `Lembrete do processo favorito ${favorito.numero}.`,
    priority: 1,
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test notify.test.ts`
Expected: PASS

- [ ] **Step 5: Alarme diário**

Criar `src/background/lembreteFavoritosAlarme.ts`:

```typescript
export const ALARME_CHECAGEM_LEMBRETES_FAVORITOS = 'seirmg-checagem-lembretes-favoritos'

// Só lê chrome.storage local, nunca busca nada no SEI -- sem o risco de deslogamento que
// afasta alarme autônomo do resto do projeto (ver lib/storage.ts, comentário em
// BlocoAssinaturaConfig.checagemOportunistaIntervaloMinutos).
export function agendarChecagemLembretesFavoritos(ativo: boolean): void {
  if (ativo) {
    chrome.alarms.create(ALARME_CHECAGEM_LEMBRETES_FAVORITOS, { periodInMinutes: 24 * 60 })
  } else {
    chrome.alarms.clear(ALARME_CHECAGEM_LEMBRETES_FAVORITOS)
  }
}
```

- [ ] **Step 6: Escrever o teste do pipeline que falha**

Criar `src/background/lembreteFavoritosPipeline.test.ts` (seguir o padrão de `tarefasPipeline.test.ts` — stores falsos injetados via `deps`):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { processarLembretesFavoritos } from './lembreteFavoritosPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../lib/storage'

describe('processarLembretesFavoritos', () => {
  it('notifica favoritos com lembrete devido e persiste o estado', async () => {
    const localConfig = { ...DEFAULT_LOCAL_CONFIG, favoritosLembretesNotificados: {} }
    const syncConfig = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        favoritos: {
          ativo: true,
          itens: [{ numero: '1', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', lembreteData: '2026-07-20' }],
        },
      },
    }
    const localSet = vi.fn()
    const notificar = vi.fn()

    await processarLembretesFavoritos({
      localStore: { get: async () => localConfig, set: localSet },
      syncStore: { get: async () => syncConfig, set: vi.fn() },
      notificar,
      hojeIso: '2026-07-20T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith({ numero: '1', lembreteNota: undefined })
    expect(localSet).toHaveBeenCalledWith(
      expect.objectContaining({ favoritosLembretesNotificados: { '1': { notificadoEm: '2026-07-20T10:00:00.000Z' } } })
    )
  })

  it('não notifica quando não há lembrete devido', async () => {
    const notificar = vi.fn()
    await processarLembretesFavoritos({
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: vi.fn() },
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: vi.fn() },
      notificar,
      hojeIso: '2026-07-20T10:00:00.000Z',
    })
    expect(notificar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `bun run test lembreteFavoritosPipeline.test.ts`
Expected: FAIL — arquivo não existe

- [ ] **Step 8: Implementar o pipeline**

Criar `src/background/lembreteFavoritosPipeline.ts`:

```typescript
import { diffLembretesFavoritos } from '../features/controle-processos/lembretesFavoritos'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarLembreteFavorito } from './notifications/notify'

type LocalStore = ReturnType<typeof createLocalConfigStore>
type SyncStore = ReturnType<typeof createSyncConfigStore>

export interface LembreteFavoritosPipelineDeps {
  localStore?: LocalStore
  syncStore?: SyncStore
  notificar?: typeof notificarLembreteFavorito
  hojeIso?: string
}

export async function processarLembretesFavoritos(deps: LembreteFavoritosPipelineDeps = {}): Promise<void> {
  const localStore = deps.localStore ?? createLocalConfigStore()
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const notificar = deps.notificar ?? notificarLembreteFavorito
  const hojeIso = deps.hojeIso ?? new Date().toISOString()

  const syncConfig = await syncStore.get()
  const localConfig = await localStore.get()
  const { devidos, estadoAtualizado } = diffLembretesFavoritos(
    syncConfig.controleProcessos.favoritos.itens,
    localConfig.favoritosLembretesNotificados ?? {},
    hojeIso
  )

  devidos.forEach((favorito) => notificar(favorito))

  await localStore.set({ ...localConfig, favoritosLembretesNotificados: estadoAtualizado })
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `bun run test lembreteFavoritosPipeline.test.ts`
Expected: PASS

- [ ] **Step 10: Ligar no background**

Em `src/background/index.ts`:

Acrescentar aos imports existentes:

```typescript
import { agendarChecagemLembretesFavoritos, ALARME_CHECAGEM_LEMBRETES_FAVORITOS } from './lembreteFavoritosAlarme'
import { processarLembretesFavoritos } from './lembreteFavoritosPipeline'
import {
  // ...imports já existentes de notify, acrescentar:
  NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX,
} from './notifications/notify'
```

Criar a função de reagendamento (ao lado de `reagendarLembreteBlocoAssinatura`):

```typescript
async function reagendarChecagemLembretesFavoritos(): Promise<void> {
  const config = await createSyncConfigStore().get()
  agendarChecagemLembretesFavoritos(config.controleProcessos.favoritos.ativo)
}
```

Chamar essa função nos três pontos onde `reagendarLembreteBlocoAssinatura()` já é chamada (`onInstalled`, `onStartup`, `storage.onChanged`) — acrescentando a chamada ao lado da existente em cada bloco, sem remover a atual:

```typescript
  reagendarChecagemLembretesFavoritos().catch((error) => {
    console.error('[SEIRMG] Falha ao agendar checagem de lembretes de favoritos:', error)
  })
```

Acrescentar um novo listener de alarme (seguindo o padrão de múltiplos listeners separados já usado no arquivo):

```typescript
chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARME_CHECAGEM_LEMBRETES_FAVORITOS) return
  processarLembretesFavoritos().catch((error) => {
    console.error('[SEIRMG] Falha ao processar lembretes de favoritos:', error)
  })
})
```

E estender o `if`/`else if` dentro de `chrome.notifications.onClicked.addListener` pra abrir o processo do lembrete:

```typescript
    } else if (notificationId.startsWith(NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX)) {
      const numero = notificationId.slice(NOTIFICATION_ID_LEMBRETE_FAVORITO_PREFIX.length)
      const syncConfig = await createSyncConfigStore().get()
      const favorito = syncConfig.controleProcessos.favoritos.itens.find((item) => item.numero === numero)
      const url = favorito?.link ? `${localConfig.baseUrlSei}/${favorito.link}` : localConfig.baseUrlSei
      await abrirOuFocarAba(localConfig.baseUrlSei, url)
    }
```

- [ ] **Step 11: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/background/notifications/notify.ts src/background/notifications/notify.test.ts src/background/lembreteFavoritosAlarme.ts src/background/lembreteFavoritosPipeline.ts src/background/lembreteFavoritosPipeline.test.ts src/background/index.ts
git commit -m "feat(favoritos): notificação de lembrete via alarme diário local"
```

---

### Task 4: Campo de lembrete na tabela de Favoritos

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:1305-1329,1455-1476`
- Modify: `src/content-scripts/core/theme.css`

**Interfaces:**
- Consumes: `FavoritoProcesso.lembreteData`/`lembreteNota` (Task 1)

- [ ] **Step 1: Nova célula de lembrete**

Adicionar, perto de `montarCelulaRemover` (linha ~1289), uma nova função de célula:

```typescript
function montarCelulaLembrete(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')

  const inputData = document.createElement('input')
  inputData.type = 'date'
  inputData.className = 'seirmg-favoritos-lembrete-data'
  inputData.value = item.lembreteData ?? ''

  const inputNota = document.createElement('input')
  inputNota.type = 'text'
  inputNota.className = 'seirmg-favoritos-lembrete-nota'
  inputNota.placeholder = 'Nota (opcional)'
  inputNota.value = item.lembreteNota ?? ''

  async function salvar(): Promise<void> {
    try {
      const store = createSyncConfigStore()
      const atual = await store.get()
      const itens = atual.controleProcessos.favoritos.itens.map((favorito) =>
        favorito.numero === item.numero
          ? { ...favorito, lembreteData: inputData.value || undefined, lembreteNota: inputNota.value || undefined }
          : favorito
      )
      await store.set({
        ...atual,
        controleProcessos: { ...atual.controleProcessos, favoritos: { ...atual.controleProcessos.favoritos, itens } },
      })
    } catch (error) {
      console.error('[SEIRMG] Falha ao salvar lembrete do favorito:', error)
    }
  }

  inputData.addEventListener('change', salvar)
  inputNota.addEventListener('change', salvar)

  td.append(inputData, inputNota)
  return td
}
```

- [ ] **Step 2: Encaixar a coluna na tabela**

Em `montarLinhaPainelFavoritos` (linha 1305), acrescentar a célula antes da de remover:

```typescript
  tr.appendChild(montarCelulaLembrete(item))
  tr.appendChild(montarCelulaRemover(item))
  return tr
```

No cabeçalho (linha ~1461-1476), acrescentar `'Lembrete'` à lista de rótulos e redistribuir as larguras do `colgroup` pra 6 colunas:

```typescript
    ;[26, 20, 16, 14, 16, 8].forEach((largura) => {
```

```typescript
    ;['Processo', 'Marcadores', 'Prazo', 'Atribuição', 'Lembrete', ''].forEach((rotulo) => {
```

(A ordem dos `th` deve bater com a ordem das células: Processo, Marcadores, Prazo, Atribuição, Lembrete, Remover.)

- [ ] **Step 3: Estilo**

Adicionar em `src/content-scripts/core/theme.css`:

```css
.seirmg-favoritos-lembrete-data, .seirmg-favoritos-lembrete-nota { display: block; width: 100%; font-size: 11px; padding: 2px 4px; margin-bottom: 2px; box-sizing: border-box; }
```

- [ ] **Step 4: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS (nenhum teste novo nesta tarefa — `content-scripts/*/index.ts` não tem suíte própria; a lógica de quando notificar já está coberta pela Tarefa 2)

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts src/content-scripts/core/theme.css
git commit -m "feat(favoritos): campo de lembrete (data + nota) na tabela de favoritos"
```

---

### Task 5: Funções puras da lixeira

**Files:**
- Modify: `src/features/controle-processos/favoritos.ts`
- Modify: `src/features/controle-processos/favoritos.test.ts`

**Interfaces:**
- Consumes: `FavoritoProcesso`, `FavoritoRemovido` (Task 1), `adicionarFavoritoSeNovo` (já existe, Plano de Histórico Tarefa 5 — se esse plano não foi executado antes deste, implementar aqui também, é idempotente)
- Produces: `moverParaLixeira(lixeiraAtual: FavoritoRemovido[], removido: FavoritoProcesso, removidoEm: string, limite?: number): FavoritoRemovido[]`
- Produces: `podarLixeiraPorJanela(lixeira: FavoritoRemovido[], agoraIso: string, janelaDias?: number): FavoritoRemovido[]`
- Produces: `restaurarDaLixeira(itens: FavoritoProcesso[], lixeira: FavoritoRemovido[], numero: string): { itens: FavoritoProcesso[]; lixeira: FavoritoRemovido[] }`
- Produces: `removerDefinitivamenteDaLixeira(lixeira: FavoritoRemovido[], numero: string): FavoritoRemovido[]`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
import { moverParaLixeira, podarLixeiraPorJanela, restaurarDaLixeira, removerDefinitivamenteDaLixeira } from './favoritos'
import type { FavoritoRemovido } from '../../lib/storage'

describe('moverParaLixeira', () => {
  it('adiciona no topo e respeita o limite', () => {
    const lixeira: FavoritoRemovido[] = [
      { numero: 'A', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', removidoEm: '2026-07-02T00:00:00.000Z' },
    ]
    const removido = { numero: 'B', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' }
    const resultado = moverParaLixeira(lixeira, removido, '2026-07-20T00:00:00.000Z', 1)
    expect(resultado).toEqual([{ ...removido, removidoEm: '2026-07-20T00:00:00.000Z' }])
  })
})

describe('podarLixeiraPorJanela', () => {
  it('remove entradas mais antigas que a janela', () => {
    const lixeira: FavoritoRemovido[] = [
      { numero: 'A', link: null, adicionadoEm: '2026-01-01T00:00:00.000Z', removidoEm: '2026-07-19T00:00:00.000Z' },
      { numero: 'B', link: null, adicionadoEm: '2026-01-01T00:00:00.000Z', removidoEm: '2026-01-01T00:00:00.000Z' },
    ]
    expect(podarLixeiraPorJanela(lixeira, '2026-07-20T00:00:00.000Z', 30)).toEqual([lixeira[0]])
  })
})

describe('restaurarDaLixeira', () => {
  it('move o item da lixeira de volta pros favoritos, sem duplicar', () => {
    const itens = [{ numero: 'A', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' }]
    const lixeira: FavoritoRemovido[] = [
      { numero: 'B', link: 'controlador.php?x=1', adicionadoEm: '2026-06-01T00:00:00.000Z', removidoEm: '2026-07-19T00:00:00.000Z' },
    ]
    const resultado = restaurarDaLixeira(itens, lixeira, 'B')
    expect(resultado.itens).toEqual([
      ...itens,
      { numero: 'B', link: 'controlador.php?x=1', adicionadoEm: '2026-06-01T00:00:00.000Z' },
    ])
    expect(resultado.lixeira).toEqual([])
  })

  it('não faz nada se o número não está na lixeira', () => {
    const itens = [{ numero: 'A', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z' }]
    const resultado = restaurarDaLixeira(itens, [], 'Z')
    expect(resultado).toEqual({ itens, lixeira: [] })
  })
})

describe('removerDefinitivamenteDaLixeira', () => {
  it('remove o item pelo número', () => {
    const lixeira: FavoritoRemovido[] = [
      { numero: 'A', link: null, adicionadoEm: '2026-07-01T00:00:00.000Z', removidoEm: '2026-07-19T00:00:00.000Z' },
    ]
    expect(removerDefinitivamenteDaLixeira(lixeira, 'A')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test favoritos.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

Acrescentar em `src/features/controle-processos/favoritos.ts`:

```typescript
import type { FavoritoRemovido } from '../../lib/storage'

export function moverParaLixeira(
  lixeiraAtual: FavoritoRemovido[],
  removido: FavoritoProcesso,
  removidoEm: string,
  limite = 20
): FavoritoRemovido[] {
  const semDuplicata = lixeiraAtual.filter((item) => item.numero !== removido.numero)
  return [{ ...removido, removidoEm }, ...semDuplicata].slice(0, limite)
}

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000

export function podarLixeiraPorJanela(
  lixeira: FavoritoRemovido[],
  agoraIso: string,
  janelaDias = 30
): FavoritoRemovido[] {
  if (janelaDias <= 0) return lixeira
  const limiteMs = new Date(agoraIso).getTime() - janelaDias * MILISSEGUNDOS_POR_DIA
  return lixeira.filter((item) => new Date(item.removidoEm).getTime() >= limiteMs)
}

export function restaurarDaLixeira(
  itens: FavoritoProcesso[],
  lixeira: FavoritoRemovido[],
  numero: string
): { itens: FavoritoProcesso[]; lixeira: FavoritoRemovido[] } {
  const encontrado = lixeira.find((item) => item.numero === numero)
  if (!encontrado) return { itens, lixeira }

  const { removidoEm, ...favorito } = encontrado
  return {
    itens: adicionarFavoritoSeNovo(itens, favorito),
    lixeira: lixeira.filter((item) => item.numero !== numero),
  }
}

export function removerDefinitivamenteDaLixeira(lixeira: FavoritoRemovido[], numero: string): FavoritoRemovido[] {
  return lixeira.filter((item) => item.numero !== numero)
}
```

(`adicionarFavoritoSeNovo` já existe neste arquivo — se o Plano de Histórico ainda não foi executado, implementar primeiro a função mínima: `itens.some((item) => item.numero === novo.numero) ? itens : [...itens, novo]`.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test favoritos.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/favoritos.ts src/features/controle-processos/favoritos.test.ts
git commit -m "feat(favoritos): funções puras da lixeira (mover, podar, restaurar, remover)"
```

---

### Task 6: `alternarFavorito` alimenta a lixeira ao remover

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:1502-1525`

**Interfaces:**
- Consumes: `moverParaLixeira`, `podarLixeiraPorJanela` (Task 5)

- [ ] **Step 1: Modificar `alternarFavorito`**

Trocar o corpo (linhas 1502-1525aprox.) por:

```typescript
async function alternarFavorito(favorito: FavoritoProcesso): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const atual = await store.get()
    const itens = atual.controleProcessos.favoritos.itens
    const itemRemovido = itens.find((item) => item.numero === favorito.numero)
    const novosItens = itemRemovido
      ? itens.filter((item) => item.numero !== favorito.numero)
      : [...itens, { ...favorito, adicionadoEm: new Date().toISOString() }]

    await store.set({
      ...atual,
      controleProcessos: {
        ...atual.controleProcessos,
        favoritos: { ...atual.controleProcessos.favoritos, itens: novosItens },
      },
    })

    if (itemRemovido) {
      const localStore = createLocalConfigStore()
      const localConfig = await localStore.get()
      const agoraIso = new Date().toISOString()
      const lixeiraPodada = podarLixeiraPorJanela(localConfig.favoritosLixeira ?? [], agoraIso, 30)
      await localStore.set({
        ...localConfig,
        favoritosLixeira: moverParaLixeira(lixeiraPodada, itemRemovido, agoraIso),
      })
    }

    itensFavoritados = novosItens
    aplicarFiltroFavoritoEmTodasAsTabelas()
    atualizarTodasAsEstrelas()
```

(O restante da função — o que vem depois de `atualizarTodasAsEstrelas()` — continua sem mudança. Import `moverParaLixeira`/`podarLixeiraPorJanela` junto ao import já existente de `favoritos.ts`, linha 108.)

- [ ] **Step 2: Rodar typecheck e lint**

Run: `bun run typecheck && bun run lint`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(favoritos): remover favorito agora manda pra lixeira em vez de apagar direto"
```

---

### Task 7: Seção de Lixeira no painel de Favoritos

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:1440-1500`
- Modify: `src/content-scripts/core/theme.css`

**Interfaces:**
- Consumes: `restaurarDaLixeira`, `removerDefinitivamenteDaLixeira` (Task 5)

- [ ] **Step 1: Função de renderização da lixeira**

Adicionar, depois de `renderizarPainelFavoritos` (linha ~1500):

```typescript
async function renderizarLixeiraFavoritos(): Promise<void> {
  try {
    const painel = document.getElementById('seirmg-favoritos-painel')
    if (!painel) return
    document.getElementById('seirmg-favoritos-lixeira')?.remove()

    const localConfig = await createLocalConfigStore().get()
    const lixeira = localConfig.favoritosLixeira ?? []
    if (lixeira.length === 0) return

    const container = document.createElement('div')
    container.id = 'seirmg-favoritos-lixeira'
    container.className = 'seirmg-favoritos-lixeira'

    const titulo = document.createElement('div')
    titulo.className = 'seirmg-favoritos-lixeira-titulo'
    titulo.textContent = `Lixeira (${lixeira.length})`
    container.appendChild(titulo)

    lixeira.forEach((item) => {
      const linha = document.createElement('div')
      linha.className = 'seirmg-favoritos-lixeira-item'

      const numero = document.createElement('span')
      numero.textContent = item.numero
      linha.appendChild(numero)

      const btnRestaurar = criarBotaoIconeFavoritos('Restaurar favorito', rotateCcwIconSvg)
      btnRestaurar.addEventListener('click', async () => {
        try {
          const store = createSyncConfigStore()
          const atual = await store.get()
          const resultado = restaurarDaLixeira(atual.controleProcessos.favoritos.itens, lixeira, item.numero)
          await store.set({
            ...atual,
            controleProcessos: { ...atual.controleProcessos, favoritos: { ...atual.controleProcessos.favoritos, itens: resultado.itens } },
          })
          await createLocalConfigStore().set({ ...localConfig, favoritosLixeira: resultado.lixeira })
          itensFavoritados = resultado.itens
          renderizarPainelFavoritos()
        } catch (error) {
          console.error('[SEIRMG] Falha ao restaurar favorito da lixeira:', error)
        }
      })

      const btnRemover = criarBotaoIconeFavoritos('Remover definitivamente', trash2IconSvg)
      btnRemover.addEventListener('click', async () => {
        try {
          const novaLixeira = removerDefinitivamenteDaLixeira(lixeira, item.numero)
          await createLocalConfigStore().set({ ...localConfig, favoritosLixeira: novaLixeira })
          renderizarLixeiraFavoritos()
        } catch (error) {
          console.error('[SEIRMG] Falha ao remover favorito definitivamente da lixeira:', error)
        }
      })

      linha.append(btnRestaurar, btnRemover)
      container.appendChild(linha)
    })

    painel.appendChild(container)
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar lixeira de favoritos:', error)
  }
}
```

(`rotateCcwIconSvg` precisa ser importado junto aos outros ícones `lucide-static`, igual aos já existentes no topo do arquivo: `import rotateCcwIconSvg from 'lucide-static/icons/rotate-ccw.svg?raw'`. `trash2IconSvg` já está importado em `procedimento_visualizar/index.ts` mas não necessariamente aqui — confirmar e importar se faltar.)

- [ ] **Step 2: Chamar a renderização da lixeira junto com o painel**

`renderizarPainelFavoritos` hoje retorna sem renderizar nada quando `itensFavoritados.length === 0` (linha 1444) — a lixeira pode ter itens mesmo com zero favoritos ativos, então ela precisa aparecer independentemente disso. No final de `renderizarPainelFavoritos`, depois do bloco `if (referencia.comoFilho) {...}`, acrescentar:

```typescript
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar painel de favoritos:', error)
  }

  renderizarLixeiraFavoritos().catch((error) => {
    console.error('[SEIRMG] Falha ao renderizar lixeira de favoritos:', error)
  })
}
```

Isso significa mover a chamada pra **fora** do `try/catch` existente (ela já tem o próprio tratamento de erro). Também remover o `return` antecipado da linha 1444 (`if (!favoritosAtivo || itensFavoritados.length === 0) return`) só para esse caminho específico — a forma mais simples é extrair a parte "monta o painel com a tabela" pra um bloco que já tem seu próprio early-return, e deixar `renderizarLixeiraFavoritos()` sempre ser chamada no final da função pública, depois do `try/catch`.

- [ ] **Step 3: Estilo**

```css
.seirmg-favoritos-lixeira { margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 8px; }
.seirmg-favoritos-lixeira-titulo { font-size: 11px; font-weight: 700; text-transform: uppercase; opacity: 0.6; margin-bottom: 4px; }
.seirmg-favoritos-lixeira-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }
.seirmg-favoritos-lixeira-item span { flex: 1; }
```

- [ ] **Step 4: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts src/content-scripts/core/theme.css
git commit -m "feat(favoritos): seção de lixeira no painel, com restaurar e remover definitivo"
```

---

## Self-Review

- **Cobertura:** lembrete com notificação (Tasks 2-4) e lixeira (Tasks 5-7) — os dois pontos mapeados na conversa.
- **Placeholders:** nenhum. Toda função pura tem teste real; a integração em `procedimento_controlar/index.ts` reaproveita helpers já existentes no arquivo (`criarBotaoIconeFavoritos`, `createLocalConfigStore`, `createSyncConfigStore`).
- **Consistência de tipos:** `FavoritoParaNotificar`, `FavoritoRemovido`, `LembreteFavoritosPipelineDeps` são usados com o mesmo nome em toda tarefa que os consome; `adicionarFavoritoSeNovo` é a mesma função do Plano de Histórico (Task 5 lá) — se os dois planos forem executados, a segunda implementação é um no-op (função já existe).
