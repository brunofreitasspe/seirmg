# SEIRMG — Dashboard (página própria, estatísticas e histórico de eventos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página própria do Dashboard (aberta em nova aba, nunca embutida em Opções) com 4 abas — Visão Geral (métricas + linha do tempo de eventos por período + export CSV/relatório), Favoritos, Prazos em alerta/crítico e Tarefas pendentes — alimentada pelos dados já existentes (favoritos, prazos, marcadores nativos, tarefas) mais um novo log de eventos opt-in.

**Architecture:** Um novo tipo `EventoHistorico` (`acesso`/`enviado`/`documento`/`assinatura`/`concluido`) persistido em `LocalConfig.historicoEventos`, separado do `historicoProcessosVisitados` existente (que não muda). A captura de cada tipo de evento é feita no ponto onde a ação já é observável (clique nos botões nativos correspondentes ou carregamento da página, conforme o caso), sempre condicionada a um novo toggle `SyncConfig.dashboard.ativo`. Toda a lógica de agregação (período, métricas, agrupamento por dia, CSV, relatório HTML) é pura e testável em `src/features/dashboard/`. A página em si (`src/dashboard/`) segue o mesmo padrão de `src/popup`/`src/options` — HTML + `main.ts` sem framework — e reaproveita CSS/estrutura do mockup aprovado (visual companion, 2026-08-03).

**Tech Stack:** TypeScript, Vitest + jsdom, `chrome.storage.sync`/`chrome.storage.local` (via `createSyncConfigStore`/`createLocalConfigStore`), `@crxjs/vite-plugin`, `lucide-static`.

## Global Constraints

- Nada do que já existe muda de comportamento: `historicoProcessosVisitados` (popup "Processos recentes"), o painel inline de Favoritos em `procedimento_controlar`, e todos os toggles atuais de Opções continuam exatamente como estão.
- Toda captura de evento nova é condicionada a `syncConfig.dashboard?.ativo` — desligado (default), nada é gravado.
- `LocalConfig.historicoEventos` é capado em 500 itens (`registrarEvento`), sem deduplicar por número — cada evento é um registro independente.
- "Tags" no Dashboard = marcador nativo do SEI (`marcadoresNomes`, já existente em `SnapshotFavorito`) — nenhum sistema de tag customizada novo.
- As abas Favoritos/Prazos/Tarefas do Dashboard são **somente leitura** (link "Abrir no SEI", sem edição).
- A página do Dashboard é aberta via `chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })` — nunca `chrome.runtime.openOptionsPage()`.
- Wiring em content scripts (extração de DOM, listeners de clique) segue o padrão já estabelecido no projeto: sem teste automatizado, verificado via `bun run typecheck`/`bun run test`/`bun run build` e depois validação manual numa instância SEI real — a mesma disciplina já documentada em `ROADMAP-LOTES.md` (várias correções após teste ao vivo).
- Pontos marcados **"a confirmar ao vivo"** neste plano são exatamente os mesmos já sinalizados na spec — não inventar seletor/comportamento além do que está escrito; se o teste ao vivo mostrar outra coisa, ajustar só aquele trecho, sem tocar no resto.

Spec completa: `docs/superpowers/specs/2026-08-03-seirmg-dashboard-design.md`

---

### Task 1: Tipos e defaults em `src/lib/storage.ts`

**Files:**
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: `TipoEventoHistorico`, `EventoHistorico`, `DashboardConfig` — usados por todas as tasks seguintes. `SyncConfig.dashboard: DashboardConfig`. `LocalConfig.historicoEventos: EventoHistorico[]`.

- [ ] **Step 1: Adicionar os tipos novos**

Em `src/lib/storage.ts`, logo depois da interface `HistoricoProcessosConfig` (linha 96-98), adicionar:

```ts
export type TipoEventoHistorico = 'acesso' | 'enviado' | 'documento' | 'assinatura' | 'concluido'

export interface EventoHistorico {
  tipo: TipoEventoHistorico
  numero: string
  tipoProcesso?: string
  especificacao?: string
  ocorridoEm: string // ISO
}

export interface DashboardConfig {
  ativo: boolean
}
```

- [ ] **Step 2: Adicionar os campos em `SyncConfig` e `LocalConfig`**

Em `SyncConfig` (linhas 189-203), adicionar `dashboard: DashboardConfig` depois de `historicoProcessos: HistoricoProcessosConfig`:

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
  referenciaLink: ReferenciaLinkConfig
  tarefas: TarefasConfig
  historicoProcessos: HistoricoProcessosConfig
  dashboard: DashboardConfig
}
```

Em `LocalConfig` (linhas 219-241), adicionar `historicoEventos: EventoHistorico[]` depois de `historicoProcessosVisitados: HistoricoProcessoEntry[]`:

```ts
  historicoProcessosVisitados: HistoricoProcessoEntry[]
  historicoEventos: EventoHistorico[]
```

- [ ] **Step 3: Adicionar os defaults**

Em `DEFAULT_SYNC_CONFIG` (linha 243-326), adicionar depois de `historicoProcessos: { ativo: false },`:

```ts
  dashboard: {
    ativo: false,
  },
```

Em `DEFAULT_LOCAL_CONFIG` (linha 328-336), adicionar depois de `historicoProcessosVisitados: [],`:

```ts
  historicoEventos: [],
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: sem erros (campos novos com default, nenhum código existente quebra).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: tipos e defaults do Dashboard (EventoHistorico, DashboardConfig)"
```

---

### Task 2: `src/features/dashboard/historicoEventos.ts`

**Files:**
- Create: `src/features/dashboard/historicoEventos.ts`
- Test: `src/features/dashboard/historicoEventos.test.ts`

**Interfaces:**
- Consumes: `EventoHistorico`, `TipoEventoHistorico` (Task 1, `../../lib/storage`).
- Produces: `registrarEvento`, `filtrarPorPeriodo`, `calcularMetricas`, `agruparPorDia` — usados pelas Tasks 10-14 (captura) e 16 (Visão Geral).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/dashboard/historicoEventos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { registrarEvento, filtrarPorPeriodo, calcularMetricas, agruparPorDia } from './historicoEventos'
import type { EventoHistorico } from '../../lib/storage'

const evento = (tipo: EventoHistorico['tipo'], numero: string, ocorridoEm: string): EventoHistorico => ({
  tipo,
  numero,
  ocorridoEm,
})

describe('registrarEvento', () => {
  it('acrescenta o novo evento no fim da lista', () => {
    const atual = [evento('acesso', '0001', '2026-08-01T10:00:00.000Z')]
    const novo = evento('enviado', '0002', '2026-08-02T10:00:00.000Z')
    expect(registrarEvento(atual, novo)).toEqual([...atual, novo])
  })

  it('não deduplica por número — mesmo processo pode aparecer várias vezes', () => {
    const atual = [evento('acesso', '0001', '2026-08-01T10:00:00.000Z')]
    const novo = evento('acesso', '0001', '2026-08-02T10:00:00.000Z')
    expect(registrarEvento(atual, novo)).toEqual([...atual, novo])
  })

  it('apara pelo limite, descartando os mais antigos', () => {
    const atual = [evento('acesso', '0001', '2026-08-01T10:00:00.000Z'), evento('acesso', '0002', '2026-08-01T11:00:00.000Z')]
    const novo = evento('acesso', '0003', '2026-08-01T12:00:00.000Z')
    const resultado = registrarEvento(atual, novo, 2)
    expect(resultado).toEqual([evento('acesso', '0002', '2026-08-01T11:00:00.000Z'), novo])
  })
})

describe('filtrarPorPeriodo', () => {
  const eventos = [
    evento('acesso', '0001', '2026-08-01T10:00:00.000Z'),
    evento('enviado', '0002', '2026-08-02T10:00:00.000Z'),
    evento('documento', '0003', '2026-08-03T10:00:00.000Z'),
  ]

  it('inclui eventos dentro do intervalo, com bordas inclusivas', () => {
    const inicio = new Date('2026-08-01T00:00:00.000Z')
    const fim = new Date('2026-08-02T23:59:59.999Z')
    expect(filtrarPorPeriodo(eventos, inicio, fim)).toEqual(eventos.slice(0, 2))
  })

  it('retorna lista vazia quando nada está no intervalo', () => {
    const inicio = new Date('2026-09-01T00:00:00.000Z')
    const fim = new Date('2026-09-30T23:59:59.999Z')
    expect(filtrarPorPeriodo(eventos, inicio, fim)).toEqual([])
  })
})

describe('calcularMetricas', () => {
  it('conta eventos por tipo, com zero pros tipos ausentes', () => {
    const eventos = [
      evento('acesso', '0001', '2026-08-01T10:00:00.000Z'),
      evento('acesso', '0002', '2026-08-01T11:00:00.000Z'),
      evento('enviado', '0003', '2026-08-01T12:00:00.000Z'),
    ]
    expect(calcularMetricas(eventos)).toEqual({ acesso: 2, enviado: 1, documento: 0, assinatura: 0, concluido: 0 })
  })

  it('retorna todos os tipos zerados pra lista vazia', () => {
    expect(calcularMetricas([])).toEqual({ acesso: 0, enviado: 0, documento: 0, assinatura: 0, concluido: 0 })
  })
})

describe('agruparPorDia', () => {
  it('agrupa por data (yyyy-mm-dd), preservando a ordem de chegada dentro do grupo', () => {
    const eventos = [
      evento('acesso', '0001', '2026-08-01T10:00:00.000Z'),
      evento('enviado', '0002', '2026-08-01T14:00:00.000Z'),
      evento('documento', '0003', '2026-08-02T09:00:00.000Z'),
    ]
    expect(agruparPorDia(eventos)).toEqual([
      { data: '2026-08-01', eventos: [eventos[0], eventos[1]] },
      { data: '2026-08-02', eventos: [eventos[2]] },
    ])
  })

  it('retorna lista vazia pra entrada vazia', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `src/features/dashboard/historicoEventos.ts` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/dashboard/historicoEventos.ts`:

```ts
import type { EventoHistorico, TipoEventoHistorico } from '../../lib/storage'

export function registrarEvento(
  eventosAtuais: EventoHistorico[],
  novo: EventoHistorico,
  limite = 500
): EventoHistorico[] {
  const proxima = [...eventosAtuais, novo]
  return proxima.length > limite ? proxima.slice(proxima.length - limite) : proxima
}

export function filtrarPorPeriodo(eventos: EventoHistorico[], inicio: Date, fim: Date): EventoHistorico[] {
  return eventos.filter((evento) => {
    const ocorridoEm = new Date(evento.ocorridoEm).getTime()
    return ocorridoEm >= inicio.getTime() && ocorridoEm <= fim.getTime()
  })
}

const TIPOS: TipoEventoHistorico[] = ['acesso', 'enviado', 'documento', 'assinatura', 'concluido']

export function calcularMetricas(eventos: EventoHistorico[]): Record<TipoEventoHistorico, number> {
  const metricas = { acesso: 0, enviado: 0, documento: 0, assinatura: 0, concluido: 0 } as Record<
    TipoEventoHistorico,
    number
  >
  eventos.forEach((evento) => {
    metricas[evento.tipo] += 1
  })
  return metricas
}

export function agruparPorDia(eventos: EventoHistorico[]): Array<{ data: string; eventos: EventoHistorico[] }> {
  const grupos: Array<{ data: string; eventos: EventoHistorico[] }> = []
  const indicePorData = new Map<string, number>()

  eventos.forEach((evento) => {
    const data = evento.ocorridoEm.slice(0, 10)
    const indice = indicePorData.get(data)
    if (indice === undefined) {
      indicePorData.set(data, grupos.length)
      grupos.push({ data, eventos: [evento] })
    } else {
      grupos[indice].eventos.push(evento)
    }
  })

  return grupos
}
```

(`TIPOS` fica declarado pra deixar explícito o conjunto fechado de chaves de `calcularMetricas` — não é usado fora deste arquivo.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/historicoEventos.ts src/features/dashboard/historicoEventos.test.ts
git commit -m "feat: helpers puros de agregação do histórico de eventos do Dashboard"
```

---

### Task 3: `src/features/dashboard/periodo.ts`

**Files:**
- Create: `src/features/dashboard/periodo.ts`
- Test: `src/features/dashboard/periodo.test.ts`

**Interfaces:**
- Produces: `Periodo`, `calcularIntervalo(periodo, agora): { inicio: Date; fim: Date; rotulo: string }` — usado pela Task 16.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/dashboard/periodo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calcularIntervalo } from './periodo'

const AGORA = new Date('2026-08-15T14:30:00.000Z')

describe('calcularIntervalo', () => {
  it('"hoje" cobre só o dia atual', () => {
    const { inicio, fim } = calcularIntervalo('hoje', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-08-15')
    expect(fim.toISOString().slice(0, 10)).toBe('2026-08-15')
    expect(inicio.getUTCHours()).toBe(0)
    expect(fim.getUTCHours()).toBe(23)
  })

  it('"7dias" cobre os últimos 7 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('7dias', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-08-09')
  })

  it('"30dias" cobre os últimos 30 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('30dias', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-07-17')
  })

  it('"90dias" cobre os últimos 90 dias incluindo hoje', () => {
    const { inicio } = calcularIntervalo('90dias', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-05-18')
  })

  it('"ano" cobre de 1º de janeiro a 31 de dezembro do ano de "agora"', () => {
    const { inicio, fim, rotulo } = calcularIntervalo('ano', AGORA)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(fim.toISOString().slice(0, 10)).toBe('2026-12-31')
    expect(rotulo).toContain('2026')
  })

  it('"ano" na virada do ano usa o ano de "agora", não o ano seguinte', () => {
    const reveillon = new Date('2026-12-31T23:00:00.000Z')
    const { inicio, fim } = calcularIntervalo('ano', reveillon)
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(fim.toISOString().slice(0, 10)).toBe('2026-12-31')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `src/features/dashboard/periodo.ts` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/dashboard/periodo.ts`:

```ts
export type Periodo = 'hoje' | '7dias' | '30dias' | '90dias' | 'ano'

export interface Intervalo {
  inicio: Date
  fim: Date
  rotulo: string
}

function inicioDoDia(data: Date): Date {
  const copia = new Date(data)
  copia.setUTCHours(0, 0, 0, 0)
  return copia
}

function fimDoDia(data: Date): Date {
  const copia = new Date(data)
  copia.setUTCHours(23, 59, 59, 999)
  return copia
}

function subtrairDias(data: Date, dias: number): Date {
  const copia = new Date(data)
  copia.setUTCDate(copia.getUTCDate() - dias)
  return copia
}

export function calcularIntervalo(periodo: Periodo, agora: Date): Intervalo {
  const fim = fimDoDia(agora)

  switch (periodo) {
    case 'hoje':
      return { inicio: inicioDoDia(agora), fim, rotulo: 'Hoje' }
    case '7dias':
      return { inicio: inicioDoDia(subtrairDias(agora, 6)), fim, rotulo: 'Últimos 7 dias' }
    case '30dias':
      return { inicio: inicioDoDia(subtrairDias(agora, 29)), fim, rotulo: 'Últimos 30 dias' }
    case '90dias':
      return { inicio: inicioDoDia(subtrairDias(agora, 89)), fim, rotulo: 'Últimos 90 dias' }
    case 'ano': {
      const ano = agora.getUTCFullYear()
      return {
        inicio: new Date(Date.UTC(ano, 0, 1, 0, 0, 0, 0)),
        fim: new Date(Date.UTC(ano, 11, 31, 23, 59, 59, 999)),
        rotulo: `Ano ${ano}`,
      }
    }
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/periodo.ts src/features/dashboard/periodo.test.ts
git commit -m "feat: calcularIntervalo pros filtros de período do Dashboard"
```

---

### Task 4: `src/features/dashboard/relatorio.ts`

**Files:**
- Create: `src/features/dashboard/relatorio.ts`
- Test: `src/features/dashboard/relatorio.test.ts`

**Interfaces:**
- Consumes: `EventoHistorico` (Task 1, `../../lib/storage`); `montarLinhaCsv` (já existe, `../controle-processos/favoritosExportar`); `Intervalo` (Task 3, `./periodo`).
- Produces: `montarCsvHistorico`, `montarHtmlRelatorio` — usados pela Task 16.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/dashboard/relatorio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarCsvHistorico, montarHtmlRelatorio } from './relatorio'
import type { EventoHistorico } from '../../lib/storage'

describe('montarCsvHistorico', () => {
  it('gera cabeçalho e uma linha por evento', () => {
    const eventos: EventoHistorico[] = [
      { tipo: 'acesso', numero: '0001/2026', tipoProcesso: 'Ofício', especificacao: 'Teste', ocorridoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const csv = montarCsvHistorico(eventos)
    const linhas = csv.split('\r\n')
    expect(linhas[0]).toBe('Processo;Tipo de Evento;Tipo do Processo;Especificação;Data;Hora')
    expect(linhas[1]).toContain('0001/2026')
    expect(linhas[1]).toContain('acesso')
  })

  it('escapa campos com ponto e vírgula usando a mesma lógica de favoritosExportar', () => {
    const eventos: EventoHistorico[] = [
      { tipo: 'documento', numero: '0002/2026', especificacao: 'Nota; Fiscal', ocorridoEm: '2026-08-01T10:00:00.000Z' },
    ]
    expect(montarCsvHistorico(eventos)).toContain('"Nota; Fiscal"')
  })

  it('lista vazia gera só o cabeçalho', () => {
    expect(montarCsvHistorico([]).split('\r\n')).toEqual(['Processo;Tipo de Evento;Tipo do Processo;Especificação;Data;Hora'])
  })
})

describe('montarHtmlRelatorio', () => {
  const intervalo = { inicio: new Date('2026-08-01T00:00:00.000Z'), fim: new Date('2026-08-31T23:59:59.999Z'), rotulo: 'Agosto 2026' }

  it('inclui o rótulo do período e a contagem total de eventos', () => {
    const eventos: EventoHistorico[] = [
      { tipo: 'acesso', numero: '0001/2026', ocorridoEm: '2026-08-05T10:00:00.000Z' },
      { tipo: 'enviado', numero: '0002/2026', ocorridoEm: '2026-08-06T10:00:00.000Z' },
    ]
    const html = montarHtmlRelatorio(eventos, intervalo)
    expect(html).toContain('Agosto 2026')
    expect(html).toContain('0001/2026')
    expect(html).toContain('0002/2026')
  })

  it('período sem eventos não quebra e mostra mensagem de vazio', () => {
    const html = montarHtmlRelatorio([], intervalo)
    expect(html).toContain('Nenhum evento')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `src/features/dashboard/relatorio.ts` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/dashboard/relatorio.ts`:

```ts
import { montarLinhaCsv } from '../controle-processos/favoritosExportar'
import type { EventoHistorico } from '../../lib/storage'
import type { Intervalo } from './periodo'

const CABECALHO_CSV = ['Processo', 'Tipo de Evento', 'Tipo do Processo', 'Especificação', 'Data', 'Hora']

function dataHoraLocal(iso: string): { data: string; hora: string } {
  const dataObj = new Date(iso)
  return {
    data: dataObj.toLocaleDateString('pt-BR'),
    hora: dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

export function montarCsvHistorico(eventos: EventoHistorico[]): string {
  const linhas = [montarLinhaCsv(CABECALHO_CSV)]
  eventos.forEach((evento) => {
    const { data, hora } = dataHoraLocal(evento.ocorridoEm)
    linhas.push(
      montarLinhaCsv([evento.numero, evento.tipo, evento.tipoProcesso ?? '', evento.especificacao ?? '', data, hora])
    )
  })
  return linhas.join('\r\n')
}

function escaparHtml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function montarHtmlRelatorio(eventos: EventoHistorico[], intervalo: Intervalo): string {
  const linhas = eventos
    .map((evento) => {
      const { data, hora } = dataHoraLocal(evento.ocorridoEm)
      return `<tr><td>${escaparHtml(evento.numero)}</td><td>${escaparHtml(evento.tipo)}</td><td>${escaparHtml(evento.tipoProcesso ?? '—')}</td><td>${escaparHtml(evento.especificacao ?? '—')}</td><td>${data}</td><td>${hora}</td></tr>`
    })
    .join('')

  const corpo =
    eventos.length > 0
      ? linhas
      : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Nenhum evento encontrado para o período selecionado.</td></tr>'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório SEIRMG — ${escaparHtml(intervalo.rotulo)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1d23; }
  h1 { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #e2e5ea; text-align: left; font-size: 13px; }
  th { background: #f5f6f8; }
</style>
</head>
<body>
  <h1>Relatório de Atividade — ${escaparHtml(intervalo.rotulo)}</h1>
  <p>${eventos.length} evento(s) no período.</p>
  <table>
    <thead><tr><th>Processo</th><th>Evento</th><th>Tipo do Processo</th><th>Especificação</th><th>Data</th><th>Hora</th></tr></thead>
    <tbody>${corpo}</tbody>
  </table>
</body>
</html>`
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/relatorio.ts src/features/dashboard/relatorio.test.ts
git commit -m "feat: exportação CSV e relatório HTML do histórico de eventos"
```

---

### Task 5: `src/features/dashboard/concluirProcesso.ts`

**Files:**
- Create: `src/features/dashboard/concluirProcesso.ts`
- Test: `src/features/dashboard/concluirProcesso.test.ts`

**Interfaces:**
- Produces: `ehLinkConcluirIndividual(onclick)`, `ehLinkConcluirEmLote(onclick)` — usadas pela Task 14.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/dashboard/concluirProcesso.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ehLinkConcluirIndividual, ehLinkConcluirEmLote } from './concluirProcesso'

describe('ehLinkConcluirIndividual', () => {
  it('reconhece o onclick de "Concluir Processo" individual', () => {
    expect(ehLinkConcluirIndividual('concluirProcesso();')).toBe(true)
  })

  it('ignora onclick de outras ações', () => {
    expect(ehLinkConcluirIndividual("enviarProcesso();")).toBe(false)
  })

  it('trata null/undefined como não-match', () => {
    expect(ehLinkConcluirIndividual(null)).toBe(false)
  })
})

describe('ehLinkConcluirEmLote', () => {
  it('reconhece o onclick de "Concluir Processo nesta Unidade" em lote', () => {
    const onclick =
      "if (confirm('Deseja mesmo concluir os processos selecionados?')) { return acaoControleProcessos('controlador.php?acao=procedimento_concluir&acao_origem=procedimento_controlar&acao_retorno=procedimento_controlar&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abc', true, true); }"
    expect(ehLinkConcluirEmLote(onclick)).toBe(true)
  })

  it('ignora onclick de outras ações em lote', () => {
    expect(ehLinkConcluirEmLote("acaoControleProcessos('controlador.php?acao=procedimento_enviar', true, true)")).toBe(false)
  })

  it('trata null/undefined como não-match', () => {
    expect(ehLinkConcluirEmLote(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `src/features/dashboard/concluirProcesso.ts` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/dashboard/concluirProcesso.ts`:

```ts
export function ehLinkConcluirIndividual(onclick: string | null | undefined): boolean {
  return !!onclick && /concluirProcesso\s*\(/.test(onclick)
}

export function ehLinkConcluirEmLote(onclick: string | null | undefined): boolean {
  return !!onclick && onclick.includes('acao=procedimento_concluir')
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/concluirProcesso.ts src/features/dashboard/concluirProcesso.test.ts
git commit -m "feat: reconhecimento dos links de Concluir Processo (individual e em lote)"
```

---

### Task 6: Extrair `obterNumeroProcesso` + novo `extrairNumeroProcessoDaBarra`

**Files:**
- Create: `src/features/procedimento-visualizar/numeroProcesso.ts`
- Test: `src/features/procedimento-visualizar/numeroProcesso.test.ts`
- Modify: `src/content-scripts/procedimento_visualizar/index.ts:103-111`

**Interfaces:**
- Produces: `obterNumeroProcesso(doc: Document): string | null`, `extrairNumeroProcessoDaBarra(doc: Document): string | null` — usadas pelas Tasks 10, 11, 12, 13, 14.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/procedimento-visualizar/numeroProcesso.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { obterNumeroProcesso, extrairNumeroProcessoDaBarra } from './numeroProcesso'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('obterNumeroProcesso', () => {
  it('lê o nó selecionado da árvore quando presente', () => {
    const doc = montarDocumento('<span class="infraArvoreNoSelecionado">0001234-56.2026</span>')
    expect(obterNumeroProcesso(doc)).toBe('0001234-56.2026')
  })

  it('cai pro link de visualização quando não há nó selecionado', () => {
    const doc = montarDocumento(
      '<div class="infraArvore"><a target="ifrVisualizacao">0009876-54.2026</a></div>'
    )
    expect(obterNumeroProcesso(doc)).toBe('0009876-54.2026')
  })

  it('retorna null quando nenhum dos dois existe', () => {
    expect(obterNumeroProcesso(montarDocumento('<div></div>'))).toBeNull()
  })
})

describe('extrairNumeroProcessoDaBarra', () => {
  it('extrai o número de #divInfraBarraLocalizacao', () => {
    const doc = montarDocumento('<div id="divInfraBarraLocalizacao">GAB/2026 0001234-56.2026</div>')
    expect(extrairNumeroProcessoDaBarra(doc)).toBe('0001234-56.2026')
  })

  it('cai pro corpo inteiro da página quando a barra não existe', () => {
    const doc = montarDocumento('<body>Registrar recebimento — processo 0009876-54.2026</body>')
    expect(extrairNumeroProcessoDaBarra(doc)).toBe('0009876-54.2026')
  })

  it('retorna null quando nenhum padrão de número é encontrado', () => {
    expect(extrairNumeroProcessoDaBarra(montarDocumento('<div>sem número aqui</div>'))).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `src/features/procedimento-visualizar/numeroProcesso.ts` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/procedimento-visualizar/numeroProcesso.ts`:

```ts
const REGEX_NUMERO_PROCESSO = /\d{4,}-\d{2}\.\d{4}|\d{4,}\/\d{5,}-\d{2}/

export function obterNumeroProcesso(doc: Document): string | null {
  const noSelecionado = doc.querySelector('.infraArvoreNoSelecionado')
  const numeroNoSelecionado = noSelecionado?.textContent?.trim()
  if (numeroNoSelecionado) return numeroNoSelecionado

  const link = doc.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
  if (!link) return null
  return link.textContent?.trim() || null
}

export function extrairNumeroProcessoDaBarra(doc: Document): string | null {
  const barra = doc.getElementById('divInfraBarraLocalizacao')
  const textoBarra = barra?.textContent?.match(REGEX_NUMERO_PROCESSO)?.[0]
  if (textoBarra) return textoBarra

  return doc.body?.textContent?.match(REGEX_NUMERO_PROCESSO)?.[0] ?? null
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Atualizar `procedimento_visualizar/index.ts` pra usar a versão compartilhada**

Substituir (linhas 103-111):

```ts
function obterNumeroProcesso(): string | null {
  const noSelecionado = document.querySelector('.infraArvoreNoSelecionado')
  const numeroNoSelecionado = noSelecionado?.textContent?.trim()
  if (numeroNoSelecionado) return numeroNoSelecionado

  const link = document.querySelector('.infraArvore > a[target="ifrVisualizacao"]')
  if (!link) return null
  return link.textContent?.trim() || null
}
```

por (removendo a função local e chamando a versão importada com `document`):

```ts
```

Ou seja: apagar essas 8 linhas. No topo do arquivo, adicionar o import (junto aos outros de `features/procedimento-visualizar/`):

```ts
import { obterNumeroProcesso } from '../../features/procedimento-visualizar/numeroProcesso'
```

E em `montarPainelTipoEInteressados` (linha 535), trocar a chamada:

```ts
  const numero = obterNumeroProcesso()
```

por:

```ts
  const numero = obterNumeroProcesso(document)
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 7: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/procedimento-visualizar/numeroProcesso.ts src/features/procedimento-visualizar/numeroProcesso.test.ts src/content-scripts/procedimento_visualizar/index.ts
git commit -m "refactor: extrai obterNumeroProcesso pra módulo compartilhado, adiciona extrairNumeroProcessoDaBarra"
```

---

### Task 7: Extrair `favoritosRender.ts` de `procedimento_controlar/index.ts`

**Files:**
- Create: `src/features/controle-processos/favoritosRender.ts`
- Test: `src/features/controle-processos/favoritosRender.test.ts`
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `calcularDiasAteVencimento`, `formatarDiasRestantes` (já existem, `./prazos`).
- Produces: `criarIcone`, `montarCelulaMarcadoresCongelados`, `montarCelulaPrazoCongelado`, `montarCelulaAtribuicao` — usadas pela Task 17 (Favoritos do Dashboard) e continuam sendo usadas por `procedimento_controlar/index.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/controle-processos/favoritosRender.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
} from './favoritosRender'

describe('montarCelulaMarcadoresCongelados', () => {
  it('mostra "—" quando não há marcadores', () => {
    const td = montarCelulaMarcadoresCongelados([])
    expect(td.textContent).toBe('—')
    expect(td.className).toBe('seirmg-favoritos-vazio')
  })

  it('monta um pill por nome de marcador', () => {
    const td = montarCelulaMarcadoresCongelados(['Urgente', 'Prioridade'])
    expect(td.querySelectorAll('.seirmg-favoritos-marcador')).toHaveLength(2)
    expect(td.textContent).toContain('Urgente')
    expect(td.textContent).toContain('Prioridade')
  })
})

describe('montarCelulaPrazoCongelado', () => {
  it('mostra "—" quando não há data de prazo', () => {
    const td = montarCelulaPrazoCongelado(null)
    expect(td.textContent).toBe('—')
  })

  it('mostra a data e os dias restantes formatados', () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const dataTexto = `${String(amanha.getDate()).padStart(2, '0')}/${String(amanha.getMonth() + 1).padStart(2, '0')}/${amanha.getFullYear()}`
    const td = montarCelulaPrazoCongelado(dataTexto)
    expect(td.textContent).toContain(dataTexto)
  })
})

describe('montarCelulaAtribuicao', () => {
  it('mostra "—" quando não há atribuição', () => {
    const td = montarCelulaAtribuicao(null)
    expect(td.textContent).toBe('—')
  })

  it('mostra o nome do atribuído', () => {
    const td = montarCelulaAtribuicao('joao.silva')
    expect(td.textContent).toContain('joao.silva')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `src/features/controle-processos/favoritosRender.ts` não existe.

- [ ] **Step 3: Implementar**

Criar `src/features/controle-processos/favoritosRender.ts`:

```ts
import { calcularDiasAteVencimento, formatarDiasRestantes } from './prazos'
import flagIconSvg from 'lucide-static/icons/flag.svg?raw'
import clockIconSvg from 'lucide-static/icons/clock.svg?raw'
import userIconSvg from 'lucide-static/icons/user.svg?raw'

export function criarIcone(svg: string): HTMLElement {
  const icone = document.createElement('span')
  icone.className = 'seirmg-favoritos-icone'
  icone.innerHTML = svg
  return icone
}

export function montarCelulaMarcadoresCongelados(nomes: string[]): HTMLTableCellElement {
  const td = document.createElement('td')
  if (nomes.length === 0) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  nomes.forEach((nome) => {
    const pill = document.createElement('span')
    pill.className = 'seirmg-favoritos-marcador'
    pill.appendChild(criarIcone(flagIconSvg))
    pill.appendChild(document.createTextNode(nome))
    td.appendChild(pill)
  })
  return td
}

export function montarCelulaPrazoCongelado(prazoDataTexto: string | null): HTMLTableCellElement {
  const td = document.createElement('td')
  if (!prazoDataTexto) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }

  const linhaData = document.createElement('div')
  linhaData.className = 'seirmg-favoritos-prazo'
  linhaData.appendChild(criarIcone(clockIconSvg))
  linhaData.appendChild(document.createTextNode(prazoDataTexto))
  td.appendChild(linhaData)

  const dias = calcularDiasAteVencimento(prazoDataTexto, new Date())
  const linhaDias = document.createElement('div')
  linhaDias.className = 'seirmg-favoritos-prazo-data'
  linhaDias.textContent = dias === null ? '' : formatarDiasRestantes(dias)
  td.appendChild(linhaDias)

  return td
}

export function montarCelulaAtribuicao(atribuicao: string | null): HTMLTableCellElement {
  const td = document.createElement('td')
  if (!atribuicao) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  td.appendChild(criarIcone(userIconSvg))
  td.appendChild(document.createTextNode(atribuicao))
  return td
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Remover as definições locais de `procedimento_controlar/index.ts` e importar do módulo novo**

Remover as 4 funções (linhas 1001-1006, 1060-1075, 1077-1098, 1100-1110 — `criarIcone`, `montarCelulaMarcadoresCongelados`, `montarCelulaPrazoCongelado`, `montarCelulaAtribuicao`) inteiras do arquivo.

Remover a linha 89 (`import clockIconSvg from 'lucide-static/icons/clock.svg?raw'` — deixa de ser usado neste arquivo; `flagIconSvg` e `userIconSvg`, linhas 87-88, continuam porque `montarCelulaMarcadores` — que não foi movida, ainda lê DOM ao vivo — e outro ponto do arquivo, linha 2273, ainda usam `userIconSvg`).

Remover `formatarDiasRestantes` do import de `../../features/controle-processos/prazos` (linhas 1-6):

```ts
import {
  calcularDiasAteVencimento,
  classificarPrazo,
  extrairTextoMarcador,
} from '../../features/controle-processos/prazos'
```

Adicionar um novo import, logo depois do bloco acima:

```ts
import {
  criarIcone,
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
} from '../../features/controle-processos/favoritosRender'
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: sem erros (nenhuma referência às 4 funções/ícone removido sobra fora do que foi importado de volta).

- [ ] **Step 7: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 8: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 9: Commit**

```bash
git add src/features/controle-processos/favoritosRender.ts src/features/controle-processos/favoritosRender.test.ts src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor: extrai renderização de favoritos congelados pra módulo compartilhado com o Dashboard"
```

- [ ] **Step 10: Validação manual numa instância SEI real**

Carregar a extensão atualizada e conferir que o painel "★ Favoritos" em Controle de Processos continua exatamente igual (processos abertos e fechados, marcadores/prazo/atribuição) — este é um refactor puro, nenhum comportamento deveria mudar.

---

### Task 8: Checkbox "Ativar Dashboard" em Opções (aba Geral)

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `SyncConfig.dashboard.ativo` (Task 1).

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, dentro de `<section id="painel-geral">`, logo depois do bloco do "Painel de Tarefas" (depois de `Ativar Painel de Tarefas (checklist pessoal, disponível em qualquer tela do SEI)` e antes do `<br />` que precede o botão salvar):

```html
      <label>
        <input type="checkbox" id="geral-dashboard-ativo" />
        Ativar Dashboard (estatísticas e histórico de eventos, acessível pelo popup da extensão)
      </label>
```

- [ ] **Step 2: Ler/gravar o campo em `carregarAbaGeral`**

Em `src/options/main.ts`, dentro de `carregarAbaGeral` (linha 124), adicionar a declaração do input junto às outras (depois de `inputTarefasAtivo`, linha 141):

```ts
    const inputDashboardAtivo = document.getElementById('geral-dashboard-ativo') as HTMLInputElement | null
```

Adicionar a leitura do valor atual (depois de `if (inputTarefasAtivo) { inputTarefasAtivo.checked = config.tarefas.ativo }`, linha 156-158):

```ts
    if (inputDashboardAtivo) {
      inputDashboardAtivo.checked = config.dashboard.ativo
    }
```

Dentro do listener de `geral-salvar` (linha 160), adicionar `dashboard` ao objeto `atualizado` (depois de `tarefas: { ...config.tarefas, ativo: inputTarefasAtivo?.checked ?? false }`, linha 179-182):

```ts
          dashboard: {
            ativo: inputDashboardAtivo?.checked ?? false,
          },
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat: checkbox Ativar Dashboard na aba Geral de Opções"
```

- [ ] **Step 6: Validação manual**

Abrir a página de Opções (`bun run build` + recarregar em `chrome://extensions` + clicar em "Detalhes" > "Opções da extensão"), marcar o checkbox, clicar em Salvar, recarregar a página e confirmar que o checkbox continua marcado.

---

### Task 9: Botão "Abrir Dashboard" no popup (condicional)

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/main.ts`

**Interfaces:**
- Consumes: `createSyncConfigStore` (já existe, `../lib/storage`), `SyncConfig.dashboard.ativo` (Task 1).

- [ ] **Step 1: Adicionar o botão no HTML**

Em `src/popup/index.html`, inserir logo **antes** de `<div id="status" class="status">`:

```html
    <button id="abrir-dashboard" class="btn-abrir-dashboard" type="button" style="display: none">
      <span id="icone-dashboard"></span>
      <span>Abrir Dashboard</span>
    </button>
```

Adicionar o estilo do botão (mesmo grupo de `#abrir-opcoes`, reaproveitando as mesmas variáveis de cor):

```css
      .btn-abrir-dashboard { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 9px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer; }
      .btn-abrir-dashboard:hover { filter: brightness(1.08); }
      .btn-abrir-dashboard svg { width: 14px; height: 14px; flex-shrink: 0; }
```

- [ ] **Step 2: Mostrar o botão condicionalmente e ligar o clique**

Em `src/popup/main.ts`, importar `createSyncConfigStore` e um ícone (junto aos outros imports de ícone, topo do arquivo):

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import layoutDashboardIconSvg from 'lucide-static/icons/layout-dashboard.svg?raw'
```

Dentro de `render()`, logo depois de `const localConfig = await createLocalConfigStore().get()` (linha 87):

```ts
    const syncConfig = await createSyncConfigStore().get()
    const botaoDashboard = document.getElementById('abrir-dashboard') as HTMLButtonElement | null
    if (botaoDashboard && syncConfig.dashboard.ativo) {
      botaoDashboard.style.display = ''
      const iconeDashboard = document.getElementById('icone-dashboard')
      if (iconeDashboard) iconeDashboard.innerHTML = layoutDashboardIconSvg
      botaoDashboard.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
      })
    }
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro (a referência a `src/dashboard/index.html` só existirá de fato depois da Task 15 — até lá o link fica quebrado, o que é esperado nesta altura do plano).

- [ ] **Step 5: Commit**

```bash
git add src/popup/index.html src/popup/main.ts
git commit -m "feat: botão condicional Abrir Dashboard no popup"
```

---

### Task 10: Evento `acesso` — `procedimento_visualizar/index.ts`

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`

**Interfaces:**
- Consumes: `registrarEvento` (Task 2, `../../features/dashboard/historicoEventos`); `EventoHistorico` (Task 1, `../../lib/storage`).

- [ ] **Step 1: Adicionar a função de captura**

No topo do arquivo, adicionar o import:

```ts
import { registrarEvento } from '../../features/dashboard/historicoEventos'
import type { EventoHistorico } from '../../lib/storage'
```

Adicionar, logo depois de `registrarHistoricoVisita` (que termina na linha 134, antes de `alterarTitulo`):

```ts
async function registrarEventoAcesso(numero: string | null, tipoProcesso: string, especificacao: string): Promise<void> {
  if (!numero) return

  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.dashboard?.ativo) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: EventoHistorico = {
    tipo: 'acesso',
    numero,
    tipoProcesso,
    especificacao,
    ocorridoEm: new Date().toISOString(),
  }
  const historicoEventos = registrarEvento(localConfig.historicoEventos ?? [], novo)
  await localStore.set({ ...localConfig, historicoEventos })
}
```

- [ ] **Step 2: Chamar a nova função no mesmo ponto de `registrarHistoricoVisita`**

Em `montarPainelTipoEInteressados`, capturar a especificação numa variável antes de usá-la (linha 564 já chama `extrairEspecificacao(doc)` inline — passa a ficar numa variável):

Substituir:

```ts
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', extrairEspecificacao(doc), 'Sem especificação.', fileTextIconSvg)
```

por:

```ts
  const especificacao = extrairEspecificacao(doc)
  renderizarTextoSimples(container, 'Especificação', 'seirmg-especificacao', especificacao, 'Sem especificação.', fileTextIconSvg)
```

E logo depois da chamada existente (linhas 559-561):

```ts
  registrarHistoricoVisita(numero, tipo).catch((error) => {
    console.error('[SEIRMG] Falha ao registrar processo no histórico:', error)
  })
```

adicionar:

```ts
  registrarEventoAcesso(numero, tipo, especificacao).catch((error) => {
    console.error('[SEIRMG] Falha ao registrar evento de acesso no Dashboard:', error)
  })
```

(Mover essa chamada pra depois da nova declaração de `especificacao`, já que ela agora depende dessa variável — ou seja, a ordem final é: extrair `especificacao`, renderizar o texto simples, registrar histórico de visita, registrar evento de acesso.)

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat: captura evento 'acesso' pro Dashboard (opt-in via dashboard.ativo)"
```

- [ ] **Step 6: Validação manual numa instância SEI real**

Com `dashboard.ativo` desligado (default): abrir um processo, confirmar (via `chrome.storage.local.get('localConfig')` no DevTools da extensão) que `historicoEventos` continua vazio. Ativar o Dashboard em Opções, abrir outro processo, confirmar que um evento `acesso` foi gravado com número/tipo/especificação corretos, e que `historicoProcessosVisitados` (usado no popup) não mudou de comportamento.

---

### Task 11: Evento `enviado` — `procedimento_enviar/index.ts`

**Files:**
- Modify: `src/content-scripts/procedimento_enviar/index.ts`

**Interfaces:**
- Consumes: `registrarEvento` (Task 2); `obterNumeroProcesso` (Task 6, `../../features/procedimento-visualizar/numeroProcesso`); `EventoHistorico` (Task 1).

- [ ] **Step 1: Adicionar a captura, independente do gate de `alertaNaoAssinados`**

No topo do arquivo, adicionar os imports:

```ts
import { registrarEvento } from '../../features/dashboard/historicoEventos'
import { obterNumeroProcesso } from '../../features/procedimento-visualizar/numeroProcesso'
import type { EventoHistorico } from '../../lib/storage'
```

Adicionar, logo antes de `async function bootstrap` (linha 63):

```ts
async function registrarEventoEnviado(): Promise<void> {
  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.dashboard?.ativo) return

  const numero = obterNumeroProcesso(document)
  if (!numero) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: EventoHistorico = { tipo: 'enviado', numero, ocorridoEm: new Date().toISOString() }
  const historicoEventos = registrarEvento(localConfig.historicoEventos ?? [], novo)
  await localStore.set({ ...localConfig, historicoEventos })
}

function instalarCapturaEventoEnviado(): void {
  document.addEventListener('click', (evento) => {
    const alvo = evento.target instanceof Element ? evento.target.closest('#sbmEnviar') : null
    if (!alvo) return
    registrarEventoEnviado().catch((error) => {
      console.error('[SEIRMG] Falha ao registrar evento de envio no Dashboard:', error)
    })
  })
}
```

Precisa de `createLocalConfigStore` no import existente de `../../lib/storage` (linha 5):

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
```

- [ ] **Step 2: Chamar a instalação do listener independentemente do early-return de `bootstrap`**

No final do arquivo, substituir:

```ts
bootstrap()
```

por:

```ts
bootstrap()
instalarCapturaEventoEnviado()
```

(`bootstrap()` continua com seu próprio `if (!syncConfig.controleProcessos.alertaNaoAssinados.ativo) return` intocado — a captura do evento roda em paralelo, sem depender desse gate, porque o botão de enviar existe independente do alerta de documentos não assinados estar ativo.)

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_enviar/index.ts
git commit -m "feat: captura evento 'enviado' pro Dashboard (opt-in via dashboard.ativo)"
```

- [ ] **Step 6: Validação manual numa instância SEI real (a confirmar ao vivo)**

Com Dashboard ativado: abrir um processo, ir até "Enviar Processo", escolher a unidade de destino e clicar no botão final de confirmação. Confirmar no `chrome.storage.local` que um evento `enviado` foi gravado com o número correto. **Se o seletor `#sbmEnviar` não corresponder ao botão real** (a tela é injetada via AJAX, mesmo cenário já documentado em `ROADMAP-LOTES.md` pro Lote Q), inspecionar o HTML real da tela nesse momento e corrigir só o seletor usado em `instalarCapturaEventoEnviado`, sem mudar o resto da lógica.

---

### Task 12: Evento `documento` — `documento_receber/index.ts`

**Files:**
- Modify: `src/content-scripts/documento_receber/index.ts`

**Interfaces:**
- Consumes: `registrarEvento` (Task 2); `extrairNumeroProcessoDaBarra` (Task 6); `EventoHistorico` (Task 1).

- [ ] **Step 1: Adicionar a captura no clique dos botões de salvar já referenciados neste arquivo**

No topo do arquivo, adicionar os imports:

```ts
import { registrarEvento } from '../../features/dashboard/historicoEventos'
import { extrairNumeroProcessoDaBarra } from '../../features/procedimento-visualizar/numeroProcesso'
import type { EventoHistorico } from '../../lib/storage'
```

Ajustar o import existente de `../../lib/storage` (linha 7) pra incluir `createLocalConfigStore`:

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
```

Adicionar, logo antes de `async function bootstrap` (linha 69):

```ts
async function registrarEventoDocumento(): Promise<void> {
  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.dashboard?.ativo) return

  const numero = extrairNumeroProcessoDaBarra(document)
  if (!numero) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: EventoHistorico = { tipo: 'documento', numero, ocorridoEm: new Date().toISOString() }
  const historicoEventos = registrarEvento(localConfig.historicoEventos ?? [], novo)
  await localStore.set({ ...localConfig, historicoEventos })
}

function instalarCapturaEventoDocumento(): void {
  document.addEventListener('click', (evento) => {
    const alvo =
      evento.target instanceof Element
        ? evento.target.closest('#divInfraBarraComandosSuperior #btnSalvar, #divInfraBarraComandosInferior #btnSalvar')
        : null
    if (!alvo) return
    registrarEventoDocumento().catch((error) => {
      console.error('[SEIRMG] Falha ao registrar evento de documento no Dashboard:', error)
    })
  })
}
```

- [ ] **Step 2: Instalar o listener no final do arquivo**

Substituir:

```ts
bootstrap()
```

por:

```ts
bootstrap()
instalarCapturaEventoDocumento()
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/documento_receber/index.ts
git commit -m "feat: captura evento 'documento' pro Dashboard (opt-in via dashboard.ativo)"
```

- [ ] **Step 6: Validação manual numa instância SEI real (a confirmar ao vivo)**

Com Dashboard ativado: receber um documento externo e clicar em Salvar. Confirmar que o evento `documento` foi gravado com o número correto — **`extrairNumeroProcessoDaBarra` é best-effort** (tenta `#divInfraBarraLocalizacao`, cai pro texto da página inteira); se a tela de `documento_receber` não expuser o número em nenhum dos dois lugares, esse é o ponto a ajustar (sem mudar o resto do arquivo).

---

### Task 13: Evento `assinatura` — novo content script `documento_assinar/index.ts`

**Files:**
- Create: `src/content-scripts/documento_assinar/index.ts`
- Modify: `manifest.config.ts`

**Interfaces:**
- Consumes: `registrarEvento` (Task 2); `extrairNumeroProcessoDaBarra` (Task 6); `EventoHistorico` (Task 1).

- [ ] **Step 1: Criar o content script**

Criar `src/content-scripts/documento_assinar/index.ts`:

```ts
import { registrarEvento } from '../../features/dashboard/historicoEventos'
import { extrairNumeroProcessoDaBarra } from '../../features/procedimento-visualizar/numeroProcesso'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { EventoHistorico } from '../../lib/storage'

async function registrarEventoAssinatura(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.dashboard?.ativo) return

    const numero = extrairNumeroProcessoDaBarra(document)
    if (!numero) return

    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    const novo: EventoHistorico = { tipo: 'assinatura', numero, ocorridoEm: new Date().toISOString() }
    const historicoEventos = registrarEvento(localConfig.historicoEventos ?? [], novo)
    await localStore.set({ ...localConfig, historicoEventos })
  } catch (error) {
    console.error('[SEIRMG] Falha ao registrar evento de assinatura no Dashboard:', error)
  }
}

registrarEventoAssinatura()
```

- [ ] **Step 2: Registrar o content script novo no manifest**

Em `manifest.config.ts`, adicionar uma nova entrada em `content_scripts` (depois da entrada de `editor_montar`, antes de `procedimento_visualizar`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=documento_assinar*',
        '*://*.org/*controlador.php?acao=documento_assinar*',
      ],
      js: ['src/content-scripts/documento_assinar/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro, `manifest.json` gerado inclui a nova entrada de content script.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/documento_assinar/index.ts manifest.config.ts
git commit -m "feat: captura evento 'assinatura' pro Dashboard (novo content script em acao=documento_assinar)"
```

- [ ] **Step 6: Validação manual numa instância SEI real (a confirmar ao vivo)**

Com Dashboard ativado: abrir o editor de um documento (`editor_montar`) e assinar (abre a janela popup `documento_assinar`, comportamento já confirmado em 2026-07-20 no `ROADMAP-LOTES.md`). Confirmar no `chrome.storage.local` que um evento `assinatura` foi gravado. Se `extrairNumeroProcessoDaBarra` não encontrar o número nessa janela específica, esse é o ponto a ajustar.

---

### Task 14: Evento `concluido` — individual (`procedimento_visualizar`) e em lote (`procedimento_controlar`)

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `registrarEvento` (Task 2); `ehLinkConcluirIndividual`, `ehLinkConcluirEmLote` (Task 5); `obterNumeroProcesso` (Task 6); `EventoHistorico` (Task 1).

- [ ] **Step 1: Captura individual em `procedimento_visualizar/index.ts`**

Adicionar o import (junto aos das Tasks 10):

```ts
import { ehLinkConcluirIndividual } from '../../features/dashboard/concluirProcesso'
```

Adicionar, logo depois de `registrarEventoAcesso` (Task 10):

```ts
async function registrarEventoConcluido(numero: string): Promise<void> {
  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.dashboard?.ativo) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: EventoHistorico = { tipo: 'concluido', numero, ocorridoEm: new Date().toISOString() }
  const historicoEventos = registrarEvento(localConfig.historicoEventos ?? [], novo)
  await localStore.set({ ...localConfig, historicoEventos })
}

function instalarCapturaEventoConcluidoIndividual(): void {
  document.addEventListener('click', (evento) => {
    if (!(evento.target instanceof Element)) return
    const link = evento.target.closest('a[onclick]')
    if (!link || !ehLinkConcluirIndividual(link.getAttribute('onclick'))) return

    const numero = obterNumeroProcesso(document)
    if (!numero) return
    registrarEventoConcluido(numero).catch((error) => {
      console.error('[SEIRMG] Falha ao registrar evento de conclusão no Dashboard:', error)
    })
  })
}
```

No final do arquivo, substituir `bootstrap()` por:

```ts
bootstrap()
instalarCapturaEventoConcluidoIndividual()
```

- [ ] **Step 2: Captura em lote em `procedimento_controlar/index.ts`**

Adicionar o import:

```ts
import { ehLinkConcluirEmLote } from '../../features/dashboard/concluirProcesso'
import { registrarEvento } from '../../features/dashboard/historicoEventos'
import type { EventoHistorico } from '../../lib/storage'
```

Adicionar, no final do arquivo (antes do bootstrap/observer que já existe — este arquivo já tem `IDS_TABELAS` e `linhasDaTabela` disponíveis, definidos no topo):

```ts
async function registrarEventosConcluidoEmLote(numeros: string[]): Promise<void> {
  if (numeros.length === 0) return

  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.dashboard?.ativo) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  let historicoEventos = localConfig.historicoEventos ?? []
  const agora = new Date().toISOString()
  numeros.forEach((numero) => {
    const novo: EventoHistorico = { tipo: 'concluido', numero, ocorridoEm: agora }
    historicoEventos = registrarEvento(historicoEventos, novo)
  })
  await localStore.set({ ...localConfig, historicoEventos })
}

function numerosSelecionadosEmLote(): string[] {
  const numeros: string[] = []
  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const checkbox = linha.querySelector<HTMLInputElement>('input.infraCheckbox, input[type="checkbox"]')
      if (!checkbox?.checked) return
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const numero = processo?.textContent?.trim()
      if (numero) numeros.push(numero)
    })
  })
  return numeros
}

function instalarCapturaEventoConcluidoEmLote(): void {
  document.addEventListener('click', (evento) => {
    if (!(evento.target instanceof Element)) return
    const link = evento.target.closest('a[onclick]')
    if (!link || !ehLinkConcluirEmLote(link.getAttribute('onclick'))) return

    registrarEventosConcluidoEmLote(numerosSelecionadosEmLote()).catch((error) => {
      console.error('[SEIRMG] Falha ao registrar eventos de conclusão em lote no Dashboard:', error)
    })
  })
}

instalarCapturaEventoConcluidoEmLote()
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat: captura evento 'concluido' pro Dashboard (individual e em lote)"
```

- [ ] **Step 6: Validação manual numa instância SEI real (a confirmar ao vivo — item mais incerto do plano)**

Com Dashboard ativado: (a) selecionar um ou mais processos em Controle de Processos e clicar em "Concluir Processo nesta Unidade" — confirmar um evento `concluido` por processo selecionado; (b) abrir um processo individual e usar o ícone "Concluir Processo" — confirmar um evento `concluido`. **Este item foi sinalizado na spec como o de maior incerteza**: se o botão individual não estiver em `procedimento_visualizar` (ex.: estiver só na árvore de `arvore_visualizar`, ou em outra tela), mover `instalarCapturaEventoConcluidoIndividual` pro content script correto — a lógica pura (`ehLinkConcluirIndividual`, `registrarEventoConcluido`) não muda, só o arquivo/bootstrap que a chama.

---

### Task 15: Scaffolding da página `src/dashboard`

**Files:**
- Create: `src/dashboard/index.html`
- Create: `src/dashboard/style.css`
- Create: `src/dashboard/main.ts`
- Modify: `manifest.config.ts`

**Interfaces:**
- Produces: estrutura de abas (`data-tab`, `.view`/`.view.ativa`) reaproveitada pelas Tasks 16-19.

- [ ] **Step 1: Criar `src/dashboard/style.css`**

Reaproveitar as variáveis `--seirmg-*` de `src/options/style.css` (mesma paleta, já validada no mockup do visual companion). Criar `src/dashboard/style.css`:

```css
:root {
  --seirmg-primary: #017fff;
  --seirmg-primary-hover: #0166d1;
  --seirmg-primary-soft: #e8f2ff;
  --seirmg-danger: #dc2626;
  --seirmg-danger-soft: #fef2f2;
  --seirmg-warn: #b5530a;
  --seirmg-warn-soft: #fdf1e6;
  --seirmg-bg: #f5f6f8;
  --seirmg-surface: #ffffff;
  --seirmg-surface-muted: #fafbfc;
  --seirmg-border: #e2e5ea;
  --seirmg-text: #1a1d23;
  --seirmg-text-muted: #667085;
  --seirmg-radius: 10px;
  --seirmg-radius-sm: 6px;
  --seirmg-shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08);
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
  --tipo-acesso: #017fff; --tipo-acesso-soft: #e8f2ff;
  --tipo-enviado: #b5530a; --tipo-enviado-soft: #fdf1e6;
  --tipo-documento: #6d28d9; --tipo-documento-soft: #f1e9fd;
  --tipo-assinatura: #be185d; --tipo-assinatura-soft: #fce7f0;
  --tipo-concluido: #0d9488; --tipo-concluido-soft: #e6f7f5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --seirmg-primary: #4da3ff; --seirmg-primary-hover: #6fb5ff; --seirmg-primary-soft: #17324f;
    --seirmg-danger: #f87171; --seirmg-danger-soft: #2c1616;
    --seirmg-warn: #f0a13c; --seirmg-warn-soft: rgba(240, 161, 60, 0.14);
    --seirmg-bg: #14161a; --seirmg-surface: #1c1f26; --seirmg-surface-muted: #21242c;
    --seirmg-border: #30343d; --seirmg-text: #e7e9ed; --seirmg-text-muted: #9aa1ac;
    --tipo-acesso-soft: #17324f; --tipo-enviado-soft: #3a2412; --tipo-documento-soft: #2a2140;
    --tipo-assinatura-soft: #3a1a29; --tipo-concluido-soft: #123230;
  }
}
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  margin: 0; background: var(--seirmg-bg); color: var(--seirmg-text); font-size: 14px; line-height: 1.6;
}
.cabecalho { padding: var(--sp-6) var(--sp-8) var(--sp-4); max-width: 1080px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
.cabecalho-titulo { display: flex; align-items: center; gap: var(--sp-3); }
.cabecalho-titulo img { width: 32px; height: 32px; border-radius: var(--seirmg-radius-sm); }
.cabecalho h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
.cabecalho p { margin: var(--sp-1) 0 0; color: var(--seirmg-text-muted); font-size: 13px; }
.tabs { max-width: 1080px; margin: 0 auto; padding: 0 var(--sp-8); display: flex; gap: 2px; border-bottom: 1px solid var(--seirmg-border); }
.tab-btn { padding: 10px var(--sp-4); border: none; background: transparent; color: var(--seirmg-text-muted); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab-btn:hover { color: var(--seirmg-text); }
.tab-btn.ativa { color: var(--seirmg-primary); border-color: var(--seirmg-primary); }
.conteudo { max-width: 1080px; margin: 0 auto; padding: var(--sp-6) var(--sp-8) var(--sp-8); }
.view { display: none; }
.view.ativa { display: block; }
.secao-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); flex-wrap: wrap; gap: var(--sp-3); }
.secao-header h2 { margin: 0; font-size: 17px; font-weight: 700; }
.periodo-pills { display: flex; gap: 4px; background: var(--seirmg-surface-muted); border: 1px solid var(--seirmg-border); border-radius: 999px; padding: 3px; }
.periodo-pill { border: none; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; color: var(--seirmg-text-muted); cursor: pointer; }
.periodo-pill.ativa { background: var(--seirmg-primary); color: #fff; }
.acoes { display: flex; gap: var(--sp-2); }
.btn { font: inherit; font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: var(--seirmg-radius-sm); border: 1px solid var(--seirmg-border); background: var(--seirmg-surface); color: var(--seirmg-text); cursor: pointer; }
.btn:hover { background: var(--seirmg-surface-muted); }
.btn-primario { background: var(--seirmg-primary); border-color: var(--seirmg-primary); color: #fff; }
.btn-primario:hover { background: var(--seirmg-primary-hover); }
.cards-metricas { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-6); }
.card-metrica { background: var(--seirmg-surface); border: 1px solid var(--seirmg-border); border-radius: var(--seirmg-radius); padding: var(--sp-4); box-shadow: var(--seirmg-shadow); border-top: 3px solid var(--cor); }
.card-metrica .valor { font-size: 26px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
.card-metrica .rotulo { font-size: 11.5px; color: var(--seirmg-text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
.painel-lista { background: var(--seirmg-surface); border: 1px solid var(--seirmg-border); border-radius: var(--seirmg-radius); box-shadow: var(--seirmg-shadow); overflow: hidden; }
.grupo-data { padding: 8px 16px; background: var(--seirmg-surface-muted); font-size: 11px; font-weight: 700; text-transform: capitalize; color: var(--seirmg-text-muted); border-bottom: 1px solid var(--seirmg-border); }
.evento-linha { display: flex; align-items: center; gap: var(--sp-3); padding: 10px 16px; border-bottom: 1px solid var(--seirmg-border); }
.evento-linha:last-child { border-bottom: none; }
.evento-tipo { flex-shrink: 0; width: 92px; font-size: 11px; font-weight: 700; text-align: center; padding: 3px 0; border-radius: 999px; background: var(--bg); color: var(--fg); }
.evento-numero { font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums; width: 150px; flex-shrink: 0; }
.evento-detalhe { flex: 1; color: var(--seirmg-text-muted); font-size: 12.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evento-hora { flex-shrink: 0; font-size: 11.5px; color: var(--seirmg-text-muted); }
table.tabela-dash { width: 100%; border-collapse: collapse; }
table.tabela-dash th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--seirmg-text-muted); padding: 10px 16px; border-bottom: 1px solid var(--seirmg-border); background: var(--seirmg-surface-muted); }
table.tabela-dash td { padding: 10px 16px; border-bottom: 1px solid var(--seirmg-border); font-size: 13px; vertical-align: middle; }
table.tabela-dash tr:last-child td { border-bottom: none; }
.link-abrir { color: var(--seirmg-primary); text-decoration: none; font-size: 12.5px; font-weight: 600; }
.link-abrir:hover { text-decoration: underline; }
.badge-prazo { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.badge-vencido, .badge-critico { background: var(--seirmg-danger-soft); color: var(--seirmg-danger); }
.badge-alerta { background: var(--seirmg-warn-soft); color: var(--seirmg-warn); }
.prioridade { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.prioridade-alta { background: var(--seirmg-danger-soft); color: var(--seirmg-danger); }
.prioridade-media { background: var(--seirmg-warn-soft); color: var(--seirmg-warn); }
.prioridade-baixa { background: var(--seirmg-surface-muted); color: var(--seirmg-text-muted); }
.vazio { padding: var(--sp-8); text-align: center; color: var(--seirmg-text-muted); font-size: 13px; }
```

- [ ] **Step 2: Criar `src/dashboard/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Dashboard — SEIRMG</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div class="cabecalho">
      <div class="cabecalho-titulo">
        <img src="../assets/icons/icon-48.png" alt="" />
        <div>
          <h1>SEIRMG — Dashboard</h1>
          <p>Estatísticas e histórico de eventos dos processos</p>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ativa" data-tab="geral">Visão Geral</button>
      <button class="tab-btn" data-tab="favoritos">Favoritos</button>
      <button class="tab-btn" data-tab="prazos">Prazos</button>
      <button class="tab-btn" data-tab="tarefas">Tarefas</button>
    </div>

    <div class="conteudo">
      <div class="view ativa" id="view-geral"></div>
      <div class="view" id="view-favoritos"></div>
      <div class="view" id="view-prazos"></div>
      <div class="view" id="view-tarefas"></div>
    </div>

    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

(Cada `<div class="view">` começa vazio — o conteúdo de cada aba é montado via DOM pelas Tasks 16-19, seguindo o padrão de `createElement`/`.append()` já usado em todo o projeto, não HTML estático.)

- [ ] **Step 3: Criar `src/dashboard/main.ts` com o roteamento de abas**

```ts
function ativarAba(abaAlvo: string): void {
  document.querySelectorAll('.tab-btn').forEach((botao) => {
    botao.classList.toggle('ativa', botao.getAttribute('data-tab') === abaAlvo)
  })
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('ativa', view.id === `view-${abaAlvo}`)
  })
}

document.querySelectorAll('.tab-btn').forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-tab')
    if (aba) ativarAba(aba)
  })
})
```

- [ ] **Step 4: Registrar a página nova no manifest**

Em `manifest.config.ts`, adicionar (nova propriedade de topo, junto de `permissions`/`host_permissions`):

```ts
  web_accessible_resources: [
    {
      resources: ['src/dashboard/index.html'],
      matches: ['*://*.br/*', '*://*.org/*'],
    },
  ],
```

- [ ] **Step 5: Build e validar que a página é empacotada**

Run: `bun run build`
Expected: build termina sem erro. Conferir em `dist/manifest.json` que `web_accessible_resources` aparece e que existe um `dist/src/dashboard/index.html` gerado. **Se o `@crxjs/vite-plugin` não gerar esse arquivo automaticamente** a partir de `web_accessible_resources` (ponto sinalizado como "a confirmar" na spec), adicionar em `vite.config.ts` a opção `build.rollupOptions.input` apontando pra `src/dashboard/index.html` como entry point adicional, e rodar `bun run build` de novo até o arquivo aparecer em `dist/`.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/index.html src/dashboard/style.css src/dashboard/main.ts manifest.config.ts
git commit -m "feat: scaffolding da página do Dashboard (abas, sem conteúdo ainda)"
```

- [ ] **Step 7: Validação manual**

Carregar a extensão (`chrome://extensions` > recarregar), abrir o popup (com Dashboard ativado em Opções, Task 8/9) e clicar em "Abrir Dashboard" — confirmar que a página abre numa nova aba, com o cabeçalho, o ícone real da extensão, e a troca de abas (Visão Geral/Favoritos/Prazos/Tarefas) funcionando (mesmo com o conteúdo ainda vazio).

---

### Task 16: Dashboard — aba Visão Geral

**Files:**
- Modify: `src/dashboard/main.ts`

**Interfaces:**
- Consumes: `createLocalConfigStore` (`../lib/storage`); `filtrarPorPeriodo`, `calcularMetricas`, `agruparPorDia` (Task 2); `calcularIntervalo`, `Periodo` (Task 3); `montarCsvHistorico`, `montarHtmlRelatorio` (Task 4).

- [ ] **Step 1: Implementar a renderização da Visão Geral**

Em `src/dashboard/main.ts`, adicionar (antes do bloco de roteamento de abas já existente):

```ts
import { createLocalConfigStore } from '../lib/storage'
import type { EventoHistorico } from '../lib/storage'
import { filtrarPorPeriodo, calcularMetricas, agruparPorDia } from '../features/dashboard/historicoEventos'
import { calcularIntervalo, type Periodo } from '../features/dashboard/periodo'
import { montarCsvHistorico, montarHtmlRelatorio } from '../features/dashboard/relatorio'

const ROTULOS_TIPO: Record<EventoHistorico['tipo'], string> = {
  acesso: 'Acesso',
  enviado: 'Enviado',
  documento: 'Documento',
  assinatura: 'Assinatura',
  concluido: 'Concluído',
}

let periodoAtivo: Periodo = '30dias'

function formatarDataGrupo(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

async function renderizarVisaoGeral(): Promise<void> {
  const view = document.getElementById('view-geral')
  if (!view) return

  const localConfig = await createLocalConfigStore().get()
  const todosOsEventos = localConfig.historicoEventos ?? []
  const intervalo = calcularIntervalo(periodoAtivo, new Date())
  const eventos = filtrarPorPeriodo(todosOsEventos, intervalo.inicio, intervalo.fim)
  const metricas = calcularMetricas(eventos)
  const grupos = agruparPorDia([...eventos].reverse())

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'

  const pills = document.createElement('div')
  pills.className = 'periodo-pills'
  const periodos: Array<{ valor: Periodo; rotulo: string }> = [
    { valor: 'hoje', rotulo: 'Hoje' },
    { valor: '7dias', rotulo: '7 dias' },
    { valor: '30dias', rotulo: '30 dias' },
    { valor: '90dias', rotulo: '90 dias' },
    { valor: 'ano', rotulo: 'Ano' },
  ]
  periodos.forEach(({ valor, rotulo }) => {
    const botao = document.createElement('button')
    botao.className = 'periodo-pill' + (valor === periodoAtivo ? ' ativa' : '')
    botao.textContent = rotulo
    botao.addEventListener('click', () => {
      periodoAtivo = valor
      renderizarVisaoGeral().catch((error) => console.error('[SEIRMG] Falha ao renderizar Visão Geral:', error))
    })
    pills.appendChild(botao)
  })

  const acoes = document.createElement('div')
  acoes.className = 'acoes'
  const btnCsv = document.createElement('button')
  btnCsv.className = 'btn'
  btnCsv.textContent = 'Exportar CSV'
  btnCsv.addEventListener('click', () => exportarCsv(eventos))
  const btnRelatorio = document.createElement('button')
  btnRelatorio.className = 'btn btn-primario'
  btnRelatorio.textContent = 'Gerar Relatório'
  btnRelatorio.addEventListener('click', () => gerarRelatorio(eventos, intervalo))
  acoes.append(btnCsv, btnRelatorio)

  header.append(pills, acoes)
  view.appendChild(header)

  const cards = document.createElement('div')
  cards.className = 'cards-metricas'
  ;(Object.keys(ROTULOS_TIPO) as Array<EventoHistorico['tipo']>).forEach((tipo) => {
    const card = document.createElement('div')
    card.className = 'card-metrica'
    card.style.setProperty('--cor', `var(--tipo-${tipo})`)
    const valor = document.createElement('div')
    valor.className = 'valor'
    valor.textContent = String(metricas[tipo])
    const rotulo = document.createElement('div')
    rotulo.className = 'rotulo'
    rotulo.textContent = ROTULOS_TIPO[tipo]
    card.append(valor, rotulo)
    cards.appendChild(card)
  })
  view.appendChild(cards)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'
  if (grupos.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhum evento registrado neste período.'
    painel.appendChild(vazio)
  } else {
    grupos.forEach((grupo) => {
      const cabecalhoGrupo = document.createElement('div')
      cabecalhoGrupo.className = 'grupo-data'
      cabecalhoGrupo.textContent = formatarDataGrupo(grupo.data)
      painel.appendChild(cabecalhoGrupo)

      grupo.eventos.forEach((evento) => {
        const linha = document.createElement('div')
        linha.className = 'evento-linha'

        const tipoSpan = document.createElement('span')
        tipoSpan.className = 'evento-tipo'
        tipoSpan.style.setProperty('--bg', `var(--tipo-${evento.tipo}-soft)`)
        tipoSpan.style.setProperty('--fg', `var(--tipo-${evento.tipo})`)
        tipoSpan.textContent = ROTULOS_TIPO[evento.tipo]

        const numeroSpan = document.createElement('span')
        numeroSpan.className = 'evento-numero'
        numeroSpan.textContent = evento.numero

        const detalheSpan = document.createElement('span')
        detalheSpan.className = 'evento-detalhe'
        detalheSpan.textContent = [evento.tipoProcesso, evento.especificacao].filter(Boolean).join(' — ')

        const horaSpan = document.createElement('span')
        horaSpan.className = 'evento-hora'
        horaSpan.textContent = new Date(evento.ocorridoEm).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })

        linha.append(tipoSpan, numeroSpan, detalheSpan, horaSpan)
        painel.appendChild(linha)
      })
    })
  }
  view.appendChild(painel)
}

function exportarCsv(eventos: EventoHistorico[]): void {
  const blob = new Blob(['﻿' + montarCsvHistorico(eventos)], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `seirmg_historico_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

function gerarRelatorio(eventos: EventoHistorico[], intervalo: ReturnType<typeof calcularIntervalo>): void {
  const html = montarHtmlRelatorio(eventos, intervalo)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

renderizarVisaoGeral().catch((error) => console.error('[SEIRMG] Falha ao renderizar Visão Geral:', error))
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/main.ts
git commit -m "feat: aba Visão Geral do Dashboard (métricas, linha do tempo, CSV, relatório)"
```

- [ ] **Step 5: Validação manual**

Com alguns eventos já registrados (Tasks 10-14 rodadas ao vivo), abrir o Dashboard e conferir: os 5 cards de métrica batem com a contagem esperada pro período selecionado, trocar de período recalcula tudo, a linha do tempo mostra os eventos agrupados por dia, "Exportar CSV" baixa um arquivo abrindo corretamente no Excel/LibreOffice (acentos ok), e "Gerar Relatório" abre uma nova aba com uma tabela legível.

---

### Task 17: Dashboard — aba Favoritos

**Files:**
- Modify: `src/dashboard/main.ts`

**Interfaces:**
- Consumes: `createSyncConfigStore` (`../lib/storage`); `montarCelulaMarcadoresCongelados`, `montarCelulaPrazoCongelado`, `montarCelulaAtribuicao` (Task 7, `../features/controle-processos/favoritosRender`); `ordenarFavoritosPorData` (já existe, `../features/controle-processos/favoritos`).

- [ ] **Step 1: Implementar a renderização de Favoritos**

Adicionar em `src/dashboard/main.ts`:

```ts
import { createSyncConfigStore } from '../lib/storage'
import type { FavoritoProcesso } from '../lib/storage'
import { ordenarFavoritosPorData, construirLinkSeguro } from '../features/controle-processos/favoritos'
import {
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
} from '../features/controle-processos/favoritosRender'

function montarCelulaProcessoFavorito(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')
  td.textContent = item.numero
  if (item.especificacao) {
    const especificacao = document.createElement('div')
    especificacao.style.color = 'var(--seirmg-text-muted)'
    especificacao.style.fontSize = '11.5px'
    especificacao.textContent = item.especificacao
    td.appendChild(especificacao)
  }
  return td
}

function montarCelulaAbrirFavorito(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')
  const url = construirLinkSeguro(item.link)
  if (url) {
    const link = document.createElement('a')
    link.className = 'link-abrir'
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Abrir ↗'
    td.appendChild(link)
  }
  return td
}

async function renderizarFavoritos(): Promise<void> {
  const view = document.getElementById('view-favoritos')
  if (!view) return

  const config = await createSyncConfigStore().get()
  const itens = ordenarFavoritosPorData(config.controleProcessos.favoritos.itens)

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'
  const titulo = document.createElement('h2')
  titulo.textContent = `★ Favoritos (${itens.length})`
  header.appendChild(titulo)
  view.appendChild(header)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'

  if (itens.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhum processo favoritado ainda.'
    painel.appendChild(vazio)
  } else {
    const tabela = document.createElement('table')
    tabela.className = 'tabela-dash'
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Processo</th><th>Marcadores</th><th>Prazo</th><th>Atribuição</th><th></th></tr>'
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    itens.forEach((item) => {
      const tr = document.createElement('tr')
      tr.appendChild(montarCelulaProcessoFavorito(item))
      tr.appendChild(montarCelulaMarcadoresCongelados(item.ultimoSnapshot?.marcadoresNomes ?? []))
      tr.appendChild(montarCelulaPrazoCongelado(item.ultimoSnapshot?.prazoDataTexto ?? null))
      tr.appendChild(montarCelulaAtribuicao(item.ultimoSnapshot?.atribuicao ?? null))
      tr.appendChild(montarCelulaAbrirFavorito(item))
      tbody.appendChild(tr)
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)
  }

  view.appendChild(painel)
}

renderizarFavoritos().catch((error) => console.error('[SEIRMG] Falha ao renderizar Favoritos:', error))
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros. (`construirLinkSeguro`, `ordenarFavoritosPorData` já existem em `favoritos.ts` — conferir que ambos são exportados; se `construirLinkSeguro` não estiver exportado lá, adicionar `export` na declaração existente, sem mudar sua implementação.)

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/main.ts
git commit -m "feat: aba Favoritos do Dashboard (somente leitura)"
```

- [ ] **Step 5: Validação manual**

Com processos já favoritados (via painel inline em Controle de Processos), abrir o Dashboard > aba Favoritos e conferir que a lista bate com o painel inline (mesmos marcadores/prazo/atribuição), e que "Abrir ↗" navega pro processo correto numa aba nova.

---

### Task 18: Dashboard — aba Prazos

**Files:**
- Modify: `src/dashboard/main.ts`

**Interfaces:**
- Consumes: `createSyncConfigStore`; `calcularDiasAteVencimento`, `classificarPrazo` (já existem, `../features/controle-processos/prazos`); `construirLinkSeguro` (Task 17).

- [ ] **Step 1: Implementar a renderização de Prazos**

Adicionar em `src/dashboard/main.ts`:

```ts
import { calcularDiasAteVencimento, classificarPrazo } from '../features/controle-processos/prazos'

function montarBadgePrazo(dias: number, config: { alerta: number; critico: number }): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = 'badge-prazo'
  if (dias < 0) {
    badge.classList.add('badge-vencido')
    badge.textContent = `Vencido há ${Math.abs(dias)} dia(s)`
    return badge
  }
  const classificacao = classificarPrazo(dias, config)
  badge.classList.add(classificacao === 'critico' ? 'badge-critico' : 'badge-alerta')
  badge.textContent = `${classificacao === 'critico' ? 'Crítico' : 'Alerta'} · ${dias} dia(s)`
  return badge
}

async function renderizarPrazos(): Promise<void> {
  const view = document.getElementById('view-prazos')
  if (!view) return

  const config = await createSyncConfigStore().get()
  const limites = { alerta: config.controleProcessos.prazos.alerta, critico: config.controleProcessos.prazos.critico }
  const agora = new Date()

  const itens = config.controleProcessos.favoritos.itens
    .map((item) => {
      const dataTexto = item.ultimoSnapshot?.prazoDataTexto ?? null
      if (!dataTexto) return null
      const dias = calcularDiasAteVencimento(dataTexto, agora)
      if (dias === null) return null
      const emAlerta = dias < 0 || classificarPrazo(dias, limites) !== null
      return emAlerta ? { item, dataTexto, dias } : null
    })
    .filter((valor): valor is { item: (typeof config.controleProcessos.favoritos.itens)[number]; dataTexto: string; dias: number } => valor !== null)
    .sort((a, b) => a.dias - b.dias)

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'
  const titulo = document.createElement('h2')
  titulo.textContent = 'Processos com prazo em alerta ou crítico'
  header.appendChild(titulo)
  view.appendChild(header)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'

  if (itens.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhum favorito com prazo em alerta, crítico ou vencido.'
    painel.appendChild(vazio)
  } else {
    const tabela = document.createElement('table')
    tabela.className = 'tabela-dash'
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Processo</th><th>Especificação</th><th>Prazo</th><th>Situação</th></tr>'
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    itens.forEach(({ item, dataTexto, dias }) => {
      const tr = document.createElement('tr')

      const tdNumero = document.createElement('td')
      tdNumero.textContent = item.numero
      tr.appendChild(tdNumero)

      const tdEspecificacao = document.createElement('td')
      tdEspecificacao.textContent = item.especificacao ?? '—'
      tr.appendChild(tdEspecificacao)

      const tdData = document.createElement('td')
      tdData.textContent = dataTexto
      tr.appendChild(tdData)

      const tdSituacao = document.createElement('td')
      tdSituacao.appendChild(montarBadgePrazo(dias, limites))
      tr.appendChild(tdSituacao)

      tbody.appendChild(tr)
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)
  }

  view.appendChild(painel)
}

renderizarPrazos().catch((error) => console.error('[SEIRMG] Falha ao renderizar Prazos:', error))
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/main.ts
git commit -m "feat: aba Prazos do Dashboard (favoritos em alerta/crítico/vencido)"
```

- [ ] **Step 5: Validação manual**

Com favoritos cujo prazo caia nas faixas de alerta/crítico configuradas em Opções > Processos > Prazos, conferir que só esses aparecem na aba Prazos, ordenados do mais urgente pro menos urgente, e que processos vencidos aparecem com "Vencido há N dia(s)".

---

### Task 19: Dashboard — aba Tarefas

**Files:**
- Modify: `src/dashboard/main.ts`

**Interfaces:**
- Consumes: `createSyncConfigStore`; `agruparPorUrgencia`, `ordenarDentroDoGrupo` (já existem, `../features/tarefas/urgencia`).

- [ ] **Step 1: Implementar a renderização de Tarefas**

Adicionar em `src/dashboard/main.ts`:

```ts
import { agruparPorUrgencia, ordenarDentroDoGrupo } from '../features/tarefas/urgencia'
import type { Tarefa } from '../lib/storage'

const ROTULOS_PRIORIDADE: Record<Tarefa['prioridade'], string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

function montarLinhaTarefa(tarefa: Tarefa, vencidaLabel?: string): HTMLTableRowElement {
  const tr = document.createElement('tr')

  const tdTitulo = document.createElement('td')
  tdTitulo.textContent = tarefa.titulo
  tr.appendChild(tdTitulo)

  const tdProcesso = document.createElement('td')
  tdProcesso.textContent = tarefa.processo || '—'
  tr.appendChild(tdProcesso)

  const tdVencimento = document.createElement('td')
  tdVencimento.textContent = tarefa.vencimento ? `${tarefa.vencimento}${vencidaLabel ? ` (${vencidaLabel})` : ''}` : '—'
  tr.appendChild(tdVencimento)

  const tdPrioridade = document.createElement('td')
  const badge = document.createElement('span')
  badge.className = `prioridade prioridade-${tarefa.prioridade}`
  badge.textContent = ROTULOS_PRIORIDADE[tarefa.prioridade]
  tdPrioridade.appendChild(badge)
  tr.appendChild(tdPrioridade)

  return tr
}

async function renderizarTarefas(): Promise<void> {
  const view = document.getElementById('view-tarefas')
  if (!view) return

  const config = await createSyncConfigStore().get()
  const grupos = agruparPorUrgencia(config.tarefas.itens, new Date())
  const pendentes = [...ordenarDentroDoGrupo(grupos.atrasadas), ...ordenarDentroDoGrupo(grupos.hoje), ...ordenarDentroDoGrupo(grupos.proximas)]

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'
  const titulo = document.createElement('h2')
  titulo.textContent = 'Tarefas pendentes'
  header.appendChild(titulo)
  view.appendChild(header)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'

  if (pendentes.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhuma tarefa pendente.'
    painel.appendChild(vazio)
  } else {
    const tabela = document.createElement('table')
    tabela.className = 'tabela-dash'
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Título</th><th>Processo</th><th>Vencimento</th><th>Prioridade</th></tr>'
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    grupos.atrasadas.forEach((tarefa) => tbody.appendChild(montarLinhaTarefa(tarefa, 'vencida')))
    ordenarDentroDoGrupo(grupos.hoje).forEach((tarefa) => tbody.appendChild(montarLinhaTarefa(tarefa)))
    ordenarDentroDoGrupo(grupos.proximas).forEach((tarefa) => tbody.appendChild(montarLinhaTarefa(tarefa)))
    tabela.appendChild(tbody)
    painel.appendChild(tabela)
  }

  view.appendChild(painel)
}

renderizarTarefas().catch((error) => console.error('[SEIRMG] Falha ao renderizar Tarefas:', error))
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte de testes completa**

Run: `bun run test`
Expected: PASS (todas as tasks anteriores).

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/main.ts
git commit -m "feat: aba Tarefas do Dashboard (pendentes, atrasadas e próximas)"
```

- [ ] **Step 6: Validação manual final**

Com o Painel de Tarefas populado (algumas atrasadas, uma hoje, uma futura, uma concluída), abrir o Dashboard > aba Tarefas e conferir que só as pendentes aparecem (não a concluída), ordenadas atrasadas → hoje → próximas, com o rótulo "(vencida)" nas atrasadas. Depois, percorrer as 4 abas mais uma vez de ponta a ponta (Visão Geral, Favoritos, Prazos, Tarefas) confirmando que nenhuma mudou o comportamento das telas nativas do SEI nem dos painéis já existentes (Favoritos inline, popup, Opções).

---

## Self-Review

**Cobertura da spec:** tipos/defaults (Task 1) → agregação pura de eventos/período/relatório (Tasks 2-4) → reconhecimento dos links de concluir (Task 5) → extração de número de processo compartilhada (Task 6) → extração do render de favoritos congelados compartilhado (Task 7) → toggle em Opções (Task 8) → botão condicional no popup (Task 9) → captura dos 5 eventos, cada um com seu próprio ponto de wiring e seu próprio passo de validação ao vivo (Tasks 10-14) → scaffolding + 4 abas da página (Tasks 15-19). Todos os itens "a confirmar durante a implementação" da spec (seletor de `#sbmEnviar`, tela do botão individual de concluir, DOM de `documento_assinar`, empacotamento da página pelo Vite) têm um passo de validação dedicado apontando exatamente o que ajustar se a suposição estiver errada.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo step tem código completo; os 4 pontos de incerteza genuína (idênticos aos da spec) estão marcados explicitamente como "a confirmar ao vivo", não como lacuna do plano.

**Consistência de tipos:** `EventoHistorico` (Task 1) usado com os mesmos 5 campos em `historicoEventos.ts` (Task 2), `relatorio.ts` (Task 4) e em todos os 5 pontos de captura (Tasks 10-14); `TipoEventoHistorico` sempre com os mesmos 5 valores (`acesso`/`enviado`/`documento`/`assinatura`/`concluido`) em `ROTULOS_TIPO` (Task 16) e nas variáveis CSS `--tipo-*` (Task 15); `Periodo`/`Intervalo` (Task 3) usados identicamente em `calcularIntervalo` e em `renderizarVisaoGeral`/`gerarRelatorio` (Task 16); `criarIcone`/`montarCelulaMarcadoresCongelados`/`montarCelulaPrazoCongelado`/`montarCelulaAtribuicao` (Task 7) com a mesma assinatura usada tanto em `procedimento_controlar/index.ts` quanto na aba Favoritos do Dashboard (Task 17).
