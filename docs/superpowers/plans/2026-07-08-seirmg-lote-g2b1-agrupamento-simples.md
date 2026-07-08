# SEIRMG — Lote G2b-1: Agrupamento Simples de Processos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar agrupamento de processos por marcador/tipo/responsável/ponto de controle às tabelas Recebidos/Gerados de Controle de Processos, convivendo com a ordenação por coluna (Lote E3), a rolagem infinita (Lote E3b) e os filtros já existentes (Lotes E/E2).

**Architecture:** Ver `docs/superpowers/specs/2026-07-08-seirmg-lote-g2b1-agrupamento-simples-design.md`. Lógica pura nova em `features/controle-processos/agrupamento.ts` (testada); `content-scripts/procedimento_controlar/index.ts` ganha uma função central `reaplicarOrdemDaTabela` que converge filtros + agrupamento + ordenação num único ponto, substituindo as chamadas hoje espalhadas.

**Tech Stack:** TypeScript, Vite, Bun, Vitest — mesma infraestrutura já existente. Sem dependência nova.

## Global Constraints

- Só `#tblProcessosRecebidos` e `#tblProcessosGerados` recebem agrupamento — `#tblProcessosDetalhado` nunca (mesma restrição do Lote E3b); continua recebendo ordenação/filtros normalmente, sem mudança de comportamento.
- 4 critérios: marcador, tipo, responsável, ponto de controle. `criterio: 'nenhum'` é o estado desligado — sem campo `ativo` separado.
- Critério de agrupamento persiste em `SyncConfig` (sincroniza entre sessões), diferente da ordenação por coluna (E3), que é só estado em memória.
- Convive com ordenação por coluna (ordena dentro do grupo), rolagem infinita (linhas novas são reagrupadas) e filtros (cabeçalho de grupo some se todas as linhas do grupo estiverem ocultas por filtro).
- Toda função de topo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.
- Sem toggle na tela de Opções — o controle é o `<select>` inserido na própria página do SEI (paridade com o Sei Pro original).

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── features/controle-processos/
│   │   └── agrupamento.ts (+ .test.ts, novo)
│   ├── lib/
│   │   └── storage.ts (modificado)
│   └── content-scripts/procedimento_controlar/index.ts (modificado)
```

---

### Task 1: `features/controle-processos/agrupamento.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\agrupamento.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\agrupamento.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces:
  - `type CriterioAgrupamento = 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'`
  - `interface LinhaParaAgrupar { id: string; chaveGrupo: string | null }`
  - `interface GrupoOrdenado { chaveGrupo: string | null; ids: string[] }`
  - `extrairNomeMarcador(onmouseover: string): string`
  - `extrairTipoProcesso(onmouseover: string): string`
  - `extrairTextoPontoControle(onmouseover: string): string`
  - `agruparLinhas(linhas: LinhaParaAgrupar[], ordemDentroDoGrupo?: Map<string, number>): GrupoOrdenado[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/controle-processos/agrupamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { agruparLinhas, extrairNomeMarcador, extrairTextoPontoControle, extrairTipoProcesso } from './agrupamento'

describe('extrairNomeMarcador', () => {
  it('extrai o segundo argumento entre aspas simples', () => {
    expect(extrairNomeMarcador("infraTooltipMostrar('Até 10/10/2026','Urgente')")).toBe('Urgente')
  })

  it('retorna string vazia quando só há um argumento', () => {
    expect(extrairNomeMarcador("infraTooltipMostrar('Até 10/10/2026')")).toBe('')
  })
})

describe('extrairTipoProcesso', () => {
  it('extrai o segundo argumento entre aspas simples', () => {
    expect(extrairTipoProcesso("mostrarDica('Recursos Humanos','Administrativo: Diárias')")).toBe(
      'Administrativo: Diárias'
    )
  })

  it('retorna string vazia quando só há um argumento', () => {
    expect(extrairTipoProcesso("mostrarDica('Recursos Humanos')")).toBe('')
  })
})

describe('extrairTextoPontoControle', () => {
  it('extrai o segundo argumento entre aspas simples', () => {
    expect(extrairTextoPontoControle("infraTooltipMostrar('01/01/2026','Aguardando Análise')")).toBe(
      'Aguardando Análise'
    )
  })

  it('retorna string vazia quando só há um argumento', () => {
    expect(extrairTextoPontoControle("infraTooltipMostrar('01/01/2026')")).toBe('')
  })
})

describe('agruparLinhas', () => {
  it('agrupa linhas com a mesma chave', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: 'Financeiro' },
      { id: '2', chaveGrupo: 'Financeiro' },
      { id: '3', chaveGrupo: 'Pessoal' },
    ])
    expect(grupos).toEqual([
      { chaveGrupo: 'Financeiro', ids: ['1', '2'] },
      { chaveGrupo: 'Pessoal', ids: ['3'] },
    ])
  })

  it('ordena os grupos nomeados em ordem alfabética', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: 'Pessoal' },
      { id: '2', chaveGrupo: 'Financeiro' },
    ])
    expect(grupos.map((g) => g.chaveGrupo)).toEqual(['Financeiro', 'Pessoal'])
  })

  it('coloca o grupo sem chave ("Sem Grupo") sempre por último, mesmo alfabeticamente antes', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: null },
      { id: '2', chaveGrupo: 'Ambiental' },
    ])
    expect(grupos.map((g) => g.chaveGrupo)).toEqual(['Ambiental', null])
  })

  it('trata string vazia como equivalente a null (Sem Grupo)', () => {
    const grupos = agruparLinhas([
      { id: '1', chaveGrupo: '' },
      { id: '2', chaveGrupo: 'Ambiental' },
    ])
    expect(grupos.map((g) => g.chaveGrupo)).toEqual(['Ambiental', null])
  })

  it('preserva a ordem de entrada dentro do grupo quando ordemDentroDoGrupo não é fornecido', () => {
    const grupos = agruparLinhas([
      { id: '3', chaveGrupo: 'Financeiro' },
      { id: '1', chaveGrupo: 'Financeiro' },
      { id: '2', chaveGrupo: 'Financeiro' },
    ])
    expect(grupos[0].ids).toEqual(['3', '1', '2'])
  })

  it('ordena dentro do grupo pela posição informada em ordemDentroDoGrupo', () => {
    const ordem = new Map([
      ['3', 2],
      ['1', 0],
      ['2', 1],
    ])
    const grupos = agruparLinhas(
      [
        { id: '3', chaveGrupo: 'Financeiro' },
        { id: '1', chaveGrupo: 'Financeiro' },
        { id: '2', chaveGrupo: 'Financeiro' },
      ],
      ordem
    )
    expect(grupos[0].ids).toEqual(['1', '2', '3'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/agrupamento.test.ts`
Expected: FAIL — `Cannot find module './agrupamento'`

- [ ] **Step 3: Implementar `src/features/controle-processos/agrupamento.ts`**

```ts
export type CriterioAgrupamento = 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'

export interface LinhaParaAgrupar {
  id: string
  chaveGrupo: string | null
}

export interface GrupoOrdenado {
  chaveGrupo: string | null
  ids: string[]
}

function extrairSegundoArgumento(onmouseover: string): string {
  return onmouseover.split("'")[3] ?? ''
}

export function extrairNomeMarcador(onmouseover: string): string {
  return extrairSegundoArgumento(onmouseover)
}

export function extrairTipoProcesso(onmouseover: string): string {
  return extrairSegundoArgumento(onmouseover)
}

export function extrairTextoPontoControle(onmouseover: string): string {
  return extrairSegundoArgumento(onmouseover)
}

export function agruparLinhas(
  linhas: LinhaParaAgrupar[],
  ordemDentroDoGrupo?: Map<string, number>
): GrupoOrdenado[] {
  const gruposPorChave = new Map<string | null, string[]>()

  linhas.forEach(({ id, chaveGrupo }) => {
    const chave = chaveGrupo && chaveGrupo !== '' ? chaveGrupo : null
    const idsDoGrupo = gruposPorChave.get(chave) ?? []
    idsDoGrupo.push(id)
    gruposPorChave.set(chave, idsDoGrupo)
  })

  const chavesNomeadas = Array.from(gruposPorChave.keys())
    .filter((chave): chave is string => chave !== null)
    .sort((a, b) => a.localeCompare(b))

  const chavesOrdenadas: Array<string | null> = [...chavesNomeadas]
  if (gruposPorChave.has(null)) chavesOrdenadas.push(null)

  return chavesOrdenadas.map((chaveGrupo) => {
    const ids = gruposPorChave.get(chaveGrupo) ?? []
    const idsOrdenados = ordemDentroDoGrupo
      ? [...ids].sort((a, b) => (ordemDentroDoGrupo.get(a) ?? 0) - (ordemDentroDoGrupo.get(b) ?? 0))
      : ids
    return { chaveGrupo, ids: idsOrdenados }
  })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/agrupamento.test.ts`
Expected: PASS (12 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/agrupamento.ts src/features/controle-processos/agrupamento.test.ts
git commit -m "feat(controle-processos): add grouping extraction and sort helpers"
```

---

### Task 2: `lib/storage.ts` — config de agrupamento

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `AgrupamentoConfig { criterio: 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle' }`; `ControleProcessosConfig.agrupamento: AgrupamentoConfig`

- [ ] **Step 1: Atualizar o teste existente e escrever o novo teste (ambos devem falhar)**

Em `src/lib/storage.test.ts`, localizar o teste `'inclui controleProcessos padrão quando vazio'` (por volta da linha 73):

```ts
  it('inclui controleProcessos padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).controleProcessos).toEqual({
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alertaDias: 30,
        criticoDias: 60,
        alertaPrazo: 10,
        criticoPrazo: 5,
      },
      coresProcesso: { ativo: true, regras: [] },
      especificacao: { ativo: true, modo: 'mostrar' },
      rolagemInfinita: { ativo: false },
    })
  })
```

Substituir por:

```ts
  it('inclui controleProcessos padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).controleProcessos).toEqual({
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alertaDias: 30,
        criticoDias: 60,
        alertaPrazo: 10,
        criticoPrazo: 5,
      },
      coresProcesso: { ativo: true, regras: [] },
      especificacao: { ativo: true, modo: 'mostrar' },
      rolagemInfinita: { ativo: false },
      agrupamento: { criterio: 'nenhum' },
    })
  })
```

Logo depois do teste `'persiste alteração de controleProcessos.rolagemInfinita'` (por volta da linha 120), adicionar:

```ts
  it('persiste alteração de controleProcessos.agrupamento', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        agrupamento: { criterio: 'marcador' as const },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — o objeto esperado no primeiro teste não bate (falta `agrupamento`) e/ou erro de tipo no segundo teste (`agrupamento` não existe em `ControleProcessosConfig`)

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Trecho atual (por volta da linha 53-62):

```ts
export interface RolagemInfinitaConfig {
  ativo: boolean
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
}
```

Substituir por:

```ts
export interface RolagemInfinitaConfig {
  ativo: boolean
}

export type CriterioAgrupamento = 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'

export interface AgrupamentoConfig {
  criterio: CriterioAgrupamento
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
}
```

Em `DEFAULT_SYNC_CONFIG.controleProcessos`, localizar (por volta da linha 150):

```ts
    rolagemInfinita: {
      ativo: false,
    },
  },
```

Substituir por:

```ts
    rolagemInfinita: {
      ativo: false,
    },
    agrupamento: {
      criterio: 'nenhum',
    },
  },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (22 testes — 21 já existentes + 1 novo)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add agrupamento config to ControleProcessosConfig"
```

---

### Task 3: Função central de reordenação (`reaplicarOrdemDaTabela`)

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: refactor comportamento-preservando. Introduz `reaplicarOrdemDaTabela` (filtros → agrupamento-ou-ordenação → oculta cabeçalhos de grupo vazios) e suas dependências, e rewire os 4 gatilhos existentes (clique em cabeçalho de coluna, os 3 filtros) para chamá-la em vez de reordenar isoladamente. Como `criterioAgrupamentoAtivo` fica em `'nenhum'` nesta task (a Task 4 é quem adiciona o `<select>` que muda esse valor), o branch de agrupamento nunca é alcançado ainda — o comportamento observável não muda, só a estrutura interna. Verificado pela suíte de testes completa (nenhum teste novo nesta task) e pelo build. Não é coberto por TDD (wiring de DOM), mesma convenção já estabelecida neste arquivo.

**Interfaces:**
- Consumes: `agruparLinhas`, `LinhaParaAgrupar`, `type CriterioAgrupamento`, `extrairNomeMarcador`, `extrairTipoProcesso`, `extrairTextoPontoControle` (Task 1)
- Produces: `reaplicarOrdemDaTabela(idTabela: string): void` — usado pela Task 4 e reutilizado nos gatilhos já existentes.

- [ ] **Step 1: Adicionar o import da Task 1**

Trecho atual (linhas 26-31):

```ts
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
```

Substituir por:

```ts
import {
  agruparLinhas,
  extrairNomeMarcador,
  extrairTextoPontoControle,
  extrairTipoProcesso,
  type CriterioAgrupamento,
  type LinhaParaAgrupar,
} from '../../features/controle-processos/agrupamento'
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
```

- [ ] **Step 2: Excluir cabeçalhos de grupo de `linhasDaTabela`**

Trecho atual (linhas 40-44):

```ts
function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr'))
}
```

Substituir por:

```ts
function linhasDaTabela(idTabela: string): Element[] {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr:not(.seirmg-cabecalho-grupo)'))
}
```

- [ ] **Step 3: Extrair `calcularOrdemIds` e simplificar `aplicarOrdenacaoNaTabela`/`reaplicarOrdenacaoAtual`/`ordenarTabelaPelaColuna`**

Trecho atual (linhas 218-258):

```ts
function aplicarOrdenacaoNaTabela(
  idTabela: string,
  indiceColuna: number,
  direcao: 'asc' | 'desc',
  headers: HTMLTableCellElement[]
): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const valores = linhas.map((linha, index) => ({
      id: linha.id || String(index),
      valor: linha.children[indiceColuna]?.textContent?.trim() ?? '',
    }))

    const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
    const ordemIds = ordenarIds(valores, tipo, direcao)

    const tabela = document.querySelector(idTabela)
    const tbody = tabela?.querySelector('tbody')
    if (!tbody) return

    const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
    ordemIds.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })

    limparIndicadoresOrdenacao(headers)
    aplicarIndicadorOrdenacao(headers[indiceColuna], direcao)
    ultimoIndicePorTabela.delete(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  const direcao: 'asc' | 'desc' =
    estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
  estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })
  aplicarOrdenacaoNaTabela(idTabela, indiceColuna, direcao, headers)
}

function reaplicarOrdenacaoAtual(idTabela: string): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoAtual) return

  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  const headers = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead > tr > th'))
  aplicarOrdenacaoNaTabela(idTabela, estadoAtual.indiceColuna, estadoAtual.direcao, headers)
}
```

Substituir por:

```ts
function calcularOrdemIds(linhas: Element[], indiceColuna: number, direcao: 'asc' | 'desc'): string[] {
  const valores = linhas.map((linha, index) => ({
    id: linha.id || String(index),
    valor: linha.children[indiceColuna]?.textContent?.trim() ?? '',
  }))

  const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
  return ordenarIds(valores, tipo, direcao)
}

function aplicarOrdenacaoNaTabela(idTabela: string, indiceColuna: number, direcao: 'asc' | 'desc'): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const ordemIds = calcularOrdemIds(linhas, indiceColuna, direcao)

    const tabela = document.querySelector(idTabela)
    const tbody = tabela?.querySelector('tbody')
    if (!tbody) return

    const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
    ordemIds.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  const direcao: 'asc' | 'desc' =
    estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
  estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })
  limparIndicadoresOrdenacao(headers)
  aplicarIndicadorOrdenacao(headers[indiceColuna], direcao)
  reaplicarOrdemDaTabela(idTabela)
}

function reaplicarOrdenacaoAtual(idTabela: string): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoAtual) return
  aplicarOrdenacaoNaTabela(idTabela, estadoAtual.indiceColuna, estadoAtual.direcao)
}
```

**Nota:** `ordenarTabelaPelaColuna` agora chama `reaplicarOrdemDaTabela` (definida no Step 4 abaixo) em vez de `aplicarOrdenacaoNaTabela` diretamente — por isso o `ultimoIndicePorTabela.delete(idTabela)` que estava dentro de `aplicarOrdenacaoNaTabela` foi removido daqui e passa a viver dentro de `reaplicarOrdemDaTabela`, centralizado (Step 4).

- [ ] **Step 4: Adicionar o módulo de agrupamento e `reaplicarOrdemDaTabela`**

Logo depois de `reaplicarOrdenacaoAtual` (função do Step 3 acima) e antes de `function montarOrdenacaoTabelas(): void {`, adicionar:

```ts
let criterioAgrupamentoAtivo: CriterioAgrupamento = 'nenhum'

const ROTULO_GRUPO_SEM_CHAVE = 'Sem Grupo'

function criarCabecalhoDeGrupo(idTabela: string, rotulo: string, quantidade: number): HTMLTableRowElement {
  const tabela = document.querySelector(idTabela)
  const colunas = tabela?.querySelectorAll('thead > tr > th').length ?? 1
  const tr = document.createElement('tr')
  tr.className = 'tableHeader infraCaption seirmg-cabecalho-grupo'
  const td = document.createElement('td')
  td.colSpan = colunas
  td.textContent = `${rotulo} (${quantidade} processo${quantidade === 1 ? '' : 's'})`
  tr.appendChild(td)
  return tr
}

function removerCabecalhosDeGrupo(idTabela: string): void {
  document.querySelectorAll(`${idTabela} tbody > tr.seirmg-cabecalho-grupo`).forEach((tr) => tr.remove())
}

function calcularOrdemDentroDoGrupo(idTabela: string, linhas: Element[]): Map<string, number> | undefined {
  const estadoOrdenacao = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoOrdenacao) return undefined

  const ordemIds = calcularOrdemIds(linhas, estadoOrdenacao.indiceColuna, estadoOrdenacao.direcao)
  return new Map(ordemIds.map((id, posicao) => [id, posicao]))
}

function extrairChaveDeAgrupamento(linha: Element, criterio: Exclude<CriterioAgrupamento, 'nenhum'>): string | null {
  if (criterio === 'responsavel') {
    return obterTextoAtribuido(linha)
  }

  const seletores: Record<Exclude<CriterioAgrupamento, 'nenhum' | 'responsavel'>, string> = {
    marcador: "td > a[href*='acao=andamento_marcador_gerenciar']",
    tipo: '.processoVisualizado, .processoNaoVisualizado',
    pontoControle: "td > a[href*='acao=andamento_situacao_gerenciar']",
  }
  const extratores: Record<
    Exclude<CriterioAgrupamento, 'nenhum' | 'responsavel'>,
    (onmouseover: string) => string
  > = {
    marcador: extrairNomeMarcador,
    tipo: extrairTipoProcesso,
    pontoControle: extrairTextoPontoControle,
  }

  const elemento = linha.querySelector<HTMLElement>(seletores[criterio])
  const onmouseover = elemento?.getAttribute('onmouseover')
  if (!onmouseover) return null

  return extratores[criterio](onmouseover) || null
}

function aplicarAgrupamento(idTabela: string, criterio: Exclude<CriterioAgrupamento, 'nenhum'>): void {
  removerCabecalhosDeGrupo(idTabela)

  const tabela = document.querySelector(idTabela)
  const tbody = tabela?.querySelector('tbody')
  if (!tabela || !tbody) return

  const linhas = linhasDaTabela(idTabela)
  const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))

  const linhasParaAgrupar: LinhaParaAgrupar[] = linhas.map((linha, index) => ({
    id: linha.id || String(index),
    chaveGrupo: extrairChaveDeAgrupamento(linha, criterio),
  }))

  const grupos = agruparLinhas(linhasParaAgrupar, calcularOrdemDentroDoGrupo(idTabela, linhas))

  grupos.forEach((grupo) => {
    tbody.appendChild(criarCabecalhoDeGrupo(idTabela, grupo.chaveGrupo ?? ROTULO_GRUPO_SEM_CHAVE, grupo.ids.length))
    grupo.ids.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })
  })
}

function ocultarCabecalhosDeGrupoVazios(idTabela: string): void {
  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  let cabecalhoAtual: HTMLElement | null = null
  let grupoTemLinhaVisivel = false

  const fecharGrupoAnterior = (): void => {
    if (cabecalhoAtual) cabecalhoAtual.style.display = grupoTemLinhaVisivel ? 'table-row' : 'none'
  }

  Array.from(tabela.querySelectorAll('tbody > tr')).forEach((linha) => {
    const linhaEl = linha as HTMLElement
    if (linhaEl.classList.contains('seirmg-cabecalho-grupo')) {
      fecharGrupoAnterior()
      cabecalhoAtual = linhaEl
      grupoTemLinhaVisivel = false
    } else if (linhaEl.style.display !== 'none') {
      grupoTemLinhaVisivel = true
    }
  })
  fecharGrupoAnterior()
}

function reaplicarOrdemDaTabela(idTabela: string): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const estado = estadoFiltrosPorTabela.get(idTabela) ?? {}
    const ids = linhas.map((linha, index) => linha.id || String(index))
    aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))

    const tabelaSuportaAgrupamento = idTabela === '#tblProcessosRecebidos' || idTabela === '#tblProcessosGerados'
    const criterio = criterioAgrupamentoAtivo
    if (tabelaSuportaAgrupamento && criterio !== 'nenhum') {
      aplicarAgrupamento(idTabela, criterio)
    } else {
      removerCabecalhosDeGrupo(idTabela)
      reaplicarOrdenacaoAtual(idTabela)
    }

    ocultarCabecalhosDeGrupoVazios(idTabela)
    ultimoIndicePorTabela.delete(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao reaplicar ordem da tabela:', error)
  }
}
```

**Nota:** `reaplicarOrdemDaTabela` referencia `aplicarVisibilidade`, `calcularVisibilidade`, `estadoFiltrosPorTabela`, `obterTextoAtribuido` e `ultimoIndicePorTabela`, todas definidas mais abaixo no arquivo (ou já acima, no caso de `estadoFiltrosPorTabela`). Isso é seguro: declarações de função em JavaScript são "hoisted" (disponíveis em todo o módulo independente de onde aparecem no arquivo) e as demais são `const`/`let` de nível de módulo já inicializadas antes de qualquer código rodar (`bootstrap()` só executa no fim do arquivo). `obterTextoAtribuido` é definida por volta da linha 428 — nenhuma mudança necessária nela.

- [ ] **Step 5: Rewire os 3 filtros para chamar `reaplicarOrdemDaTabela`**

Em `montarBuscaRapida`, trecho atual (dentro de `atualizar`):

```ts
          estadoFiltrosPorTabela.set(idTabela, estado)
          const ids = linhas.map((linha, index) => linha.id || String(index))
          aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
        })
      } catch (error) {
        console.error('[SEIRMG] Falha ao aplicar busca rápida:', error)
```

Substituir por:

```ts
          estadoFiltrosPorTabela.set(idTabela, estado)
          reaplicarOrdemDaTabela(idTabela)
        })
      } catch (error) {
        console.error('[SEIRMG] Falha ao aplicar busca rápida:', error)
```

Em `montarFiltroAtribuicao`, trecho atual (dentro de `aplicar`):

```ts
        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicar(select.value))
```

Substituir por:

```ts
        estadoFiltrosPorTabela.set(idTabela, estado)
        reaplicarOrdemDaTabela(idTabela)
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicar(select.value))
```

Em `montarFiltroBloco`, trecho atual (dentro de `aplicarFiltroBloco`):

```ts
        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicarFiltroBloco(ultimoNumerosBloco))
```

Substituir por:

```ts
        estadoFiltrosPorTabela.set(idTabela, estado)
        reaplicarOrdemDaTabela(idTabela)
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicarFiltroBloco(ultimoNumerosBloco))
```

**Nota:** nos 3 casos, a variável `linhas` (usada para montar `estado`, poucas linhas acima do trecho substituído) continua necessária para o cálculo do próprio `estado` — só a cauda (`ids`/`aplicarVisibilidade`) é substituída. Não remova a declaração de `linhas` em nenhum dos três.

- [ ] **Step 6: Remover a chamada de ordenação agora redundante em `reaplicarTratamentosNasLinhasNovas`**

Trecho atual (linhas 629-636):

```ts
function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdenacaoAtual(idTabela)
  linhas.forEach((linha) => desabilitarSelecaoNaLinha(linha))
}
```

Substituir por:

```ts
function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  // Cada callback de reaplicarFiltrosAposNovasLinhas já termina chamando reaplicarOrdemDaTabela
  // (Step 5) — os 3 filtros (busca/atribuição/bloco) sempre se registram aqui, então a
  // ordenação/agrupamento já é reaplicada por eles, sem precisar de uma chamada extra.
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  linhas.forEach((linha) => desabilitarSelecaoNaLinha(linha))
}
```

- [ ] **Step 7: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run typecheck && bun run lint && bun run build`
Expected: todos os testes continuam passando (264 — 251 antes deste plano + 12 (Task 1) + 1 (Task 2)), build/typecheck/lint sem erros. Nenhum teste novo nesta task — comportamento observável idêntico (`criterioAgrupamentoAtivo` ainda é sempre `'nenhum'`).

- [ ] **Step 8: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor(controle-processos): converge filters/sort into a single reapply function"
```

---

### Task 4: Seletor de agrupamento na página + wiring no bootstrap

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: task final de integração — liga o `<select>` visível na página ao `criterioAgrupamentoAtivo` (Task 3) e à persistência em `SyncConfig` (Task 2). Não é coberto por TDD (wiring de DOM) — verificado via build.

**Interfaces:**
- Consumes: `reaplicarOrdemDaTabela` (Task 3); `ControleProcessosConfig.agrupamento`/`CriterioAgrupamento` (Task 2)

- [ ] **Step 1: Adicionar `montarAgrupamento`**

Logo antes de `async function bootstrap(): Promise<void> {`, adicionar:

```ts
const ROTULOS_OPCAO_AGRUPAMENTO: Array<{ valor: CriterioAgrupamento; rotulo: string }> = [
  { valor: 'nenhum', rotulo: 'Sem agrupamento' },
  { valor: 'marcador', rotulo: 'Por marcador' },
  { valor: 'tipo', rotulo: 'Por tipo' },
  { valor: 'responsavel', rotulo: 'Por responsável' },
  { valor: 'pontoControle', rotulo: 'Por ponto de controle' },
]

const TABELAS_COM_AGRUPAMENTO = ['#tblProcessosRecebidos', '#tblProcessosGerados']

function montarAgrupamento(config: SyncConfig): void {
  try {
    const divFiltro = document.getElementById('divFiltro')
    if (!divFiltro) return

    criterioAgrupamentoAtivo = config.controleProcessos.agrupamento.criterio

    const select = document.createElement('select')
    select.id = 'seirmg-agrupamento-criterio'
    ROTULOS_OPCAO_AGRUPAMENTO.forEach(({ valor, rotulo }) => {
      select.appendChild(new Option(rotulo, valor))
    })
    select.value = criterioAgrupamentoAtivo

    select.addEventListener('change', () => {
      criterioAgrupamentoAtivo = select.value as CriterioAgrupamento
      TABELAS_COM_AGRUPAMENTO.forEach((idTabela) => reaplicarOrdemDaTabela(idTabela))

      createSyncConfigStore()
        .get()
        .then((atual) =>
          createSyncConfigStore().set({
            ...atual,
            controleProcessos: {
              ...atual.controleProcessos,
              agrupamento: { criterio: criterioAgrupamentoAtivo },
            },
          })
        )
        .catch((error) => {
          console.error('[SEIRMG] Falha ao salvar critério de agrupamento:', error)
        })
    })

    divFiltro.prepend(select)

    if (criterioAgrupamentoAtivo !== 'nenhum') {
      TABELAS_COM_AGRUPAMENTO.forEach((idTabela) => reaplicarOrdemDaTabela(idTabela))
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar agrupamento:', error)
  }
}
```

- [ ] **Step 2: Chamar `montarAgrupamento` no `bootstrap()`**

Trecho atual:

```ts
    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)

    if (config.controleProcessos.rolagemInfinita.ativo) {
```

Substituir por:

```ts
    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
    montarAgrupamento(config)

    if (config.controleProcessos.rolagemInfinita.ativo) {
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run typecheck && bun run lint && bun run build`
Expected: todos os testes continuam passando (264), build/typecheck/lint sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): wire grouping select into Controle de Processos page"
```

---

### Task 5: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 264 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes (nenhum manifest change neste lote).

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: extração pura (`extrairNomeMarcador`/`extrairTipoProcesso`/`extrairTextoPontoControle`/`agruparLinhas`, Task 1); config opt-in via `criterio` (Task 2, sem toggle de Opções, conforme decidido na spec); `reaplicarOrdemDaTabela` convergindo filtros+agrupamento+ordenação, cabeçalho com colspan dinâmico, ocultação de cabeçalho vazio, convivência com E3 (ordena dentro do grupo)/E3b (linhas novas reagrupadas via `reaplicarFiltrosAposNovasLinhas`) (Task 3); `<select>` na página + persistência em `SyncConfig` (Task 4); checagem final (Task 5). Todas as seções da spec têm task correspondente. Compatibilidade com seleção múltipla (spec seção 6) não exige nenhuma mudança de código — documentada como consequência do design (cabeçalhos de grupo sem checkbox, nós `<tr>` nunca clonados), verificável por leitura, não precisa de task própria.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `CriterioAgrupamento`/`LinhaParaAgrupar`/`GrupoOrdenado`/`agruparLinhas` (Task 1) consumidos identicamente pela Task 3 (`extrairChaveDeAgrupamento`, `aplicarAgrupamento`) e pela Task 4 (`ROTULOS_OPCAO_AGRUPAMENTO`, cast `as CriterioAgrupamento`). `AgrupamentoConfig`/`ControleProcessosConfig.agrupamento` (Task 2) consumidos identicamente por `montarAgrupamento` (Task 4). `reaplicarOrdemDaTabela` (Task 3) é o único ponto que os 4 gatilhos (3 filtros + `ordenarTabelaPelaColuna`, Task 3; `<select>` de agrupamento, Task 4) chamam — mesma assinatura (`idTabela: string`) em todos os usos.
4. **Contagem de testes**: 251 (baseline antes deste plano) + 12 (Task 1) + 1 (Task 2) = 264 testes esperados a partir da Task 2 em diante.
