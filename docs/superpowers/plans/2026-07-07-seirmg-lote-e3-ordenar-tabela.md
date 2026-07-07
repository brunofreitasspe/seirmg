# SEIRMG — Lote E3: Ordenar Tabelas de Controle de Processos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ordenação por clique no cabeçalho às três tabelas de Controle de Processos (`#tblProcessosRecebidos`, `#tblProcessosGerados`, `#tblProcessosDetalhado`), completando a parte de "ordenar" do item E3 do roteiro (a parte de "filtrar" já existe desde o Lote E).

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-e3-ordenar-tabela-design.md`. Lógica pura nova em `features/controle-processos/ordenarTabela.ts` (testada); wiring estende o content script já existente `content-scripts/procedimento_controlar/index.ts`.

**Tech Stack:** TypeScript, Vite, Bun, Vitest — mesma infraestrutura já existente. Sem dependência nova.

## Global Constraints

- Nenhum content script novo, nenhuma dependência nova (sem tablesorter, sem jQuery).
- Escopo: apenas as três tabelas já tratadas por `content-scripts/procedimento_controlar/index.ts` — nenhuma outra tabela do sistema.
- Sem persistência da ordenação entre reloads (mesma convenção da busca rápida já existente).
- Valores vazios sempre ordenam por último, independente da direção (asc ou desc).
- Ordenar não deve interferir nos filtros já ativos (busca rápida, atribuição, bloco) — mover `<tr>` no DOM preserva o `style.display` que os filtros já aplicaram.
- Todo listener/callback novo segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── features/controle-processos/
│   │   └── ordenarTabela.ts (+ .test.ts, novo)
│   └── content-scripts/procedimento_controlar/index.ts (modificado)
```

---

### Task 1: `features/controle-processos/ordenarTabela.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\ordenarTabela.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\ordenarTabela.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces:
  - `type TipoColuna = 'texto' | 'numero' | 'data'`
  - `detectarTipoColuna(valores: string[]): TipoColuna`
  - `compararValores(a: string, b: string, tipo: TipoColuna): number`
  - `ordenarIds(linhas: Array<{ id: string; valor: string }>, tipo: TipoColuna, direcao: 'asc' | 'desc'): string[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/controle-processos/ordenarTabela.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compararValores, detectarTipoColuna, ordenarIds } from './ordenarTabela'

describe('detectarTipoColuna', () => {
  it('retorna numero quando todos os valores são numéricos', () => {
    expect(detectarTipoColuna(['10', '2', '33'])).toBe('numero')
  })

  it('retorna data quando todos os valores batem dd/mm/yyyy', () => {
    expect(detectarTipoColuna(['01/01/2026', '15/03/2025'])).toBe('data')
  })

  it('retorna texto quando os valores não são numéricos nem datas', () => {
    expect(detectarTipoColuna(['Processo A', 'Processo B'])).toBe('texto')
  })

  it('ignora valores vazios ao detectar o tipo numero', () => {
    expect(detectarTipoColuna(['10', '', '5'])).toBe('numero')
  })

  it('retorna texto quando não há nenhum valor não vazio', () => {
    expect(detectarTipoColuna(['', ''])).toBe('texto')
  })

  it('retorna texto quando os valores misturam número e texto', () => {
    expect(detectarTipoColuna(['10', 'abc'])).toBe('texto')
  })
})

describe('compararValores', () => {
  it('compara números numericamente, não como string', () => {
    expect(compararValores('2', '10', 'numero')).toBeLessThan(0)
  })

  it('trata vírgula como separador decimal em numero', () => {
    expect(compararValores('1,5', '1,20', 'numero')).toBeGreaterThan(0)
  })

  it('compara datas dd/mm/yyyy pela data real, não pela string', () => {
    expect(compararValores('01/01/2026', '15/03/2025', 'data')).toBeGreaterThan(0)
  })

  it('compara texto por ordem alfabética', () => {
    expect(compararValores('Ana', 'Bruno', 'texto')).toBeLessThan(0)
  })

  it('ordena valor vazio depois de valor não vazio', () => {
    expect(compararValores('', 'Ana', 'texto')).toBeGreaterThan(0)
  })

  it('ordena valor não vazio antes de valor vazio', () => {
    expect(compararValores('Ana', '', 'texto')).toBeLessThan(0)
  })

  it('considera dois valores vazios iguais', () => {
    expect(compararValores('', '', 'texto')).toBe(0)
  })
})

describe('ordenarIds', () => {
  it('ordena ascendente por tipo numero', () => {
    const linhas = [
      { id: 'a', valor: '10' },
      { id: 'b', valor: '2' },
    ]
    expect(ordenarIds(linhas, 'numero', 'asc')).toEqual(['b', 'a'])
  })

  it('ordena descendente por tipo numero', () => {
    const linhas = [
      { id: 'a', valor: '10' },
      { id: 'b', valor: '2' },
    ]
    expect(ordenarIds(linhas, 'numero', 'desc')).toEqual(['a', 'b'])
  })

  it('mantém valores vazios sempre por último, mesmo em ordem descendente', () => {
    const linhas = [
      { id: 'a', valor: '10' },
      { id: 'b', valor: '' },
      { id: 'c', valor: '2' },
    ]
    expect(ordenarIds(linhas, 'numero', 'desc')).toEqual(['a', 'c', 'b'])
  })

  it('retorna lista vazia para entrada vazia', () => {
    expect(ordenarIds([], 'texto', 'asc')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/ordenarTabela.test.ts`
Expected: FAIL — `Cannot find module './ordenarTabela'`

- [ ] **Step 3: Implementar `src/features/controle-processos/ordenarTabela.ts`**

```ts
export type TipoColuna = 'texto' | 'numero' | 'data'

const REGEX_NUMERO = /^-?\d+([.,]\d+)?$/
const REGEX_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/

export function detectarTipoColuna(valores: string[]): TipoColuna {
  const naoVazios = valores.map((valor) => valor.trim()).filter((valor) => valor !== '')
  if (naoVazios.length === 0) return 'texto'

  if (naoVazios.every((valor) => REGEX_NUMERO.test(valor))) return 'numero'
  if (naoVazios.every((valor) => REGEX_DATA.test(valor))) return 'data'
  return 'texto'
}

function normalizarNumero(valor: string): number {
  return Number(valor.replace(',', '.'))
}

function normalizarData(valor: string): string {
  const match = valor.match(REGEX_DATA)
  if (!match) return valor
  const [, dia, mes, ano] = match
  return `${ano}-${mes}-${dia}`
}

export function compararValores(a: string, b: string, tipo: TipoColuna): number {
  const aVazio = a.trim() === ''
  const bVazio = b.trim() === ''
  if (aVazio && bVazio) return 0
  if (aVazio) return 1
  if (bVazio) return -1

  switch (tipo) {
    case 'numero':
      return normalizarNumero(a) - normalizarNumero(b)
    case 'data':
      return normalizarData(a).localeCompare(normalizarData(b))
    case 'texto':
      return a.localeCompare(b, 'pt-BR')
  }
}

export function ordenarIds(
  linhas: Array<{ id: string; valor: string }>,
  tipo: TipoColuna,
  direcao: 'asc' | 'desc'
): string[] {
  const ordenadas = [...linhas].sort((x, y) => compararValores(x.valor, y.valor, tipo))

  if (direcao === 'desc') {
    const vazias = ordenadas.filter((linha) => linha.valor.trim() === '')
    const naoVazias = ordenadas.filter((linha) => linha.valor.trim() !== '').reverse()
    return [...naoVazias, ...vazias].map((linha) => linha.id)
  }

  return ordenadas.map((linha) => linha.id)
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/ordenarTabela.test.ts`
Expected: PASS (17 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/ordenarTabela.ts src/features/controle-processos/ordenarTabela.test.ts
git commit -m "feat(controle-processos): add column type detection and row ordering for table sort"
```

---

### Task 2: Wiring em `content-scripts/procedimento_controlar/index.ts`

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: wiring fino, conecta DOM à lógica pura da Task 1. Não é coberto por TDD — verificado via build, seguindo a mesma convenção já usada nesse arquivo para `montarBuscaRapida`, `montarSelecaoMultipla` etc.

**Interfaces:**
- Consumes: `detectarTipoColuna`, `ordenarIds` (Task 1); `IDS_TABELAS`, `linhasDaTabela` (já existentes no arquivo)

- [ ] **Step 1: Adicionar o import no topo do arquivo**

Localizar o bloco de imports atual (linhas 1-28) e adicionar, junto aos demais imports de `../../features/controle-processos/`:

```ts
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
```

- [ ] **Step 2: Adicionar o estado de ordenação e a função de wiring**

Localizar a declaração de `estadoFiltrosPorTabela` (linha 164):

```ts
const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()
```

Adicionar logo abaixo dela (antes de `atualizarCaption`):

```ts
const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()

interface EstadoOrdenacao {
  indiceColuna: number
  direcao: 'asc' | 'desc'
}

const estadoOrdenacaoPorTabela = new Map<string, EstadoOrdenacao>()

function limparIndicadoresOrdenacao(headers: HTMLTableCellElement[]): void {
  headers.forEach((th) => {
    th.querySelector('.seirmg-indicador-ordenacao')?.remove()
  })
}

function aplicarIndicadorOrdenacao(th: HTMLTableCellElement, direcao: 'asc' | 'desc'): void {
  const span = document.createElement('span')
  span.className = 'seirmg-indicador-ordenacao'
  span.textContent = direcao === 'asc' ? ' ▲' : ' ▼'
  th.appendChild(span)
}

function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  try {
    const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
    const direcao: 'asc' | 'desc' =
      estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
    estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })

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
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function montarOrdenacaoTabelas(): void {
  try {
    IDS_TABELAS.forEach((idTabela) => {
      const tabela = document.querySelector(idTabela)
      if (!tabela) return

      const headers = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead > tr > th'))
      headers.forEach((th, indiceColuna) => {
        if (!th.textContent?.trim()) return

        th.style.cursor = 'pointer'
        th.addEventListener('click', () => {
          ordenarTabelaPelaColuna(idTabela, indiceColuna, headers)
        })
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar ordenação de tabelas:', error)
  }
}
```

- [ ] **Step 3: Chamar `montarOrdenacaoTabelas()` no `bootstrap()`**

Trecho atual (linhas 479-495):

```ts
async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}
```

Substituir por:

```ts
async function bootstrap(): Promise<void> {
  try {
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
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}
```

**Nota:** `montarOrdenacaoTabelas()` precisa rodar depois de `corrigirTabelasNativas()` (que cria o `<thead>` a partir da primeira linha do `<tbody>`) — sem isso, o seletor `thead > tr > th` não encontraria nenhum cabeçalho.

- [ ] **Step 4: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (237 testes no total — 220 antes deste plano + 17 da Task 1)

- [ ] **Step 5: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): wire click-to-sort on table headers"
```

---

### Task 3: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 237 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `detectarTipoColuna`/`compararValores`/`ordenarIds` (Task 1) cobrem os três tipos de coluna e a regra de vazio-sempre-por-último descritos na spec. Wiring (Task 2) cobre clique no cabeçalho, toggle asc/desc, reset ao trocar de coluna, indicador visual, preservação dos filtros ativos (via `tbody.appendChild` que só move o nó, não recria — o `style.display` já aplicado pelos filtros permanece). Escopo restrito às três tabelas de Controle de Processos, sem persistência entre reloads — ambos conforme a seção "Fora de escopo" da spec.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `TipoColuna`, `detectarTipoColuna`, `ordenarIds` (Task 1) usados identicamente pelo wiring (Task 2). Assinatura de `ordenarIds` (`linhas`, `tipo`, `direcao`) idêntica em ambas as tasks.
4. **Contagem de testes**: 220 (baseline antes deste plano) + 6 (`detectarTipoColuna`) + 7 (`compararValores`) + 4 (`ordenarIds`) = 237 testes esperados ao final da Task 2 em diante.
