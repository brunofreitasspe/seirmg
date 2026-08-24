# Dashboard — Aba Alterados + Card Blocos de Assinatura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adiciona uma 5ª aba "Alterados" ao Dashboard (processos com documento incluído/assinado desde a
última visita) e um card ao vivo de Blocos de Assinatura na Visão Geral, ambos reusando lógica de
detecção/consulta que já existe no projeto.

**Architecture:** Feature "Alterados" segue exatamente o padrão já estabelecido pela aba Prazos — um snapshot
imutável em `LocalConfig`, atualizado por uma função pura (`atualizarSnapshotAlterados`) chamada no bootstrap
de `procedimento_controlar/index.ts`, lido pelo Dashboard sem transformação adicional. Feature "Blocos de
Assinatura" não usa storage — é uma consulta ao vivo (mesmo mecanismo que o popup já usa hoje: `chrome.tabs.query`
+ `chrome.tabs.sendMessage` pra uma aba do SEI aberta), extraída pra um módulo compartilhado entre popup e
dashboard pra não duplicar a lógica de consulta.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Vitest (+ `jsdom` pros testes que tocam `Element`/DOM),
Chrome Extension APIs (`chrome.storage`, `chrome.tabs`, `chrome.runtime`).

**Spec:** `docs/superpowers/specs/2026-08-24-seirmg-dashboard-alterados-blocos-design.md`

## Global Constraints

- Captura de "Alterados" tem gate só em `config.dashboard?.ativo` (não depende de
  `controleProcessos.prazos.ativo` — "alterado" não é um conceito de prazo).
- Sem expiração por tempo no snapshot de Alterados — só sai da lista quando revisitado e constatado que não
  está mais alterado (mesma regra da aba Prazos).
- Sem contagem de documentos/documentos-sem-assinatura por bloco (exigiria N+1 requisições) — só contagem de
  blocos por estado.
- Card de Blocos usa os rótulos que a extensão já classifica internamente — **Abertos**, **Disponibilizados p/
  sua área**, **Retornados** — não tenta replicar os rótulos "Recebidos/Retornados" do painel nativo do SEI.
  `disponibilizado_pela_area` fica fora do card.
- Rodar `bun run test` e `bun run typecheck` depois de cada task antes de commitar.

---

## Task 1: Schema de storage para o snapshot de Alterados

**Files:**
- Modify: `src/lib/storage.ts:86` (depois da interface `SnapshotPrazoProcesso`)
- Modify: `src/lib/storage.ts:267` (dentro de `LocalConfig`, depois de `snapshotPrazosProcessos`)
- Modify: `src/lib/storage.ts:392` (dentro de `DEFAULT_LOCAL_CONFIG`, depois de `snapshotPrazosProcessos: []`)
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Produces: `SnapshotAlteradoProcesso { numero: string; especificacao?: string; link: string | null; vistoEm: string }`,
  campo `LocalConfig.snapshotAlteradosProcessos: SnapshotAlteradoProcesso[]`.

- [ ] **Step 1: Escrever o teste que verifica o default**

Abra `src/lib/storage.test.ts`, ache o teste existente que verifica os defaults de `DEFAULT_LOCAL_CONFIG` (ou a
`describe` mais próxima de config local) e adicione:

```ts
it('DEFAULT_LOCAL_CONFIG inclui snapshotAlteradosProcessos vazio', () => {
  expect(DEFAULT_LOCAL_CONFIG.snapshotAlteradosProcessos).toEqual([])
})
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `bun run test -- storage.test.ts`
Expected: FAIL — `snapshotAlteradosProcessos` não existe em `DEFAULT_LOCAL_CONFIG` (undefined !== []).

- [ ] **Step 3: Adicionar a interface, o campo em `LocalConfig` e o default**

Em `src/lib/storage.ts`, logo depois da interface `SnapshotPrazoProcesso` (linha 86):

```ts
export interface SnapshotAlteradoProcesso {
  numero: string
  especificacao?: string
  link: string | null
  vistoEm: string // ISO — informativo, não usado para expirar nada
}
```

Dentro de `LocalConfig`, logo depois de `snapshotPrazosProcessos: SnapshotPrazoProcesso[]`:

```ts
  snapshotAlteradosProcessos: SnapshotAlteradoProcesso[]
```

Dentro de `DEFAULT_LOCAL_CONFIG`, logo depois de `snapshotPrazosProcessos: [],`:

```ts
  snapshotAlteradosProcessos: [],
```

- [ ] **Step 4: Rodar o teste e o typecheck pra confirmar que passam**

Run: `bun run test -- storage.test.ts && bun run typecheck`
Expected: PASS em ambos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(dashboard): schema de snapshot para processos alterados"
```

---

## Task 2: Função pura `atualizarSnapshotAlterados`

**Files:**
- Create: `src/features/dashboard/snapshotAlterados.ts`
- Test: `src/features/dashboard/snapshotAlterados.test.ts`

**Interfaces:**
- Consumes: `SnapshotAlteradoProcesso` (Task 1, `src/lib/storage.ts`).
- Produces: `LinhaVisivelComAlterado { numero: string; alterado: boolean; especificacao?: string; link: string | null }`,
  `atualizarSnapshotAlterados(atuais: SnapshotAlteradoProcesso[], linhasVisiveis: LinhaVisivelComAlterado[], agoraIso: string): { itens: SnapshotAlteradoProcesso[]; mudou: boolean }`.
  (Assinatura espelha exatamente `atualizarSnapshotPrazos` em `src/features/dashboard/snapshotPrazos.ts`, que já
  retorna `{ itens, mudou }`, não só o array.)

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/features/dashboard/snapshotAlterados.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { atualizarSnapshotAlterados, type LinhaVisivelComAlterado } from './snapshotAlterados'
import type { SnapshotAlteradoProcesso } from '../../lib/storage'

const AGORA = '2026-08-24T10:00:00.000Z'

describe('atualizarSnapshotAlterados', () => {
  it('adiciona uma entrada nova quando a linha visível está alterada e não existe entrada anterior', () => {
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados([], linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('atualiza vistoEm de uma entrada existente que continua alterada', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: AGORA },
    ])
  })

  it('não marca mudou quando a linha visível tem exatamente os mesmos dados já salvos', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('remove a entrada quando a linha revisitada não está mais alterada', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: false, especificacao: 'Aquisição', link: 'controlador.php?id=1' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    expect(resultado.itens).toEqual([])
  })

  it('não mexe em uma entrada cujo processo não aparece nas linhas visíveis desta página', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', especificacao: 'Aquisição', link: 'controlador.php?id=1', vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, [], AGORA)
    expect(resultado.mudou).toBe(false)
    expect(resultado.itens).toEqual(atuais)
  })

  it('lida com lista de entradas atuais vazia e nenhuma linha visível sem quebrar', () => {
    const resultado = atualizarSnapshotAlterados([], [], AGORA)
    expect(resultado).toEqual({ itens: [], mudou: false })
  })

  it('mistura adição, atualização, remoção e entrada intocada numa única chamada', () => {
    const atuais: SnapshotAlteradoProcesso[] = [
      { numero: 'HMMG.1', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.2', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
      { numero: 'HMMG.3', link: null, vistoEm: '2026-08-01T10:00:00.000Z' },
    ]
    const linhas: LinhaVisivelComAlterado[] = [
      { numero: 'HMMG.1', alterado: true, link: null },
      { numero: 'HMMG.2', alterado: false, link: null },
      { numero: 'HMMG.4', alterado: true, link: null },
    ]
    const resultado = atualizarSnapshotAlterados(atuais, linhas, AGORA)
    expect(resultado.mudou).toBe(true)
    const porNumero = new Map(resultado.itens.map((item) => [item.numero, item]))
    expect(porNumero.get('HMMG.1')).toEqual(atuais[0])
    expect(porNumero.has('HMMG.2')).toBe(false)
    expect(porNumero.get('HMMG.3')).toEqual(atuais[2])
    expect(porNumero.get('HMMG.4')).toEqual({ numero: 'HMMG.4', link: null, vistoEm: AGORA })
  })
})
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham**

Run: `bun run test -- snapshotAlterados.test.ts`
Expected: FAIL — módulo `./snapshotAlterados` não existe.

- [ ] **Step 3: Implementar `snapshotAlterados.ts`**

Crie `src/features/dashboard/snapshotAlterados.ts` (espelha `snapshotPrazos.ts` linha a linha, trocando o campo
de texto de prazo por um booleano):

```ts
import type { SnapshotAlteradoProcesso } from '../../lib/storage'

export interface LinhaVisivelComAlterado {
  numero: string
  alterado: boolean
  especificacao?: string
  link: string | null
}

export function atualizarSnapshotAlterados(
  atuais: SnapshotAlteradoProcesso[],
  linhasVisiveis: LinhaVisivelComAlterado[],
  agoraIso: string
): { itens: SnapshotAlteradoProcesso[]; mudou: boolean } {
  const porNumero = new Map(atuais.map((item) => [item.numero, item]))
  let mudou = false

  linhasVisiveis.forEach((linha) => {
    if (linha.alterado) {
      const existente = porNumero.get(linha.numero)
      const igual =
        existente !== undefined &&
        existente.especificacao === linha.especificacao &&
        existente.link === linha.link
      if (igual) return

      mudou = true
      porNumero.set(linha.numero, {
        numero: linha.numero,
        especificacao: linha.especificacao,
        link: linha.link,
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

- [ ] **Step 4: Rodar os testes e o typecheck pra confirmar que passam**

Run: `bun run test -- snapshotAlterados.test.ts && bun run typecheck`
Expected: PASS em ambos.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/snapshotAlterados.ts src/features/dashboard/snapshotAlterados.test.ts
git commit -m "feat(dashboard): função pura atualizarSnapshotAlterados"
```

---

## Task 3: Captura do snapshot de Alterados em `procedimento_controlar`

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:93` (import), `:1055` (nova função, depois de
  `capturarSnapshotGlobalDePrazos`), `:3955-3959` (chamada no `bootstrap()`)

**Interfaces:**
- Consumes: `atualizarSnapshotAlterados`, `type LinhaVisivelComAlterado` (Task 2); `linhaTemDocumentoAlterado`
  (já exportada de `features/controle-processos/kanban.ts`, já importada neste arquivo na linha 100);
  `extrairFavoritoDaLinha` (já importada neste arquivo, mesma usada por `capturarSnapshotGlobalDePrazos`).
- Produces: `capturarSnapshotGlobalDeAlterados(linhas: Element[]): Promise<void>`, chamada no `bootstrap()`.

Sem teste automatizado pra este task — é wiring de content script (mesmo padrão já estabelecido no projeto pra
`capturarSnapshotGlobalDePrazos`: verificado via `typecheck`/`test`/`build`, depois validação manual numa
instância SEI real).

- [ ] **Step 1: Adicionar o import da função nova**

Em `src/content-scripts/procedimento_controlar/index.ts`, logo depois da linha:

```ts
import { atualizarSnapshotPrazos, type LinhaVisivelComPrazo } from '../../features/dashboard/snapshotPrazos'
```

adicione:

```ts
import { atualizarSnapshotAlterados, type LinhaVisivelComAlterado } from '../../features/dashboard/snapshotAlterados'
```

- [ ] **Step 2: Adicionar `capturarSnapshotGlobalDeAlterados`**

Logo depois do fechamento de `capturarSnapshotGlobalDePrazos` (depois da linha
`await createLocalConfigStore().set({ ...localConfig, snapshotPrazosProcessos: resultado.itens })` e do `}` que
a segue):

```ts
async function capturarSnapshotGlobalDeAlterados(linhas: Element[]): Promise<void> {
  const agoraIso = new Date().toISOString()

  const linhasVisiveis: LinhaVisivelComAlterado[] = linhas
    .map((linha) => {
      const favorito = extrairFavoritoDaLinha(linha, agoraIso)
      if (!favorito) return null
      const resultado: LinhaVisivelComAlterado = {
        numero: favorito.numero,
        alterado: linhaTemDocumentoAlterado(linha),
        especificacao: favorito.especificacao,
        link: favorito.link,
      }
      return resultado
    })
    .filter((linha): linha is LinhaVisivelComAlterado => linha !== null)

  const localConfig = await createLocalConfigStore().get()
  const resultado = atualizarSnapshotAlterados(localConfig.snapshotAlteradosProcessos ?? [], linhasVisiveis, agoraIso)
  if (!resultado.mudou) return

  await createLocalConfigStore().set({ ...localConfig, snapshotAlteradosProcessos: resultado.itens })
}
```

- [ ] **Step 3: Chamar a nova função no `bootstrap()`**

Troque:

```ts
    if (config.dashboard?.ativo && config.controleProcessos.prazos.ativo) {
      capturarSnapshotGlobalDePrazos(todasAsLinhas).catch((error) => {
        console.error('[SEIRMG] Falha ao capturar snapshot global de prazos:', error)
      })
    }
```

por:

```ts
    if (config.dashboard?.ativo && config.controleProcessos.prazos.ativo) {
      capturarSnapshotGlobalDePrazos(todasAsLinhas).catch((error) => {
        console.error('[SEIRMG] Falha ao capturar snapshot global de prazos:', error)
      })
    }

    if (config.dashboard?.ativo) {
      capturarSnapshotGlobalDeAlterados(todasAsLinhas).catch((error) => {
        console.error('[SEIRMG] Falha ao capturar snapshot global de alterados:', error)
      })
    }
```

- [ ] **Step 4: Rodar typecheck, testes e build**

Run: `bun run typecheck && bun run test && bun run build`
Expected: os três passam sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(dashboard): captura snapshot global de processos alterados no Controle de Processos"
```

---

## Task 4: Aba "Alterados" no Dashboard

**Files:**
- Modify: `src/dashboard/index.html` (nova aba + view)
- Modify: `src/dashboard/main.ts` (nova função `renderizarAlterados`)

**Interfaces:**
- Consumes: `localConfig.snapshotAlteradosProcessos` (Task 1); `montarCelulaAbrirProcesso` (já existe em
  `src/dashboard/main.ts`, usada pelas abas Favoritos e Prazos).

Sem teste automatizado — renderização de página, mesmo padrão já usado pelas outras 4 abas do Dashboard.

- [ ] **Step 1: Adicionar a aba e a view em `index.html`**

Troque:

```html
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
```

por:

```html
    <div class="tabs">
      <button class="tab-btn ativa" data-tab="geral">Visão Geral</button>
      <button class="tab-btn" data-tab="favoritos">Favoritos</button>
      <button class="tab-btn" data-tab="prazos">Prazos</button>
      <button class="tab-btn" data-tab="tarefas">Tarefas</button>
      <button class="tab-btn" data-tab="alterados">Alterados</button>
    </div>

    <div class="conteudo">
      <div class="view ativa" id="view-geral"></div>
      <div class="view" id="view-favoritos"></div>
      <div class="view" id="view-prazos"></div>
      <div class="view" id="view-tarefas"></div>
      <div class="view" id="view-alterados"></div>
    </div>
```

- [ ] **Step 2: Adicionar `renderizarAlterados()` em `main.ts`**

No final de `src/dashboard/main.ts`, depois de `renderizarTarefas().catch(...)`, adicione:

```ts
async function renderizarAlterados(): Promise<void> {
  const view = document.getElementById('view-alterados')
  if (!view) return

  const localConfig = await createLocalConfigStore().get()
  const itens = [...(localConfig.snapshotAlteradosProcessos ?? [])].sort(
    (a, b) => new Date(b.vistoEm).getTime() - new Date(a.vistoEm).getTime()
  )

  view.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'secao-header'
  const titulo = document.createElement('h2')
  titulo.textContent = `⚠ Alterados (${itens.length})`
  header.appendChild(titulo)
  view.appendChild(header)

  const painel = document.createElement('div')
  painel.className = 'painel-lista'

  if (itens.length === 0) {
    const vazio = document.createElement('div')
    vazio.className = 'vazio'
    vazio.textContent = 'Nenhum processo com alteração pendente de visualização.'
    painel.appendChild(vazio)
  } else {
    const tabela = document.createElement('table')
    tabela.className = 'tabela-dash'
    const thead = document.createElement('thead')
    thead.innerHTML = '<tr><th>Processo</th><th>Especificação</th><th></th></tr>'
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    itens.forEach((item) => {
      const tr = document.createElement('tr')

      const tdNumero = document.createElement('td')
      tdNumero.textContent = item.numero
      tr.appendChild(tdNumero)

      const tdEspecificacao = document.createElement('td')
      tdEspecificacao.textContent = item.especificacao ?? '—'
      tr.appendChild(tdEspecificacao)

      tr.appendChild(montarCelulaAbrirProcesso(item.link, localConfig.baseUrlSei))

      tbody.appendChild(tr)
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)
  }

  view.appendChild(painel)
}

renderizarAlterados().catch((error) => console.error('[SEIRMG] Falha ao renderizar Alterados:', error))
```

- [ ] **Step 3: Rodar typecheck e build**

Run: `bun run typecheck && bun run build`
Expected: passam sem erro (`montarCelulaAbrirProcesso` já existe no arquivo, `snapshotAlteradosProcessos` já
existe no tipo `LocalConfig` desde a Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/index.html src/dashboard/main.ts
git commit -m "feat(dashboard): aba Alterados"
```

---

## Task 5: Generalizar `resumirBlocos` para aceitar `BlocoListaItem[]`

**Files:**
- Modify: `src/features/bloco-assinatura/parser.ts:72` (assinatura de `resumirBlocos`)
- Modify: `src/features/bloco-assinatura/parser.test.ts` (novo caso de teste)

**Interfaces:**
- Produces: `resumirBlocos(itens: Array<{ estado: EstadoBloco | undefined }>): BlocoAssinaturaResumo` — assinatura
  relaxada (era `itens: BlocoAssinaturaItem[]`); `BlocoAssinaturaItem[]` e `BlocoListaItem[]` continuam
  compatíveis estruturalmente (ambos têm `estado: EstadoBloco | undefined`), então nenhum call site existente
  muda.

- [ ] **Step 1: Escrever o teste (falhando) com `BlocoListaItem[]`**

Em `src/features/bloco-assinatura/parser.test.ts`, dentro do `describe('resumirBlocos', ...)` já existente,
adicione:

```ts
  it('aceita itens no formato BlocoListaItem (sem id/numero/link), ignorando estado indefinido', () => {
    const blocos: BlocoListaItem[] = [
      { numero: '1', descricao: '', href: '', estado: 'aberto' },
      { numero: '2', descricao: '', href: '', estado: 'retornado' },
      { numero: '3', descricao: '', href: '', estado: undefined },
    ]
    const resumo = resumirBlocos(blocos)
    expect(resumo).toEqual({
      totalDisponibilizadoParaArea: 0,
      totalDisponibilizadoPelaArea: 0,
      totalAberto: 1,
      totalRetornado: 1,
    })
  })
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `bun run test -- parser.test.ts`
Expected: FAIL — erro de tipo, `resumirBlocos` hoje só aceita `BlocoAssinaturaItem[]` (que exige `id`/`numero`/
`link`), `BlocoListaItem[]` não é atribuível a esse parâmetro.

- [ ] **Step 3: Relaxar a assinatura de `resumirBlocos`**

Troque a assinatura:

```ts
export function resumirBlocos(itens: BlocoAssinaturaItem[]): BlocoAssinaturaResumo {
```

por:

```ts
export function resumirBlocos(itens: Array<{ estado: EstadoBloco | undefined }>): BlocoAssinaturaResumo {
```

(o corpo da função não muda — só lê `item.estado`, que continua existindo em ambos os formatos.)

- [ ] **Step 4: Rodar os testes e o typecheck pra confirmar que passam**

Run: `bun run test -- parser.test.ts && bun run typecheck`
Expected: PASS em ambos, incluindo o teste original de `resumirBlocos` com `BlocoAssinaturaItem[]` (continua
passando sem alteração — tipagem estrutural).

- [ ] **Step 5: Commit**

```bash
git add src/features/bloco-assinatura/parser.ts src/features/bloco-assinatura/parser.test.ts
git commit -m "refactor(bloco-assinatura): resumirBlocos aceita qualquer item com estado (BlocoListaItem incluso)"
```

---

## Task 6: Estender `consultarBlocosDisponibilizados` com a contagem por estado

**Files:**
- Modify: `src/content-scripts/core/index.ts:1-8` (import), `:166-185` (interface + função)

**Interfaces:**
- Consumes: `resumirBlocos` (Task 5, agora aceita `BlocoListaItem[]`), `BlocoAssinaturaResumo` (tipo, de
  `features/bloco-assinatura/types.ts`).
- Produces: `RespostaBlocosDisponibilizados` ganha o campo `resumo?: BlocoAssinaturaResumo`, sempre presente
  quando `ok: true`. `total` continua com o mesmo significado de hoje (`disponibilizado_para_area`) — nenhum
  consumidor existente quebra.

Sem teste automatizado direto pra esta função (já não tinha — depende de `fetchText`/DOM ao vivo); a cobertura
vem de `resumirBlocos` (Task 5) e de `parseListaBlocosAssinatura` (já testado).

- [ ] **Step 1: Importar `resumirBlocos` e o tipo `BlocoAssinaturaResumo`**

Troque:

```ts
import { parseListaBlocosAssinatura } from '../../features/bloco-assinatura/parser'
```

por:

```ts
import { parseListaBlocosAssinatura, resumirBlocos } from '../../features/bloco-assinatura/parser'
import type { BlocoAssinaturaResumo } from '../../features/bloco-assinatura/types'
```

- [ ] **Step 2: Estender a interface e a função**

Troque:

```ts
interface RespostaBlocosDisponibilizados {
  ok: boolean
  total?: number
  error?: string
}

async function consultarBlocosDisponibilizados(): Promise<RespostaBlocosDisponibilizados> {
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href^="controlador.php?acao=bloco_assinatura_listar"]'
  )
  if (!link) return { ok: false, error: 'Link de Bloco de Assinatura não encontrado nessa página' }

  const resultado = await fetchText(link.href)
  if (!resultado.ok) return { ok: false, error: resultado.error }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const blocos = parseListaBlocosAssinatura(doc)
  const total = blocos.filter((bloco) => bloco.estado === 'disponibilizado_para_area').length
  return { ok: true, total }
}
```

por:

```ts
interface RespostaBlocosDisponibilizados {
  ok: boolean
  total?: number
  resumo?: BlocoAssinaturaResumo
  error?: string
}

async function consultarBlocosDisponibilizados(): Promise<RespostaBlocosDisponibilizados> {
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href^="controlador.php?acao=bloco_assinatura_listar"]'
  )
  if (!link) return { ok: false, error: 'Link de Bloco de Assinatura não encontrado nessa página' }

  const resultado = await fetchText(link.href)
  if (!resultado.ok) return { ok: false, error: resultado.error }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const blocos = parseListaBlocosAssinatura(doc)
  const total = blocos.filter((bloco) => bloco.estado === 'disponibilizado_para_area').length
  const resumo = resumirBlocos(blocos)
  return { ok: true, total, resumo }
}
```

- [ ] **Step 3: Rodar typecheck, testes e build**

Run: `bun run typecheck && bun run test && bun run build`
Expected: os três passam sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/core/index.ts
git commit -m "feat(dashboard): consultarBlocosDisponibilizados devolve contagem por estado"
```

---

## Task 7: Módulo compartilhado `consultarBlocosAoVivo` + refatoração do popup

**Files:**
- Create: `src/features/bloco-assinatura/consultarAoVivo.ts`
- Modify: `src/popup/main.ts:37-56` (remove a versão local, importa a compartilhada)

**Interfaces:**
- Consumes: mensagem `{ type: 'seirmg:consultar-blocos-disponibilizados' }` respondida por
  `consultarBlocosDisponibilizados` (Task 6, `content-scripts/core/index.ts`).
- Produces: `ConsultaBlocosAoVivo = { ok: true; total: number; resumo: BlocoAssinaturaResumo } | { ok: false }`,
  `consultarBlocosAoVivo(baseUrlSei: string | undefined): Promise<ConsultaBlocosAoVivo>`.

Sem teste automatizado — função de wiring (`chrome.tabs.query`/`chrome.tabs.sendMessage`), mesmo padrão já
usado pela versão original no popup (nunca teve teste).

- [ ] **Step 1: Criar o módulo compartilhado**

Crie `src/features/bloco-assinatura/consultarAoVivo.ts`:

```ts
import type { BlocoAssinaturaResumo } from './types'

export type ConsultaBlocosAoVivo = { ok: true; total: number; resumo: BlocoAssinaturaResumo } | { ok: false }

export async function consultarBlocosAoVivo(baseUrlSei: string | undefined): Promise<ConsultaBlocosAoVivo> {
  if (!baseUrlSei) return { ok: false }
  try {
    const [aba] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
    if (!aba?.id) return { ok: false }
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      type: 'seirmg:consultar-blocos-disponibilizados',
    })
    if (!resposta?.ok || typeof resposta.total !== 'number' || !resposta.resumo) return { ok: false }
    return { ok: true, total: resposta.total, resumo: resposta.resumo }
  } catch (error) {
    // Esperado quando a aba do SEI encontrada não tem o content script ativo (ex.: aba aberta
    // antes de a extensão ser recarregada) — quem chama já cai graciosamente no estado
    // "indisponível", então isso não é um erro de verdade, só um diagnóstico.
    console.warn('[SEIRMG] Não foi possível consultar blocos de assinatura ao vivo:', error)
    return { ok: false }
  }
}
```

- [ ] **Step 2: Refatorar o popup pra usar o módulo compartilhado**

Em `src/popup/main.ts`, troque:

```ts
type ConsultaBlocos = { ok: true; total: number } | { ok: false }

async function consultarBlocosAoVivo(baseUrlSei: string | undefined): Promise<ConsultaBlocos> {
  if (!baseUrlSei) return { ok: false }
  try {
    const [aba] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
    if (!aba?.id) return { ok: false }
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      type: 'seirmg:consultar-blocos-disponibilizados',
    })
    if (!resposta?.ok || typeof resposta.total !== 'number') return { ok: false }
    return { ok: true, total: resposta.total }
  } catch (error) {
    // Esperado quando a aba do SEI encontrada não tem o content script ativo (ex.: aba aberta
    // antes de a extensão ser recarregada) — a UI já cai graciosamente no estado "indisponível"
    // logo abaixo, então isso não é um erro de verdade, só um diagnóstico.
    console.warn('[SEIRMG] Não foi possível consultar blocos de assinatura ao vivo:', error)
    return { ok: false }
  }
}
```

por (só o import — a lógica agora vive no módulo compartilhado):

```ts
import { consultarBlocosAoVivo, type ConsultaBlocosAoVivo } from '../features/bloco-assinatura/consultarAoVivo'
```

(adicione esse import junto dos outros imports no topo do arquivo). Em seguida, ache o restante do arquivo que
referencia o tipo `ConsultaBlocos` (a assinatura de `renderizarStatus`) e troque `ConsultaBlocos` por
`ConsultaBlocosAoVivo`.

- [ ] **Step 3: Rodar typecheck, testes e build**

Run: `bun run typecheck && bun run test && bun run build`
Expected: os três passam sem erro. `renderizarStatus` continua compilando porque só usa `consulta.total`, que
`ConsultaBlocosAoVivo` também tem.

- [ ] **Step 4: Commit**

```bash
git add src/features/bloco-assinatura/consultarAoVivo.ts src/popup/main.ts
git commit -m "refactor(bloco-assinatura): extrai consultarBlocosAoVivo pra módulo compartilhado"
```

---

## Task 8: Card "Blocos de Assinatura" na Visão Geral do Dashboard

**Files:**
- Modify: `src/dashboard/main.ts` (import + `montarCardBlocos` + chamada dentro de `renderizarVisaoGeral`)
- Modify: `src/dashboard/style.css` (novas classes `.card-blocos*`)

**Interfaces:**
- Consumes: `consultarBlocosAoVivo`, `type ConsultaBlocosAoVivo` (Task 7).

Sem teste automatizado — renderização de página (mesmo padrão das outras seções do Dashboard); a lógica de
contagem já testada em `resumirBlocos` (Task 5).

- [ ] **Step 1: Importar o módulo compartilhado em `dashboard/main.ts`**

No topo de `src/dashboard/main.ts`, junto dos outros imports, adicione:

```ts
import { consultarBlocosAoVivo, type ConsultaBlocosAoVivo } from '../features/bloco-assinatura/consultarAoVivo'
```

- [ ] **Step 2: Adicionar `montarCardBlocos`**

Antes da função `renderizarVisaoGeral`, adicione:

```ts
function montarCardBlocos(consulta: ConsultaBlocosAoVivo): HTMLElement {
  const card = document.createElement('div')
  card.className = 'card-blocos'

  const titulo = document.createElement('h3')
  titulo.textContent = 'Blocos de Assinatura'
  card.appendChild(titulo)

  if (!consulta.ok) {
    const aviso = document.createElement('p')
    aviso.className = 'card-blocos-vazio'
    aviso.textContent = 'Abra uma aba do SEI pra ver blocos pendentes.'
    card.appendChild(aviso)
    return card
  }

  const linhas = document.createElement('div')
  linhas.className = 'card-blocos-linhas'
  const itens: Array<{ rotulo: string; valor: number }> = [
    { rotulo: 'Abertos', valor: consulta.resumo.totalAberto },
    { rotulo: 'Disponibilizados p/ sua área', valor: consulta.resumo.totalDisponibilizadoParaArea },
    { rotulo: 'Retornados', valor: consulta.resumo.totalRetornado },
  ]
  itens.forEach(({ rotulo, valor }) => {
    const linha = document.createElement('div')
    linha.className = 'card-blocos-linha'
    const valorSpan = document.createElement('span')
    valorSpan.className = 'card-blocos-valor'
    valorSpan.textContent = String(valor)
    const rotuloSpan = document.createElement('span')
    rotuloSpan.className = 'card-blocos-rotulo'
    rotuloSpan.textContent = rotulo
    linha.append(valorSpan, rotuloSpan)
    linhas.appendChild(linha)
  })
  card.appendChild(linhas)
  return card
}
```

- [ ] **Step 3: Chamar `montarCardBlocos` dentro de `renderizarVisaoGeral`**

Ache, dentro de `renderizarVisaoGeral`, a linha:

```ts
  view.appendChild(cards)
```

e logo depois adicione:

```ts

  const consultaBlocos = await consultarBlocosAoVivo(localConfig.baseUrlSei)
  view.appendChild(montarCardBlocos(consultaBlocos))
```

(`localConfig` já existe nesse escopo — é lido no topo da função pra `historicoEventos`.)

- [ ] **Step 4: Adicionar o CSS do card**

No final de `src/dashboard/style.css`, adicione:

```css
.card-blocos { background: var(--seirmg-surface); border: 1px solid var(--seirmg-border); border-radius: var(--seirmg-radius); padding: var(--sp-4); box-shadow: var(--seirmg-shadow); margin-bottom: var(--sp-6); }
.card-blocos h3 { margin: 0 0 var(--sp-3); font-size: 13px; font-weight: 700; }
.card-blocos-linhas { display: flex; gap: var(--sp-6); flex-wrap: wrap; }
.card-blocos-linha { display: flex; flex-direction: column; }
.card-blocos-valor { font-size: 22px; font-weight: 800; line-height: 1; }
.card-blocos-rotulo { font-size: 11.5px; color: var(--seirmg-text-muted); margin-top: 4px; }
.card-blocos-vazio { margin: 0; color: var(--seirmg-text-muted); font-size: 13px; }
```

- [ ] **Step 5: Rodar typecheck, testes e build**

Run: `bun run typecheck && bun run test && bun run build`
Expected: os três passam sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/main.ts src/dashboard/style.css
git commit -m "feat(dashboard): card de Blocos de Assinatura ao vivo na Visão Geral"
```

---

## Validação manual (depois de todas as tasks)

Sem teste automatizado cobre o wiring end-to-end — seguir o mesmo processo já estabelecido no projeto (ver
seção "Pontos a confirmar" da spec):

1. Numa instância SEI real, com `config.dashboard.ativo = true`, abrir o Controle de Processos com pelo menos
   um processo marcado com `exclamacao.svg` (documento alterado) — confirmar que ele aparece na aba "Alterados"
   do Dashboard depois de recarregar a página do Controle de Processos.
2. Assinar/visualizar esse documento (o que remove o ícone de alterado no SEI) e revisitar o Controle de
   Processos — confirmar que a entrada some da aba "Alterados".
3. Com uma aba do SEI aberta e blocos de assinatura em estados variados (aberto, disponibilizado, retornado),
   abrir o Dashboard e conferir que os 3 números do card batem com o que aparece em
   `acao=bloco_assinatura_listar`.
4. Fechar todas as abas do SEI e abrir o Dashboard — confirmar que o card mostra "Abra uma aba do SEI pra ver
   blocos pendentes" em vez de números ou erro.
