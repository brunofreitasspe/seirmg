# SEIRMG — Lote L (núcleo): Favoritos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users favoritar processos na tela de Controle de Processos (estrela por linha), com um painel de Favoritos dedicado, resolvendo a duplicação processo-aberto-e-favoritado ao esconder a linha nativa e mostrar o processo só no painel.

**Architecture:** Reaproveita 100% a infraestrutura já existente em `src/content-scripts/procedimento_controlar/index.ts`: o sistema de filtros por linha (`filtroTabela.ts` — `registrarFiltro`/`removerFiltro`/`calcularVisibilidade`, combinados via `estadoFiltrosPorTabela` + `reaplicarOrdemDaTabela`) para esconder a linha nativa de um processo favoritado-e-aberto, e o padrão `insertAdjacentElement('afterend', ...)` já usado por especificação/Planka para inserir o ícone de estrela. Estado persiste em `SyncConfig.controleProcessos.favoritos` via `createSyncConfigStore`. Lógica pura testável isolada em `src/features/controle-processos/favoritos.ts`; wiring de DOM/`chrome.*` no content script sem teste direto (mesma política já aplicada ao resto do projeto).

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Bun, Vitest (`environment: 'jsdom'`), Lucide static icons (`?raw` import).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-10-seirmg-lote-l-favoritos-nucleo-design.md`.
- Quando um processo está favoritado E aberto (aparece na tabela nativa da tela atual), ele **some da tabela nativa** e aparece **só no painel de Favoritos** (oposto do Sei Pro original).
- Ocultação é implementada como um filtro registrado no sistema já existente de `filtroTabela.ts`, sob o sufixo `'PorFavoritoAberto'` — nunca manipulação direta de `style.display`.
- O painel de Favoritos fica na tela de Controle de Processos, inserido logo após a última das três tabelas presentes na página, na ordem de `IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']`.
- Favoritos default: `{ ativo: false, itens: [] }` — opt-in por padrão, mesmo precedente de `rolagemInfinita`.
- `FavoritoProcesso` e `FavoritosConfig` são definidos em `src/lib/storage.ts` (fonte da verdade), não em `favoritos.ts` — segue o precedente já estabelecido de `ConfiguracaoCor`/`ConfiguracaoPontoControle` (definidos em `storage.ts`, importados como `type` pelos módulos de `features/`).
- Se `favoritos.itens` estiver vazio, ou `favoritos.ativo` for `false`, o painel inteiro não aparece.
- Extração de NUP/link por linha reaproveita o seletor já usado no resto do arquivo: `linha.querySelector('.processoVisualizado, .processoNaoVisualizado')`.
- Fora de escopo (não implementar nesta plan): etiquetas coloridas, mapas, categorias, prazo com edição avançada, export/import, painel na página inicial do SEI, reordenação manual, UI de gerenciamento em massa nas Opções.

---

### Task 1: Storage — tipos e config padrão de Favoritos

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Produces: `export interface FavoritoProcesso { numero: string; link: string | null; adicionadoEm: string }`, `export interface FavoritosConfig { ativo: boolean; itens: FavoritoProcesso[] }`. `ControleProcessosConfig` ganha o campo `favoritos: FavoritosConfig`. `DEFAULT_SYNC_CONFIG.controleProcessos.favoritos = { ativo: false, itens: [] }`.

- [ ] **Step 1: Atualizar o teste que verifica o `controleProcessos` padrão (deve falhar)**

Em `src/lib/storage.test.ts`, no teste `'inclui controleProcessos padrão quando vazio'` (por volta da linha 57), adicione `favoritos` ao objeto esperado:

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
      favoritos: { ativo: false, itens: [] },
    })
  })
```

Também adicione um novo teste logo após `'persiste alteração de controleProcessos.agrupamento'` (por volta da linha 119):

```ts
  it('persiste alteração de controleProcessos.favoritos', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        favoritos: {
          ativo: true,
          itens: [
            { numero: 'HMMG.2025.00001-1', link: 'controlador.php?acao=x', adicionadoEm: '2026-07-10T10:00:00.000Z' },
          ],
        },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `controleProcessos` não tem `favoritos`, e `TypeScript` provavelmente já aponta erro de tipo em `favoritos` não existir em `ControleProcessosConfig`.

- [ ] **Step 3: Adicionar os tipos e o valor padrão em `storage.ts`**

Em `src/lib/storage.ts`, logo após a interface `AgrupamentoConfig` (linha 52-54) e antes de `ControleProcessosConfig` (linha 56), adicione:

```ts
export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
}

export interface FavoritosConfig {
  ativo: boolean
  itens: FavoritoProcesso[]
}
```

Modifique `ControleProcessosConfig` (linha 56-62) para incluir o novo campo:

```ts
export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
  favoritos: FavoritosConfig
}
```

Em `DEFAULT_SYNC_CONFIG.controleProcessos` (dentro do bloco que termina em `agrupamento: { criterio: 'nenhum' }`, por volta da linha 158-160), adicione o campo `favoritos`:

```ts
    agrupamento: {
      criterio: 'nenhum',
    },
    favoritos: {
      ativo: false,
      itens: [],
    },
  },
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os dois modificados/adicionados).

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /c/sei/seirmg
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): adiciona FavoritosConfig ao ControleProcessosConfig"
```

---

### Task 2: Lógica pura de Favoritos

**Files:**
- Create: `src/features/controle-processos/favoritos.ts`
- Test: `src/features/controle-processos/favoritos.test.ts`

**Interfaces:**
- Consumes: `type { FavoritoProcesso }` de `../../lib/storage` (Task 1).
- Produces: `extrairFavoritoDaLinha(linha: Element, agoraIso: string): FavoritoProcesso | null`, `calcularOcultacaoPorFavorito(linhas: Array<{ id: string; nup: string | null }>, idsFavoritados: Set<string>): Record<string, boolean>`, `ordenarFavoritosPorData(itens: FavoritoProcesso[]): FavoritoProcesso[]`. Task 4/5 consomem essas três funções diretamente.

- [ ] **Step 1: Escrever os testes (devem falhar — módulo não existe)**

Crie `src/features/controle-processos/favoritos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calcularOcultacaoPorFavorito, extrairFavoritoDaLinha, ordenarFavoritosPorData } from './favoritos'
import type { FavoritoProcesso } from '../../lib/storage'

function criarLinhaComProcesso(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

describe('extrairFavoritoDaLinha', () => {
  it('extrai numero e link de uma linha com .processoVisualizado', () => {
    const linha = criarLinhaComProcesso(
      '<td><a class="processoVisualizado" href="controlador.php?acao=x&id=1"> HMMG.2025.00001-1 </a></td>'
    )
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')).toEqual({
      numero: 'HMMG.2025.00001-1',
      link: 'controlador.php?acao=x&id=1',
      adicionadoEm: '2026-07-10T10:00:00.000Z',
    })
  })

  it('extrai numero de uma linha com .processoNaoVisualizado', () => {
    const linha = criarLinhaComProcesso(
      '<td><a class="processoNaoVisualizado" href="controlador.php?acao=y">HMMG.2025.00002-2</a></td>'
    )
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.numero).toBe('HMMG.2025.00002-2')
  })

  it('retorna link null quando o elemento não tem atributo href', () => {
    const linha = criarLinhaComProcesso('<td><a class="processoVisualizado">HMMG.2025.00003-3</a></td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.link).toBeNull()
  })

  it('retorna null quando a linha não tem elemento de processo', () => {
    const linha = criarLinhaComProcesso('<td>sem link</td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')).toBeNull()
  })

  it('retorna null quando o texto do processo está vazio', () => {
    const linha = criarLinhaComProcesso('<td><a class="processoVisualizado" href="x">   </a></td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')).toBeNull()
  })
})

describe('calcularOcultacaoPorFavorito', () => {
  it('marca como oculta (false) a linha cujo nup está favoritado', () => {
    const linhas = [{ id: 'a', nup: 'HMMG.1' }, { id: 'b', nup: 'HMMG.2' }]
    const resultado = calcularOcultacaoPorFavorito(linhas, new Set(['HMMG.1']))
    expect(resultado).toEqual({ a: false, b: true })
  })

  it('mantém visível (true) quando o conjunto de favoritados está vazio', () => {
    const linhas = [{ id: 'a', nup: 'HMMG.1' }]
    expect(calcularOcultacaoPorFavorito(linhas, new Set())).toEqual({ a: true })
  })

  it('trata nup null como sempre visível', () => {
    const linhas = [{ id: 'a', nup: null }]
    expect(calcularOcultacaoPorFavorito(linhas, new Set(['HMMG.1']))).toEqual({ a: true })
  })
})

describe('ordenarFavoritosPorData', () => {
  const item = (numero: string, adicionadoEm: string): FavoritoProcesso => ({ numero, link: null, adicionadoEm })

  it('ordena do mais recente para o mais antigo', () => {
    const itens = [
      item('HMMG.1', '2026-07-01T10:00:00.000Z'),
      item('HMMG.2', '2026-07-10T10:00:00.000Z'),
      item('HMMG.3', '2026-07-05T10:00:00.000Z'),
    ]
    expect(ordenarFavoritosPorData(itens).map((i) => i.numero)).toEqual(['HMMG.2', 'HMMG.3', 'HMMG.1'])
  })

  it('não modifica o array original', () => {
    const itens = [item('HMMG.1', '2026-07-01T10:00:00.000Z'), item('HMMG.2', '2026-07-10T10:00:00.000Z')]
    const copia = [...itens]
    ordenarFavoritosPorData(itens)
    expect(itens).toEqual(copia)
  })
})
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/controle-processos/favoritos.test.ts`
Expected: FAIL com "Cannot find module './favoritos'".

- [ ] **Step 3: Implementar `src/features/controle-processos/favoritos.ts`**

```ts
import type { FavoritoProcesso } from '../../lib/storage'

export function extrairFavoritoDaLinha(linha: Element, agoraIso: string): FavoritoProcesso | null {
  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const numero = processo?.textContent?.trim()
  if (!processo || !numero) return null

  return {
    numero,
    link: processo.getAttribute('href'),
    adicionadoEm: agoraIso,
  }
}

export function calcularOcultacaoPorFavorito(
  linhas: Array<{ id: string; nup: string | null }>,
  idsFavoritados: Set<string>
): Record<string, boolean> {
  const resultado: Record<string, boolean> = {}
  linhas.forEach(({ id, nup }) => {
    resultado[id] = !(nup !== null && idsFavoritados.has(nup))
  })
  return resultado
}

export function ordenarFavoritosPorData(itens: FavoritoProcesso[]): FavoritoProcesso[] {
  return [...itens].sort((a, b) => b.adicionadoEm.localeCompare(a.adicionadoEm))
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/controle-processos/favoritos.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /c/sei/seirmg
git add src/features/controle-processos/favoritos.ts src/features/controle-processos/favoritos.test.ts
git commit -m "feat(controle-processos): adiciona lógica pura de favoritos"
```

---

### Task 3: Opções — ativar/desativar Favoritos

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `ControleProcessosConfig.favoritos` (Task 1).
- Produces: checkbox `#processos-favoritos-ativo` persistido em `config.controleProcessos.favoritos.ativo`; `favoritos.itens` é passado adiante sem UI de edição.

Este task não tem lógica pura testável (wiring de DOM na página de Opções, mesma política já aplicada aos outros campos desta mesma aba — prazos, cores, rolagem infinita). Verificação é feita por typecheck + inspeção visual manual (a Task de review final revisa o diff).

- [ ] **Step 1: Adicionar a seção "Favoritos" em `src/options/index.html`**

Em `src/options/index.html`, insira o bloco abaixo imediatamente após a seção "Rolagem infinita" (que termina na linha 123) e antes de `<br /><button id="processos-salvar">` (linha 125-126):

```html
      <h3>Favoritos</h3>
      <label>
        <input type="checkbox" id="processos-favoritos-ativo" />
        Ativar favoritos (esconde da listagem nativa o processo já favoritado e aberto,
        mostrando-o só no painel de Favoritos)
      </label>
```

O resultado deve ficar assim (trecho completo, linhas 119-128 originais viram):

```html
      <h3>Rolagem infinita</h3>
      <label>
        <input type="checkbox" id="processos-rolagem-infinita-ativo" />
        Ativar rolagem infinita (remover paginação e carregar todos os processos)
      </label>

      <h3>Favoritos</h3>
      <label>
        <input type="checkbox" id="processos-favoritos-ativo" />
        Ativar favoritos (esconde da listagem nativa o processo já favoritado e aberto,
        mostrando-o só no painel de Favoritos)
      </label>

      <br />
      <button id="processos-salvar">Salvar</button>
      <span id="processos-status"></span>
    </section>
```

- [ ] **Step 2: Ler e gravar o campo em `src/options/main.ts`**

Em `src/options/main.ts`, dentro de `carregarAbaProcessos`, logo após a declaração de `inputRolagemInfinitaAtivo` (por volta da linha 189-191):

```ts
    const inputRolagemInfinitaAtivo = document.getElementById(
      'processos-rolagem-infinita-ativo'
    ) as HTMLInputElement | null
    const inputFavoritosAtivo = document.getElementById('processos-favoritos-ativo') as HTMLInputElement | null
    const status = document.getElementById('processos-status')
```

Logo após a linha que seta `inputRolagemInfinitaAtivo.checked` (por volta da linha 207-209):

```ts
    if (inputRolagemInfinitaAtivo) {
      inputRolagemInfinitaAtivo.checked = config.controleProcessos.rolagemInfinita.ativo
    }
    if (inputFavoritosAtivo) {
      inputFavoritosAtivo.checked = config.controleProcessos.favoritos.ativo
    }
```

No handler de salvar, dentro do objeto `controleProcessos` (por volta da linha 268-271), troque:

```ts
            rolagemInfinita: {
              ativo: inputRolagemInfinitaAtivo?.checked ?? false,
            },
            agrupamento: config.controleProcessos.agrupamento,
```

por:

```ts
            rolagemInfinita: {
              ativo: inputRolagemInfinitaAtivo?.checked ?? false,
            },
            agrupamento: config.controleProcessos.agrupamento,
            favoritos: {
              ativo: inputFavoritosAtivo?.checked ?? false,
              itens: config.controleProcessos.favoritos.itens,
            },
```

- [ ] **Step 3: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
cd /c/sei/seirmg
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): adiciona toggle de favoritos na aba Processos"
```

---

### Task 4: Estrela de favoritar + filtro de ocultação por linha

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `extrairFavoritoDaLinha`, `calcularOcultacaoPorFavorito` de `../../features/controle-processos/favoritos` (Task 2); `type { FavoritoProcesso }` de `../../lib/storage` (Task 1); `IDS_TABELAS`, `linhasDaTabela`, `estadoFiltrosPorTabela`, `registrarFiltro`, `removerFiltro`, `reaplicarOrdemDaTabela`, `reaplicarTratamentosNasLinhasNovas`, `createSyncConfigStore` — todos já existentes no próprio arquivo.
- Produces: `favoritosAtivo` (module-level `let boolean`), `itensFavoritados` (module-level `let FavoritoProcesso[]`), `aplicarEstrelasEmLinhas(linhas: Element[]): void`, `atualizarTodasAsEstrelas(): void`, `alternarFavorito(nup: string, link: string | null): Promise<void>`, `aplicarFiltroFavoritoNaTabela(idTabela: string): void`, `aplicarFiltroFavoritoEmTodasAsTabelas(): void`. Task 5 consome `favoritosAtivo`, `itensFavoritados` e chama `alternarFavorito` a partir do painel; também substitui o stub `renderizarPainelFavoritos` criado aqui.

Sem teste direto (wiring de DOM/`chrome.*`, mesma política do resto do arquivo). Verificação por typecheck + build.

- [ ] **Step 1: Imports e CSS**

Em `src/content-scripts/procedimento_controlar/index.ts`, adicione aos imports existentes (após a linha 46, `import { limparTokenPlanka } from '../shared/plankaToken'`):

```ts
import {
  extrairFavoritoDaLinha,
  calcularOcultacaoPorFavorito,
} from '../../features/controle-processos/favoritos'
import type { FavoritoProcesso } from '../../lib/storage'
import starIconSvg from 'lucide-static/icons/star.svg?raw'
import starOffIconSvg from 'lucide-static/icons/star-off.svg?raw'
```

Adicione ao final do template string `ESTILO_FILTROS_E_ESPECIFICACAO` (logo antes do fechamento `` ` `` da linha 95), depois do bloco `.seirmg-planka-popover-mensagem`:

```ts
  .seirmg-favorito-estrela {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-left: 4px;
    color: #f5a623;
  }
  .seirmg-favorito-estrela svg {
    width: 14px;
    height: 14px;
  }
  .seirmg-favorito-estrela.seirmg-favorito-inativo {
    color: #ccc;
  }
```

- [ ] **Step 2: Estado module-level e função de estrela**

Adicione logo após a declaração de `const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()` e `const reaplicarFiltrosAposNovasLinhas: Array<() => void> = []` (linhas 429-430):

```ts
let favoritosAtivo = false
let itensFavoritados: FavoritoProcesso[] = []

function criarEstrela(nup: string, link: string | null, favoritado: boolean): HTMLElement {
  const estrela = document.createElement('span')
  estrela.className = favoritado ? 'seirmg-favorito-estrela' : 'seirmg-favorito-estrela seirmg-favorito-inativo'
  estrela.innerHTML = favoritado ? starIconSvg : starOffIconSvg
  estrela.title = favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
  estrela.addEventListener('click', (evento) => {
    evento.preventDefault()
    evento.stopPropagation()
    alternarFavorito(nup, link).catch((error) => {
      console.error('[SEIRMG] Falha ao favoritar processo:', error)
    })
  })
  return estrela
}

function aplicarEstrelasEmLinhas(linhas: Element[]): void {
  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  const agoraIso = new Date().toISOString()

  linhas.forEach((linha) => {
    if (linha.querySelector('.seirmg-favorito-estrela')) return

    const favorito = extrairFavoritoDaLinha(linha, agoraIso)
    if (!favorito) return

    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    if (!processo) return

    const favoritado = idsFavoritados.has(favorito.numero)
    processo.insertAdjacentElement('afterend', criarEstrela(favorito.numero, favorito.link, favoritado))
  })
}

function atualizarTodasAsEstrelas(): void {
  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  document.querySelectorAll<HTMLElement>('.seirmg-favorito-estrela').forEach((estrela) => {
    const processo = estrela.previousElementSibling as HTMLElement | null
    const nup = processo?.textContent?.trim()
    if (!nup) return

    const favoritado = idsFavoritados.has(nup)
    estrela.innerHTML = favoritado ? starIconSvg : starOffIconSvg
    estrela.className = favoritado ? 'seirmg-favorito-estrela' : 'seirmg-favorito-estrela seirmg-favorito-inativo'
    estrela.title = favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
  })
}
```

**Nota:** `criarEstrela` referencia `alternarFavorito`, que é definida no Step 3 abaixo — isso é válido em JavaScript/TypeScript porque `function alternarFavorito(...)` (function declaration) é hoisted; não é necessário reordenar.

- [ ] **Step 3: Alternar favorito, filtro por tabela, e stub do painel**

Adicione logo após as funções do Step 2:

```ts
function aplicarFiltroFavoritoNaTabela(idTabela: string): void {
  let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

  if (!favoritosAtivo || itensFavoritados.length === 0) {
    estado = removerFiltro(estado, 'PorFavoritoAberto')
    estadoFiltrosPorTabela.set(idTabela, estado)
    return
  }

  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  const linhas = linhasDaTabela(idTabela).map((linha, index) => {
    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    return { id: linha.id || String(index), nup: processo?.textContent?.trim() ?? null }
  })

  estado = registrarFiltro(estado, 'PorFavoritoAberto', calcularOcultacaoPorFavorito(linhas, idsFavoritados))
  estadoFiltrosPorTabela.set(idTabela, estado)
}

function aplicarFiltroFavoritoEmTodasAsTabelas(): void {
  IDS_TABELAS.forEach((idTabela) => {
    aplicarFiltroFavoritoNaTabela(idTabela)
    reaplicarOrdemDaTabela(idTabela)
  })
}

function renderizarPainelFavoritos(): void {
  // Implementado na Task 5 (painel visual). Por ora, mantém a estrela e o
  // filtro de ocultação funcionais sem o painel.
}

async function alternarFavorito(nup: string, link: string | null): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const atual = await store.get()
    const itens = atual.controleProcessos.favoritos.itens
    const jaFavoritado = itens.some((item) => item.numero === nup)
    const novosItens = jaFavoritado
      ? itens.filter((item) => item.numero !== nup)
      : [...itens, { numero: nup, link, adicionadoEm: new Date().toISOString() }]

    await store.set({
      ...atual,
      controleProcessos: {
        ...atual.controleProcessos,
        favoritos: { ...atual.controleProcessos.favoritos, itens: novosItens },
      },
    })

    itensFavoritados = novosItens
    aplicarFiltroFavoritoEmTodasAsTabelas()
    atualizarTodasAsEstrelas()
    renderizarPainelFavoritos()
  } catch (error) {
    console.error('[SEIRMG] Falha ao alternar favorito:', error)
  }
}
```

- [ ] **Step 4: Ler `favoritosAtivo`/`itensFavoritados` no bootstrap e aplicar estrelas/filtro**

Em `bootstrap()` (linha 1155-1191), logo após `montarAgrupamento(config)` (linha 1170) e antes de `const todasAsLinhas = ...` (linha 1172):

```ts
    montarAgrupamento(config)

    favoritosAtivo = config.controleProcessos.favoritos.ativo
    itensFavoritados = config.controleProcessos.favoritos.itens

    const todasAsLinhas = IDS_TABELAS.flatMap((idTabela) => linhasDaTabela(idTabela))
    aplicarEstrelasEmLinhas(todasAsLinhas)
    aplicarFiltroFavoritoEmTodasAsTabelas()
    renderizarPainelFavoritos()

    aplicarLinksPlankaEmLinhas(todasAsLinhas).catch((error) => {
      console.error('[SEIRMG] Falha ao aplicar links do Planka:', error)
    })
```

- [ ] **Step 5: Aplicar em linhas novas (rolagem infinita)**

Em `reaplicarTratamentosNasLinhasNovas` (linhas 995-1005), troque:

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

por:

```ts
function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  aplicarLinksPlankaEmLinhas(linhas).catch((error) => {
    console.error('[SEIRMG] Falha ao aplicar links do Planka nas linhas novas:', error)
  })
  aplicarEstrelasEmLinhas(linhas)
  aplicarFiltroFavoritoNaTabela(idTabela)
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdemDaTabela(idTabela)
  linhas.forEach((linha) => desabilitarSelecaoNaLinha(linha))
  renderizarPainelFavoritos()
}
```

- [ ] **Step 6: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros. (Confirma que `alternarFavorito` referenciado antes da declaração em `criarEstrela` resolve corretamente via hoisting.)

- [ ] **Step 7: Rodar toda a suíte de testes (garantir que nada quebrou)**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam (nenhum teste direto cobre este arquivo, mas a suíte completa não deve quebrar).

- [ ] **Step 8: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros.

- [ ] **Step 9: Commit**

```bash
cd /c/sei/seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): adiciona estrela de favoritar e filtro de ocultação"
```

---

### Task 5: Painel de Favoritos

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `ordenarFavoritosPorData` de `../../features/controle-processos/favoritos` (Task 2); `favoritosAtivo`, `itensFavoritados`, `IDS_TABELAS`, `linhasDaTabela`, `alternarFavorito`, `starIconSvg` (Task 4).
- Produces: substitui o stub `renderizarPainelFavoritos` da Task 4 pela implementação completa.

Sem teste direto (wiring de DOM). Verificação por typecheck + build + inspeção manual do HTML gerado (descrita no Step de review manual abaixo).

- [ ] **Step 1: CSS do painel**

Adicione ao final do template string `ESTILO_FILTROS_E_ESPECIFICACAO`, depois do bloco `.seirmg-favorito-estrela.seirmg-favorito-inativo` adicionado na Task 4:

```ts
  .seirmg-favoritos-painel {
    margin-top: 12px;
  }
  .seirmg-favoritos-painel-titulo {
    font-weight: bold;
    padding: 6px 10px;
    background: #fff4e0;
    border: 1px solid #f0d9a0;
    border-bottom: none;
  }
  .seirmg-favoritos-badge {
    display: inline-block;
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 10px;
    margin-left: 6px;
    background: #e8f2ff;
    color: #017fff;
  }
  .seirmg-favoritos-badge-fechado {
    background: #eee;
    color: #777;
  }
```

- [ ] **Step 2: Importar `ordenarFavoritosPorData`**

Em `src/content-scripts/procedimento_controlar/index.ts`, troque o import feito na Task 4:

```ts
import {
  extrairFavoritoDaLinha,
  calcularOcultacaoPorFavorito,
} from '../../features/controle-processos/favoritos'
```

por:

```ts
import {
  extrairFavoritoDaLinha,
  calcularOcultacaoPorFavorito,
  ordenarFavoritosPorData,
} from '../../features/controle-processos/favoritos'
```

- [ ] **Step 3: Funções auxiliares do painel**

Adicione, logo antes da função `renderizarPainelFavoritos` (o stub criado na Task 4):

```ts
function nupsAbertosNaPagina(): Set<string> {
  const nups = new Set<string>()
  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const nup = processo?.textContent?.trim()
      if (nup) nups.add(nup)
    })
  })
  return nups
}

function ultimaTabelaPresente(): Element | null {
  for (let i = IDS_TABELAS.length - 1; i >= 0; i--) {
    const tabela = document.querySelector(IDS_TABELAS[i])
    if (tabela) return tabela
  }
  return null
}

function montarLinhaPainelFavoritos(item: FavoritoProcesso, aberto: boolean): HTMLTableRowElement {
  const tr = document.createElement('tr')

  const tdProcesso = document.createElement('td')
  if (item.link) {
    const link = document.createElement('a')
    link.href = item.link
    link.textContent = item.numero
    tdProcesso.appendChild(link)
  } else {
    tdProcesso.appendChild(document.createTextNode(item.numero))
  }

  const badge = document.createElement('span')
  badge.className = aberto ? 'seirmg-favoritos-badge' : 'seirmg-favoritos-badge seirmg-favoritos-badge-fechado'
  badge.textContent = aberto ? 'aberto na sua caixa' : 'fechado'
  tdProcesso.appendChild(badge)
  tr.appendChild(tdProcesso)

  const tdRemover = document.createElement('td')
  const botaoRemover = document.createElement('span')
  botaoRemover.className = 'seirmg-favorito-estrela'
  botaoRemover.innerHTML = starIconSvg
  botaoRemover.title = 'Remover dos favoritos'
  botaoRemover.addEventListener('click', () => {
    alternarFavorito(item.numero, item.link).catch((error) => {
      console.error('[SEIRMG] Falha ao remover favorito:', error)
    })
  })
  tdRemover.appendChild(botaoRemover)
  tr.appendChild(tdRemover)

  return tr
}
```

- [ ] **Step 4: Implementar `renderizarPainelFavoritos`**

Substitua o stub criado na Task 4:

```ts
function renderizarPainelFavoritos(): void {
  // Implementado na Task 5 (painel visual). Por ora, mantém a estrela e o
  // filtro de ocultação funcionais sem o painel.
}
```

por:

```ts
function renderizarPainelFavoritos(): void {
  try {
    document.getElementById('seirmg-favoritos-painel')?.remove()

    if (!favoritosAtivo || itensFavoritados.length === 0) return

    const referencia = ultimaTabelaPresente()
    if (!referencia) return

    const painel = document.createElement('div')
    painel.id = 'seirmg-favoritos-painel'
    painel.className = 'seirmg-favoritos-painel'

    const titulo = document.createElement('div')
    titulo.className = 'seirmg-favoritos-painel-titulo'
    titulo.textContent = `★ Favoritos (${itensFavoritados.length} registro${itensFavoritados.length === 1 ? '' : 's'})`
    painel.appendChild(titulo)

    const tabela = document.createElement('table')
    tabela.className = 'infraTable'

    const thead = document.createElement('thead')
    const trHead = document.createElement('tr')
    ;['Processo', ''].forEach((rotulo) => {
      const th = document.createElement('th')
      th.className = 'infraTh'
      th.textContent = rotulo
      trHead.appendChild(th)
    })
    thead.appendChild(trHead)
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    const nupsAbertos = nupsAbertosNaPagina()
    ordenarFavoritosPorData(itensFavoritados).forEach((item) => {
      tbody.appendChild(montarLinhaPainelFavoritos(item, nupsAbertos.has(item.numero)))
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)

    referencia.insertAdjacentElement('afterend', painel)
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar painel de favoritos:', error)
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Rodar toda a suíte de testes**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam.

- [ ] **Step 7: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros.

- [ ] **Step 8: Commit**

```bash
cd /c/sei/seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): adiciona painel visual de Favoritos"
```

---

## Verificação final (fora do escopo de qualquer task individual)

Depois que todas as tasks estiverem completas e revisadas, a revisão final de branch (whole-branch review) deve confirmar:

1. `bunx tsc --noEmit`, `bun run test` e `bun run build` passam na branch completa.
2. Nenhum processo aparece duplicado: favoritar um processo aberto some da tabela nativa e some no painel.
3. Desfavoritar (estrela na tabela OU no painel) faz o processo voltar a aparecer na tabela nativa (se ainda estiver aberto) e sumir do painel.
4. `favoritos.ativo = false` (padrão) não altera nenhum comportamento visível — sem estrelas, sem filtro, sem painel (checar manualmente via `chrome.storage.sync` ou pela build carregada no Chrome, já que não há teste automatizado para esse wiring).
5. Rolagem infinita: favoritar um processo, rolar a página para carregar mais linhas, confirmar que a estrela aparece nas linhas novas e que o filtro/painel continuam corretos.
