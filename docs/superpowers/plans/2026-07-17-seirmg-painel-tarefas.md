# SEIRMG — Painel de Tarefas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o "SEI Notas" (`C:\sei\seinotas`) pro SEIRMG como um painel de tarefas opt-in
(desligado por padrão, ligado na aba Geral das Opções), com visual redesenhado seguindo o padrão já
estabelecido do SEIRMG (aprovado via mockup nesta sessão).

**Architecture:** Novo content script dedicado (`content-scripts/tarefas/index.ts`, mesmo `matches`
broto já usado por `core`/`ponto_controle`) monta um botão flutuante + painel arrastável quando
`SyncConfig.tarefas.ativo` está ligado. Tarefas ficam em `SyncConfig.tarefas.itens` (mesmo padrão já
usado por `controleProcessos.favoritos.itens`, sem storage novo). Lógica pura testada em
`features/tarefas/` (agrupar por urgência, exportar/importar, diff de vencidas pra notificação).
Notificação de vencidas reaproveita `chrome.notifications` já usado pelo bloco de assinatura, com um
pipeline no background espelhando `blocoAssinaturaPipeline.ts` (mesmo padrão de dependency injection
pra teste).

**Tech Stack:** TypeScript, Vitest (jsdom), Vite/CRXJS (extensão Chrome MV3). Sem dependências novas
(ícones via `lucide-static`, já uma dependência do projeto).

## Global Constraints

- `tsconfig.json` tem `noUnusedParameters: true` e `noUnusedLocals: true` — nenhum
  parâmetro/variável sem uso.
- Qualquer código que chama `chrome.*` ou faz I/O assíncrono a partir de um listener/callback
  precisa de `try/catch` (log via `console.error('[SEIRMG] ...', error)`, sem rethrow) — política já
  estabelecida no projeto.
- Lógica pura testada em `features/`; wiring de DOM em `content-scripts/` e chamadas diretas a
  `chrome.notifications.create` em `background/notifications/notify.ts` sem teste automatizado
  (mesmo padrão já estabelecido — `notify.test.ts` só testa `buildNotificationId`, não as funções
  `notificarXyz` em si).
- **Desvio deliberado da spec** (linha "Armazenamento" do design doc): a spec propunha um storage
  dedicado (`createTarefasStore()`, chave própria). Este plano usa em vez disso o mesmo padrão já
  usado por `controleProcessos.favoritos.itens` — um array dentro do `SyncConfig` já existente, sem
  store novo. Mais simples, mais consistente com o precedente já em produção (Favoritos), evita
  reinventar get/set. Trade-off aceito: os dados de tarefas passam a competir pelo mesmo limite de
  8KB por item do `chrome.storage.sync` junto com o resto das configurações — o mesmo trade-off que
  Favoritos já aceita.
- **Opt-in, desligado por padrão**: `SyncConfig.tarefas.ativo` começa `false`. O content script
  inteiro (`bootstrap()`) sai cedo se estiver desligado — nenhum DOM é montado, nenhuma tarefa é
  lida, nenhuma notificação é agendada.
- Ícones via `lucide-static/icons/*.svg?raw` (mesmo padrão de import já usado no projeto), nunca
  emoji.

---

## Task 1: Tipos e config (`lib/storage.ts`)

**Files:**
- Modify: `src/lib/storage.ts` (`SyncConfig`, `LocalConfig`, `DEFAULT_SYNC_CONFIG`, `DEFAULT_LOCAL_CONFIG`)
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `NotificadoState` (já existe no mesmo arquivo).
- Produces: `Tarefa`, `TarefasConfig` — usados por todas as tasks seguintes.

- [ ] **Step 1: Adicionar os testes novos em `storage.test.ts`**

Logo depois do teste `it('inclui controleProcessos padrão quando vazio', ...)`, adicionar:

```ts
  it('inclui tarefas padrão (desativado, sem itens) quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).tarefas).toEqual({ ativo: false, itens: [] })
  })

  it('persiste alteração de tarefas.itens', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const tarefa = {
      id: '1',
      titulo: 'Analisar parecer',
      processo: '0021.334',
      vencimento: '2026-07-20',
      prioridade: 'alta' as const,
      concluido: false,
    }
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      tarefas: { ativo: true, itens: [tarefa] },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

E, no `describe('createLocalConfigStore', ...)`, logo depois do teste que cobre
`blocoAssinaturaEstadosConhecidos`, adicionar:

```ts
  it('inclui tarefasNotificadas vazio por padrão', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect((await store.get()).tarefasNotificadas).toEqual({})
  })
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `tarefas`/`tarefasNotificadas` vêm `undefined`.

- [ ] **Step 3: Adicionar os tipos `Tarefa`/`TarefasConfig`**

Em `storage.ts`, logo acima de `export interface SyncConfig {`, adicionar:

```ts
export type PrioridadeTarefa = 'baixa' | 'media' | 'alta'

export interface Tarefa {
  id: string
  titulo: string
  processo: string
  vencimento: string // ISO date (yyyy-mm-dd) ou '' quando sem prazo
  prioridade: PrioridadeTarefa
  concluido: boolean
  concluidoEm?: string // ISO datetime, só presente depois de marcar como concluída
  // true em tarefas trazidas por importação -- título/processo/vencimento ficam somente-leitura
  // na UI (mesmo comportamento do plugin original, pra evitar editar por engano dados de origem
  // quando a exportação veio de outra pessoa).
  bloqueada?: boolean
}

export interface TarefasConfig {
  ativo: boolean
  itens: Tarefa[]
}
```

- [ ] **Step 4: Adicionar `tarefas` a `SyncConfig` e `DEFAULT_SYNC_CONFIG`**

Trocar:

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
  documentoExterno: DocumentoExternoConfig
  ferramentasIA: FerramentasIAConfig
  corretorOrtografico: CorretorOrtograficoConfig
  formatacaoBasica: FormatacaoBasicaConfig
}
```

por:

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
  documentoExterno: DocumentoExternoConfig
  ferramentasIA: FerramentasIAConfig
  corretorOrtografico: CorretorOrtograficoConfig
  formatacaoBasica: FormatacaoBasicaConfig
  tarefas: TarefasConfig
}
```

E, em `DEFAULT_SYNC_CONFIG`, logo depois de `formatacaoBasica: { ativo: false, atalhos: [] },`,
adicionar:

```ts
  tarefas: {
    ativo: false,
    itens: [],
  },
```

- [ ] **Step 5: Adicionar `tarefasNotificadas` a `LocalConfig` e `DEFAULT_LOCAL_CONFIG`**

Trocar:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  // Último Estado conhecido de cada bloco (chave = número do bloco), usado só pela checagem
  // oportunista pra detectar transição pra "disponibilizado_para_area". Guardado como string crua
  // (não o tipo EstadoBloco) porque lib/storage.ts não importa de features/.
  blocoAssinaturaEstadosConhecidos: Record<string, string>
  blocoAssinaturaUltimaChecagemOportunista: string
  baseUrlSei?: string
```

por:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  // Último Estado conhecido de cada bloco (chave = número do bloco), usado só pela checagem
  // oportunista pra detectar transição pra "disponibilizado_para_area". Guardado como string crua
  // (não o tipo EstadoBloco) porque lib/storage.ts não importa de features/.
  blocoAssinaturaEstadosConhecidos: Record<string, string>
  blocoAssinaturaUltimaChecagemOportunista: string
  // Última data (yyyy-mm-dd) em que cada tarefa vencida já notificou -- no máximo 1x por dia por
  // tarefa (chave = Tarefa.id).
  tarefasNotificadas: NotificadoState
  baseUrlSei?: string
```

E em `DEFAULT_LOCAL_CONFIG`, logo depois de `blocoAssinaturaUltimaChecagemOportunista: '',`,
adicionar:

```ts
  tarefasNotificadas: {},
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/lib/storage.test.ts`
Expected: PASS (todos os testes, incluindo os novos).

- [ ] **Step 7: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
cd C:\sei\seirmg
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona tipos e config do painel de tarefas

Tarefa/TarefasConfig seguem o mesmo padrão já usado por
controleProcessos.favoritos.itens (array dentro do SyncConfig
existente, sem storage novo). tarefas.ativo começa desligado
(opt-in). tarefasNotificadas em LocalConfig controla o limite de
1 notificação de vencimento por dia por tarefa.
EOF
)"
```

---

## Task 2: Agrupamento por urgência (`features/tarefas/urgencia.ts`)

**Files:**
- Create: `src/features/tarefas/urgencia.ts`
- Test: `src/features/tarefas/urgencia.test.ts`

**Interfaces:**
- Consumes: `Tarefa` (Task 1).
- Produces: `GrupoUrgencia`, `TarefasAgrupadas`, `classificarUrgencia`, `agruparPorUrgencia`,
  `contarAtrasadas`, `ordenarDentroDoGrupo`, `concluidasRecentes` — usadas pela Task 8 (wiring do
  painel).

- [ ] **Step 1: Escrever os testes**

Criar `src/features/tarefas/urgencia.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  agruparPorUrgencia,
  classificarUrgencia,
  concluidasRecentes,
  contarAtrasadas,
  ordenarDentroDoGrupo,
} from './urgencia'
import type { Tarefa } from '../../lib/storage'

function montarTarefa(sobrescreve: Partial<Tarefa>): Tarefa {
  return {
    id: '1',
    titulo: 'Tarefa',
    processo: '',
    vencimento: '',
    prioridade: 'media',
    concluido: false,
    ...sobrescreve,
  }
}

const hoje = new Date('2026-07-17T12:00:00.000Z')

describe('classificarUrgencia', () => {
  it('classifica sem vencimento como semPrazo', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '' }), hoje)).toBe('semPrazo')
  })

  it('classifica data anterior a hoje como atrasadas', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '2026-07-10' }), hoje)).toBe('atrasadas')
  })

  it('classifica a data de hoje como hoje', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '2026-07-17' }), hoje)).toBe('hoje')
  })

  it('classifica data futura como proximas', () => {
    expect(classificarUrgencia(montarTarefa({ vencimento: '2026-08-01' }), hoje)).toBe('proximas')
  })
})

describe('agruparPorUrgencia', () => {
  it('agrupa tarefas pendentes nos 4 grupos', () => {
    const atrasada = montarTarefa({ id: 'a', vencimento: '2026-07-10' })
    const hojeT = montarTarefa({ id: 'b', vencimento: '2026-07-17' })
    const futura = montarTarefa({ id: 'c', vencimento: '2026-08-01' })
    const semPrazoT = montarTarefa({ id: 'd', vencimento: '' })

    const grupos = agruparPorUrgencia([atrasada, hojeT, futura, semPrazoT], hoje)

    expect(grupos.atrasadas).toEqual([atrasada])
    expect(grupos.hoje).toEqual([hojeT])
    expect(grupos.proximas).toEqual([futura])
    expect(grupos.semPrazo).toEqual([semPrazoT])
  })

  it('ignora tarefas concluídas', () => {
    const concluida = montarTarefa({ vencimento: '2026-07-10', concluido: true })
    const grupos = agruparPorUrgencia([concluida], hoje)
    expect(grupos.atrasadas).toEqual([])
  })
})

describe('contarAtrasadas', () => {
  it('conta só as pendentes com vencimento no passado', () => {
    const atrasada = montarTarefa({ id: 'a', vencimento: '2026-07-10' })
    const concluidaAtrasada = montarTarefa({ id: 'b', vencimento: '2026-07-10', concluido: true })
    const futura = montarTarefa({ id: 'c', vencimento: '2026-08-01' })
    expect(contarAtrasadas([atrasada, concluidaAtrasada, futura], hoje)).toBe(1)
  })
})

describe('ordenarDentroDoGrupo', () => {
  it('ordena por prioridade (alta > media > baixa)', () => {
    const baixa = montarTarefa({ id: 'a', prioridade: 'baixa' })
    const alta = montarTarefa({ id: 'b', prioridade: 'alta' })
    const media = montarTarefa({ id: 'c', prioridade: 'media' })
    expect(ordenarDentroDoGrupo([baixa, alta, media]).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('em caso de empate de prioridade, ordena por vencimento crescente', () => {
    const depois = montarTarefa({ id: 'a', prioridade: 'alta', vencimento: '2026-08-01' })
    const antes = montarTarefa({ id: 'b', prioridade: 'alta', vencimento: '2026-07-20' })
    expect(ordenarDentroDoGrupo([depois, antes]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('tarefas sem vencimento vão pro final do grupo', () => {
    const semData = montarTarefa({ id: 'a', prioridade: 'alta', vencimento: '' })
    const comData = montarTarefa({ id: 'b', prioridade: 'alta', vencimento: '2026-07-20' })
    expect(ordenarDentroDoGrupo([semData, comData]).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('concluidasRecentes', () => {
  it('retorna só as concluídas, mais recente primeiro, limitado', () => {
    const c1 = montarTarefa({ id: 'a', concluido: true, concluidoEm: '2026-07-15T10:00:00.000Z' })
    const c2 = montarTarefa({ id: 'b', concluido: true, concluidoEm: '2026-07-16T10:00:00.000Z' })
    const c3 = montarTarefa({ id: 'c', concluido: true, concluidoEm: '2026-07-14T10:00:00.000Z' })
    const pendente = montarTarefa({ id: 'd', concluido: false })

    expect(concluidasRecentes([c1, c2, c3, pendente], 2).map((t) => t.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/tarefas/urgencia.test.ts`
Expected: FAIL — `./urgencia` não existe ainda.

- [ ] **Step 3: Implementar `urgencia.ts`**

```ts
import type { Tarefa } from '../../lib/storage'

export type GrupoUrgencia = 'atrasadas' | 'hoje' | 'proximas' | 'semPrazo'

export interface TarefasAgrupadas {
  atrasadas: Tarefa[]
  hoje: Tarefa[]
  proximas: Tarefa[]
  semPrazo: Tarefa[]
}

function normalizarData(data: Date): Date {
  const normalizada = new Date(data)
  normalizada.setHours(0, 0, 0, 0)
  return normalizada
}

export function classificarUrgencia(tarefa: Tarefa, hoje: Date): GrupoUrgencia {
  if (!tarefa.vencimento) return 'semPrazo'

  const vencimento = normalizarData(new Date(tarefa.vencimento))
  const hojeNormalizado = normalizarData(hoje)

  if (vencimento.getTime() < hojeNormalizado.getTime()) return 'atrasadas'
  if (vencimento.getTime() === hojeNormalizado.getTime()) return 'hoje'
  return 'proximas'
}

export function agruparPorUrgencia(tarefas: Tarefa[], hoje: Date): TarefasAgrupadas {
  const grupos: TarefasAgrupadas = { atrasadas: [], hoje: [], proximas: [], semPrazo: [] }

  tarefas
    .filter((tarefa) => !tarefa.concluido)
    .forEach((tarefa) => {
      grupos[classificarUrgencia(tarefa, hoje)].push(tarefa)
    })

  return grupos
}

export function contarAtrasadas(tarefas: Tarefa[], hoje: Date): number {
  return tarefas.filter((tarefa) => !tarefa.concluido && classificarUrgencia(tarefa, hoje) === 'atrasadas')
    .length
}

const PESO_PRIORIDADE: Record<Tarefa['prioridade'], number> = { alta: 0, media: 1, baixa: 2 }

export function ordenarDentroDoGrupo(tarefas: Tarefa[]): Tarefa[] {
  return [...tarefas].sort((a, b) => {
    const diffPrioridade = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade]
    if (diffPrioridade !== 0) return diffPrioridade
    if (!a.vencimento && !b.vencimento) return 0
    if (!a.vencimento) return 1
    if (!b.vencimento) return -1
    return a.vencimento.localeCompare(b.vencimento)
  })
}

export function concluidasRecentes(tarefas: Tarefa[], limite: number): Tarefa[] {
  return tarefas
    .filter((tarefa) => tarefa.concluido)
    .sort((a, b) => (b.concluidoEm ?? '').localeCompare(a.concluidoEm ?? ''))
    .slice(0, limite)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/tarefas/urgencia.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/tarefas/urgencia.ts src/features/tarefas/urgencia.test.ts
git commit -m "feat: adiciona agrupamento de tarefas por urgência"
```

---

## Task 3: Exportar/Importar (`features/tarefas/exportar.ts`)

**Files:**
- Create: `src/features/tarefas/exportar.ts`
- Test: `src/features/tarefas/exportar.test.ts`

**Interfaces:**
- Consumes: `Tarefa` (Task 1).
- Produces: `ExportacaoTarefas`, `montarExportacao`, `parseImportacao`,
  `tarefasImportadasParaAdicionar` — usadas pela Task 10 (wiring de exportar/importar).

- [ ] **Step 1: Escrever os testes**

Criar `src/features/tarefas/exportar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarExportacao, parseImportacao, tarefasImportadasParaAdicionar } from './exportar'
import type { Tarefa } from '../../lib/storage'

const tarefa: Tarefa = {
  id: '1',
  titulo: 'Analisar parecer',
  processo: '0021.334',
  vencimento: '2026-07-20',
  prioridade: 'alta',
  concluido: false,
}

describe('montarExportacao', () => {
  it('monta o objeto de exportação com só os campos relevantes', () => {
    const agora = new Date('2026-07-17T10:00:00.000Z')
    const exportacao = montarExportacao([tarefa], '5.0', agora)

    expect(exportacao).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [
        {
          titulo: 'Analisar parecer',
          processo: '0021.334',
          vencimento: '2026-07-20',
          prioridade: 'alta',
          concluido: false,
        },
      ],
    })
  })
})

describe('parseImportacao', () => {
  it('faz parse de um JSON válido', () => {
    const json = JSON.stringify({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [tarefa],
    })
    expect(parseImportacao(json)).toEqual({
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [tarefa],
    })
  })

  it('retorna null pra JSON inválido (sintaxe)', () => {
    expect(parseImportacao('{ isso não é json')).toBeNull()
  })

  it('retorna null quando falta o campo tarefas', () => {
    expect(parseImportacao(JSON.stringify({ versaoSeirmg: '5.0' }))).toBeNull()
  })

  it('retorna null quando tarefas não é um array', () => {
    expect(parseImportacao(JSON.stringify({ tarefas: 'não é array' }))).toBeNull()
  })
})

describe('tarefasImportadasParaAdicionar', () => {
  it('gera um novo id e marca como bloqueada', () => {
    const exportacao = {
      versaoSeirmg: '5.0',
      exportadoEm: '2026-07-17T10:00:00.000Z',
      tarefas: [
        {
          titulo: 'Analisar parecer',
          processo: '0021.334',
          vencimento: '2026-07-20',
          prioridade: 'alta' as const,
          concluido: false,
        },
      ],
    }

    const resultado = tarefasImportadasParaAdicionar(exportacao, () => 'novo-id')

    expect(resultado).toEqual([
      {
        id: 'novo-id',
        titulo: 'Analisar parecer',
        processo: '0021.334',
        vencimento: '2026-07-20',
        prioridade: 'alta',
        concluido: false,
        bloqueada: true,
      },
    ])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/tarefas/exportar.test.ts`
Expected: FAIL — `./exportar` não existe ainda.

- [ ] **Step 3: Implementar `exportar.ts`**

```ts
import type { Tarefa } from '../../lib/storage'

export type TarefaExportada = Pick<
  Tarefa,
  'titulo' | 'processo' | 'vencimento' | 'prioridade' | 'concluido'
>

export interface ExportacaoTarefas {
  versaoSeirmg: string
  exportadoEm: string
  tarefas: TarefaExportada[]
}

export function montarExportacao(tarefas: Tarefa[], versaoSeirmg: string, agora: Date): ExportacaoTarefas {
  return {
    versaoSeirmg,
    exportadoEm: agora.toISOString(),
    tarefas: tarefas.map(({ titulo, processo, vencimento, prioridade, concluido }) => ({
      titulo,
      processo,
      vencimento,
      prioridade,
      concluido,
    })),
  }
}

export function parseImportacao(json: string): ExportacaoTarefas | null {
  try {
    const dados: unknown = JSON.parse(json)
    if (
      typeof dados !== 'object' ||
      dados === null ||
      !Array.isArray((dados as { tarefas?: unknown }).tarefas)
    ) {
      return null
    }
    return dados as ExportacaoTarefas
  } catch {
    return null
  }
}

export function tarefasImportadasParaAdicionar(
  exportacao: ExportacaoTarefas,
  gerarId: () => string
): Tarefa[] {
  return exportacao.tarefas.map((tarefaExportada) => ({
    ...tarefaExportada,
    id: gerarId(),
    bloqueada: true,
  }))
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/tarefas/exportar.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/tarefas/exportar.ts src/features/tarefas/exportar.test.ts
git commit -m "feat: adiciona exportação/importação de tarefas (formato próprio do SEIRMG)"
```

---

## Task 4: Diff de tarefas vencidas (`features/tarefas/diffVencidas.ts`)

**Files:**
- Create: `src/features/tarefas/diffVencidas.ts`
- Test: `src/features/tarefas/diffVencidas.test.ts`

**Interfaces:**
- Consumes: `NotificadoState` (já existe em `lib/storage.ts`).
- Produces: `TarefaParaNotificar`, `diffVencidas` — usada pela Task 5 (pipeline do background).

Diferente de `diffPendentes` (bloco de assinatura, que notifica só 1x pra sempre por item): aqui a
regra é **1x por dia** por tarefa (mesmo comportamento do plugin original) — por isso a comparação é
por data (`yyyy-mm-dd`), não por presença da chave.

- [ ] **Step 1: Escrever os testes**

Criar `src/features/tarefas/diffVencidas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { diffVencidas } from './diffVencidas'
import type { NotificadoState } from '../../lib/storage'

const tarefa = { id: '1', titulo: 'Analisar parecer' }

describe('diffVencidas', () => {
  it('inclui tarefa nunca notificada', () => {
    const resultado = diffVencidas([tarefa], {}, '2026-07-17T10:00:00.000Z')
    expect(resultado.novas).toEqual([tarefa])
    expect(resultado.estadoAtualizado).toEqual({ '1': { notificadoEm: '2026-07-17T10:00:00.000Z' } })
  })

  it('não repete tarefa já notificada no mesmo dia', () => {
    const notificadas: NotificadoState = { '1': { notificadoEm: '2026-07-17T08:00:00.000Z' } }
    const resultado = diffVencidas([tarefa], notificadas, '2026-07-17T18:00:00.000Z')
    expect(resultado.novas).toEqual([])
  })

  it('notifica de novo em um dia diferente', () => {
    const notificadas: NotificadoState = { '1': { notificadoEm: '2026-07-16T08:00:00.000Z' } }
    const resultado = diffVencidas([tarefa], notificadas, '2026-07-17T08:00:00.000Z')
    expect(resultado.novas).toEqual([tarefa])
    expect(resultado.estadoAtualizado['1'].notificadoEm).toBe('2026-07-17T08:00:00.000Z')
  })

  it('preserva o estado de outras tarefas não presentes na lista atual', () => {
    const notificadas: NotificadoState = { outraTarefa: { notificadoEm: '2026-07-10T08:00:00.000Z' } }
    const resultado = diffVencidas([tarefa], notificadas, '2026-07-17T08:00:00.000Z')
    expect(resultado.estadoAtualizado.outraTarefa).toEqual({ notificadoEm: '2026-07-10T08:00:00.000Z' })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/tarefas/diffVencidas.test.ts`
Expected: FAIL — `./diffVencidas` não existe ainda.

- [ ] **Step 3: Implementar `diffVencidas.ts`**

```ts
import type { NotificadoState } from '../../lib/storage'

export interface TarefaParaNotificar {
  id: string
  titulo: string
}

export interface DiffVencidasResultado {
  novas: TarefaParaNotificar[]
  estadoAtualizado: NotificadoState
}

function mesmoDia(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10)
}

export function diffVencidas(
  tarefasVencidas: TarefaParaNotificar[],
  jaNotificadas: NotificadoState,
  agoraIso: string
): DiffVencidasResultado {
  const novas = tarefasVencidas.filter((tarefa) => {
    const ultimaNotificacao = jaNotificadas[tarefa.id]?.notificadoEm
    return !ultimaNotificacao || !mesmoDia(ultimaNotificacao, agoraIso)
  })

  const estadoAtualizado: NotificadoState = { ...jaNotificadas }
  novas.forEach((tarefa) => {
    estadoAtualizado[tarefa.id] = { notificadoEm: agoraIso }
  })

  return { novas, estadoAtualizado }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/tarefas/diffVencidas.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/tarefas/diffVencidas.ts src/features/tarefas/diffVencidas.test.ts
git commit -m "feat: adiciona diff de tarefas vencidas (1 notificação por dia por tarefa)"
```

---

## Task 5: Notificação + pipeline no background

**Files:**
- Modify: `src/background/notifications/notify.ts`
- Create: `src/background/tarefasPipeline.ts`
- Test: `src/background/tarefasPipeline.test.ts`

**Interfaces:**
- Consumes: `diffVencidas`, `TarefaParaNotificar` (Task 4); `createLocalConfigStore` (já existe).
- Produces: `NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX`, `notificarTarefaVencida`,
  `processarTarefasVencidas` — usados pela Task 6 (wiring do `background/index.ts`).

- [ ] **Step 1: Adicionar a notificação em `notify.ts`**

No final do arquivo, adicionar:

```ts
export const NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX = 'seirmg-tarefa-vencida-'

export function notificarTarefaVencida(tarefa: { id: string; titulo: string }): void {
  chrome.notifications.create(`${NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX}${tarefa.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Tarefa vencida',
    message: `"${tarefa.titulo || 'Sem título'}" está com o prazo vencido.`,
    priority: 1,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Escrever o teste do pipeline**

Criar `src/background/tarefasPipeline.test.ts` (mesmo padrão de dependency injection de
`blocoAssinaturaPipeline.test.ts`):

```ts
import { describe, expect, it, vi } from 'vitest'
import { processarTarefasVencidas } from './tarefasPipeline'
import { DEFAULT_LOCAL_CONFIG } from '../lib/storage'

const tarefa = { id: '1', titulo: 'Analisar parecer' }

describe('processarTarefasVencidas', () => {
  it('notifica e persiste quando há tarefa vencida nova', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarTarefasVencidas([tarefa], {
      localStore: {
        get: async () => DEFAULT_LOCAL_CONFIG,
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-17T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith(tarefa)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      tarefasNotificadas: { '1': { notificadoEm: '2026-07-17T10:00:00.000Z' } },
    })
  })

  it('não notifica de novo a mesma tarefa no mesmo dia', async () => {
    const notificar = vi.fn()

    await processarTarefasVencidas([tarefa], {
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          tarefasNotificadas: { '1': { notificadoEm: '2026-07-17T08:00:00.000Z' } },
        }),
        set: async () => {},
      },
      notificar,
      agoraIso: '2026-07-17T18:00:00.000Z',
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('lista vazia não chama notificar nem falha', async () => {
    const notificar = vi.fn()

    await processarTarefasVencidas([], {
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/background/tarefasPipeline.test.ts`
Expected: FAIL — `./tarefasPipeline` não existe ainda.

- [ ] **Step 5: Implementar `tarefasPipeline.ts`**

```ts
import { diffVencidas, type TarefaParaNotificar } from '../features/tarefas/diffVencidas'
import { createLocalConfigStore } from '../lib/storage'
import { notificarTarefaVencida } from './notifications/notify'

type LocalStore = ReturnType<typeof createLocalConfigStore>

export interface TarefasPipelineDeps {
  localStore?: LocalStore
  notificar?: typeof notificarTarefaVencida
  agoraIso?: string
}

export async function processarTarefasVencidas(
  tarefasVencidas: TarefaParaNotificar[],
  deps: TarefasPipelineDeps = {}
): Promise<void> {
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarTarefaVencida
  const agoraIso = deps.agoraIso ?? new Date().toISOString()

  const localConfig = await localStore.get()
  const { novas, estadoAtualizado } = diffVencidas(
    tarefasVencidas,
    localConfig.tarefasNotificadas,
    agoraIso
  )

  novas.forEach((tarefa) => notificar(tarefa))

  await localStore.set({
    ...localConfig,
    tarefasNotificadas: estadoAtualizado,
  })
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/background/tarefasPipeline.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 7: Commit**

```bash
cd C:\sei\seirmg
git add src/background/notifications/notify.ts src/background/tarefasPipeline.ts src/background/tarefasPipeline.test.ts
git commit -m "$(cat <<'EOF'
feat: notificação e pipeline de tarefas vencidas no background

processarTarefasVencidas espelha blocoAssinaturaPipeline.ts (mesmo
padrão de dependency injection pra teste), mas com diffVencidas
(1 notificação por dia por tarefa, não 1 pra sempre).
EOF
)"
```

---

## Task 6: Wiring no `background/index.ts`

**Files:**
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX`, `processarTarefasVencidas` (Task 5).
- Produces: mensagem `{ type: 'seirmg:tarefas-vencidas', tarefas: TarefaParaNotificar[] }` —
  formato que a Task 10 precisa enviar exatamente assim.

Sem teste automatizado — mesmo padrão do resto de `background/index.ts`.

- [ ] **Step 1: Atualizar os imports do topo do arquivo**

Trocar:

```ts
import {
  NOTIFICATION_ID_PREFIX,
  NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA,
  NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX,
  notificarLembreteBlocoAssinatura,
  notificarBlocoDisponibilizado,
} from './notifications/notify'
```

por:

```ts
import {
  NOTIFICATION_ID_PREFIX,
  NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA,
  NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX,
  NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX,
  notificarLembreteBlocoAssinatura,
  notificarBlocoDisponibilizado,
} from './notifications/notify'
import { processarTarefasVencidas } from './tarefasPipeline'
```

- [ ] **Step 2: Adicionar a interface e o type guard da nova mensagem**

Logo depois da interface `MensagemBlocoDisponibilizado` (que já existe), adicionar:

```ts
interface MensagemTarefasVencidas {
  type: 'seirmg:tarefas-vencidas'
  tarefas: Array<{ id: string; titulo: string }>
}
```

E logo depois de `ehMensagemBlocoDisponibilizado` (que já existe), adicionar:

```ts
function ehMensagemTarefasVencidas(mensagem: unknown): mensagem is MensagemTarefasVencidas {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:tarefas-vencidas'
  )
}
```

- [ ] **Step 3: Adicionar o listener**

Logo depois do listener existente de `seirmg:bloco-disponibilizado`, adicionar:

```ts
chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemTarefasVencidas(mensagem)) return
  processarTarefasVencidas(mensagem.tarefas).catch((error) => {
    console.error('[SEIRMG] Falha ao processar tarefas vencidas:', error)
  })
})
```

- [ ] **Step 4: Estender o clique em notificação pra incluir o novo prefixo**

Trocar:

```ts
    if (
      notificationId.startsWith(NOTIFICATION_ID_PREFIX) ||
      notificationId === NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA ||
      notificationId.startsWith(NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX)
    ) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
      )
    }
```

por:

```ts
    if (
      notificationId.startsWith(NOTIFICATION_ID_PREFIX) ||
      notificationId === NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA ||
      notificationId.startsWith(NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX)
    ) {
      await abrirOuFocarAba(
        localConfig.baseUrlSei,
        `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
      )
    } else if (notificationId.startsWith(NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX)) {
      // Sem tela dedicada de tarefas -- o painel convive em qualquer página do SEI, então só
      // focamos/abrimos a aba do SEI onde o usuário já estava.
      await abrirOuFocarAba(localConfig.baseUrlSei, localConfig.baseUrlSei)
    }
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd C:\sei\seirmg
git add src/background/index.ts
git commit -m "$(cat <<'EOF'
feat: background escuta seirmg:tarefas-vencidas e notifica

Clique na notificação foca/abre a aba do SEI já aberta (sem tela
dedicada de tarefas -- o painel convive em qualquer página).
EOF
)"
```

---

## Task 7: Novo content script no manifest (`manifest.config.ts`)

**Files:**
- Modify: `manifest.config.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: entry point `src/content-scripts/tarefas/index.ts` — arquivo que a Task 8 cria.

- [ ] **Step 1: Adicionar a entrada no array `content_scripts`**

Logo depois da entrada de `ponto_controle/index.ts` (que usa o mesmo `matches` broto), adicionar:

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/tarefas/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 2: Criar um placeholder mínimo do content script pra validar o manifest**

Criar `src/content-scripts/tarefas/index.ts`:

```ts
export {}
```

(Será substituído pelo conteúdo real na Task 8 — esse placeholder só garante que o build não quebra
por falta do arquivo referenciado no manifest.)

- [ ] **Step 3: Typecheck e build**

Run: `cd C:\sei\seirmg && npx tsc --noEmit && npm run build`
Expected: sem erros, `dist/` gerado com o novo content script listado.

- [ ] **Step 4: Commit**

```bash
cd C:\sei\seirmg
git add manifest.config.ts src/content-scripts/tarefas/index.ts
git commit -m "feat: registra o content script do painel de tarefas no manifest"
```

---

## Task 8: Painel — esqueleto e renderização (`content-scripts/tarefas/index.ts`, parte 1)

**Files:**
- Modify: `src/content-scripts/tarefas/index.ts`

**Interfaces:**
- Consumes: `Tarefa`, `TarefasConfig`, `createSyncConfigStore` (Task 1); `agruparPorUrgencia`,
  `contarAtrasadas`, `ordenarDentroDoGrupo`, `concluidasRecentes` (Task 2).
- Produces: `renderizarPainel(): void`, `atualizarBadge(): void`, `tarefasAtuais: Tarefa[]`
  (estado em memória do módulo) — usados pelas Task 9 e 10 (mesmo arquivo, funções seguintes).

Sem teste automatizado (mesmo padrão já estabelecido pra essa classe de wiring de DOM).

- [ ] **Step 1: Escrever o CSS e o esqueleto do painel**

Substituir o conteúdo de `src/content-scripts/tarefas/index.ts` (que hoje é só `export {}`) por:

```ts
import { createSyncConfigStore } from '../../lib/storage'
import type { Tarefa } from '../../lib/storage'
import {
  agruparPorUrgencia,
  concluidasRecentes,
  contarAtrasadas,
  ordenarDentroDoGrupo,
  type GrupoUrgencia,
} from '../../features/tarefas/urgencia'
import listChecksIconSvg from 'lucide-static/icons/list-checks.svg?raw'
import alertTriangleIconSvg from 'lucide-static/icons/alert-triangle.svg?raw'
import clockIconSvg from 'lucide-static/icons/clock.svg?raw'
import minusIconSvg from 'lucide-static/icons/minus.svg?raw'
import gripVerticalIconSvg from 'lucide-static/icons/grip-vertical.svg?raw'

const ESTILO_TAREFAS = `
  #seirmg-tarefas-fab {
    position: fixed;
    bottom: 25px;
    right: 25px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(1, 127, 255, .4);
    cursor: pointer;
    z-index: 999998;
  }
  #seirmg-tarefas-fab svg {
    width: 19px;
    height: 19px;
  }
  #seirmg-tarefas-fab-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #dc3545;
    color: #fff;
    font-size: 9px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #fff;
  }
  #seirmg-tarefas-painel {
    position: fixed;
    bottom: 70px;
    right: 25px;
    width: 264px;
    max-height: 70vh;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
    border: 1px solid #edf0f2;
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    z-index: 999998;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  #seirmg-tarefas-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid #f0f2f4;
    flex-shrink: 0;
  }
  #seirmg-tarefas-mover {
    color: #cfd4d8;
    cursor: grab;
    background: none;
    border: none;
    padding: 2px;
  }
  #seirmg-tarefas-mover svg {
    width: 13px;
    height: 13px;
  }
  #seirmg-tarefas-titulo {
    font-weight: 700;
    font-size: 13px;
    color: #1a1d1f;
    flex: 1;
  }
  #seirmg-tarefas-contagem {
    color: var(--seirmg-accent-color, #017fff);
    background: #eaf4ff;
    border-radius: 20px;
    font-size: 10.5px;
    padding: 1px 7px;
    margin-left: 5px;
  }
  #seirmg-tarefas-corpo {
    padding: 10px 12px 4px;
    background: #fbfcfd;
    overflow-y: auto;
  }
  .seirmg-tarefas-grupo {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .4px;
    text-transform: uppercase;
    color: #a3232b;
    margin: 12px 0 6px;
  }
  .seirmg-tarefas-grupo:first-child {
    margin-top: 2px;
  }
  .seirmg-tarefas-grupo svg {
    width: 11px;
    height: 11px;
  }
  .seirmg-tarefas-grupo-n {
    color: #c98;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  .seirmg-tarefas-grupo.hoje {
    color: #92720b;
  }
  .seirmg-tarefas-grupo.proximas,
  .seirmg-tarefas-grupo.semPrazo {
    color: #8a919a;
  }
  .seirmg-tarefas-linha {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 4px;
    border-radius: 8px;
    font-size: 12px;
  }
  .seirmg-tarefas-linha:hover {
    background: #f1f6fb;
  }
  .seirmg-tarefas-ponto {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .seirmg-tarefas-ponto.alta { background: #e5484d; }
  .seirmg-tarefas-ponto.media { background: #f5a623; }
  .seirmg-tarefas-ponto.baixa { background: #30a46c; }
  .seirmg-tarefas-linha-titulo {
    flex: 1;
    color: #1a1d1f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seirmg-tarefas-linha.concluida .seirmg-tarefas-linha-titulo {
    color: #adb3b8;
    text-decoration: line-through;
  }
  .seirmg-tarefas-linha-data {
    color: #adb3b8;
    font-size: 10.5px;
    flex-shrink: 0;
  }
  .seirmg-tarefas-linha-data.atrasada {
    color: #e5484d;
    font-weight: 600;
  }
  #seirmg-tarefas-divisor {
    height: 1px;
    background: #f0f2f4;
    margin: 4px 0 2px;
  }
  .seirmg-theme-black #seirmg-tarefas-painel {
    background: #202325;
    border-color: #2c3033;
  }
  .seirmg-theme-black #seirmg-tarefas-header {
    border-color: #2c3033;
  }
  .seirmg-theme-black #seirmg-tarefas-titulo {
    color: #f2f3f5;
  }
  .seirmg-theme-black #seirmg-tarefas-corpo {
    background: #1a1c1e;
  }
  .seirmg-theme-black .seirmg-tarefas-linha-titulo {
    color: #f2f3f5;
  }
  .seirmg-theme-black .seirmg-tarefas-linha:hover {
    background: #262a2d;
  }
  .seirmg-theme-black #seirmg-tarefas-divisor {
    background: #2c3033;
  }
`

function injetarEstilos(): void {
  if (document.getElementById('seirmg-estilo-tarefas')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-tarefas'
  style.textContent = ESTILO_TAREFAS
  document.head.appendChild(style)
}

let tarefasAtuais: Tarefa[] = []

const ROTULOS_GRUPO: Record<GrupoUrgencia, { texto: string; iconeSvg: string; classe: string }> = {
  atrasadas: { texto: 'Atrasadas', iconeSvg: alertTriangleIconSvg, classe: 'atrasadas' },
  hoje: { texto: 'Hoje', iconeSvg: clockIconSvg, classe: 'hoje' },
  proximas: { texto: 'Próximas', iconeSvg: clockIconSvg, classe: 'proximas' },
  semPrazo: { texto: 'Sem prazo', iconeSvg: minusIconSvg, classe: 'semPrazo' },
}

const ORDEM_GRUPOS: GrupoUrgencia[] = ['atrasadas', 'hoje', 'proximas', 'semPrazo']
const LIMITE_CONCLUIDAS_RECENTES = 3

function montarLinhaTarefa(tarefa: Tarefa, concluidaRecente: boolean, hoje: Date): HTMLElement {
  const linha = document.createElement('div')
  linha.className = concluidaRecente ? 'seirmg-tarefas-linha concluida' : 'seirmg-tarefas-linha'
  linha.dataset.id = tarefa.id

  const ponto = document.createElement('span')
  ponto.className = `seirmg-tarefas-ponto ${tarefa.prioridade}`
  linha.appendChild(ponto)

  const titulo = document.createElement('span')
  titulo.className = 'seirmg-tarefas-linha-titulo'
  titulo.textContent = tarefa.titulo || '(sem título)'
  linha.appendChild(titulo)

  const data = document.createElement('span')
  const vencimento = tarefa.vencimento ? new Date(tarefa.vencimento) : null
  const atrasada = !concluidaRecente && !!vencimento && vencimento < hoje
  data.className = atrasada ? 'seirmg-tarefas-linha-data atrasada' : 'seirmg-tarefas-linha-data'
  data.textContent = concluidaRecente
    ? '✓ concluída'
    : tarefa.vencimento
      ? new Date(tarefa.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—'
  linha.appendChild(data)

  return linha
}

function renderizarPainel(): void {
  const corpo = document.getElementById('seirmg-tarefas-corpo')
  const contagem = document.getElementById('seirmg-tarefas-contagem')
  if (!corpo || !contagem) return

  corpo.innerHTML = ''
  const hoje = new Date()
  const grupos = agruparPorUrgencia(tarefasAtuais, hoje)
  const pendentes = tarefasAtuais.filter((tarefa) => !tarefa.concluido)

  contagem.textContent = `${pendentes.length} pendente${pendentes.length === 1 ? '' : 's'}`

  ORDEM_GRUPOS.forEach((chave) => {
    const itensGrupo = ordenarDentroDoGrupo(grupos[chave])
    if (itensGrupo.length === 0) return

    const rotulo = ROTULOS_GRUPO[chave]
    const cabecalho = document.createElement('div')
    cabecalho.className = `seirmg-tarefas-grupo ${rotulo.classe}`
    const iconeSpan = document.createElement('span')
    iconeSpan.innerHTML = rotulo.iconeSvg
    cabecalho.appendChild(iconeSpan)
    cabecalho.appendChild(document.createTextNode(rotulo.texto))
    const contadorSpan = document.createElement('span')
    contadorSpan.className = 'seirmg-tarefas-grupo-n'
    contadorSpan.textContent = ` · ${itensGrupo.length}`
    cabecalho.appendChild(contadorSpan)
    corpo.appendChild(cabecalho)

    itensGrupo.forEach((tarefa) => {
      corpo.appendChild(montarLinhaTarefa(tarefa, false, hoje))
    })
  })

  const recentes = concluidasRecentes(tarefasAtuais, LIMITE_CONCLUIDAS_RECENTES)
  if (recentes.length > 0) {
    const divisor = document.createElement('div')
    divisor.id = 'seirmg-tarefas-divisor'
    corpo.appendChild(divisor)
    recentes.forEach((tarefa) => {
      corpo.appendChild(montarLinhaTarefa(tarefa, true, hoje))
    })
  }
}

function atualizarBadge(): void {
  const badge = document.getElementById('seirmg-tarefas-fab-badge')
  if (!badge) return
  const atrasadas = tarefasAtuais.filter((tarefa) => !tarefa.concluido)
  const quantidade = atrasadas.length === 0 ? 0 : contarAtrasadasNoBadge()
  badge.style.display = quantidade > 0 ? 'flex' : 'none'
  badge.textContent = String(quantidade)
}

function contarAtrasadasNoBadge(): number {
  const hoje = new Date()
  return agruparPorUrgencia(tarefasAtuais, hoje).atrasadas.length
}

function montarEsqueleto(): void {
  const fab = document.createElement('div')
  fab.id = 'seirmg-tarefas-fab'
  fab.innerHTML = listChecksIconSvg
  const badge = document.createElement('span')
  badge.id = 'seirmg-tarefas-fab-badge'
  badge.style.display = 'none'
  fab.appendChild(badge)
  document.body.appendChild(fab)

  const painel = document.createElement('div')
  painel.id = 'seirmg-tarefas-painel'
  painel.innerHTML = `
    <div id="seirmg-tarefas-header">
      <button id="seirmg-tarefas-mover" title="Mover">${gripVerticalIconSvg}</button>
      <span id="seirmg-tarefas-titulo">Tarefas<span id="seirmg-tarefas-contagem">0 pendentes</span></span>
    </div>
    <div id="seirmg-tarefas-corpo"></div>
  `
  document.body.appendChild(painel)

  fab.addEventListener('click', () => {
    const aberto = painel.style.display === 'flex'
    painel.style.display = aberto ? 'none' : 'flex'
  })
}

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.tarefas.ativo) return

    injetarEstilos()
    tarefasAtuais = config.tarefas.itens
    montarEsqueleto()
    renderizarPainel()
    atualizarBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de tarefas:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/tarefas/index.ts
git commit -m "$(cat <<'EOF'
feat: esqueleto e renderização do painel de tarefas

Botão flutuante com badge de atrasadas + painel agrupado por
urgência (atrasadas/hoje/próximas/sem prazo) + concluídas recentes
esmaecidas no fim. Sai cedo se tarefas.ativo estiver desligado
(opt-in). Ainda sem CRUD/drag/popups -- só leitura e renderização.
EOF
)"
```

---

## Task 9: CRUD e arrastar painel (`content-scripts/tarefas/index.ts`, parte 2)

**Files:**
- Modify: `src/content-scripts/tarefas/index.ts`

**Interfaces:**
- Consumes: `renderizarPainel`, `atualizarBadge`, `tarefasAtuais` (Task 8, mesmo arquivo).
- Produces: nada consumido por outra task.

Sem teste automatizado (mesmo padrão já estabelecido).

- [ ] **Step 1: Adicionar `salvarTarefas` e os handlers de CRUD**

Logo depois de `montarEsqueleto()` (antes de `async function bootstrap()`), adicionar:

```ts
async function salvarTarefas(): Promise<void> {
  const store = createSyncConfigStore()
  const config = await store.get()
  await store.set({ ...config, tarefas: { ...config.tarefas, itens: tarefasAtuais } })
}

function criarTarefa(): void {
  const nova: Tarefa = {
    id: crypto.randomUUID(),
    titulo: '',
    processo: '',
    vencimento: '',
    prioridade: 'media',
    concluido: false,
  }
  tarefasAtuais = [...tarefasAtuais, nova]
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar tarefa nova:', error))
  renderizarPainel()
  atualizarBadge()
  abrirEdicao(nova.id)
}

function alternarConcluida(id: string): void {
  tarefasAtuais = tarefasAtuais.map((tarefa) =>
    tarefa.id === id
      ? {
          ...tarefa,
          concluido: !tarefa.concluido,
          concluidoEm: !tarefa.concluido ? new Date().toISOString() : undefined,
        }
      : tarefa
  )
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar conclusão de tarefa:', error))
  renderizarPainel()
  atualizarBadge()
}

function excluirTarefa(id: string): void {
  tarefasAtuais = tarefasAtuais.filter((tarefa) => tarefa.id !== id)
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar exclusão de tarefa:', error))
  renderizarPainel()
  atualizarBadge()
}

function atualizarCampoTarefa(id: string, campos: Partial<Tarefa>): void {
  tarefasAtuais = tarefasAtuais.map((tarefa) => (tarefa.id === id ? { ...tarefa, ...campos } : tarefa))
  salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar edição de tarefa:', error))
}

let idEmEdicao: string | null = null

function abrirEdicao(id: string): void {
  idEmEdicao = id
  renderizarPainel()
}

function fecharEdicao(): void {
  idEmEdicao = null
  renderizarPainel()
}
```

- [ ] **Step 2: Trocar `montarLinhaTarefa` pra suportar clique (abrir edição) e o modo de edição inline**

Trocar a função `montarLinhaTarefa` inteira (criada na Task 8) por:

```ts
function montarLinhaTarefa(tarefa: Tarefa, concluidaRecente: boolean, hoje: Date): HTMLElement {
  if (idEmEdicao === tarefa.id) return montarLinhaEdicao(tarefa)

  const linha = document.createElement('div')
  linha.className = concluidaRecente ? 'seirmg-tarefas-linha concluida' : 'seirmg-tarefas-linha'
  linha.dataset.id = tarefa.id
  linha.addEventListener('click', (evento) => {
    if ((evento.target as HTMLElement).closest('.seirmg-tarefas-acao')) return
    if (!concluidaRecente) abrirEdicao(tarefa.id)
  })

  const ponto = document.createElement('span')
  ponto.className = `seirmg-tarefas-ponto ${tarefa.prioridade}`
  linha.appendChild(ponto)

  const titulo = document.createElement('span')
  titulo.className = 'seirmg-tarefas-linha-titulo'
  titulo.textContent = tarefa.titulo || '(sem título)'
  linha.appendChild(titulo)

  const acoes = document.createElement('span')
  acoes.className = 'seirmg-tarefas-acao'
  const botaoConcluir = document.createElement('button')
  botaoConcluir.type = 'button'
  botaoConcluir.title = concluidaRecente ? 'Reabrir' : 'Concluir'
  botaoConcluir.innerHTML = checkIconSvg
  botaoConcluir.addEventListener('click', (evento) => {
    evento.stopPropagation()
    alternarConcluida(tarefa.id)
  })
  acoes.appendChild(botaoConcluir)

  const botaoExcluir = document.createElement('button')
  botaoExcluir.type = 'button'
  botaoExcluir.title = 'Excluir'
  botaoExcluir.innerHTML = trash2IconSvg
  botaoExcluir.addEventListener('click', (evento) => {
    evento.stopPropagation()
    excluirTarefa(tarefa.id)
  })
  acoes.appendChild(botaoExcluir)
  linha.appendChild(acoes)

  const data = document.createElement('span')
  const vencimento = tarefa.vencimento ? new Date(tarefa.vencimento) : null
  const atrasada = !concluidaRecente && !!vencimento && vencimento < hoje
  data.className = atrasada ? 'seirmg-tarefas-linha-data' : 'seirmg-tarefas-linha-data'
  if (atrasada) data.classList.add('atrasada')
  data.textContent = concluidaRecente
    ? '✓ concluída'
    : tarefa.vencimento
      ? new Date(tarefa.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—'
  linha.appendChild(data)

  return linha
}

function montarLinhaEdicao(tarefa: Tarefa): HTMLElement {
  const container = document.createElement('div')
  container.className = 'seirmg-tarefas-edicao'

  const inputTitulo = document.createElement('textarea')
  inputTitulo.className = 'seirmg-tarefas-input'
  inputTitulo.rows = 2
  inputTitulo.placeholder = 'Título...'
  inputTitulo.value = tarefa.titulo
  inputTitulo.disabled = !!tarefa.bloqueada
  inputTitulo.addEventListener('input', () => atualizarCampoTarefa(tarefa.id, { titulo: inputTitulo.value }))
  container.appendChild(inputTitulo)

  const inputProcesso = document.createElement('input')
  inputProcesso.type = 'text'
  inputProcesso.className = 'seirmg-tarefas-input'
  inputProcesso.placeholder = 'Processo SEI...'
  inputProcesso.value = tarefa.processo
  inputProcesso.disabled = !!tarefa.bloqueada
  inputProcesso.addEventListener('input', () =>
    atualizarCampoTarefa(tarefa.id, { processo: inputProcesso.value })
  )
  container.appendChild(inputProcesso)

  const inputVencimento = document.createElement('input')
  inputVencimento.type = 'date'
  inputVencimento.className = 'seirmg-tarefas-input'
  inputVencimento.value = tarefa.vencimento
  inputVencimento.disabled = !!tarefa.bloqueada
  inputVencimento.addEventListener('change', () => {
    atualizarCampoTarefa(tarefa.id, { vencimento: inputVencimento.value })
    renderizarPainel()
  })
  container.appendChild(inputVencimento)

  const selectPrioridade = document.createElement('select')
  selectPrioridade.className = 'seirmg-tarefas-input'
  ;(['baixa', 'media', 'alta'] as const).forEach((valor) => {
    const rotulo = valor === 'baixa' ? 'Baixa' : valor === 'media' ? 'Média' : 'Alta'
    const opcao = new Option(rotulo, valor, false, tarefa.prioridade === valor)
    selectPrioridade.appendChild(opcao)
  })
  selectPrioridade.addEventListener('change', () => {
    atualizarCampoTarefa(tarefa.id, { prioridade: selectPrioridade.value as Tarefa['prioridade'] })
    renderizarPainel()
  })
  container.appendChild(selectPrioridade)

  const botaoFechar = document.createElement('button')
  botaoFechar.type = 'button'
  botaoFechar.textContent = 'Concluído'
  botaoFechar.className = 'seirmg-tarefas-btn-fechar-edicao'
  botaoFechar.addEventListener('click', fecharEdicao)
  container.appendChild(botaoFechar)

  return container
}
```

- [ ] **Step 3: Adicionar os imports de ícone que faltam e o CSS da edição inline**

No topo do arquivo, adicionar aos imports já existentes:

```ts
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import trash2IconSvg from 'lucide-static/icons/trash-2.svg?raw'
```

Em `ESTILO_TAREFAS`, logo antes do fechamento da template string, adicionar:

```css
  .seirmg-tarefas-acao {
    display: none;
    gap: 4px;
    color: #adb3b8;
  }
  .seirmg-tarefas-linha:hover .seirmg-tarefas-acao {
    display: flex;
  }
  .seirmg-tarefas-linha:hover .seirmg-tarefas-linha-data {
    display: none;
  }
  .seirmg-tarefas-acao svg {
    width: 12px;
    height: 12px;
  }
  .seirmg-tarefas-acao button {
    background: none;
    border: none;
    padding: 2px;
    color: inherit;
    cursor: pointer;
  }
  .seirmg-tarefas-edicao {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 4px;
    border: 1px solid #dbe9fb;
    background: #f5faff;
    border-radius: 8px;
    margin-bottom: 4px;
  }
  .seirmg-tarefas-input {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 7px;
    font: inherit;
    font-size: 11.5px;
    border: 1px solid #dbe9fb;
    border-radius: 6px;
  }
  .seirmg-tarefas-input:disabled {
    background: #eee;
    color: #888;
  }
  .seirmg-tarefas-btn-fechar-edicao {
    align-self: flex-end;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
```

- [ ] **Step 4: Ligar o botão "+" (adicionar) e o arrastar do painel**

Em `montarEsqueleto()`, trocar o `innerHTML` do header pra incluir a barra de ações no rodapé, e
adicionar o listener de drag. Trocar:

```ts
  const painel = document.createElement('div')
  painel.id = 'seirmg-tarefas-painel'
  painel.innerHTML = `
    <div id="seirmg-tarefas-header">
      <button id="seirmg-tarefas-mover" title="Mover">${gripVerticalIconSvg}</button>
      <span id="seirmg-tarefas-titulo">Tarefas<span id="seirmg-tarefas-contagem">0 pendentes</span></span>
    </div>
    <div id="seirmg-tarefas-corpo"></div>
  `
  document.body.appendChild(painel)

  fab.addEventListener('click', () => {
    const aberto = painel.style.display === 'flex'
    painel.style.display = aberto ? 'none' : 'flex'
  })
```

por:

```ts
  const painel = document.createElement('div')
  painel.id = 'seirmg-tarefas-painel'
  painel.innerHTML = `
    <div id="seirmg-tarefas-header">
      <button id="seirmg-tarefas-mover" title="Mover">${gripVerticalIconSvg}</button>
      <span id="seirmg-tarefas-titulo">Tarefas<span id="seirmg-tarefas-contagem">0 pendentes</span></span>
    </div>
    <div id="seirmg-tarefas-corpo"></div>
    <div id="seirmg-tarefas-barra">
      <button id="seirmg-tarefas-add" title="Nova tarefa">${plusIconSvg}</button>
    </div>
  `
  document.body.appendChild(painel)

  fab.addEventListener('click', () => {
    const aberto = painel.style.display === 'flex'
    painel.style.display = aberto ? 'none' : 'flex'
  })

  document.getElementById('seirmg-tarefas-add')?.addEventListener('click', criarTarefa)

  const botaoMover = document.getElementById('seirmg-tarefas-mover')
  let arrastando = false
  let deslocX = 0
  let deslocY = 0

  botaoMover?.addEventListener('mousedown', (evento) => {
    arrastando = true
    const rect = painel.getBoundingClientRect()
    deslocX = evento.clientX - rect.left
    deslocY = evento.clientY - rect.top
    document.body.style.userSelect = 'none'
  })

  document.addEventListener('mousemove', (evento) => {
    if (!arrastando) return
    painel.style.top = `${evento.clientY - deslocY}px`
    painel.style.left = `${evento.clientX - deslocX}px`
    painel.style.right = 'auto'
    painel.style.bottom = 'auto'
  })

  document.addEventListener('mouseup', () => {
    arrastando = false
    document.body.style.userSelect = ''
  })
```

E adicionar o import de `plusIconSvg` no topo:

```ts
import plusIconSvg from 'lucide-static/icons/plus.svg?raw'
```

E o CSS da barra em `ESTILO_TAREFAS`:

```css
  #seirmg-tarefas-barra {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 16px;
    border-top: 1px solid #f0f2f4;
    flex-shrink: 0;
  }
  #seirmg-tarefas-add {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 14px rgba(1, 127, 255, .4);
    border: 3px solid #fff;
    cursor: pointer;
  }
  #seirmg-tarefas-add svg {
    width: 18px;
    height: 18px;
  }
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 7: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 8: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/tarefas/index.ts
git commit -m "$(cat <<'EOF'
feat: CRUD e arrastar no painel de tarefas

Clicar numa linha abre edição inline (título/processo/vencimento/
prioridade); campos ficam somente-leitura em tarefas bloqueada
(importadas). Hover na linha troca a data pelas ações rápidas
concluir/excluir. Botão "+" cria tarefa nova e já abre em edição.
Painel arrastável pelo ícone de mover (mesmo padrão mousedown/
mousemove/mouseup do SEI Notas original).
EOF
)"
```

---

## Task 10: Popups (histórico/ajuda) e exportar/importar (`content-scripts/tarefas/index.ts`, parte 3)

**Files:**
- Modify: `src/content-scripts/tarefas/index.ts`

**Interfaces:**
- Consumes: `montarExportacao`, `parseImportacao`, `tarefasImportadasParaAdicionar` (Task 3);
  `renderizarPainel`, `atualizarBadge`, `salvarTarefas`, `tarefasAtuais` (Task 8/9, mesmo arquivo).
- Produces: mensagem `{ type: 'seirmg:tarefas-vencidas', tarefas: Array<{id, titulo}> }` — formato
  exigido pela Task 6 (já implementada, wiring do lado do background).

Sem teste automatizado.

- [ ] **Step 1: Adicionar os imports que faltam**

No topo do arquivo, adicionar:

```ts
import { montarExportacao, parseImportacao, tarefasImportadasParaAdicionar } from '../../features/tarefas/exportar'
import downloadIconSvg from 'lucide-static/icons/download.svg?raw'
import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import circleHelpIconSvg from 'lucide-static/icons/circle-help.svg?raw'
import checkCircle2IconSvg from 'lucide-static/icons/check-circle-2.svg?raw'
```

- [ ] **Step 2: Adicionar o popup de concluídas (histórico completo)**

Logo depois de `fecharEdicao()` (antes de `async function bootstrap()`), adicionar:

```ts
let popupHistoricoAtual: HTMLElement | null = null

function fecharPopupHistorico(): void {
  popupHistoricoAtual?.remove()
  popupHistoricoAtual = null
}

function abrirPopupHistorico(): void {
  fecharPopupHistorico()

  const concluidas = tarefasAtuais.filter((tarefa) => tarefa.concluido)

  const popup = document.createElement('div')
  popup.id = 'seirmg-tarefas-popup-historico'
  popup.addEventListener('click', (evento) => evento.stopPropagation())

  const cabecalho = document.createElement('div')
  cabecalho.className = 'seirmg-tarefas-popup-cabecalho'
  cabecalho.innerHTML = `<span>${checkCircle2IconSvg} Concluídas</span><small>${concluidas.length} item(ns)</small>`
  popup.appendChild(cabecalho)

  if (concluidas.length === 0) {
    const vazio = document.createElement('p')
    vazio.className = 'seirmg-tarefas-popup-vazio'
    vazio.textContent = 'Nenhuma tarefa concluída ainda.'
    popup.appendChild(vazio)
  }

  concluidas.forEach((tarefa) => {
    const item = document.createElement('div')
    item.className = 'seirmg-tarefas-popup-item'

    const titulo = document.createElement('div')
    titulo.className = 'seirmg-tarefas-popup-item-titulo'
    titulo.textContent = tarefa.titulo || '(sem título)'
    item.appendChild(titulo)

    const acoes = document.createElement('div')
    acoes.className = 'seirmg-tarefas-popup-item-acoes'

    const reabrir = document.createElement('button')
    reabrir.type = 'button'
    reabrir.textContent = 'Reabrir'
    reabrir.addEventListener('click', () => {
      alternarConcluida(tarefa.id)
      abrirPopupHistorico()
    })
    acoes.appendChild(reabrir)

    const excluir = document.createElement('button')
    excluir.type = 'button'
    excluir.innerHTML = trash2IconSvg
    excluir.addEventListener('click', () => {
      excluirTarefa(tarefa.id)
      abrirPopupHistorico()
    })
    acoes.appendChild(excluir)

    item.appendChild(acoes)
    popup.appendChild(item)
  })

  document.body.appendChild(popup)
  popupHistoricoAtual = popup
}
```

- [ ] **Step 3: Adicionar o popup de ajuda**

Logo depois do bloco do Step 2, adicionar:

```ts
function abrirPopupAjuda(): void {
  fecharPopupHistorico()

  if (document.getElementById('seirmg-tarefas-popup-ajuda')) return

  const popup = document.createElement('div')
  popup.id = 'seirmg-tarefas-popup-ajuda'
  popup.innerHTML = `
    <h2>Painel de Tarefas — Guia</h2>
    <p>Checklist pessoal disponível em qualquer tela do SEI. Os dados são salvos na sua conta
    (chrome.storage.sync), sincronizados entre os navegadores em que você estiver logado.</p>
    <h3>Como usar</h3>
    <ul>
      <li>O botão azul abre/fecha o painel.</li>
      <li>Clique numa tarefa pra editar; passe o mouse pra ver os atalhos de concluir/excluir.</li>
      <li>Tarefas são agrupadas por urgência: atrasadas, hoje, próximas e sem prazo.</li>
      <li>As últimas concluídas ficam esmaecidas no fim da lista, pra desfazer rápido.</li>
    </ul>
    <h3>Exportar / Importar</h3>
    <p>Exporte suas tarefas pra um arquivo, e importe em outro perfil ou compartilhe com um
    colega. Tarefas importadas ficam com título/processo/vencimento travados (só prioridade,
    concluir e excluir continuam editáveis).</p>
    <button id="seirmg-tarefas-fechar-ajuda">Fechar</button>
  `
  document.body.appendChild(popup)
  document.getElementById('seirmg-tarefas-fechar-ajuda')?.addEventListener('click', () => {
    popup.remove()
  })
}
```

- [ ] **Step 4: Adicionar exportar/importar (arquivo)**

Logo depois do bloco do Step 3, adicionar:

```ts
function exportarTarefas(): void {
  const exportacao = montarExportacao(tarefasAtuais, chrome.runtime.getManifest().version, new Date())
  const blob = new Blob([JSON.stringify(exportacao, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tarefas-seirmg.json'
  link.click()
  URL.revokeObjectURL(url)
}

function importarTarefas(arquivo: File): void {
  const leitor = new FileReader()
  leitor.onload = (evento) => {
    const conteudo = evento.target?.result
    if (typeof conteudo !== 'string') return

    const exportacao = parseImportacao(conteudo)
    if (!exportacao) {
      window.alert('Arquivo inválido.')
      return
    }

    const novas = tarefasImportadasParaAdicionar(exportacao, () => crypto.randomUUID())
    tarefasAtuais = [...tarefasAtuais, ...novas]
    salvarTarefas().catch((error) => console.error('[SEIRMG] Falha ao salvar tarefas importadas:', error))
    renderizarPainel()
    atualizarBadge()
    window.alert(`${novas.length} tarefa(s) importada(s).`)
  }
  leitor.readAsText(arquivo)
}
```

- [ ] **Step 5: Ligar os botões da barra (histórico/exportar/importar/ajuda) e o clique-fora**

Trocar (na `montarEsqueleto()`, dentro do `innerHTML` do painel):

```ts
    <div id="seirmg-tarefas-barra">
      <button id="seirmg-tarefas-add" title="Nova tarefa">${plusIconSvg}</button>
    </div>
```

por:

```ts
    <div id="seirmg-tarefas-barra">
      <button id="seirmg-tarefas-historico" title="Concluídas">${checkCircle2IconSvg}</button>
      <button id="seirmg-tarefas-exportar" title="Exportar">${downloadIconSvg}</button>
      <button id="seirmg-tarefas-add" title="Nova tarefa">${plusIconSvg}</button>
      <button id="seirmg-tarefas-importar" title="Importar">${uploadIconSvg}</button>
      <button id="seirmg-tarefas-ajuda" title="Ajuda">${circleHelpIconSvg}</button>
    </div>
    <input type="file" id="seirmg-tarefas-input-importar" accept="application/json" style="display:none" />
```

E, logo depois de `document.getElementById('seirmg-tarefas-add')?.addEventListener('click', criarTarefa)`,
adicionar:

```ts
  document.getElementById('seirmg-tarefas-historico')?.addEventListener('click', abrirPopupHistorico)
  document.getElementById('seirmg-tarefas-exportar')?.addEventListener('click', exportarTarefas)
  document.getElementById('seirmg-tarefas-ajuda')?.addEventListener('click', abrirPopupAjuda)

  const inputImportar = document.getElementById('seirmg-tarefas-input-importar') as HTMLInputElement | null
  document.getElementById('seirmg-tarefas-importar')?.addEventListener('click', () => inputImportar?.click())
  inputImportar?.addEventListener('change', () => {
    const arquivo = inputImportar.files?.[0]
    if (arquivo) importarTarefas(arquivo)
    inputImportar.value = ''
  })

  document.addEventListener('click', (evento) => {
    const alvo = evento.target as HTMLElement
    if (popupHistoricoAtual && !popupHistoricoAtual.contains(alvo) && alvo.id !== 'seirmg-tarefas-historico') {
      fecharPopupHistorico()
    }
  })
```

- [ ] **Step 6: CSS dos popups**

Em `ESTILO_TAREFAS`, adicionar:

```css
  #seirmg-tarefas-popup-historico,
  #seirmg-tarefas-popup-ajuda {
    position: fixed;
    bottom: 70px;
    right: 300px;
    width: 280px;
    max-height: 65vh;
    overflow-y: auto;
    background: #fff;
    border: 1px solid #edf0f2;
    border-radius: 14px;
    padding: 12px;
    z-index: 999999;
    box-shadow: 0 14px 34px rgba(0, 0, 0, .16);
    font-size: 11.5px;
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    color: #1a1d1f;
  }
  .seirmg-tarefas-popup-cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f0f2f4;
  }
  .seirmg-tarefas-popup-vazio {
    color: #adb3b8;
    font-style: italic;
  }
  .seirmg-tarefas-popup-item {
    background: #fbfcfd;
    border: 1px solid #f0f2f4;
    border-radius: 8px;
    padding: 7px 9px;
    margin-bottom: 6px;
  }
  .seirmg-tarefas-popup-item-titulo {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .seirmg-tarefas-popup-item-acoes {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .seirmg-tarefas-popup-item-acoes button {
    font-size: 10px;
    padding: 3px 7px;
    border-radius: 6px;
    border: none;
    background: #eaf4ff;
    color: var(--seirmg-accent-color, #017fff);
    cursor: pointer;
  }
  #seirmg-tarefas-popup-ajuda h2 {
    margin-top: 0;
    font-size: 13.5px;
  }
  #seirmg-tarefas-popup-ajuda h3 {
    font-size: 12px;
    margin: 10px 0 4px;
  }
  #seirmg-tarefas-popup-ajuda ul {
    padding-left: 16px;
    margin: 4px 0;
  }
  #seirmg-tarefas-popup-ajuda button {
    margin-top: 10px;
    padding: 5px 12px;
    border-radius: 6px;
    border: none;
    background: var(--seirmg-accent-color, #017fff);
    color: #fff;
    cursor: pointer;
  }
```

- [ ] **Step 7: Disparar a checagem de vencidas ao final do `bootstrap()`**

Trocar o final de `bootstrap()`:

```ts
    injetarEstilos()
    tarefasAtuais = config.tarefas.itens
    montarEsqueleto()
    renderizarPainel()
    atualizarBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de tarefas:', error)
  }
}
```

por:

```ts
    injetarEstilos()
    tarefasAtuais = config.tarefas.itens
    montarEsqueleto()
    renderizarPainel()
    atualizarBadge()

    const hoje = new Date()
    const vencidas = agruparPorUrgencia(tarefasAtuais, hoje).atrasadas.map((tarefa) => ({
      id: tarefa.id,
      titulo: tarefa.titulo,
    }))
    if (vencidas.length > 0) {
      chrome.runtime
        .sendMessage({ type: 'seirmg:tarefas-vencidas', tarefas: vencidas })
        .catch((error) => console.error('[SEIRMG] Falha ao notificar tarefas vencidas:', error))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel de tarefas:', error)
  }
}
```

- [ ] **Step 8: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 10: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 11: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/tarefas/index.ts
git commit -m "$(cat <<'EOF'
feat: popups, exportar/importar e notificação de vencidas

Histórico completo de concluídas (reabrir/excluir) e popup de ajuda.
Exportar baixa um .json (formato próprio do SEIRMG, não compatível
com .seinotas do plugin original -- decisão do usuário, vai começar
do zero); importar marca as tarefas trazidas como bloqueada (só
título/processo/vencimento travados). bootstrap() envia
seirmg:tarefas-vencidas pro background quando há atrasada.
EOF
)"
```

---

## Task 11: Opção na aba Geral (`options/index.html` + `options/main.ts`)

**Files:**
- Modify: `src/options/index.html` (seção `#painel-geral`)
- Modify: `src/options/main.ts` (`carregarAbaGeral`)

**Interfaces:**
- Consumes: `SyncConfig.tarefas.ativo` (Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, dentro de `#painel-geral`, trocar:

```html
      <label>
        Também considerar assinado por alguém deste(s) cargo(s), pras duas opções acima (separe por vírgula):
        <input type="text" id="geral-cargos-adicionais" placeholder="Diretor, Vice-Diretor" />
      </label>
      <br />
      <button id="geral-salvar">Salvar</button>
```

por:

```html
      <label>
        Também considerar assinado por alguém deste(s) cargo(s), pras duas opções acima (separe por vírgula):
        <input type="text" id="geral-cargos-adicionais" placeholder="Diretor, Vice-Diretor" />
      </label>
      <br />
      <label>
        <input type="checkbox" id="geral-tarefas-ativo" />
        Ativar Painel de Tarefas (checklist pessoal, disponível em qualquer tela do SEI)
      </label>
      <br />
      <button id="geral-salvar">Salvar</button>
```

- [ ] **Step 2: Ler/gravar o novo campo em `carregarAbaGeral` (`main.ts`)**

Trocar:

```ts
    const inputCargosAdicionais = document.getElementById(
      'geral-cargos-adicionais'
    ) as HTMLInputElement | null
    const status = document.getElementById('geral-status')
```

por:

```ts
    const inputCargosAdicionais = document.getElementById(
      'geral-cargos-adicionais'
    ) as HTMLInputElement | null
    const inputTarefasAtivo = document.getElementById('geral-tarefas-ativo') as HTMLInputElement | null
    const status = document.getElementById('geral-status')
```

Trocar:

```ts
    if (inputCargosAdicionais) {
      inputCargosAdicionais.value = (config.blocoAssinatura.cargosAdicionais ?? []).join(', ')
    }
```

por:

```ts
    if (inputCargosAdicionais) {
      inputCargosAdicionais.value = (config.blocoAssinatura.cargosAdicionais ?? []).join(', ')
    }
    if (inputTarefasAtivo) {
      inputTarefasAtivo.checked = config.tarefas.ativo
    }
```

E, na gravação ao salvar, trocar:

```ts
        const atualizado = {
          ...config,
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
            desabilitarDocumentosAssinados: inputDesabilitarAssinados?.checked ?? true,
            ocultarDocumentosAssinados: inputOcultarAssinados?.checked ?? false,
          },
          blocoAssinatura: {
            ...config.blocoAssinatura,
            cargosAdicionais,
          },
        }
```

por:

```ts
        const atualizado = {
          ...config,
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
            desabilitarDocumentosAssinados: inputDesabilitarAssinados?.checked ?? true,
            ocultarDocumentosAssinados: inputOcultarAssinados?.checked ?? false,
          },
          blocoAssinatura: {
            ...config.blocoAssinatura,
            cargosAdicionais,
          },
          tarefas: {
            ...config.tarefas,
            ativo: inputTarefasAtivo?.checked ?? false,
          },
        }
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/options/index.html src/options/main.ts
git commit -m "feat: opção pra ativar o Painel de Tarefas na aba Geral (opt-in)"
```

---

## Task 12: Verificação final + documentação

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `cd C:\sei\seirmg && npx vitest run`
Expected: todos os testes passam.

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 4: Build final**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 5: Adicionar entrada no ROADMAP-LOTES.md**

Em `docs/ROADMAP-LOTES.md`, na seção "Já entregue", logo depois da última entrada existente,
adicionar:

```
- **Painel de Tarefas — checklist pessoal em qualquer tela do SEI (port do plugin "SEI Notas")** —
  spec `docs/superpowers/specs/2026-07-17-seirmg-painel-tarefas-design.md`, plano
  `docs/superpowers/plans/2026-07-17-seirmg-painel-tarefas.md`. Port de `C:\sei\seinotas`
  ("SEI Notas" v4.5, extensão de terceiros encontrada pelo usuário), com visual redesenhado
  seguindo o padrão já estabelecido do SEIRMG (mockup aprovado: painel agrupado por urgência --
  atrasadas/hoje/próximas/sem prazo -- em vez da lista plana original, botão flutuante com badge de
  atrasadas, barra de ações com "+" central em destaque). **Opt-in, desligado por padrão**
  (`SyncConfig.tarefas.ativo`, aba Geral das Opções) -- a pedido explícito do usuário, não roda o
  tempo todo. Tarefas ficam em `controleProcessos`-like array (`tarefas.itens`) dentro do mesmo
  `SyncConfig` já existente, mesmo padrão já usado por `favoritos.itens` (sem storage novo).
  Notificação de tarefas vencidas reaproveita `chrome.notifications` (mesmo mecanismo do bloco de
  assinatura) com um pipeline espelhando `blocoAssinaturaPipeline.ts`, mas com regra de "1x por dia
  por tarefa" (`diffVencidas`, diferente do "1x pra sempre" do bloco de assinatura). **Desvio
  deliberado da spec original do plugin:** a checagem `Notification.permission` do código-fonte
  original (`C:\sei\seinotas\content.js`) misturava a API de notificação web com `chrome.notifications`
  da extensão -- removida, já que só a permissão de manifest (já concedida) é necessária. Exportar/
  importar usa um formato próprio do SEIRMG (JSON), não compatível com o `.seinotas` do plugin
  original (decisão do usuário, vai começar as tarefas do zero) -- mas manteve o conceito de tarefa
  "bloqueada" quando importada (título/processo/vencimento somente-leitura), preservando o caso de
  uso original de compartilhar tarefas entre usuários sem risco de sobrescrever os dados de origem
  por engano. ⚠️ **Pendente de validação manual** -- confirmar visualmente em telas variadas do SEI
  que o painel não conflita com nada nativo, e observar o badge/notificação de atrasadas ao longo de
  alguns dias de uso real.
```

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add docs/ROADMAP-LOTES.md
git commit -m "$(cat <<'EOF'
docs: registra Painel de Tarefas como entregue

Port do plugin "SEI Notas" (C:\sei\seinotas) com visual redesenhado
e opt-in via aba Geral, não ativo por padrão.
EOF
)"
```

- [ ] **Step 7: Verificação manual (⚠️ requer instância SEI real)**

Carregar `dist/` como extensão descompactada no Chrome, abrir uma instância SEI real, ativar
"Ativar Painel de Tarefas" nas Opções (aba Geral) e confirmar:

- O botão flutuante aparece em qualquer tela do SEI (não só Controle de Processos).
- Criar, editar, concluir, reabrir e excluir uma tarefa funciona e persiste após recarregar a página.
- Tarefas se agrupam corretamente em Atrasadas/Hoje/Próximas/Sem prazo.
- O badge do botão flutuante mostra a contagem de atrasadas.
- Arrastar o painel pelo ícone de mover funciona.
- Exportar baixa um `.json`; importar esse mesmo arquivo adiciona as tarefas de volta marcadas como
  bloqueada (campos principais travados, mas prioridade/concluir/excluir continuam funcionando).
- Com uma tarefa vencida, a notificação do Chrome aparece (checar não repetir no mesmo dia ao
  recarregar a página várias vezes).
- Desativar a opção na aba Geral remove o painel e o botão flutuante ao recarregar a página.
