# SEIRMG — Lote S: Kanban de Processos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer uma visão Kanban pro Controle de Processos do SEIRMG — colunas automáticas
(Recebidos/Gerados/Favoritos) + listas criadas pelo usuário, drag-and-drop nativo, cards com
marcador colorido visível, aba própria em Opções com ícone.

**Architecture:** Módulo de lógica pura nova (`features/controle-processos/kanban.ts`, testado)
decide em qual coluna cada processo cai e faz o CRUD de listas; um módulo de UI compartilhado
(`content-scripts/shared/kanbanCard.ts`, sem estado) desenha o conteúdo estático de um card; toda
a montagem interativa do board (drag-and-drop, botões, wiring com `SyncConfig`) vive em
`content-scripts/procedimento_controlar/index.ts`, seguindo exatamente o padrão que o painel de
Favoritos já usa nesse mesmo arquivo. Zero dependências novas.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Vitest (+ jsdom para DOM em teste),
`lucide-static` (ícones SVG inline), HTML5 Drag and Drop API nativa, `chrome.storage` via
`createSyncConfigStore`/`createLocalConfigStore` (`lib/storage.ts`).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-10-seirmg-lote-s-kanban-design.md` — toda
  tarefa abaixo implementa uma parte específica dela; não adicionar escopo que não esteja lá.
- Sem dependência nova (`package.json` não ganha entradas) — drag-and-drop é a API nativa do
  navegador, ids de lista são `crypto.randomUUID()`.
- Todo código novo de topo em `content-scripts/procedimento_controlar/index.ts` segue a política
  já estabelecida no arquivo: `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca
  propaga exceção pro chamador.
- Reaproveitar o máximo de função/seletor já validado no arquivo em vez de duplicar (ver cada
  tarefa abaixo pra o que reaproveitar especificamente). Não inventar seletor novo quando um já
  validado serve.
- Card mora em exatamente uma coluna por vez (pertencimento exclusivo) — ver `calcularColuna` na
  Tarefa 2, é a função central de todo o desenho.
- Testes novos seguem o estilo de `favoritos.test.ts`/`agrupamento.test.ts`: `vitest`,
  `describe`/`it`, `expect().toEqual/toBe`, DOM construído via
  `new DOMParser().parseFromString(...)` quando o teste precisa de um `Element`.
- **Sobre "Rodar o typecheck: sem erro" nas Tarefas 7-11**: `tsconfig.json` tem
  `noUnusedLocals`/`noUnusedParameters: true`. Como essas 5 tarefas constroem o board de forma
  incremental no mesmo arquivo (`procedimento_controlar/index.ts`), é **esperado** que
  `bunx tsc --noEmit` acuse `TS6133 declared but never read` pra funções/imports/parâmetros que só
  passam a ser consumidos numa tarefa posterior (ex.: `montarKanban` fica sem chamador até a
  Tarefa 12 ligar no `bootstrap()`). Isso não é um bug da tarefa que introduz o símbolo — é
  reconhecer esses erros específicos (cada um correspondendo a algo que uma tarefa *futura, já
  planejada* consome) como esperados, não mascará-los com `_prefixo`/`@ts-expect-error` (sem
  precedente no projeto) nem chamar a função cedo demais só pra silenciar o compilador. `bun run
  build` (Vite/esbuild) não tem essa checagem e deve continuar passando normalmente em todas as
  tarefas — é o sinal prático de "nada quebrou de verdade" enquanto isso. O gate de
  `tsc --noEmit` **limpo de verdade** é o da Tarefa 12 (Step 3), depois de tudo ligado.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/storage.ts` | Modificar — tipos e defaults do Kanban |
| `src/lib/storage.test.ts` | Modificar — round-trip do campo novo |
| `src/features/controle-processos/favoritosRender.ts` | Modificar — recebe `obterMarcadoresDaLinha`/`MarcadorFavorito`, hoje presos em `index.ts` |
| `src/features/controle-processos/favoritosRender.test.ts` | Criar — cobre a função relocada |
| `src/content-scripts/procedimento_controlar/index.ts` | Modificar — consome `obterMarcadoresDaLinha` de fora; ganha o board inteiro |
| `src/features/controle-processos/kanban.ts` | Criar — lógica pura (colunas, listas, extratores de linha) |
| `src/features/controle-processos/kanban.test.ts` | Criar |
| `src/content-scripts/shared/kanbanCard.ts` | Criar — conteúdo estático do card |
| `src/options/index.html` | Modificar — aba nova |
| `src/options/main.ts` | Modificar — ícone + `carregarAbaKanban` |

---

### Task 1: Config do Kanban em `lib/storage.ts`

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Produces: `KanbanLista { id: string; nome: string; ordem: number }`,
  `KanbanCardPosicao { numero: string; listaId: string }`,
  `KanbanConfig { ativo: boolean; listas: KanbanLista[]; posicoes: KanbanCardPosicao[] }`,
  campo `kanban: KanbanConfig` em `ControleProcessosConfig`.

- [ ] **Step 1: Adicionar os tipos**

Em `src/lib/storage.ts`, logo depois da interface `AlertaNaoAssinadosConfig` (que já existe hoje
antes de `ControleProcessosConfig`):

```ts
export interface KanbanLista {
  id: string
  nome: string
  ordem: number
}

export interface KanbanCardPosicao {
  numero: string
  listaId: string
}

export interface KanbanConfig {
  ativo: boolean
  listas: KanbanLista[]
  posicoes: KanbanCardPosicao[]
}
```

- [ ] **Step 2: Adicionar o campo em `ControleProcessosConfig`**

```ts
export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
  favoritos: FavoritosConfig
  alertaNaoAssinados: AlertaNaoAssinadosConfig
  kanban: KanbanConfig
}
```

- [ ] **Step 3: Adicionar o default**

Em `DEFAULT_SYNC_CONFIG.controleProcessos`, depois de `alertaNaoAssinados: { ativo: true }`:

```ts
    kanban: {
      ativo: false,
      listas: [],
      posicoes: [],
    },
```

- [ ] **Step 4: Escrever o teste de round-trip**

Em `src/lib/storage.test.ts`, ache o teste de round-trip existente pra `controleProcessos` (mesmo
padrão dos demais campos) e adicione, no mesmo `describe` de round-trip:

```ts
it('faz round-trip de controleProcessos.kanban', async () => {
  const store = createSyncConfigStore()
  const config = await store.get()
  const atualizado = {
    ...config,
    controleProcessos: {
      ...config.controleProcessos,
      kanban: {
        ativo: true,
        listas: [{ id: 'lista-1', nome: 'Em análise', ordem: 0 }],
        posicoes: [{ numero: 'HMMG.2025.00001-1', listaId: 'lista-1' }],
      },
    },
  }
  await store.set(atualizado)
  const relido = await store.get()
  expect(relido.controleProcessos.kanban).toEqual(atualizado.controleProcessos.kanban)
})
```

Se o arquivo usa outro nome de variável pra loja/config no describe de round-trip existente,
ajuste pro nome já usado ali em vez do que está acima — o importante é o `expect` final.

- [ ] **Step 5: Rodar os testes**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (incluindo o teste novo)

- [ ] **Step 6: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro — `DEFAULT_SYNC_CONFIG` precisa bater 100% com `SyncConfig` (TS reclama de
campo faltando em objeto literal tipado)

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): adiciona KanbanConfig (listas e posições de card)"
```

---

### Task 2: Lógica pura de colunas e listas — `features/controle-processos/kanban.ts`

**Files:**
- Create: `src/features/controle-processos/kanban.ts`
- Test: `src/features/controle-processos/kanban.test.ts`

**Interfaces:**
- Consumes: `KanbanLista`, `KanbanCardPosicao` (Task 1, `../../lib/storage`).
- Produces: `type OrigemAutomatica = 'recebidos' | 'gerados'`,
  `type ColunaKanban = { tipo: 'automatica'; chave: OrigemAutomatica | 'favoritos' } | { tipo: 'lista'; id: string }`,
  `calcularColuna(origem, favoritado, listaIdManual): ColunaKanban`,
  `montarPosicoesAtualizadas(posicoes, numero, listaId): KanbanCardPosicao[]`,
  `criarLista(listasAtuais, nome): { lista: KanbanLista; listas: KanbanLista[] }`,
  `renomearLista(listas, id, novoNome): KanbanLista[]`,
  `removerLista(listas, posicoes, id): { listas: KanbanLista[]; posicoes: KanbanCardPosicao[] }`,
  `ordenarListas(listas): KanbanLista[]`.

- [ ] **Step 1: Escrever os testes de `calcularColuna`**

Criar `src/features/controle-processos/kanban.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calcularColuna } from './kanban'

describe('calcularColuna', () => {
  it('cai na origem quando não é favorito e não tem posição manual', () => {
    expect(calcularColuna('recebidos', false, null)).toEqual({ tipo: 'automatica', chave: 'recebidos' })
    expect(calcularColuna('gerados', false, null)).toEqual({ tipo: 'automatica', chave: 'gerados' })
  })

  it('favoritado sobrepõe a origem', () => {
    expect(calcularColuna('recebidos', true, null)).toEqual({ tipo: 'automatica', chave: 'favoritos' })
    expect(calcularColuna('gerados', true, null)).toEqual({ tipo: 'automatica', chave: 'favoritos' })
  })

  it('posição manual sobrepõe favoritado e origem', () => {
    expect(calcularColuna('recebidos', true, 'lista-1')).toEqual({ tipo: 'lista', id: 'lista-1' })
    expect(calcularColuna('gerados', false, 'lista-2')).toEqual({ tipo: 'lista', id: 'lista-2' })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/controle-processos/kanban.test.ts`
Expected: FAIL — `Cannot find module './kanban'`

- [ ] **Step 3: Implementar `calcularColuna`**

Criar `src/features/controle-processos/kanban.ts`:

```ts
import type { KanbanCardPosicao, KanbanLista } from '../../lib/storage'

export type OrigemAutomatica = 'recebidos' | 'gerados'

export type ColunaKanban =
  | { tipo: 'automatica'; chave: OrigemAutomatica | 'favoritos' }
  | { tipo: 'lista'; id: string }

// Pertencimento exclusivo: card nasce na origem (fato do SEI); favoritar (feature já existente,
// Lote L) sobrepõe; posição manual (arrastar pra uma lista sua) sobrepõe tudo. Nunca combina.
export function calcularColuna(
  origem: OrigemAutomatica,
  favoritado: boolean,
  listaIdManual: string | null
): ColunaKanban {
  if (listaIdManual !== null) return { tipo: 'lista', id: listaIdManual }
  if (favoritado) return { tipo: 'automatica', chave: 'favoritos' }
  return { tipo: 'automatica', chave: origem }
}
```

- [ ] **Step 4: Rodar de novo**

Run: `bunx vitest run src/features/controle-processos/kanban.test.ts`
Expected: PASS

- [ ] **Step 5: Testes de `montarPosicoesAtualizadas`**

Adicionar ao teste:

```ts
import { montarPosicoesAtualizadas } from './kanban'

describe('montarPosicoesAtualizadas', () => {
  it('adiciona uma posição nova', () => {
    const resultado = montarPosicoesAtualizadas([], 'HMMG.1', 'lista-1')
    expect(resultado).toEqual([{ numero: 'HMMG.1', listaId: 'lista-1' }])
  })

  it('atualiza a posição de um card que já tinha uma', () => {
    const posicoes = [{ numero: 'HMMG.1', listaId: 'lista-1' }]
    const resultado = montarPosicoesAtualizadas(posicoes, 'HMMG.1', 'lista-2')
    expect(resultado).toEqual([{ numero: 'HMMG.1', listaId: 'lista-2' }])
  })

  it('remove a posição quando listaId é null (volta ao automático)', () => {
    const posicoes = [{ numero: 'HMMG.1', listaId: 'lista-1' }, { numero: 'HMMG.2', listaId: 'lista-1' }]
    const resultado = montarPosicoesAtualizadas(posicoes, 'HMMG.1', null)
    expect(resultado).toEqual([{ numero: 'HMMG.2', listaId: 'lista-1' }])
  })

  it('não mexe nas posições de outros cards', () => {
    const posicoes = [{ numero: 'HMMG.1', listaId: 'lista-1' }, { numero: 'HMMG.2', listaId: 'lista-1' }]
    const resultado = montarPosicoesAtualizadas(posicoes, 'HMMG.3', 'lista-2')
    expect(resultado).toEqual([
      { numero: 'HMMG.1', listaId: 'lista-1' },
      { numero: 'HMMG.2', listaId: 'lista-1' },
      { numero: 'HMMG.3', listaId: 'lista-2' },
    ])
  })
})
```

- [ ] **Step 6: Implementar `montarPosicoesAtualizadas`**

Adicionar em `kanban.ts`:

```ts
export function montarPosicoesAtualizadas(
  posicoes: KanbanCardPosicao[],
  numero: string,
  listaId: string | null
): KanbanCardPosicao[] {
  const semEsseNumero = posicoes.filter((posicao) => posicao.numero !== numero)
  if (listaId === null) return semEsseNumero
  return [...semEsseNumero, { numero, listaId }]
}
```

- [ ] **Step 7: Rodar de novo**

Run: `bunx vitest run src/features/controle-processos/kanban.test.ts`
Expected: PASS

- [ ] **Step 8: Testes de `criarLista`/`renomearLista`/`removerLista`/`ordenarListas`**

Adicionar:

```ts
import { criarLista, ordenarListas, removerLista, renomearLista } from './kanban'

describe('criarLista', () => {
  it('cria a primeira lista com ordem 0', () => {
    const { lista, listas } = criarLista([], 'Em análise')
    expect(lista.nome).toBe('Em análise')
    expect(lista.ordem).toBe(0)
    expect(lista.id).toBeTruthy()
    expect(listas).toEqual([lista])
  })

  it('a próxima lista nasce com ordem = maior ordem existente + 1', () => {
    const listasAtuais = [{ id: 'a', nome: 'Primeira', ordem: 0 }]
    const { lista } = criarLista(listasAtuais, 'Segunda')
    expect(lista.ordem).toBe(1)
  })

  it('cada lista nasce com um id diferente', () => {
    const { listas } = criarLista(criarLista([], 'A').listas, 'B')
    const ids = listas.map((lista) => lista.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('renomearLista', () => {
  it('renomeia só a lista com o id pedido', () => {
    const listas = [{ id: 'a', nome: 'Velho nome', ordem: 0 }, { id: 'b', nome: 'Outra', ordem: 1 }]
    const resultado = renomearLista(listas, 'a', 'Novo nome')
    expect(resultado).toEqual([{ id: 'a', nome: 'Novo nome', ordem: 0 }, { id: 'b', nome: 'Outra', ordem: 1 }])
  })
})

describe('removerLista', () => {
  it('remove a lista e limpa as posições que apontavam pra ela', () => {
    const listas = [{ id: 'a', nome: 'A', ordem: 0 }, { id: 'b', nome: 'B', ordem: 1 }]
    const posicoes = [{ numero: 'HMMG.1', listaId: 'a' }, { numero: 'HMMG.2', listaId: 'b' }]
    const resultado = removerLista(listas, posicoes, 'a')
    expect(resultado.listas).toEqual([{ id: 'b', nome: 'B', ordem: 1 }])
    expect(resultado.posicoes).toEqual([{ numero: 'HMMG.2', listaId: 'b' }])
  })
})

describe('ordenarListas', () => {
  it('ordena por ordem crescente', () => {
    const listas = [{ id: 'b', nome: 'B', ordem: 2 }, { id: 'a', nome: 'A', ordem: 0 }]
    expect(ordenarListas(listas).map((lista) => lista.id)).toEqual(['a', 'b'])
  })

  it('não modifica o array original', () => {
    const listas = [{ id: 'b', nome: 'B', ordem: 1 }, { id: 'a', nome: 'A', ordem: 0 }]
    const copia = [...listas]
    ordenarListas(listas)
    expect(listas).toEqual(copia)
  })
})
```

- [ ] **Step 9: Implementar as quatro funções**

Adicionar em `kanban.ts`:

```ts
export function criarLista(
  listasAtuais: KanbanLista[],
  nome: string
): { lista: KanbanLista; listas: KanbanLista[] } {
  const maiorOrdem = listasAtuais.reduce((maior, lista) => Math.max(maior, lista.ordem), -1)
  const lista: KanbanLista = { id: crypto.randomUUID(), nome, ordem: maiorOrdem + 1 }
  return { lista, listas: [...listasAtuais, lista] }
}

export function renomearLista(listas: KanbanLista[], id: string, novoNome: string): KanbanLista[] {
  return listas.map((lista) => (lista.id === id ? { ...lista, nome: novoNome } : lista))
}

export function removerLista(
  listas: KanbanLista[],
  posicoes: KanbanCardPosicao[],
  id: string
): { listas: KanbanLista[]; posicoes: KanbanCardPosicao[] } {
  return {
    listas: listas.filter((lista) => lista.id !== id),
    posicoes: posicoes.filter((posicao) => posicao.listaId !== id),
  }
}

export function ordenarListas(listas: KanbanLista[]): KanbanLista[] {
  return [...listas].sort((a, b) => a.ordem - b.ordem)
}
```

- [ ] **Step 10: Rodar tudo**

Run: `bunx vitest run src/features/controle-processos/kanban.test.ts`
Expected: PASS (todos os `describe` acima)

- [ ] **Step 11: Commit**

```bash
git add src/features/controle-processos/kanban.ts src/features/controle-processos/kanban.test.ts
git commit -m "feat(kanban): lógica pura de colunas e CRUD de listas"
```

---

### Task 3: Extratores de linha (dados que faltam no processo) — ainda em `kanban.ts`

A referência (`C:\sei\seikaban\content-script.js`) resolve esses campos por heurística de
célula/imagem ("tenta achar uma célula que parece uma data", "tenta achar uma célula do meio que
não é o número do processo"). A spec exige seletor real e validado, não a adivinhação da
referência (`docs/superpowers/specs/2026-08-10-seirmg-lote-s-kanban-design.md:159-167`) — e como
o SEIRMG não tem hoje seletor próprio validado pra data/hora, nível de acesso e unidade geradora
(decisão tomada em revisão: **esses 3 campos ficam de fora do card por enquanto**, em vez de
portar a heurística frágil da referência), este lote implementa só o que dá pra fazer com
seletor confiável:

- **"Não recebido"**: usa a classe nativa `.processoNaoVisualizado` (já usada em
  `favoritos.ts`/`agrupamento.ts` neste projeto) — não é um port da referência, é mais confiável
  que a heurística de imagem dela.
- **"Documento alterado"**: o `img[src*="exclamacao.svg"]` da referência é mantido — é um
  seletor direto (não uma heurística de "qual célula pode ser isso"), risco baixo.
- **Ano do processo**: regex direto sobre o próprio número (`extrairAnoProcesso`), sem tocar em
  célula nenhuma da tabela — também não é heurística, é parsing de uma string que a gente já tem.

**Files:**
- Modify: `src/features/controle-processos/kanban.ts`
- Test: `src/features/controle-processos/kanban.test.ts`

**Interfaces:**
- Produces: `linhaNaoRecebida(linha: Element): boolean`,
  `linhaTemDocumentoAlterado(linha: Element): boolean`,
  `extrairAnoProcesso(numero: string): string | null`.

- [ ] **Step 1: Escrever os testes**

Adicionar em `kanban.test.ts`:

```ts
function criarLinha(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

import { extrairAnoProcesso, linhaNaoRecebida, linhaTemDocumentoAlterado } from './kanban'

describe('linhaNaoRecebida', () => {
  it('true quando a linha tem .processoNaoVisualizado', () => {
    expect(linhaNaoRecebida(criarLinha('<td><a class="processoNaoVisualizado">HMMG.1</a></td>'))).toBe(true)
  })

  it('false quando a linha tem .processoVisualizado', () => {
    expect(linhaNaoRecebida(criarLinha('<td><a class="processoVisualizado">HMMG.1</a></td>'))).toBe(false)
  })
})

describe('linhaTemDocumentoAlterado', () => {
  it('true quando há img de exclamação', () => {
    expect(linhaTemDocumentoAlterado(criarLinha('<td><img src="/img/exclamacao.svg"></td>'))).toBe(true)
  })

  it('false quando não há', () => {
    expect(linhaTemDocumentoAlterado(criarLinha('<td>sem imagem</td>'))).toBe(false)
  })
})

describe('extrairAnoProcesso', () => {
  it('extrai o ano entre a barra e o hífen', () => {
    expect(extrairAnoProcesso('0021.042267/2024-10')).toBe('2024')
  })

  it('null quando o número não bate o padrão', () => {
    expect(extrairAnoProcesso('numero-invalido')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/controle-processos/kanban.test.ts`
Expected: FAIL — funções não existem ainda

- [ ] **Step 3: Implementar**

Adicionar em `kanban.ts`:

```ts
export function linhaNaoRecebida(linha: Element): boolean {
  return !!linha.querySelector('.processoNaoVisualizado')
}

export function linhaTemDocumentoAlterado(linha: Element): boolean {
  return !!linha.querySelector('img[src*="exclamacao.svg"]')
}

// Padrão: 0021.042267/2024-10 — ano vem depois da barra, antes do hífen. Usado pelo filtro de
// ano da toolbar (Task 11), mesma extração que a referência já usa.
export function extrairAnoProcesso(numero: string): string | null {
  return numero.match(/\/(\d{4})-/)?.[1] ?? null
}
```

- [ ] **Step 4: Rodar de novo**

Run: `bunx vitest run src/features/controle-processos/kanban.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/kanban.ts src/features/controle-processos/kanban.test.ts
git commit -m "feat(kanban): extratores de linha (não recebido, doc alterado, ano do processo)"
```

---

### Task 4: Relocar `obterMarcadoresDaLinha` pra `favoritosRender.ts`

O card do Kanban precisa desenhar o marcador do jeito que já existe (nome + cor real + ícone
nativo do SEI) — mas essa extração (`obterMarcadoresDaLinha`/`MarcadorFavorito`) hoje é uma
função privada em `procedimento_controlar/index.ts`, e `shared/kanbanCard.ts` (Task 5) não pode
importar de outro content-script (só `index.ts` importa de `shared/`, nunca o contrário — mesmo
sentido de dependência que `shared/plankaCard.ts` já segue). Solução: mover a função pro módulo
de renderização que já teria essa responsabilidade (`favoritosRender.ts`, que já tem
`montarCelulaMarcadoresCongelados`), e `index.ts` passa a importar de lá — sem duplicar nada.

**Files:**
- Modify: `src/features/controle-processos/favoritosRender.ts`
- Modify: `src/content-scripts/procedimento_controlar/index.ts`
- Test: `src/features/controle-processos/favoritosRender.test.ts` (novo arquivo)

**Interfaces:**
- Produces: `MarcadorFavorito { nome: string; estilo: string | null; iconeHtml: string }`,
  `obterMarcadoresDaLinha(linha: Element): MarcadorFavorito[]` (agora exportado de
  `favoritosRender.ts`).

- [ ] **Step 1: Escrever o teste da função relocada**

Criar `src/features/controle-processos/favoritosRender.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { obterMarcadoresDaLinha } from './favoritosRender'

function criarLinha(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

describe('obterMarcadoresDaLinha', () => {
  it('extrai nome, estilo e ícone de um marcador', () => {
    const linha = criarLinha(
      `<td><a href="controlador.php?acao=andamento_marcador_gerenciar" style="background:#dc3545" onmouseover="return infraTooltipMostrar('','Urgente')"><img class="imagemStatus"></a></td>`
    )
    const marcadores = obterMarcadoresDaLinha(linha)
    expect(marcadores).toEqual([
      { nome: 'Urgente', estilo: 'background:#dc3545', iconeHtml: '<img class="imagemstatus">' },
    ])
  })

  it('retorna array vazio quando não há marcador', () => {
    expect(obterMarcadoresDaLinha(criarLinha('<td>sem marcador</td>'))).toEqual([])
  })

  it('ignora marcador cujo onmouseover não tem segundo argumento (nome vazio)', () => {
    const linha = criarLinha(
      `<td><a href="controlador.php?acao=andamento_marcador_gerenciar" onmouseover="return infraTooltipMostrar('')"></a></td>`
    )
    expect(obterMarcadoresDaLinha(linha)).toEqual([])
  })

  it('extrai múltiplos marcadores na mesma linha', () => {
    const linha = criarLinha(
      `<td>
        <a href="controlador.php?acao=andamento_marcador_gerenciar" onmouseover="return infraTooltipMostrar('','Urgente')"></a>
        <a href="controlador.php?acao=andamento_marcador_gerenciar" onmouseover="return infraTooltipMostrar('','Jurídico')"></a>
      </td>`
    )
    expect(obterMarcadoresDaLinha(linha).map((m) => m.nome)).toEqual(['Urgente', 'Jurídico'])
  })
})
```

Nota: o `iconeHtml` esperado no primeiro teste é `<img class="imagemstatus">` (minúsculo) porque
é assim que o `innerHTML` do jsdom serializa de volta — se o teste falhar só nesse detalhe de
capitalização, ajuste a asserção pro que o `console.log(marcadores)` mostrar, o resto da forma
deve bater.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/controle-processos/favoritosRender.test.ts`
Expected: FAIL — `obterMarcadoresDaLinha` não é exportado de `favoritosRender.ts` ainda

- [ ] **Step 3: Mover a função e o tipo**

Em `src/content-scripts/procedimento_controlar/index.ts`, localizar (por volta da linha 789-809):

```ts
interface MarcadorFavorito {
  nome: string
  estilo: string | null
  iconeHtml: string
}

function obterMarcadoresDaLinha(linha: Element): MarcadorFavorito[] {
  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  return marcadores
    .map((marcador) => {
      const onmouseover = marcador.getAttribute('onmouseover')
      return {
        nome: onmouseover ? extrairNomeMarcador(onmouseover) : '',
        estilo: marcador.getAttribute('style'),
        iconeHtml: marcador.innerHTML,
      }
    })
    .filter((item) => item.nome !== '')
}
```

Remover esse bloco inteiro de `index.ts`.

Em `src/features/controle-processos/favoritosRender.ts`, adicionar no topo (perto dos outros
imports de ícone) `import { extrairNomeMarcador } from './agrupamento'` e, antes de
`montarCelulaMarcadoresCongelados`, colar o mesmo bloco (só trocando `function` por
`export function` e `interface` por `export interface`):

```ts
export interface MarcadorFavorito {
  nome: string
  estilo: string | null
  iconeHtml: string
}

export function obterMarcadoresDaLinha(linha: Element): MarcadorFavorito[] {
  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  return marcadores
    .map((marcador) => {
      const onmouseover = marcador.getAttribute('onmouseover')
      return {
        nome: onmouseover ? extrairNomeMarcador(onmouseover) : '',
        estilo: marcador.getAttribute('style'),
        iconeHtml: marcador.innerHTML,
      }
    })
    .filter((item) => item.nome !== '')
}
```

- [ ] **Step 4: Atualizar o import em `index.ts`**

Em `index.ts`, no bloco de import de `../../features/controle-processos/favoritosRender`
(topo do arquivo), incluir `obterMarcadoresDaLinha` e `type MarcadorFavorito`:

```ts
import {
  criarIcone,
  montarCelulaMarcadoresCongelados,
  montarCelulaPrazoCongelado,
  montarCelulaAtribuicao,
  obterMarcadoresDaLinha,
  type MarcadorFavorito,
} from '../../features/controle-processos/favoritosRender'
```

Todo uso existente de `obterMarcadoresDaLinha`/`MarcadorFavorito` dentro de `index.ts` (por
exemplo em `capturarSnapshotDaLinha` e `montarCelulaMarcadores`) continua funcionando sem
alteração — só passou a vir de outro módulo.

- [ ] **Step 5: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro — se sobrar algum `MarcadorFavorito`/`obterMarcadoresDaLinha` não resolvido em
`index.ts`, é sinal de que faltou incluir no import do Step 4.

- [ ] **Step 6: Rodar os testes**

Run: `bunx vitest run src/features/controle-processos/favoritosRender.test.ts`
Expected: PASS

Run: `bunx vitest run`
Expected: PASS geral (nenhum teste existente deve ter quebrado com a relocação)

- [ ] **Step 7: Commit**

```bash
git add src/features/controle-processos/favoritosRender.ts src/features/controle-processos/favoritosRender.test.ts src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor: move obterMarcadoresDaLinha pra favoritosRender.ts (reuso no card do Kanban)"
```

---

### Task 5: Conteúdo estático do card — `content-scripts/shared/kanbanCard.ts`

Mesma forma de `shared/plankaCard.ts`: um `montarEstiloKanbanCard()` que injeta o próprio
`<style>` (idempotente, `id` fixo) e um `montarConteudoCardKanban(dados)` que só monta e devolve
elementos — nada de estado, nada de listener. Quem coloca `draggable`, clique, estrela e "×" é
`index.ts` (Task 8/9), por cima do que essa função devolve.

**Files:**
- Create: `src/content-scripts/shared/kanbanCard.ts`

**Interfaces:**
- Consumes: `MarcadorFavorito` (Task 4, `../../features/controle-processos/favoritosRender`).
- Produces: `DadosCardKanban` (interface), `montarEstiloKanbanCard(): void`,
  `montarConteudoCardKanban(dados: DadosCardKanban): HTMLElement`.

- [ ] **Step 1: Implementar**

Criar `src/content-scripts/shared/kanbanCard.ts`:

```ts
import type { MarcadorFavorito } from '../../features/controle-processos/favoritosRender'

export interface DadosCardKanban {
  numero: string
  tipoProcesso: string | null
  especificacao: string | null
  marcadores: MarcadorFavorito[]
  atribuicao: string | null
  prazoTexto: string | null
  documentoAlterado: boolean
  naoRecebido: boolean
}

const ESTILO_KANBAN_CARD = `
  .seirmg-kanban-card-marcadores { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .seirmg-kanban-card-marcador { display: inline-flex; align-items: center; border-radius: 3px; padding: 1px 6px; font-size: 11px; }
  .seirmg-kanban-card-marcador-icone { display: inline-flex; margin-right: 3px; }
  .seirmg-kanban-card-marcador-icone svg, .seirmg-kanban-card-marcador-icone img { width: 12px; height: 12px; }
  .seirmg-kanban-card-tipo { font-size: 10px; color: #6c757d; margin-bottom: 4px; padding: 2px 6px; background: #f8f9fa; border-radius: 3px; border-left: 3px solid #6c757d; }
  .seirmg-kanban-card-especificacao { font-size: 12px; color: #333; line-height: 1.4; margin-bottom: 6px; font-weight: 500; }
  .seirmg-kanban-card-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .seirmg-kanban-card-badge { font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 500; }
  .seirmg-kanban-card-badge-alerta { background: #fff3cd; color: #856404; }
  .seirmg-kanban-card-badge-perigo { background: #f8d7da; color: #721c24; }
  .seirmg-kanban-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: #6c757d; margin-bottom: 4px; }
  .seirmg-kanban-card-atribuicao { font-size: 10px; color: #555; background: #f8f9fa; padding: 3px 6px; border-radius: 3px; margin-top: 4px; border-left: 3px solid #017fff; }
`

export function montarEstiloKanbanCard(): void {
  if (document.getElementById('seirmg-estilo-kanban-card')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-kanban-card'
  style.textContent = ESTILO_KANBAN_CARD
  document.head.appendChild(style)
}

export function montarConteudoCardKanban(dados: DadosCardKanban): HTMLElement {
  const raiz = document.createElement('div')

  if (dados.marcadores.length > 0) {
    const linhaMarcadores = document.createElement('div')
    linhaMarcadores.className = 'seirmg-kanban-card-marcadores'
    dados.marcadores.forEach(({ nome, estilo, iconeHtml }) => {
      const pill = document.createElement('span')
      pill.className = 'seirmg-kanban-card-marcador'
      if (estilo) pill.setAttribute('style', estilo)
      if (iconeHtml.trim()) {
        const icone = document.createElement('span')
        icone.className = 'seirmg-kanban-card-marcador-icone'
        icone.innerHTML = iconeHtml
        pill.appendChild(icone)
      }
      pill.appendChild(document.createTextNode(nome))
      linhaMarcadores.appendChild(pill)
    })
    raiz.appendChild(linhaMarcadores)
  }

  if (dados.tipoProcesso) {
    const tipo = document.createElement('div')
    tipo.className = 'seirmg-kanban-card-tipo'
    tipo.textContent = dados.tipoProcesso
    raiz.appendChild(tipo)
  }

  if (dados.especificacao) {
    const especificacao = document.createElement('div')
    especificacao.className = 'seirmg-kanban-card-especificacao'
    especificacao.textContent = dados.especificacao
    raiz.appendChild(especificacao)
  }

  const badges: Array<{ texto: string; classe: string }> = []
  if (dados.naoRecebido) badges.push({ texto: 'Não recebido', classe: 'seirmg-kanban-card-badge-perigo' })
  if (dados.documentoAlterado) {
    badges.push({ texto: '⚠ Documento incluído/assinado', classe: 'seirmg-kanban-card-badge-alerta' })
  }
  if (badges.length > 0) {
    const linhaBadges = document.createElement('div')
    linhaBadges.className = 'seirmg-kanban-card-badges'
    badges.forEach(({ texto, classe }) => {
      const badge = document.createElement('span')
      badge.className = `seirmg-kanban-card-badge ${classe}`
      badge.textContent = texto
      linhaBadges.appendChild(badge)
    })
    raiz.appendChild(linhaBadges)
  }

  const metaPartes = [dados.prazoTexto].filter((parte): parte is string => !!parte)
  if (metaPartes.length > 0) {
    const meta = document.createElement('div')
    meta.className = 'seirmg-kanban-card-meta'
    metaPartes.forEach((parte) => {
      const span = document.createElement('span')
      span.textContent = parte
      meta.appendChild(span)
    })
    raiz.appendChild(meta)
  }

  if (dados.atribuicao) {
    const atribuicao = document.createElement('div')
    atribuicao.className = 'seirmg-kanban-card-atribuicao'
    atribuicao.textContent = dados.atribuicao
    raiz.appendChild(atribuicao)
  }

  return raiz
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/shared/kanbanCard.ts
git commit -m "feat(kanban): módulo de conteúdo estático do card (shared/kanbanCard.ts)"
```

---

### Task 6: Aba "Kanban" em Opções

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `config.controleProcessos.kanban.ativo` (Task 1).

- [ ] **Step 1: Adicionar o botão de aba e o painel no HTML**

Em `src/options/index.html`, dentro de `<nav id="abas">`, adicionar o botão logo depois do de
"Processos" (mantém a ordem visual perto do que ele afeta):

```html
<button data-aba="kanban" class="aba-btn">Kanban</button>
```

E, dentro de `<main class="conteudo">`, adicionar o painel logo depois de `#painel-processos`:

```html
<section id="painel-kanban" class="painel">
  <h2>Kanban de Processos</h2>
  <label>
    <input type="checkbox" id="kanban-ativo" />
    Ativar Kanban no Controle de Processos
  </label>
  <p style="font-size: 0.85em; color: #666; max-width: 480px;">
    Mostra o botão "Visão Kanban" acima das tabelas de Recebidos e Gerados. Colunas automáticas
    (Recebidos, Gerados, Favoritos) e suas próprias listas são gerenciadas direto no board.
  </p>
  <br />
  <button id="kanban-salvar">Salvar</button>
  <span id="kanban-status"></span>
</section>
```

- [ ] **Step 2: Ícone da aba**

Em `src/options/main.ts`, adicionar o import do ícone (perto dos outros `IconSvg`):

```ts
import kanbanIconSvg from 'lucide-static/icons/kanban.svg?raw'
```

E adicionar a entrada em `ICONES_ABA`:

```ts
const ICONES_ABA: Record<string, string> = {
  geral: settingsIconSvg,
  aparencia: paletteIconSvg,
  processos: listChecksIconSvg,
  editor: fileEditIconSvg,
  corretor: spellCheckIconSvg,
  ia: sparklesIconSvg,
  kanban: kanbanIconSvg,
  notificacoes: bellIconSvg,
  integracoes: plugIconSvg,
  sobre: infoIconSvg,
}
```

- [ ] **Step 3: Carregar/salvar a aba**

Em `src/options/main.ts`, adicionar a função (mesmo padrão de `carregarAbaAssinatura`, é a mais
simples de espelhar por só ter um campo):

```ts
async function carregarAbaKanban(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('kanban-ativo') as HTMLInputElement | null
    const status = document.getElementById('kanban-status')

    if (inputAtivo) inputAtivo.checked = config.controleProcessos.kanban.ativo

    document.getElementById('kanban-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          controleProcessos: {
            ...config.controleProcessos,
            kanban: {
              ...config.controleProcessos.kanban,
              ativo: inputAtivo?.checked ?? false,
            },
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração do Kanban:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Kanban:', error)
  }
}
```

E chamar no final do arquivo, junto das outras (`carregarAbaEditor()`, etc.):

```ts
carregarAbaKanban()
```

- [ ] **Step 4: Rodar o typecheck e conferir visualmente**

Run: `bunx tsc --noEmit`
Expected: sem erro

Run: `bun run build` (ou o script de dev do projeto, ver `package.json`), abrir
`chrome://extensions`, carregar a extensão sem compactar, abrir a página de Opções e conferir: a
aba "Kanban" aparece com um ícone (não só texto), o checkbox liga/desliga e "Salvo!" aparece ao
clicar Salvar.

- [ ] **Step 5: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): aba Kanban com ícone e toggle de ativação"
```

---

### Task 7: Botão "Visão Kanban" + esconder/mostrar tabelas nativas (scaffold, sem board ainda)

Primeiro passo dentro de `procedimento_controlar/index.ts`: o botão aparece, clicar nele esconde
as duas tabelas nativas e mostra um container vazio (ainda sem colunas — isso é a Task 8); clicar
em "Voltar" desfaz. Objetivo desta tarefa é só a troca de visão funcionar de ponta a ponta antes
de entrar com o conteúdo do board.

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `montarEstiloKanbanCard` (Task 5), `config.controleProcessos.kanban.ativo` (Task 1).
- Produces: `montarKanban(config: SyncConfig): void` (chamada a partir do `bootstrap()`, ligada
  na Task 12), estado module-level `kanbanAtivo: boolean`.

- [ ] **Step 1: Import novo**

No topo de `index.ts`, junto dos outros imports de ícone lucide:

```ts
import kanbanIconSvg from 'lucide-static/icons/kanban.svg?raw'
import searchIconSvg from 'lucide-static/icons/search.svg?raw'
import maximizeIconSvg from 'lucide-static/icons/maximize-2.svg?raw'
```

E, no import já existente de `shared/plankaCard`, adicionar o novo módulo compartilhado numa
linha própria (mantendo o import de `plankaCard` como está):

```ts
import { montarEstiloKanbanCard, montarConteudoCardKanban, type DadosCardKanban } from '../shared/kanbanCard'
```

- [ ] **Step 2: CSS do board**

Adicionar ao final do template `ESTILO_FILTROS_E_ESPECIFICACAO` (antes do fechamento
`` ` `` na linha ~452), reaproveitando a paleta já usada no resto do arquivo (`#017fff` de
destaque, mesmo tom de cinza dos outros painéis):

```css

  #seirmg-kanban-btn-ativar {
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 2px solid #017fff;
    border-radius: 6px;
    background: #017fff;
    color: #fff;
    margin: 10px 0;
  }
  #seirmg-kanban-container {
    margin-top: 12px;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #fafafa;
  }
  #seirmg-kanban-titulo-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  #seirmg-kanban-titulo {
    font-weight: bold;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  #seirmg-kanban-titulo svg { width: 16px; height: 16px; color: #017fff; }
  .seirmg-kanban-btn {
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid #017fff;
    border-radius: 4px;
    background: #fff;
    color: #017fff;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .seirmg-kanban-btn svg { width: 13px; height: 13px; }
  .seirmg-kanban-btn[data-ativo="true"] { background: #017fff; color: #fff; }
  #seirmg-kanban-controles {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  #seirmg-kanban-pesquisa {
    padding: 6px 10px;
    font-size: 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    min-width: 220px;
    flex: 1;
    max-width: 360px;
  }
  #seirmg-kanban-colunas-wrapper {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .seirmg-kanban-coluna {
    background: #f0f2f5;
    border: 1px solid #d5dbe4;
    border-radius: 6px;
    padding: 8px;
    min-width: 260px;
    max-width: 300px;
    flex: none;
    display: flex;
    flex-direction: column;
    max-height: 70vh;
  }
  .seirmg-kanban-coluna-header {
    font-weight: bold;
    font-size: 13px;
    margin-bottom: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.6);
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .seirmg-kanban-coluna-lista {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }
  .seirmg-kanban-coluna-lista.seirmg-kanban-arrastando-sobre {
    outline: 2px dashed #017fff;
    outline-offset: -2px;
  }
  .seirmg-kanban-card {
    background: #fff;
    border-radius: 4px;
    padding: 8px 10px;
    cursor: pointer;
    border: 1px solid #ddd;
    font-size: 12px;
    position: relative;
  }
  .seirmg-kanban-card[draggable="true"] { cursor: grab; }
  .seirmg-kanban-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .seirmg-kanban-card-numero {
    font-weight: 600;
    font-size: 11px;
    color: #017fff;
  }
  .seirmg-kanban-card-acoes { display: flex; align-items: center; gap: 4px; }
  .seirmg-kanban-card-remover-lista {
    cursor: pointer;
    color: #999;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
  }
  .seirmg-kanban-nova-lista {
    min-width: 200px;
    max-width: 220px;
    flex: none;
    border: 1.5px dashed #b9c2d0;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    color: #8892a0;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
```

- [ ] **Step 3: Estado module-level e scaffold do `montarKanban`**

Adicionar em `index.ts`, próximo de onde `criterioAgrupamentoAtivo`/`favoritosAtivo` já são
declarados (mesmo estilo de estado module-level):

```ts
let kanbanAtivo = false
let btnVisaoKanban: HTMLButtonElement | null = null

function esconderTabelasKanban(): void {
  try {
    ;['#tblProcessosRecebidos', '#tblProcessosGerados'].forEach((idTabela) => {
      const tabela = document.querySelector(idTabela)
      if (!tabela) return
      ;(tabela as HTMLElement).style.display = 'none'
      const divPai = tabela.closest('div[id*="divTabela"]')
      if (divPai) (divPai as HTMLElement).style.display = 'none'
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao esconder tabelas nativas do Kanban:', error)
  }
}

function mostrarTabelasKanban(): void {
  try {
    ;['#tblProcessosRecebidos', '#tblProcessosGerados'].forEach((idTabela) => {
      const tabela = document.querySelector(idTabela)
      if (!tabela) return
      ;(tabela as HTMLElement).style.display = ''
      const divPai = tabela.closest('div[id*="divTabela"]')
      if (divPai) (divPai as HTMLElement).style.display = ''
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao restaurar tabelas nativas do Kanban:', error)
  }
}

function montarKanban(config: SyncConfig): void {
  try {
    if (!config.controleProcessos.kanban.ativo) return
    if (document.getElementById('seirmg-kanban-btn-ativar')) return

    montarEstiloKanbanCard()

    btnVisaoKanban = document.createElement('button')
    btnVisaoKanban.id = 'seirmg-kanban-btn-ativar'
    btnVisaoKanban.innerHTML = `${kanbanIconSvg}<span>Visão Kanban</span>`
    btnVisaoKanban.addEventListener('click', () => {
      if (!btnVisaoKanban) return
      btnVisaoKanban.style.display = 'none'
      iniciarKanban(config)
    })

    const primeiroElemento = document.querySelector('#divInfraAreaTelaD') ?? document.body
    primeiroElemento.insertBefore(btnVisaoKanban, primeiroElemento.firstChild)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar o botão do Kanban:', error)
  }
}

function iniciarKanban(config: SyncConfig): void {
  try {
    if (kanbanAtivo || document.getElementById('seirmg-kanban-container')) return
    kanbanAtivo = true
    esconderTabelasKanban()

    const container = document.createElement('div')
    container.id = 'seirmg-kanban-container'

    const tituloWrapper = document.createElement('div')
    tituloWrapper.id = 'seirmg-kanban-titulo-wrapper'
    const titulo = document.createElement('div')
    titulo.id = 'seirmg-kanban-titulo'
    titulo.innerHTML = `${kanbanIconSvg}<span>Visão Kanban</span>`
    tituloWrapper.appendChild(titulo)

    const btnVoltar = document.createElement('button')
    btnVoltar.className = 'seirmg-kanban-btn'
    btnVoltar.textContent = 'Voltar à visualização padrão'
    btnVoltar.addEventListener('click', () => {
      kanbanAtivo = false
      container.remove()
      mostrarTabelasKanban()
      if (btnVisaoKanban) btnVisaoKanban.style.display = ''
    })
    tituloWrapper.appendChild(btnVoltar)

    container.appendChild(tituloWrapper)

    const primeiroQuadro = document.querySelector('#tblProcessosRecebidos') ?? document.querySelector('table')
    if (primeiroQuadro?.parentElement) {
      primeiroQuadro.parentElement.insertBefore(container, primeiroQuadro)
    } else {
      document.body.appendChild(container)
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao iniciar o Kanban:', error)
  }
}
```

- [ ] **Step 4: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro (`SyncConfig` já é importado no arquivo — conferir que `type SyncConfig` está
no import de `../../lib/storage` já existente na linha ~70; se não estiver, adicionar).

- [ ] **Step 5: Validação manual (parcial — sem board ainda)**

Run: `bun run build`, carregar a extensão, ativar o checkbox "Kanban" em Opções (Task 6), abrir
Controle de Processos.
Expected: botão "Visão Kanban" aparece no topo; clicar nele esconde as duas tabelas e mostra um
container com título e botão "Voltar à visualização padrão"; clicar em "Voltar" restaura as
tabelas e o botão original.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(kanban): botão Visão Kanban e troca tabela↔board (scaffold, sem colunas ainda)"
```

---

### Task 8: Renderizar as colunas e os cards

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `calcularColuna`, `linhaNaoRecebida`, `linhaTemDocumentoAlterado` (Task 2/3,
  `../../features/controle-processos/kanban`); `obterMarcadoresDaLinha` (Task 4); `criarEstrela`,
  `linhasDaTabela`, `obterTextoAtribuido`, `obterControleDePrazoDaLinha`,
  `extrairEspecificacaoParaExibicao`, `extrairTipoProcesso`, `extrairFavoritoDaLinha` (já
  existentes em `index.ts`/módulos já importados); `montarConteudoCardKanban` (Task 5).
- Produces: `renderizarColunasKanban(config: SyncConfig, container: HTMLElement): void` (chamada
  de dentro de `iniciarKanban`, ligada nesta tarefa).

- [ ] **Step 1: Import da lógica pura + ícone de copiar**

No import já existente de `../../features/controle-processos/agrupamento` em `index.ts`, não
mexer. Adicionar um import novo, próximo dele:

```ts
import {
  calcularColuna,
  linhaNaoRecebida,
  linhaTemDocumentoAlterado,
  type ColunaKanban,
  type OrigemAutomatica,
} from '../../features/controle-processos/kanban'
```

A spec pede número do processo "com botão de copiar" no card (mesmo padrão já usado em
`procedimento_visualizar/index.ts:414-435`, função `criarIconeCopiar` — reaproveitar a mesma
lógica, `.seirmg-tooltip-copiado` já é uma classe global de `content-scripts/core/theme.css`,
carregada em toda página do SEI, não precisa recriar). Adicionar aos imports de ícone lucide já
existentes em `index.ts`:

```ts
import copyIconSvg from 'lucide-static/icons/copy.svg?raw'
```

- [ ] **Step 2: Montar os dados de um card a partir de uma linha nativa**

Adicionar em `index.ts`, antes de `iniciarKanban`:

```ts
interface CardKanbanComOrigem {
  numero: string
  origem: OrigemAutomatica
  favorito: FavoritoProcesso
  dados: DadosCardKanban
  linhaNativa: Element
}

function montarDadosCardKanban(linha: Element, agoraIso: string): CardKanbanComOrigem | null {
  const favorito = extrairFavoritoDaLinha(linha, agoraIso)
  if (!favorito) return null

  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const onmouseover = processo?.getAttribute('onmouseover') ?? ''
  const especificacao = onmouseover ? extrairEspecificacaoParaExibicao(onmouseover) : ''
  const tipoProcesso = onmouseover ? extrairTipoProcesso(onmouseover) : ''
  const prazo = obterControleDePrazoDaLinha(linha)

  return {
    numero: favorito.numero,
    origem: linha.closest('#tblProcessosGerados') ? 'gerados' : 'recebidos',
    favorito,
    linhaNativa: linha,
    dados: {
      numero: favorito.numero,
      tipoProcesso: tipoProcesso || null,
      especificacao: especificacao || null,
      marcadores: obterMarcadoresDaLinha(linha),
      atribuicao: obterTextoAtribuido(linha),
      prazoTexto: prazo?.dataTexto ?? null,
      documentoAlterado: linhaTemDocumentoAlterado(linha),
      naoRecebido: linhaNaoRecebida(linha),
    },
  }
}
```

- [ ] **Step 3: Agrupar por coluna e desenhar**

```ts
const ROTULOS_COLUNA_AUTOMATICA: Record<'recebidos' | 'gerados' | 'favoritos', string> = {
  recebidos: 'Recebidos',
  gerados: 'Gerados',
  favoritos: 'Favoritos',
}

function chaveDeColuna(coluna: ColunaKanban): string {
  return coluna.tipo === 'automatica' ? `automatica:${coluna.chave}` : `lista:${coluna.id}`
}

function montarCardElementoKanban(card: CardKanbanComOrigem, favoritado: boolean): HTMLElement {
  const elemento = document.createElement('div')
  elemento.className = 'seirmg-kanban-card'
  elemento.draggable = true
  elemento.dataset.numero = card.numero

  const header = document.createElement('div')
  header.className = 'seirmg-kanban-card-header'
  const numero = document.createElement('span')
  numero.className = 'seirmg-kanban-card-numero'
  numero.textContent = card.numero
  header.appendChild(numero)

  const botaoCopiar = document.createElement('span')
  botaoCopiar.className = 'seirmg-kanban-card-copiar'
  botaoCopiar.innerHTML = copyIconSvg
  botaoCopiar.title = 'Copiar número do processo'
  botaoCopiar.addEventListener('click', (evento) => {
    evento.stopPropagation()
    navigator.clipboard
      .writeText(card.numero)
      .then(() => {
        const tooltip = document.createElement('div')
        tooltip.className = 'seirmg-tooltip-copiado'
        tooltip.textContent = 'Copiado!'
        botaoCopiar.appendChild(tooltip)
        setTimeout(() => tooltip.remove(), 1000)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao copiar número do processo:', error)
      })
  })
  header.appendChild(botaoCopiar)

  const acoes = document.createElement('div')
  acoes.className = 'seirmg-kanban-card-acoes'
  acoes.appendChild(criarEstrela(card.favorito, favoritado))
  header.appendChild(acoes)

  elemento.appendChild(header)
  elemento.appendChild(montarConteudoCardKanban(card.dados))

  elemento.addEventListener('click', (evento) => {
    if ((evento.target as HTMLElement).closest('.seirmg-favorito-estrela, .seirmg-kanban-card-copiar')) return
    card.linhaNativa.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')?.click()
  })

  elemento.addEventListener('dragstart', (evento) => {
    evento.dataTransfer?.setData('text/plain', card.numero)
  })

  return elemento
}

function renderizarColunasKanban(config: SyncConfig, container: HTMLElement): void {
  const antigo = document.getElementById('seirmg-kanban-colunas-wrapper')
  antigo?.remove()

  const wrapper = document.createElement('div')
  wrapper.id = 'seirmg-kanban-colunas-wrapper'

  const agoraIso = new Date().toISOString()
  const linhasRecebidos = linhasDaTabela('#tblProcessosRecebidos')
  const linhasGerados = linhasDaTabela('#tblProcessosGerados')
  const cards = [...linhasRecebidos, ...linhasGerados]
    .map((linha) => montarDadosCardKanban(linha, agoraIso))
    .filter((card): card is CardKanbanComOrigem => card !== null)

  const idsFavoritados = new Set(itensFavoritados.map((item) => item.numero))
  const posicoesPorNumero = new Map(
    config.controleProcessos.kanban.posicoes.map((posicao) => [posicao.numero, posicao.listaId])
  )

  const cardsPorColuna = new Map<string, { coluna: ColunaKanban; cards: CardKanbanComOrigem[] }>()
  cards.forEach((card) => {
    const favoritado = idsFavoritados.has(card.numero)
    const coluna = calcularColuna(card.origem, favoritado, posicoesPorNumero.get(card.numero) ?? null)
    const chave = chaveDeColuna(coluna)
    const grupo = cardsPorColuna.get(chave) ?? { coluna, cards: [] }
    grupo.cards.push(card)
    cardsPorColuna.set(chave, grupo)
  })

  ;(['recebidos', 'gerados', 'favoritos'] as const).forEach((chaveAutomatica) => {
    const chave = `automatica:${chaveAutomatica}`
    const grupo = cardsPorColuna.get(chave) ?? {
      coluna: { tipo: 'automatica', chave: chaveAutomatica } as ColunaKanban,
      cards: [],
    }
    wrapper.appendChild(
      montarColunaKanban(ROTULOS_COLUNA_AUTOMATICA[chaveAutomatica], grupo.cards, idsFavoritados, null)
    )
  })

  ordenarListas(config.controleProcessos.kanban.listas).forEach((lista) => {
    const grupo = cardsPorColuna.get(`lista:${lista.id}`) ?? { coluna: { tipo: 'lista', id: lista.id }, cards: [] }
    wrapper.appendChild(montarColunaKanban(lista.nome, grupo.cards, idsFavoritados, lista.id))
  })

  container.appendChild(wrapper)
}

function montarColunaKanban(
  nome: string,
  cards: CardKanbanComOrigem[],
  idsFavoritados: Set<string>,
  listaId: string | null
): HTMLElement {
  const coluna = document.createElement('div')
  coluna.className = 'seirmg-kanban-coluna'
  if (listaId) coluna.dataset.listaId = listaId

  const header = document.createElement('div')
  header.className = 'seirmg-kanban-coluna-header'
  const nomeEl = document.createElement('span')
  nomeEl.textContent = `${nome} (${cards.length})`
  header.appendChild(nomeEl)
  coluna.appendChild(header)

  const lista = document.createElement('div')
  lista.className = 'seirmg-kanban-coluna-lista'
  cards.forEach((card) => {
    lista.appendChild(montarCardElementoKanban(card, idsFavoritados.has(card.numero)))
  })
  coluna.appendChild(lista)

  return coluna
}
```

Adicionar também ao final do bloco CSS do board (mesmo template `ESTILO_FILTROS_E_ESPECIFICACAO`
da Task 7 — `.seirmg-tooltip-copiado` já é uma classe global de `content-scripts/core/theme.css`,
carregada em toda página do SEI, não precisa recriar):

```css

  .seirmg-kanban-card-copiar {
    cursor: pointer;
    color: #8892a0;
    display: inline-flex;
    align-items: center;
    position: relative;
  }
  .seirmg-kanban-card-copiar svg { width: 13px; height: 13px; }
  .seirmg-kanban-card-copiar:hover { color: #017fff; }
```

- [ ] **Step 4: Ligar em `iniciarKanban`**

Em `iniciarKanban` (Task 7), depois de `container.appendChild(tituloWrapper)` e antes da inserção
do `container` no DOM, adicionar:

```ts
  renderizarColunasKanban(config, container)
```

- [ ] **Step 5: Import de `ordenarListas`**

Adicionar `ordenarListas` ao import da Task 8/Step 1 (`../../features/controle-processos/kanban`).

- [ ] **Step 6: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro

- [ ] **Step 7: Validação manual**

Run: `bun run build`, recarregar a extensão, abrir Controle de Processos com o Kanban ativado,
clicar "Visão Kanban".
Expected: colunas "Recebidos", "Gerados" e "Favoritos" aparecem sempre (mesmo vazias); processos
favoritados aparecem só em Favoritos, nunca duplicados em Recebidos/Gerados; cada card mostra o(s)
chip(s) de marcador coloridos (bug 2 da spec corrigido — comparar com
`https://claude.ai/code/artifact/4f0c49e0-2baa-4365-a868-df40c9845eca`); clicar num card abre o
processo; a estrela favorita/desfavorita (ver Task 12 pra ela re-renderizar o board sozinha).

- [ ] **Step 8: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(kanban): renderiza colunas automáticas e cards com marcador visível"
```

---

### Task 9: Drag-and-drop entre listas + "×" pra voltar ao automático

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `montarPosicoesAtualizadas` (Task 2, `../../features/controle-processos/kanban`).
- Produces: card ganha um "×" quando está numa coluna de lista; colunas de lista aceitam drop.

- [ ] **Step 1: Import**

Adicionar `montarPosicoesAtualizadas` ao import de `../../features/controle-processos/kanban`
(mesmo bloco da Task 8).

- [ ] **Step 2: Persistir e re-renderizar**

Adicionar em `index.ts`:

```ts
async function moverCardKanban(numero: string, listaId: string | null): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const atual = await store.get()
    const posicoes = montarPosicoesAtualizadas(atual.controleProcessos.kanban.posicoes, numero, listaId)
    const atualizado = {
      ...atual,
      controleProcessos: {
        ...atual.controleProcessos,
        kanban: { ...atual.controleProcessos.kanban, posicoes },
      },
    }
    await store.set(atualizado)

    const container = document.getElementById('seirmg-kanban-container')
    if (container) renderizarColunasKanban(atualizado, container)
  } catch (error) {
    console.error('[SEIRMG] Falha ao mover card do Kanban:', error)
  }
}
```

- [ ] **Step 3: "×" no card quando está numa lista**

Em `montarCardElementoKanban` (Task 8), adicionar um parâmetro `listaId: string | null` e, quando
não for `null`, um botão de remover:

```ts
function montarCardElementoKanban(
  card: CardKanbanComOrigem,
  favoritado: boolean,
  listaId: string | null
): HTMLElement {
  // ...(conteúdo já existente do Step 3 da Task 8, sem mudança até `header.appendChild(acoes)`)...

  if (listaId) {
    const remover = document.createElement('span')
    remover.className = 'seirmg-kanban-card-remover-lista'
    remover.textContent = '×'
    remover.title = 'Voltar ao automático'
    remover.addEventListener('click', (evento) => {
      evento.stopPropagation()
      moverCardKanban(card.numero, null).catch((error) => {
        console.error('[SEIRMG] Falha ao remover card da lista:', error)
      })
    })
    acoes.appendChild(remover)
  }

  // ...(resto do corpo já existente: elemento.appendChild(montarConteudoCardKanban(...)), click, dragstart, return)...
}
```

Atualizar a chamada em `montarColunaKanban` (Task 8) pra passar `listaId`:

```ts
    lista.appendChild(montarCardElementoKanban(card, idsFavoritados.has(card.numero), listaId))
```

- [ ] **Step 4: Drop nas colunas de lista**

Em `montarColunaKanban` (Task 8), depois de `coluna.appendChild(lista)` e antes do `return`,
adicionar — só quando `listaId` não é `null` (colunas automáticas não são alvo de drop):

```ts
  if (listaId) {
    lista.addEventListener('dragover', (evento) => {
      evento.preventDefault()
      lista.classList.add('seirmg-kanban-arrastando-sobre')
    })
    lista.addEventListener('dragleave', () => {
      lista.classList.remove('seirmg-kanban-arrastando-sobre')
    })
    lista.addEventListener('drop', (evento) => {
      evento.preventDefault()
      lista.classList.remove('seirmg-kanban-arrastando-sobre')
      const numero = evento.dataTransfer?.getData('text/plain')
      if (numero) {
        moverCardKanban(numero, listaId).catch((error) => {
          console.error('[SEIRMG] Falha ao mover card via drag-and-drop:', error)
        })
      }
    })
  }
```

- [ ] **Step 5: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro

- [ ] **Step 6: Validação manual**

(Só é possível testar de ponta a ponta depois da Task 10, que cria a primeira lista — pode
adiantar criando uma lista manualmente no `chrome.storage` via DevTools se quiser validar antes,
ou deixar essa validação pra rodar junto da Task 10.)
Run: `bun run build`, recarregar a extensão, criar uma lista (Task 10) e arrastar um card de
Recebidos/Gerados/Favoritos pra ela.
Expected: o card sai da coluna de origem e aparece só na lista; o "×" no card volta ele pro
automático; recarregar a página mantém a posição (persistida em `SyncConfig`).

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(kanban): drag-and-drop nativo entre listas + botão de voltar ao automático"
```

---

### Task 10: Criar / renomear / excluir listas

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `criarLista`, `renomearLista`, `removerLista` (Task 2).
- Produces: coluna "+ Nova lista" ao final do board; menu simples de renomear/excluir no
  cabeçalho de cada coluna de lista.

- [ ] **Step 1: Import**

Adicionar `criarLista`, `renomearLista`, `removerLista` ao import de
`../../features/controle-processos/kanban`.

- [ ] **Step 2: Persistir mudanças de lista e re-renderizar**

```ts
async function salvarListasKanban(
  listas: KanbanConfig['listas'],
  posicoes: KanbanConfig['posicoes']
): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const atual = await store.get()
    const atualizado = {
      ...atual,
      controleProcessos: {
        ...atual.controleProcessos,
        kanban: { ...atual.controleProcessos.kanban, listas, posicoes },
      },
    }
    await store.set(atualizado)
    const container = document.getElementById('seirmg-kanban-container')
    if (container) renderizarColunasKanban(atualizado, container)
  } catch (error) {
    console.error('[SEIRMG] Falha ao salvar listas do Kanban:', error)
  }
}
```

Adicionar `type KanbanConfig` ao import já existente de `../../lib/storage` no topo do arquivo.

- [ ] **Step 3: Coluna "+ Nova lista"**

Em `renderizarColunasKanban` (Task 8), depois do `forEach` que desenha as listas do usuário e
antes de `container.appendChild(wrapper)`:

```ts
  const botaoNovaLista = document.createElement('div')
  botaoNovaLista.className = 'seirmg-kanban-nova-lista'
  botaoNovaLista.textContent = '+ Nova lista'
  botaoNovaLista.addEventListener('click', () => {
    const nome = window.prompt('Nome da nova lista:')
    if (!nome || !nome.trim()) return
    const { listas } = criarLista(config.controleProcessos.kanban.listas, nome.trim())
    salvarListasKanban(listas, config.controleProcessos.kanban.posicoes).catch((error) => {
      console.error('[SEIRMG] Falha ao criar lista do Kanban:', error)
    })
  })
  wrapper.appendChild(botaoNovaLista)
```

- [ ] **Step 4: Renomear/excluir no cabeçalho da coluna**

Em `montarColunaKanban` (Task 8/9), adicionar um parâmetro `config: SyncConfig` e, só quando
`listaId` não é `null`, dois botões no `header`:

```ts
function montarColunaKanban(
  nome: string,
  cards: CardKanbanComOrigem[],
  idsFavoritados: Set<string>,
  listaId: string | null,
  config: SyncConfig
): HTMLElement {
  // ...(header já existente, sem mudança até header.appendChild(nomeEl))...

  if (listaId) {
    const btnRenomear = document.createElement('button')
    btnRenomear.className = 'seirmg-kanban-btn'
    btnRenomear.textContent = '✎'
    btnRenomear.title = 'Renomear lista'
    btnRenomear.addEventListener('click', () => {
      const novoNome = window.prompt('Novo nome da lista:', nome)
      if (!novoNome || !novoNome.trim()) return
      const listas = renomearLista(config.controleProcessos.kanban.listas, listaId, novoNome.trim())
      salvarListasKanban(listas, config.controleProcessos.kanban.posicoes).catch((error) => {
        console.error('[SEIRMG] Falha ao renomear lista do Kanban:', error)
      })
    })
    header.appendChild(btnRenomear)

    const btnExcluir = document.createElement('button')
    btnExcluir.className = 'seirmg-kanban-btn'
    btnExcluir.textContent = '🗑'
    btnExcluir.title = 'Excluir lista'
    btnExcluir.addEventListener('click', () => {
      const confirmado = window.confirm(
        `Excluir "${nome}"? ${cards.length} card(s) voltam pras colunas automáticas.`
      )
      if (!confirmado) return
      const resultado = removerLista(
        config.controleProcessos.kanban.listas,
        config.controleProcessos.kanban.posicoes,
        listaId
      )
      salvarListasKanban(resultado.listas, resultado.posicoes).catch((error) => {
        console.error('[SEIRMG] Falha ao excluir lista do Kanban:', error)
      })
    })
    header.appendChild(btnExcluir)
  }

  // ...(resto do corpo já existente: coluna.appendChild(header), lista, dragover/drop, return)...
}
```

Atualizar as 4 chamadas de `montarColunaKanban` em `renderizarColunasKanban` (3 automáticas + 1
no `forEach` de listas) pra passar `config` como último argumento.

- [ ] **Step 5: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro

- [ ] **Step 6: Validação manual**

Run: `bun run build`, recarregar a extensão.
Expected: clicar "+ Nova lista" pede um nome e cria a coluna; "✎" renomeia; "🗑" pede confirmação
e devolve os cards ao automático (some a coluna, os cards que estavam nela reaparecem em
Recebidos/Gerados/Favoritos conforme o caso).

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(kanban): criar, renomear e excluir listas direto no board"
```

---

### Task 11: Toolbar — pesquisa, filtro de ano, não recebido, documento alterado, maximizar

Portado de `seikaban/content-script.js:154-261,473-499,524-568,570-607` — mesma lógica de filtro
combinado em AND, ícones Lucide em vez de emoji solto.

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `extrairAnoProcesso` (Task 3, `../../features/controle-processos/kanban`).

- [ ] **Step 1: Import dos ícones que faltam**

Adicionar aos imports de ícone já iniciados na Task 7:

```ts
import inboxIconSvg from 'lucide-static/icons/inbox.svg?raw'
import triangleAlertIconSvg from 'lucide-static/icons/triangle-alert.svg?raw'
```

Adicionar `extrairAnoProcesso` ao import de `../../features/controle-processos/kanban` (mesmo
bloco onde `calcularColuna` já foi importado na Task 8).

- [ ] **Step 2: Montar a barra de controles**

Em `iniciarKanban` (Task 7), depois de `container.appendChild(tituloWrapper)` e antes de
`renderizarColunasKanban(config, container)`, adicionar:

```ts
  const controles = document.createElement('div')
  controles.id = 'seirmg-kanban-controles'

  const inputPesquisa = document.createElement('input')
  inputPesquisa.id = 'seirmg-kanban-pesquisa'
  inputPesquisa.type = 'text'
  inputPesquisa.placeholder = 'Pesquisar processos...'
  inputPesquisa.addEventListener('input', () => aplicarFiltrosKanban())
  controles.appendChild(inputPesquisa)

  const anosSelecionados = new Set<string>()
  const anosPresentes = new Set(
    [...linhasDaTabela('#tblProcessosRecebidos'), ...linhasDaTabela('#tblProcessosGerados')]
      .map((linha) => linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')?.textContent?.trim())
      .filter((numero): numero is string => !!numero)
      .map((numero) => extrairAnoProcesso(numero))
      .filter((ano): ano is string => ano !== null)
  )
  Array.from(anosPresentes)
    .sort((a, b) => Number(b) - Number(a))
    .forEach((ano) => {
      const chip = document.createElement('button')
      chip.className = 'seirmg-kanban-btn'
      chip.textContent = ano
      chip.dataset.ativo = 'false'
      chip.addEventListener('click', () => {
        const ativo = chip.dataset.ativo === 'true'
        chip.dataset.ativo = ativo ? 'false' : 'true'
        if (ativo) anosSelecionados.delete(ano)
        else anosSelecionados.add(ano)
        aplicarFiltrosKanban()
      })
      controles.appendChild(chip)
    })

  const btnNaoRecebido = document.createElement('button')
  btnNaoRecebido.className = 'seirmg-kanban-btn'
  btnNaoRecebido.innerHTML = `${inboxIconSvg}<span>Não recebido</span>`
  btnNaoRecebido.dataset.ativo = 'false'
  btnNaoRecebido.addEventListener('click', () => {
    btnNaoRecebido.dataset.ativo = btnNaoRecebido.dataset.ativo === 'true' ? 'false' : 'true'
    aplicarFiltrosKanban()
  })
  controles.appendChild(btnNaoRecebido)

  const btnDocAlterado = document.createElement('button')
  btnDocAlterado.className = 'seirmg-kanban-btn'
  btnDocAlterado.innerHTML = `${triangleAlertIconSvg}<span>Documento alterado</span>`
  btnDocAlterado.dataset.ativo = 'false'
  btnDocAlterado.addEventListener('click', () => {
    btnDocAlterado.dataset.ativo = btnDocAlterado.dataset.ativo === 'true' ? 'false' : 'true'
    aplicarFiltrosKanban()
  })
  controles.appendChild(btnDocAlterado)

  const btnMaximizar = document.createElement('button')
  btnMaximizar.className = 'seirmg-kanban-btn'
  btnMaximizar.innerHTML = `${maximizeIconSvg}<span>Maximizar</span>`
  btnMaximizar.dataset.maximizado = 'false'
  btnMaximizar.addEventListener('click', () => {
    const maximizado = btnMaximizar.dataset.maximizado === 'true'
    btnMaximizar.dataset.maximizado = maximizado ? 'false' : 'true'
    container.style.position = maximizado ? '' : 'fixed'
    container.style.inset = maximizado ? '' : '0'
    container.style.zIndex = maximizado ? '' : '9999'
    container.style.overflow = maximizado ? '' : 'auto'
    container.style.margin = maximizado ? '' : '0'
    container.style.borderRadius = maximizado ? '' : '0'
  })
  controles.appendChild(btnMaximizar)

  container.appendChild(controles)

  function aplicarFiltrosKanban(): void {
    const termo = inputPesquisa.value.toLowerCase().trim()
    const filtroNaoRecebido = btnNaoRecebido.dataset.ativo === 'true'
    const filtroDocAlterado = btnDocAlterado.dataset.ativo === 'true'

    document.querySelectorAll<HTMLElement>('.seirmg-kanban-card').forEach((card) => {
      const textoCard = card.textContent?.toLowerCase() ?? ''
      const mostrarPorPesquisa = !termo || textoCard.includes(termo)
      const mostrarPorNaoRecebido = !filtroNaoRecebido || card.dataset.naoRecebido === 'true'
      const mostrarPorDocAlterado = !filtroDocAlterado || card.dataset.documentoAlterado === 'true'
      const mostrarPorAno = anosSelecionados.size === 0 || anosSelecionados.has(card.dataset.ano ?? '')
      card.style.display =
        mostrarPorPesquisa && mostrarPorNaoRecebido && mostrarPorDocAlterado && mostrarPorAno ? '' : 'none'
    })
  }
```

- [ ] **Step 3: Marcar `dataset.naoRecebido`/`dataset.documentoAlterado` no card**

Em `montarCardElementoKanban` (Task 8/9), depois de `elemento.dataset.numero = card.numero`,
adicionar:

```ts
  elemento.dataset.naoRecebido = card.dados.naoRecebido ? 'true' : 'false'
  elemento.dataset.documentoAlterado = card.dados.documentoAlterado ? 'true' : 'false'
  elemento.dataset.ano = extrairAnoProcesso(card.numero) ?? ''
```

- [ ] **Step 4: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro

- [ ] **Step 5: Validação manual**

Run: `bun run build`, recarregar a extensão.
Expected: digitar na pesquisa filtra os cards em tempo real (qualquer coluna); os chips de ano
(um por ano presente nos processos, ordem decrescente) filtram por seleção múltipla; "Não
recebido" e "Documento alterado" filtram e ficam destacados quando ativos (herdam o estilo
`.seirmg-kanban-btn[data-ativo="true"]` já definido na Task 7); "Maximizar" ocupa a tela cheia e
volta ao normal; todos os filtros combinam em AND, igual a referência.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(kanban): toolbar de pesquisa, filtros e maximizar"
```

---

### Task 12: Wiring final — `bootstrap()` e re-render ao favoritar

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `montarKanban` (Task 7), `renderizarColunasKanban` (Task 8).

- [ ] **Step 1: Chamar `montarKanban` no `bootstrap()`**

Em `bootstrap()`, depois de `renderizarPainelFavoritos()` e antes de
`aplicarLinksPlankaEmLinhas(...)`:

```ts
    montarKanban(config)
```

- [ ] **Step 2: Re-renderizar o board quando o usuário favorita/desfavorita**

Em `alternarFavorito` (por volta da linha 1296-1299), depois de `renderizarPainelFavoritos()`,
adicionar:

```ts
    const containerKanban = document.getElementById('seirmg-kanban-container')
    if (containerKanban) renderizarColunasKanban(atual, containerKanban)
```

Usa `atual` (a config já lida no início da função, antes do `.set`) — como só `favoritos.itens`
mudou entre o `atual` lido e o `.set`, e `renderizarColunasKanban` só lê
`config.controleProcessos.kanban` (que não muda aqui) mais o módulo-level `itensFavoritados`
(já reatribuído duas linhas acima, `itensFavoritados = novosItens`), passar `atual` é seguro e
evita um novo round-trip de leitura só pra isso.

- [ ] **Step 3: Rodar o typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erro

- [ ] **Step 4: Rodar toda a suite de testes**

Run: `bunx vitest run`
Expected: PASS geral (nada quebrou nas tarefas anteriores)

- [ ] **Step 5: Validação manual — fluxo completo**

Run: `bun run build`, recarregar a extensão, abrir Controle de Processos com uma instância SEI
real, Kanban ativado em Opções.

Roteiro:
1. Clicar "Visão Kanban" — tabelas somem, board aparece com Recebidos/Gerados/Favoritos.
2. Clicar a estrela de um card em Recebidos — ele desaparece de Recebidos e aparece em Favoritos,
   sem precisar recarregar a página.
3. Criar uma lista, arrastar um card pra ela — ele some da coluna de origem.
4. Recarregar a página inteira, reabrir o Kanban — a lista e a posição do card persistiram.
5. Clicar "×" no card dentro da lista — ele volta pra Recebidos/Gerados/Favoritos conforme o
   caso.
6. Excluir a lista — confirma, coluna some, nenhum card se perde.
7. Ir em Opções → aba Kanban, conferir que ela tem ícone (não só texto) igual as outras abas.
8. Desativar o checkbox "Ativar Kanban" em Opções, recarregar Controle de Processos — o botão
   "Visão Kanban" não aparece mais.

Expected: os 4 problemas da spec (`docs/superpowers/specs/2026-08-10-seirmg-lote-s-kanban-design.md`)
resolvidos — ícone na aba de Opções, marcador visível no card, Recebidos/Gerados/Favoritos como
colunas automáticas de verdade (sem misturar), Kanban funciona em qualquer instância SEI (não só
`sei.sistemas.ro.gov.br`).

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(kanban): liga o board no bootstrap e re-renderiza ao favoritar/desfavoritar"
```

---

## Depois de tudo pronto

Atualizar `docs/ROADMAP-LOTES.md` com uma entrada pro Lote S (mesmo formato das entregas
anteriores, linkando a spec e este plano) — não incluído como tarefa formal acima porque é
documentação de fechamento, não implementação; fazer manualmente ou pedir pro agente de
`finishing-a-development-branch` cuidar disso junto da integração final.
