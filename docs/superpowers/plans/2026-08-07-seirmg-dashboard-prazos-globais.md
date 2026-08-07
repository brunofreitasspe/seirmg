# Dashboard: aba Prazos mostra todos os processos com prazo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Prazos do Dashboard passa a listar todo processo com prazo definido no SEI já visto no Controle
de Processos (favoritado ou não), em vez de só favoritos.

**Architecture:** Novo campo `LocalConfig.snapshotPrazosProcessos` acumula, por número de processo, o prazo
visto na última passagem pelo Controle de Processos (captura opt-in gated por `dashboard.ativo && prazos.ativo`,
sem expiração por tempo — só sai da lista quando revisitado sem prazo). Reaproveita extração já existente
(`extrairFavoritoDaLinha`) e move `obterControleDePrazoDaLinha` de privada em `procedimento_controlar/index.ts`
para pública em `features/controle-processos/prazos.ts`. Lógica de merge (upsert/remove) é um módulo puro novo
testável em `features/dashboard/snapshotPrazos.ts`. `dashboard/main.ts` troca a fonte de dados da aba Prazos.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Vitest (com `happy-dom`/jsdom via `DOMParser` já usado
nos testes existentes), sem framework de UI.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-07-seirmg-dashboard-prazos-globais-design.md`.
- Sem expiração por tempo — só remove a entrada quando o processo for revisitado no Controle de Processos e
  não tiver mais prazo (`obterControleDePrazoDaLinha` retornar `null`).
- Captura gated por `config.dashboard?.ativo && config.controleProcessos.prazos.ativo` (as duas).
- `snapshotPrazosProcessos` vive em `LocalConfig` (local, não sync) — mesmo raciocínio de `historicoEventos`.
- Não altera o mecanismo de `ultimoSnapshot` de favoritos nem a aba Favoritos do Dashboard, exceto a extração de
  `montarCelulaAbrirProcesso` (renomeação/generalização de `montarCelulaAbrirFavorito`, comportamento idêntico).
- Todo comando de verificação roda a partir de `C:\sei\seirmg\.claude\worktrees\seirmg-dashboard`.

---

### Task 1: Tipo `SnapshotPrazoProcesso` e campo em `LocalConfig`

**Files:**
- Modify: `src/lib/storage.ts:66-83` (perto de `SnapshotFavorito`/`FavoritoProcesso`)
- Modify: `src/lib/storage.ts:234-257` (interface `LocalConfig`)
- Modify: `src/lib/storage.ts:347-356` (`DEFAULT_LOCAL_CONFIG`)

**Interfaces:**
- Produces: `SnapshotPrazoProcesso { numero: string; especificacao?: string; link: string | null;
  prazoDataTexto: string; vistoEm: string }`, `LocalConfig.snapshotPrazosProcessos: SnapshotPrazoProcesso[]`.

Sem teste dedicado novo — é só schema; a suíte existente `storage.test.ts` já cobre
`DEFAULT_LOCAL_CONFIG`/round-trip via `retorna a configuração padrão quando vazio` e continua passando com o
campo novo (default `[]`).

- [ ] **Step 1: Adicionar a interface `SnapshotPrazoProcesso`**

Em `src/lib/storage.ts`, logo depois da interface `FavoritoProcesso` (que termina em `export interface
FavoritoProcesso { ... }`), adicione:

```ts
export interface SnapshotPrazoProcesso {
  numero: string
  especificacao?: string
  link: string | null
  prazoDataTexto: string
  vistoEm: string // ISO — informativo, não usado para expirar nada
}
```

- [ ] **Step 2: Adicionar o campo em `LocalConfig`**

Na interface `LocalConfig`, logo abaixo da linha `historicoEventos: EventoHistorico[]`, adicione:

```ts
  snapshotPrazosProcessos: SnapshotPrazoProcesso[]
```

- [ ] **Step 3: Adicionar o default em `DEFAULT_LOCAL_CONFIG`**

Em `DEFAULT_LOCAL_CONFIG`, logo abaixo da linha `historicoEventos: [],`, adicione:

```ts
  snapshotPrazosProcessos: [],
```

- [ ] **Step 4: Verificar tipos e suíte existente**

Run: `bun run typecheck`
Expected: sem erros.

Run: `bun run test -- storage.test.ts`
Expected: todos os testes de `storage.test.ts` continuam passando (o novo campo entra no objeto default
comparado por `toEqual`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: adiciona SnapshotPrazoProcesso e LocalConfig.snapshotPrazosProcessos"
```

---

### Task 2: Extrair `obterControleDePrazoDaLinha` para `features/controle-processos/prazos.ts`

**Files:**
- Modify: `src/features/controle-processos/prazos.ts` (adicionar ao final)
- Modify: `src/features/controle-processos/prazos.test.ts` (adicionar testes)
- Modify: `src/content-scripts/procedimento_controlar/index.ts:1-5` (import), `:810-828` (remover definição local)

**Interfaces:**
- Produces: `export interface ControleDePrazoFavorito { dataTexto: string; diasTexto: string; iconeHtml: string
  }`, `export function obterControleDePrazoDaLinha(linha: Element): ControleDePrazoFavorito | null` — ambos
  agora exportados de `features/controle-processos/prazos.ts` (comportamento idêntico ao que já existia,
  privado, em `procedimento_controlar/index.ts`).

- [ ] **Step 1: Escrever os testes (falhando) em `prazos.test.ts`**

No topo do arquivo, troque o import:

```ts
import { describe, expect, it } from 'vitest'
import {
  calcularDiasAteVencimento,
  classificarPrazo,
  extrairTextoMarcador,
  formatarDataBr,
  formatarDiasRestantes,
  isValidDate,
  obterControleDePrazoDaLinha,
} from './prazos'
```

No final do arquivo (depois do último `describe('formatarDiasRestantes', ...)`), adicione:

```ts
function criarLinhaComPrazo(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

describe('obterControleDePrazoDaLinha', () => {
  it('extrai data, dias e ícone de uma linha com controle de prazo', () => {
    const linha = criarLinhaComPrazo(
      `<td><a href="controlador.php?acao=controle_prazo_definir&id=1" onmouseover="return infraTooltipMostrar('15/08/2026 (10 dias)','Detalhe')"><img src="prazo.gif"></a></td>`
    )
    expect(obterControleDePrazoDaLinha(linha)).toEqual({
      dataTexto: '15/08/2026',
      diasTexto: '10 dias',
      iconeHtml: '<img src="prazo.gif">',
    })
  })

  it('retorna null quando a linha não tem link de controle de prazo', () => {
    const linha = criarLinhaComPrazo('<td>sem prazo</td>')
    expect(obterControleDePrazoDaLinha(linha)).toBeNull()
  })

  it('retorna null quando o link não tem onmouseover', () => {
    const linha = criarLinhaComPrazo('<td><a href="controlador.php?acao=controle_prazo_definir&id=1"></a></td>')
    expect(obterControleDePrazoDaLinha(linha)).toBeNull()
  })

  it('retorna null quando o texto do onmouseover não casa com o formato esperado', () => {
    const linha = criarLinhaComPrazo(
      `<td><a href="controlador.php?acao=controle_prazo_definir&id=1" onmouseover="return infraTooltipMostrar('texto sem data','Detalhe')"></a></td>`
    )
    expect(obterControleDePrazoDaLinha(linha)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test -- prazos.test.ts`
Expected: FAIL — `obterControleDePrazoDaLinha` não existe em `./prazos` (erro de import/tipo).

- [ ] **Step 3: Mover a função para `prazos.ts`**

No final de `src/features/controle-processos/prazos.ts` (depois de `formatarDiasRestantes`), adicione:

```ts
export interface ControleDePrazoFavorito {
  dataTexto: string
  diasTexto: string
  iconeHtml: string
}

export function obterControleDePrazoDaLinha(linha: Element): ControleDePrazoFavorito | null {
  const link = linha.querySelector<HTMLAnchorElement>("td > a[href*='acao=controle_prazo_definir']")
  if (!link) return null

  const onmouseover = link.getAttribute('onmouseover')
  if (!onmouseover) return null

  const texto = extrairTextoMarcador(onmouseover)
  const match = texto.match(/(\d{2}\/\d{2}\/\d{4})\s*\((.+)\)/)
  if (!match) return null

  return { dataTexto: match[1], diasTexto: match[2], iconeHtml: link.innerHTML }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test -- prazos.test.ts`
Expected: PASS — todos os testes, incluindo os 4 novos.

- [ ] **Step 5: Remover a definição local em `procedimento_controlar/index.ts` e importar do módulo**

No topo do arquivo, o import de `../../features/controle-processos/prazos` (linhas 1-5) vira:

```ts
import {
  calcularDiasAteVencimento,
  classificarPrazo,
  extrairTextoMarcador,
  obterControleDePrazoDaLinha,
} from '../../features/controle-processos/prazos'
```

Em seguida, localize e **apague** este bloco (por volta da linha 810-828, logo antes de
`function capturarSnapshotDaLinha`):

```ts
interface ControleDePrazoFavorito {
  dataTexto: string
  diasTexto: string
  iconeHtml: string
}

function obterControleDePrazoDaLinha(linha: Element): ControleDePrazoFavorito | null {
  const link = linha.querySelector<HTMLAnchorElement>("td > a[href*='acao=controle_prazo_definir']")
  if (!link) return null

  const onmouseover = link.getAttribute('onmouseover')
  if (!onmouseover) return null

  const texto = extrairTextoMarcador(onmouseover)
  const match = texto.match(/(\d{2}\/\d{2}\/\d{4})\s*\((.+)\)/)
  if (!match) return null

  return { dataTexto: match[1], diasTexto: match[2], iconeHtml: link.innerHTML }
}
```

(As duas outras chamadas de `obterControleDePrazoDaLinha` no arquivo, em `aplicarPrazoNaLinha` e
`montarCelulaPrazo`, continuam iguais — só passam a resolver pro import em vez da definição local.)

- [ ] **Step 6: Verificar tipos e build**

Run: `bun run typecheck`
Expected: sem erros (nenhuma referência solta a `obterControleDePrazoDaLinha`/`ControleDePrazoFavorito` locais).

Run: `bun run test`
Expected: toda a suíte passa (nenhum teste existente dependia da função ser privada).

- [ ] **Step 7: Commit**

```bash
git add src/features/controle-processos/prazos.ts src/features/controle-processos/prazos.test.ts src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor: extrai obterControleDePrazoDaLinha para features/controle-processos/prazos.ts"
```

---

### Task 3: Módulo puro `features/dashboard/snapshotPrazos.ts`

**Files:**
- Create: `src/features/dashboard/snapshotPrazos.ts`
- Create: `src/features/dashboard/snapshotPrazos.test.ts`

**Interfaces:**
- Consumes: `SnapshotPrazoProcesso` de `../../lib/storage` (Task 1).
- Produces: `export interface LinhaVisivelComPrazo { numero: string; prazoDataTexto: string | null;
  especificacao?: string; link: string | null }`, `export function atualizarSnapshotPrazos(atuais:
  SnapshotPrazoProcesso[], linhasVisiveis: LinhaVisivelComPrazo[], agoraIso: string): { itens:
  SnapshotPrazoProcesso[]; mudou: boolean }` — usado por Task 4 (captura no content script) e indiretamente
  pelos dados que Task 5 (Dashboard) lê de `LocalConfig.snapshotPrazosProcessos`.

- [ ] **Step 1: Escrever o teste (falhando)**

Crie `src/features/dashboard/snapshotPrazos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { atualizarSnapshotPrazos, type LinhaVisivelComPrazo } from './snapshotPrazos'
import type { SnapshotPrazoProcesso } from '../../lib/storage'

const AGORA = '2026-08-07T10:00:00.000Z'

describe('atualizarSnapshotPrazos', () => {
  it('adiciona uma entrada nova quando a linha visível tem prazo e não existe entrada anterior', () => {
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotPrazos([], linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('atualiza uma entrada existente quando o prazo mudou', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '20/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', prazoDataTexto: '20/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('não marca mudou quando a linha visível tem exatamente os mesmos dados já salvos', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('remove a entrada quando a linha revisitada não tem mais prazo', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [{ numero: 'HMMG.1', prazoDataTexto: null, especificacao: 'Aquisição', link: 'controlador.php?id=1' }]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([])
  })

  it('não mexe em uma entrada cujo processo não aparece nas linhas visíveis desta página', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, [], AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('lida com lista de entradas atuais vazia e nenhuma linha visível sem quebrar', () => {
    const resultado = atualizarSnapshotPrazos([], [], AGORA)
    expect(resultado).toEqual({ itens: [], mudou: false })
  })

  it('mistura adição, atualização, remoção e entrada intocada numa única chamada', () => {
    const atuais: SnapshotPrazoProcesso[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.2', prazoDataTexto: '10/08/2026', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.3', prazoDataTexto: '01/08/2026', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComPrazo[] = [
      { numero: 'HMMG.1', prazoDataTexto: '15/08/2026', link: null },
      { numero: 'HMMG.2', prazoDataTexto: null, link: null },
      { numero: 'HMMG.4', prazoDataTexto: '25/08/2026', link: null },
    ]
    const resultado = atualizarSnapshotPrazos(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    const porNumero = new Map(resultado.itens.map((item) => [item.numero, item]))
    expect(porNumero.get('HMMG.1')).toEqual(atuais[0])
    expect(porNumero.has('HMMG.2')).toBe(false)
    expect(porNumero.get('HMMG.3')).toEqual(atuais[2])
    expect(porNumero.get('HMMG.4')).toEqual({ numero: 'HMMG.4', prazoDataTexto: '25/08/2026', link: null, vistoEm: AGORA })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- snapshotPrazos.test.ts`
Expected: FAIL — `./snapshotPrazos` não existe.

- [ ] **Step 3: Implementar `snapshotPrazos.ts`**

Crie `src/features/dashboard/snapshotPrazos.ts`:

```ts
import type { SnapshotPrazoProcesso } from '../../lib/storage'

export interface LinhaVisivelComPrazo {
  numero: string
  prazoDataTexto: string | null
  especificacao?: string
  link: string | null
}

export function atualizarSnapshotPrazos(
  atuais: SnapshotPrazoProcesso[],
  linhasVisiveis: LinhaVisivelComPrazo[],
  agoraIso: string
): { itens: SnapshotPrazoProcesso[]; mudou: boolean } {
  const porNumero = new Map(atuais.map((item) => [item.numero, item]))
  let mudou = false

  linhasVisiveis.forEach((linha) => {
    if (linha.prazoDataTexto) {
      const existente = porNumero.get(linha.numero)
      const igual =
        existente !== undefined &&
        existente.prazoDataTexto === linha.prazoDataTexto &&
        existente.especificacao === linha.especificacao &&
        existente.link === linha.link
      if (igual) return

      mudou = true
      porNumero.set(linha.numero, {
        numero: linha.numero,
        especificacao: linha.especificacao,
        link: linha.link,
        prazoDataTexto: linha.prazoDataTexto,
        vistoEm: agoraIso,
      })
    } else if (porNumero.has(linha.numero)) {
      porNumero.delete(linha.numero)
      mudou = true
    }
  })

  return { itens: Array.from(porNumero.values()), mudou }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- snapshotPrazos.test.ts`
Expected: PASS — todos os 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/snapshotPrazos.ts src/features/dashboard/snapshotPrazos.test.ts
git commit -m "feat: módulo puro atualizarSnapshotPrazos (merge/upsert/remove de prazos globais)"
```

---

### Task 4: Capturar o snapshot global no content script de Controle de Processos

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts` (novo import, nova função, nova chamada em
  `bootstrap()`)

**Interfaces:**
- Consumes: `atualizarSnapshotPrazos`, `type LinhaVisivelComPrazo` de `../../features/dashboard/snapshotPrazos`
  (Task 3); `extrairFavoritoDaLinha` (já importado, `../../features/controle-processos/favoritos`);
  `obterControleDePrazoDaLinha` (já importado após Task 2); `createLocalConfigStore` (já importado,
  `../../lib/storage`).
- Produces: grava/atualiza `LocalConfig.snapshotPrazosProcessos` toda vez que `bootstrap()` roda com
  `dashboard.ativo && controleProcessos.prazos.ativo`.

Sem teste automatizado — wiring de content script, mesmo padrão já estabelecido no projeto (verificado via
`tsc --noEmit`/build e validação manual numa instância SEI real).

- [ ] **Step 1: Adicionar o import**

No topo de `src/content-scripts/procedimento_controlar/index.ts`, logo abaixo do import de
`../../features/controle-processos/favoritosExportar` (que termina com `} from
'../../features/controle-processos/favoritosExportar'`), adicione:

```ts
import { atualizarSnapshotPrazos, type LinhaVisivelComPrazo } from '../../features/dashboard/snapshotPrazos'
```

- [ ] **Step 2: Implementar `capturarSnapshotGlobalDePrazos`**

Logo depois da função `construirSnapshotsPorNumero` (que termina com `return mapa }`), adicione:

```ts
async function capturarSnapshotGlobalDePrazos(linhas: Element[]): Promise<void> {
  const agoraIso = new Date().toISOString()

  const linhasVisiveis: LinhaVisivelComPrazo[] = linhas
    .map((linha) => {
      const favorito = extrairFavoritoDaLinha(linha, agoraIso)
      if (!favorito) return null
      const prazo = obterControleDePrazoDaLinha(linha)
      const resultado: LinhaVisivelComPrazo = {
        numero: favorito.numero,
        prazoDataTexto: prazo?.dataTexto ?? null,
        especificacao: favorito.especificacao,
        link: favorito.link,
      }
      return resultado
    })
    .filter((linha): linha is LinhaVisivelComPrazo => linha !== null)

  const localConfig = await createLocalConfigStore().get()
  const resultado = atualizarSnapshotPrazos(localConfig.snapshotPrazosProcessos ?? [], linhasVisiveis, agoraIso)
  if (!resultado.mudou) return

  await createLocalConfigStore().set({ ...localConfig, snapshotPrazosProcessos: resultado.itens })
}
```

- [ ] **Step 3: Chamar a função em `bootstrap()`**

Em `bootstrap()`, logo depois do bloco:

```ts
    const todasAsLinhas = IDS_TABELAS.flatMap((idTabela) => linhasDaTabela(idTabela))
    aplicarEstrelasEmLinhas(todasAsLinhas)
    aplicarFiltroFavoritoEmTodasAsTabelas()
    renderizarPainelFavoritos()
```

adicione:

```ts

    if (config.dashboard?.ativo && config.controleProcessos.prazos.ativo) {
      capturarSnapshotGlobalDePrazos(todasAsLinhas).catch((error) => {
        console.error('[SEIRMG] Falha ao capturar snapshot global de prazos:', error)
      })
    }
```

(Fire-and-forget com `.catch`, mesmo padrão já usado logo abaixo para `aplicarLinksPlankaEmLinhas` — não
bloqueia o resto do `bootstrap()` numa escrita de storage local.)

- [ ] **Step 4: Verificar tipos e suíte**

Run: `bun run typecheck`
Expected: sem erros.

Run: `bun run test`
Expected: toda a suíte passa (nenhum teste cobre `bootstrap()` diretamente).

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat: captura snapshot global de prazos (favoritados ou não) no Controle de Processos"
```

---

### Task 5: Aba Prazos do Dashboard lê o snapshot global

**Files:**
- Modify: `src/dashboard/main.ts`

**Interfaces:**
- Consumes: `type SnapshotPrazoProcesso` de `../lib/storage`; `createLocalConfigStore` (já importado);
  `calcularDiasAteVencimento`, `classificarPrazo`, `formatarDiasRestantes` (já importados de
  `../features/controle-processos/prazos`); `extrairIdProcedimentoDoLink` (já importado de
  `../features/controle-processos/favoritos`).

Sem teste automatizado — renderização de DOM na página do Dashboard, mesmo padrão já estabelecido pras outras 3
abas. Verificado via `tsc --noEmit`, `bun run build`, e validação manual (favoritar/desfavoritar um processo com
prazo, revisitar o Controle de Processos, abrir o Dashboard).

- [ ] **Step 1: Importar `SnapshotPrazoProcesso`**

No topo de `src/dashboard/main.ts`, troque:

```ts
import type { EventoHistorico, FavoritoProcesso } from '../lib/storage'
```

por:

```ts
import type { EventoHistorico, FavoritoProcesso, SnapshotPrazoProcesso } from '../lib/storage'
```

- [ ] **Step 2: Generalizar `montarCelulaAbrirFavorito` para `montarCelulaAbrirProcesso`**

Troque a função (usada hoje só pela aba Favoritos):

```ts
function montarCelulaAbrirFavorito(item: FavoritoProcesso, baseUrlSei: string | undefined): HTMLTableCellElement {
  const td = document.createElement('td')
  const id = extrairIdProcedimentoDoLink(item.link)
  if (id && baseUrlSei) {
    const link = document.createElement('a')
    link.className = 'link-abrir'
    link.href = `${baseUrlSei}/controlador.php?acao=procedimento_trabalhar&id_procedimento=${id}`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Abrir ↗'
    td.appendChild(link)
  }
  return td
}
```

por:

```ts
function montarCelulaAbrirProcesso(link: string | null, baseUrlSei: string | undefined): HTMLTableCellElement {
  const td = document.createElement('td')
  const id = extrairIdProcedimentoDoLink(link)
  if (id && baseUrlSei) {
    const linkEl = document.createElement('a')
    linkEl.className = 'link-abrir'
    linkEl.href = `${baseUrlSei}/controlador.php?acao=procedimento_trabalhar&id_procedimento=${id}`
    linkEl.target = '_blank'
    linkEl.rel = 'noopener noreferrer'
    linkEl.textContent = 'Abrir ↗'
    td.appendChild(linkEl)
  }
  return td
}
```

E, na função `renderizarFavoritos`, troque a linha que chama a função antiga:

```ts
      tr.appendChild(montarCelulaAbrirFavorito(item, localConfig.baseUrlSei))
```

por:

```ts
      tr.appendChild(montarCelulaAbrirProcesso(item.link, localConfig.baseUrlSei))
```

- [ ] **Step 3: Reescrever `renderizarPrazos`**

Substitua a função inteira (de `async function renderizarPrazos(): Promise<void> {` até o `}` que a fecha,
logo antes de `renderizarPrazos().catch(...)`) por:

```ts
async function renderizarPrazos(): Promise<void> {
  const view = document.getElementById('view-prazos')
  if (!view) return

  const config = await createSyncConfigStore().get()
  const localConfig = await createLocalConfigStore().get()
  const limites = { alerta: config.controleProcessos.prazos.alerta, critico: config.controleProcessos.prazos.critico }
  const agora = new Date()

  const itens = (localConfig.snapshotPrazosProcessos ?? [])
    .map((item) => {
      const dias = calcularDiasAteVencimento(item.prazoDataTexto, agora)
      if (dias === null) return null
      const emAlerta = dias < 0 || classificarPrazo(dias, limites) !== null
      return emAlerta ? { item, dias } : null
    })
    .filter((valor): valor is { item: SnapshotPrazoProcesso; dias: number } => valor !== null)
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
    vazio.textContent = 'Nenhum processo com prazo em alerta, crítico ou vencido.'
    painel.appendChild(vazio)
  } else {
    const tabela = document.createElement('table')
    tabela.className = 'tabela-dash'
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Processo</th><th>Especificação</th><th>Prazo</th><th>Situação</th><th></th></tr>'
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    itens.forEach(({ item, dias }) => {
      const tr = document.createElement('tr')

      const tdNumero = document.createElement('td')
      tdNumero.textContent = item.numero
      tr.appendChild(tdNumero)

      const tdEspecificacao = document.createElement('td')
      tdEspecificacao.textContent = item.especificacao ?? '—'
      tr.appendChild(tdEspecificacao)

      const tdData = document.createElement('td')
      tdData.textContent = item.prazoDataTexto
      tr.appendChild(tdData)

      const tdSituacao = document.createElement('td')
      tdSituacao.appendChild(montarBadgePrazo(dias, limites))
      tr.appendChild(tdSituacao)

      tr.appendChild(montarCelulaAbrirProcesso(item.link, localConfig.baseUrlSei))

      tbody.appendChild(tr)
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)
  }

  view.appendChild(painel)
}
```

- [ ] **Step 4: Verificar tipos e build**

Run: `bun run typecheck`
Expected: sem erros.

Run: `bun run build`
Expected: build conclui sem erros (confirma que o Dashboard empacota certo com o import novo).

Run: `bun run test`
Expected: toda a suíte passa.

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/main.ts
git commit -m "feat: aba Prazos do Dashboard lê snapshotPrazosProcessos (todos os processos, não só favoritos)"
```

---

### Task 6: Verificação final e validação manual

**Files:** nenhum (só comandos e checklist manual)

- [ ] **Step 1: Rodar a suíte completa**

Run: `bun run typecheck && bun run test && bun run build`
Expected: os três passam sem erro.

- [ ] **Step 2: Checklist de validação manual numa instância SEI real**

1. Nas Opções, confirme que "Ativar Dashboard" (aba Geral) e "Ativar cálculo de prazos" (aba Processos) estão
   ligados.
2. Abra o Controle de Processos numa unidade com pelo menos um processo com prazo definido que **não** esteja
   favoritado.
3. Abra o Dashboard (popup → "Abrir Dashboard") e confira que esse processo aparece na aba Prazos (se estiver
   em alerta/crítico/vencido conforme os limites configurados), com um link "Abrir" funcional.
4. No SEI, remova o prazo desse processo (Controle de Prazo → remover), volte pro Controle de Processos pra
   revisitar a linha, reabra o Dashboard e confirme que o processo **sumiu** da aba Prazos.
5. Confirme que a aba Favoritos do Dashboard continua funcionando exatamente como antes (nenhuma regressão).

- [ ] **Step 3: Commit final (se o checklist manual revelar ajustes)**

Se a validação manual pedir algum ajuste, aplique, rode `bun run typecheck && bun run test` de novo, e faça um
commit `fix:` separado descrevendo o ajuste.
