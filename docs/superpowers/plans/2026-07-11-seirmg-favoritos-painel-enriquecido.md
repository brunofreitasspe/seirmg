# SEIRMG — Painel de Favoritos enriquecido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer cada linha do painel de Favoritos (Controle de Processos) com marcadores, prazo (dias + data de vencimento), atribuição e especificação, reaproveitando a extração já existente para essas informações na tabela nativa — sem reabrir nenhuma decisão do núcleo de Favoritos já entregue.

**Architecture:** Toda a extração de dados (marcador, prazo, atribuição, especificação) já existe hoje só para as linhas nativas da tabela do Controle de Processos (`src/content-scripts/procedimento_controlar/index.ts` + `src/features/controle-processos/{prazos,agrupamento,especificacao}.ts`). O painel de Favoritos passa a chamar essas mesmas funções sobre a linha nativa correspondente, quando ela existe na página atual (favorito "aberto na sua caixa"). Quando não existe (favorito "fechado"), a linha do painel usa só o que foi capturado no momento de favoritar (`FavoritoProcesso.especificacao`, novo campo opcional) e "achata" as colunas extras via `colspan`. `prazos.ts` ganha uma pequena refatoração para expor a `Date` do marcador (não só a diferença em dias), sem mudar o comportamento já testado.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Bun, Vitest (`environment: 'jsdom'`), Lucide static icons (`?raw` import).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-11-seirmg-favoritos-painel-enriquecido-design.md`.
- Layout do painel: tabela com colunas **Processo | Marcadores | Prazo | Atribuição | (remover)**.
- Prazo mostra dias **e** a data (ex.: "45 dias" / "vence 25/08/2026" para o tipo `prazo`; "9 dias" / "desde 01/01/2026" para o tipo `qtddias`) — entre os dois tipos configurados (`exibirPrazo`/`exibirDias`), mostra o primeiro que tiver dado calculável, priorizando `prazo` (mais urgente) sobre `qtddias`.
- Texto longo (marcador ou especificação) **quebra linha, nunca trunca** — sem `white-space: nowrap`, sem reticências/tooltip.
- Marcador/prazo/atribuição só existem pra favoritos **"aberto na sua caixa"** (linha nativa presente na página atual) — nunca inventar/buscar esse dado por outro meio.
- Favoritos **"fechados"**: linha achatada — `<td colspan="4">` com processo + especificação, só a estrela de remover na coluna própria. Nunca mostrar "—" repetido nas colunas que não existem pra essa linha.
- Indicador nativo do SEI de "documento novo/pendente" (triângulo amarelo com "!"): **fora desta plan** — seletor não verificado numa instância SEI real (risco documentado na spec, seção "Riscos / verificação pendente"). Não implementar nenhuma extração/inserção desse ícone agora.
- `FavoritoProcesso.especificacao` é opcional (`especificacao?: string`) — favoritos já existentes antes desta mudança não têm o campo, tratado igual a "sem especificação", sem migração.
- `tsconfig.json` tem `noUnusedLocals`/`noUnusedParameters` ativos — nenhuma task pode deixar função/variável declarada sem uso ao final dela; por isso os helpers de extração (Task 4) só entram no mesmo commit em que já são consumidos pelo painel.
- Lógica pura testável isolada em `src/features/controle-processos/{prazos,favoritos}.ts`; wiring de DOM no content script sem teste direto (mesma política já aplicada ao resto do projeto — ver plan do núcleo, `docs/superpowers/plans/2026-07-10-seirmg-lote-l-favoritos-nucleo.md`).

---

### Task 1: `prazos.ts` — expor a data do marcador, não só os dias

**Files:**
- Modify: `src/features/controle-processos/prazos.ts`
- Test: `src/features/controle-processos/prazos.test.ts`

**Interfaces:**
- Produces: `extrairDataDoMarcador(textosMarcadores: string[], tipo: TipoCalculoPrazo): Date | null` (nova), `formatarDataBr(data: Date): string` (nova). `calcularDiasDoMarcador(textosMarcadores: string[], tipo: TipoCalculoPrazo, agora: Date): number | null` mantém a mesma assinatura e comportamento (passa a ser implementada em cima de `extrairDataDoMarcador`). Task 4 consome as duas funções novas.

- [ ] **Step 1: Escrever os testes novos (devem falhar — funções não existem)**

Em `src/features/controle-processos/prazos.test.ts`, adicione ao final do arquivo (depois do `describe('classificarPrazo', ...)`, que termina na linha 91):

```ts
describe('extrairDataDoMarcador', () => {
  it('retorna a Date correspondente ao marcador de qtddias', () => {
    expect(extrairDataDoMarcador(['01/01/2026 - aberto'], 'qtddias')).toEqual(new Date(2026, 0, 1))
  })

  it('retorna a Date correspondente ao marcador de prazo com prefixo "ate "', () => {
    expect(extrairDataDoMarcador(['ate 20/01/2026'], 'prazo')).toEqual(new Date(2026, 0, 20))
  })

  it('ignora marcador de prazo sem o prefixo "ate "', () => {
    expect(extrairDataDoMarcador(['aberto em 20/01/2026'], 'prazo')).toBeNull()
  })

  it('retorna null quando nenhum marcador tem data válida', () => {
    expect(extrairDataDoMarcador(['sem data aqui'], 'qtddias')).toBeNull()
  })
})

describe('formatarDataBr', () => {
  it('formata com zero à esquerda em dia e mês', () => {
    expect(formatarDataBr(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('formata corretamente dia e mês de dois dígitos', () => {
    expect(formatarDataBr(new Date(2026, 10, 25))).toBe('25/11/2026')
  })
})
```

E atualize o import no topo do arquivo (linha 2) de:

```ts
import { calcularDiasDoMarcador, classificarPrazo, extrairTextoMarcador, isValidDate } from './prazos'
```

para:

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairDataDoMarcador,
  extrairTextoMarcador,
  formatarDataBr,
  isValidDate,
} from './prazos'
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/controle-processos/prazos.test.ts`
Expected: FAIL — `extrairDataDoMarcador`/`formatarDataBr` não exportados por `./prazos`.

- [ ] **Step 3: Refatorar `prazos.ts`**

Substitua todo o conteúdo de `src/features/controle-processos/prazos.ts` a partir da função `calcularDiferencaDias` (linha 23) até o fim de `calcularDiasDoMarcador` (linha 55):

```ts
function calcularDiferencaDias(dataStr: string, tipo: TipoCalculoPrazo, agora: Date): number {
  const [dia, mes, ano] = dataStr.split('/').map(Number)
  const data = new Date(ano, mes - 1, dia)
  const msPorDia = 1000 * 60 * 60 * 24

  if (tipo === 'qtddias') {
    return Math.floor((agora.getTime() - data.getTime()) / msPorDia)
  }
  return Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1
}

export function calcularDiasDoMarcador(
  textosMarcadores: string[],
  tipo: TipoCalculoPrazo,
  agora: Date
): number | null {
  for (const textoOriginal of textosMarcadores) {
    const texto = textoOriginal.toLowerCase().replace('é', 'e')
    let dataStr: string

    if (tipo === 'prazo') {
      if (texto.indexOf('ate ') !== 0) continue
      dataStr = texto.substr(4, 10)
    } else {
      dataStr = texto.substr(0, 10)
    }

    if (isValidDate(dataStr)) {
      return calcularDiferencaDias(dataStr, tipo, agora)
    }
  }
  return null
}
```

por:

```ts
function parseDataBr(dataStr: string): Date {
  const [dia, mes, ano] = dataStr.split('/').map(Number)
  return new Date(ano, mes - 1, dia)
}

function calcularDiferencaDias(data: Date, tipo: TipoCalculoPrazo, agora: Date): number {
  const msPorDia = 1000 * 60 * 60 * 24

  if (tipo === 'qtddias') {
    return Math.floor((agora.getTime() - data.getTime()) / msPorDia)
  }
  return Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1
}

export function extrairDataDoMarcador(textosMarcadores: string[], tipo: TipoCalculoPrazo): Date | null {
  for (const textoOriginal of textosMarcadores) {
    const texto = textoOriginal.toLowerCase().replace('é', 'e')
    let dataStr: string

    if (tipo === 'prazo') {
      if (texto.indexOf('ate ') !== 0) continue
      dataStr = texto.substr(4, 10)
    } else {
      dataStr = texto.substr(0, 10)
    }

    if (isValidDate(dataStr)) {
      return parseDataBr(dataStr)
    }
  }
  return null
}

export function calcularDiasDoMarcador(
  textosMarcadores: string[],
  tipo: TipoCalculoPrazo,
  agora: Date
): number | null {
  const data = extrairDataDoMarcador(textosMarcadores, tipo)
  if (!data) return null
  return calcularDiferencaDias(data, tipo, agora)
}

export function formatarDataBr(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/controle-processos/prazos.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os já existentes de `calcularDiasDoMarcador` — confirma que a refatoração não mudou o comportamento).

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /c/sei/seirmg
git add src/features/controle-processos/prazos.ts src/features/controle-processos/prazos.test.ts
git commit -m "feat(controle-processos): expõe data e formatação de prazo do marcador"
```

---

### Task 2: `favoritos.ts` — capturar especificação ao favoritar

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/features/controle-processos/favoritos.ts`
- Test: `src/features/controle-processos/favoritos.test.ts`

**Interfaces:**
- Consumes: `extrairEspecificacaoParaExibicao(onmouseover: string): string` de `./especificacao` (já existe).
- Produces: `FavoritoProcesso.especificacao?: string` (novo campo em `src/lib/storage.ts`); `extrairFavoritoDaLinha` passa a incluir esse campo quando disponível. Task 3/4 consomem `FavoritoProcesso.especificacao`.

- [ ] **Step 1: Escrever os testes novos (devem falhar)**

Em `src/features/controle-processos/favoritos.test.ts`, adicione dentro do `describe('extrairFavoritoDaLinha', ...)` (depois do teste `'retorna null quando o texto do processo está vazio'`, que termina na linha 42):

```ts
  it('inclui especificação quando o onmouseover contém dados de especificação', () => {
    const linha = criarLinhaComProcesso(
      `<td><a class="processoVisualizado" href="x" onmouseover="return infraTooltipMostrar('Aquisição de bens','Detalhe')">HMMG.2025.00004-4</a></td>`
    )
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.especificacao).toBe('Aquisição de bens')
  })

  it('deixa especificação indefinida quando a linha não tem onmouseover', () => {
    const linha = criarLinhaComProcesso('<td><a class="processoVisualizado" href="x">HMMG.2025.00005-5</a></td>')
    expect(extrairFavoritoDaLinha(linha, '2026-07-10T10:00:00.000Z')?.especificacao).toBeUndefined()
  })
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/controle-processos/favoritos.test.ts`
Expected: FAIL — os dois testes novos recebem `especificacao` sempre `undefined` (campo ainda não implementado).

- [ ] **Step 3: Adicionar o campo em `src/lib/storage.ts`**

Em `src/lib/storage.ts`, troque a interface `FavoritoProcesso` (linhas 56-60):

```ts
export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
}
```

por:

```ts
export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
}
```

- [ ] **Step 4: Implementar a extração em `src/features/controle-processos/favoritos.ts`**

Troque o import do topo do arquivo:

```ts
import type { FavoritoProcesso } from '../../lib/storage'
```

por:

```ts
import type { FavoritoProcesso } from '../../lib/storage'
import { extrairEspecificacaoParaExibicao } from './especificacao'
```

Troque `extrairFavoritoDaLinha`:

```ts
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
```

por:

```ts
export function extrairFavoritoDaLinha(linha: Element, agoraIso: string): FavoritoProcesso | null {
  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const numero = processo?.textContent?.trim()
  if (!processo || !numero) return null

  const onmouseover = processo.getAttribute('onmouseover')
  const especificacao = onmouseover ? extrairEspecificacaoParaExibicao(onmouseover) : ''

  return {
    numero,
    link: processo.getAttribute('href'),
    adicionadoEm: agoraIso,
    especificacao: especificacao || undefined,
  }
}
```

- [ ] **Step 5: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/controle-processos/favoritos.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 5 já existentes — `especificacao: undefined` é ignorado por `toEqual` nos testes antigos que comparam objeto completo).

- [ ] **Step 6: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Rodar toda a suíte (garantir que `storage.test.ts` não quebrou)**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam (o campo `especificacao` é opcional, então os literais de `FavoritoProcesso` já existentes em `storage.test.ts` continuam válidos sem alteração).

- [ ] **Step 8: Commit**

```bash
cd /c/sei/seirmg
git add src/lib/storage.ts src/features/controle-processos/favoritos.ts src/features/controle-processos/favoritos.test.ts
git commit -m "feat(controle-processos): captura especificação ao favoritar um processo"
```

---

### Task 3: `index.ts` — encadear o `FavoritoProcesso` completo (com especificação) pela estrela

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `FavoritoProcesso` (Task 2).
- Produces: `criarEstrela(favorito: FavoritoProcesso, favoritado: boolean): HTMLElement` (assinatura mudou — antes `criarEstrela(nup, link, favoritado)`), `alternarFavorito(favorito: FavoritoProcesso): Promise<void>` (assinatura mudou — antes `alternarFavorito(nup, link)`). Task 4 consome a nova assinatura de `alternarFavorito` no botão de remover do painel reescrito.

Sem teste direto (wiring de DOM). Verificação por typecheck.

- [ ] **Step 1: `criarEstrela` passa a receber o `FavoritoProcesso` inteiro**

Troque (linhas 481-495):

```ts
function criarEstrela(nup: string, link: string | null, favoritado: boolean): HTMLElement {
  const estrela = document.createElement('span')
  estrela.dataset.nup = nup
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
```

por:

```ts
function criarEstrela(favorito: FavoritoProcesso, favoritado: boolean): HTMLElement {
  const estrela = document.createElement('span')
  estrela.dataset.nup = favorito.numero
  estrela.className = favoritado ? 'seirmg-favorito-estrela' : 'seirmg-favorito-estrela seirmg-favorito-inativo'
  estrela.innerHTML = favoritado ? starIconSvg : starOffIconSvg
  estrela.title = favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
  estrela.addEventListener('click', (evento) => {
    evento.preventDefault()
    evento.stopPropagation()
    alternarFavorito(favorito).catch((error) => {
      console.error('[SEIRMG] Falha ao favoritar processo:', error)
    })
  })
  return estrela
}
```

- [ ] **Step 2: Atualizar o único call site de `criarEstrela`**

Em `aplicarEstrelasEmLinhas` (linhas 497-515), troque a última linha do `forEach`:

```ts
    const favoritado = idsFavoritados.has(favorito.numero)
    processo.insertAdjacentElement('afterend', criarEstrela(favorito.numero, favorito.link, favoritado))
```

por:

```ts
    const favoritado = idsFavoritados.has(favorito.numero)
    processo.insertAdjacentElement('afterend', criarEstrela(favorito, favoritado))
```

- [ ] **Step 3: `alternarFavorito` passa a receber o `FavoritoProcesso` inteiro**

Troque (linhas 658-683):

```ts
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

por:

```ts
async function alternarFavorito(favorito: FavoritoProcesso): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const atual = await store.get()
    const itens = atual.controleProcessos.favoritos.itens
    const jaFavoritado = itens.some((item) => item.numero === favorito.numero)
    const novosItens = jaFavoritado
      ? itens.filter((item) => item.numero !== favorito.numero)
      : [...itens, { ...favorito, adicionadoEm: new Date().toISOString() }]

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

- [ ] **Step 4: Atualizar o call site de `alternarFavorito` no botão de remover do painel (mantém o painel compilando até a Task 4)**

Em `montarLinhaPainelFavoritos` (dentro do bloco `botaoRemover.addEventListener`, linhas 601-605), troque:

```ts
  botaoRemover.addEventListener('click', () => {
    alternarFavorito(item.numero, item.link).catch((error) => {
      console.error('[SEIRMG] Falha ao remover favorito:', error)
    })
  })
```

por:

```ts
  botaoRemover.addEventListener('click', () => {
    alternarFavorito(item).catch((error) => {
      console.error('[SEIRMG] Falha ao remover favorito:', error)
    })
  })
```

(`montarLinhaPainelFavoritos` será reescrita por completo na Task 4 — esta troca só mantém o arquivo compilando entre as duas tasks.)

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
git commit -m "refactor(controle-processos): encadeia o FavoritoProcesso completo pela estrela"
```

---

### Task 4: `index.ts` — helpers de extração por linha nativa + painel reescrito com 5 colunas

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `extrairDataDoMarcador`, `formatarDataBr` de `../../features/controle-processos/prazos` (Task 1); `extrairNomeMarcador` de `../../features/controle-processos/agrupamento` (já importado); `extrairEspecificacaoParaExibicao` de `../../features/controle-processos/especificacao` (já importado); `DEFAULT_SYNC_CONFIG` de `../../lib/storage` (novo import); `alternarFavorito(favorito: FavoritoProcesso)` (Task 3); `obterTextoAtribuido(linha: Element): string | null` (já existe no arquivo); `ordenarFavoritosPorData` (já importado).
- Produces: `configPrazosAtual` (module-level `let ControleProcessosConfig['prazos']`), `obterMarcadoresDaLinha(linha: Element): string[]`, `calcularPrazoFavorito(linha: Element, config: ControleProcessosConfig['prazos']): { diasTexto: string; dataTexto: string; classificacao: 'alerta' | 'critico' | null } | null`, `obterEspecificacaoDaLinha(linha: Element): string | undefined`, `mapaLinhasAbertasNaPagina(): Map<string, Element>` (substitui `nupsAbertosNaPagina`). Todos consumidos dentro desta mesma task pelo painel reescrito (`noUnusedLocals` exige isso).

Sem teste direto (wiring de DOM). Verificação por typecheck + build + inspeção manual.

- [ ] **Step 1: Atualizar os imports**

Troque o import de `prazos` no topo do arquivo (linhas 1-6):

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairTextoMarcador,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
```

por:

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairDataDoMarcador,
  extrairTextoMarcador,
  formatarDataBr,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
```

Troque o import de `storage` (linhas 41-42):

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'
```

por:

```ts
import { createLocalConfigStore, createSyncConfigStore, DEFAULT_SYNC_CONFIG } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'
```

- [ ] **Step 2: CSS novo do painel**

No template `ESTILO_FILTROS_E_ESPECIFICACAO`, troque o bloco final (linhas 128-141):

```ts
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
`
```

por:

```ts
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
  .seirmg-favoritos-detalhes {
    margin-top: 3px;
  }
  .seirmg-favoritos-especificacao {
    color: #666;
    font-size: 11px;
    margin-left: 4px;
  }
  .seirmg-favoritos-marcador {
    display: inline-block;
    background: #eef2f7;
    color: #445;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 11px;
    margin: 0 4px 2px 0;
  }
  .seirmg-favoritos-prazo {
    font-weight: bold;
  }
  .seirmg-favoritos-prazo-alerta {
    color: #b8860b;
  }
  .seirmg-favoritos-prazo-critico {
    color: #c0392b;
  }
  .seirmg-favoritos-prazo-data {
    font-size: 11px;
    color: #666;
  }
  .seirmg-favoritos-vazio {
    color: #aaa;
    font-style: italic;
  }
`
```

- [ ] **Step 3: Estado `configPrazosAtual` e helpers de extração**

Troque a declaração de estado (linhas 478-479):

```ts
let favoritosAtivo = false
let itensFavoritados: FavoritoProcesso[] = []
```

por:

```ts
let favoritosAtivo = false
let itensFavoritados: FavoritoProcesso[] = []
let configPrazosAtual: ControleProcessosConfig['prazos'] = DEFAULT_SYNC_CONFIG.controleProcessos.prazos

interface PrazoFavorito {
  diasTexto: string
  dataTexto: string
  classificacao: 'alerta' | 'critico' | null
}

function obterMarcadoresDaLinha(linha: Element): string[] {
  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  return marcadores
    .map((marcador) => marcador.getAttribute('onmouseover'))
    .filter((texto): texto is string => texto !== null)
    .map(extrairNomeMarcador)
    .filter((nome) => nome !== '')
}

function calcularPrazoFavorito(linha: Element, config: ControleProcessosConfig['prazos']): PrazoFavorito | null {
  if (!config.ativo) return null

  const marcadores = Array.from(
    linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
  )
  const textos = marcadores
    .map((marcador) => marcador.getAttribute('onmouseover'))
    .filter((texto): texto is string => texto !== null)
    .map(extrairTextoMarcador)

  const tentativas: Array<{
    tipo: TipoCalculoPrazo
    exibir: boolean
    limites: { alerta: number; critico: number }
    rotulo: string
  }> = [
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
      rotulo: 'vence',
    },
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
      rotulo: 'desde',
    },
  ]

  const agora = new Date()
  for (const tentativa of tentativas) {
    if (!tentativa.exibir) continue

    const data = extrairDataDoMarcador(textos, tentativa.tipo)
    const dias = calcularDiasDoMarcador(textos, tentativa.tipo, agora)
    if (!data || dias === null) continue

    return {
      diasTexto: `${dias} dia${Math.abs(dias) === 1 ? '' : 's'}`,
      dataTexto: `${tentativa.rotulo} ${formatarDataBr(data)}`,
      classificacao: classificarPrazo(dias, tentativa.tipo, tentativa.limites),
    }
  }
  return null
}

function obterEspecificacaoDaLinha(linha: Element): string | undefined {
  const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
  const onmouseover = processo?.getAttribute('onmouseover')
  if (!onmouseover) return undefined
  return extrairEspecificacaoParaExibicao(onmouseover) || undefined
}
```

- [ ] **Step 4: Definir `configPrazosAtual` no bootstrap**

Em `bootstrap()`, troque (linhas 1428-1429):

```ts
    favoritosAtivo = config.controleProcessos.favoritos.ativo
    itensFavoritados = config.controleProcessos.favoritos.itens
```

por:

```ts
    favoritosAtivo = config.controleProcessos.favoritos.ativo
    itensFavoritados = config.controleProcessos.favoritos.itens
    configPrazosAtual = config.controleProcessos.prazos
```

- [ ] **Step 5: Trocar `nupsAbertosNaPagina` por `mapaLinhasAbertasNaPagina`**

Troque (linhas 556-566):

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
```

por:

```ts
function mapaLinhasAbertasNaPagina(): Map<string, Element> {
  const linhas = new Map<string, Element>()
  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const nup = processo?.textContent?.trim()
      if (nup) linhas.set(nup, linha)
    })
  })
  return linhas
}
```

- [ ] **Step 6: Reescrever `montarLinhaPainelFavoritos` (célula por célula)**

Troque toda a função (o bloco inteiro `function montarLinhaPainelFavoritos(item: FavoritoProcesso, aberto: boolean): HTMLTableRowElement { ... }`):

```ts
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
  botaoRemover.dataset.nup = item.numero
  botaoRemover.innerHTML = starIconSvg
  botaoRemover.title = 'Remover dos favoritos'
  botaoRemover.addEventListener('click', () => {
    alternarFavorito(item).catch((error) => {
      console.error('[SEIRMG] Falha ao remover favorito:', error)
    })
  })
  tdRemover.appendChild(botaoRemover)
  tr.appendChild(tdRemover)

  return tr
}
```

por:

```ts
function montarCelulaProcesso(item: FavoritoProcesso, aberto: boolean, especificacao: string | undefined): HTMLTableCellElement {
  const td = document.createElement('td')
  if (item.link) {
    const link = document.createElement('a')
    link.href = item.link
    link.textContent = item.numero
    td.appendChild(link)
  } else {
    td.appendChild(document.createTextNode(item.numero))
  }

  const detalhes = document.createElement('div')
  detalhes.className = 'seirmg-favoritos-detalhes'

  const badge = document.createElement('span')
  badge.className = aberto ? 'seirmg-favoritos-badge' : 'seirmg-favoritos-badge seirmg-favoritos-badge-fechado'
  badge.textContent = aberto ? 'aberto na sua caixa' : 'fechado'
  detalhes.appendChild(badge)

  if (especificacao) {
    const especificacaoEl = document.createElement('span')
    especificacaoEl.className = 'seirmg-favoritos-especificacao'
    especificacaoEl.textContent = `· ${especificacao}`
    detalhes.appendChild(especificacaoEl)
  }

  td.appendChild(detalhes)
  return td
}

function montarCelulaMarcadores(linhaNativa: Element): HTMLTableCellElement {
  const td = document.createElement('td')
  const nomes = obterMarcadoresDaLinha(linhaNativa)
  if (nomes.length === 0) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  nomes.forEach((nome) => {
    const pill = document.createElement('span')
    pill.className = 'seirmg-favoritos-marcador'
    pill.textContent = nome
    td.appendChild(pill)
  })
  return td
}

function montarCelulaPrazo(linhaNativa: Element, config: ControleProcessosConfig['prazos']): HTMLTableCellElement {
  const td = document.createElement('td')
  const prazo = calcularPrazoFavorito(linhaNativa, config)
  if (!prazo) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }

  const linhaDias = document.createElement('div')
  const classesPorClassificacao: Record<'alerta' | 'critico', string> = {
    alerta: 'seirmg-favoritos-prazo seirmg-favoritos-prazo-alerta',
    critico: 'seirmg-favoritos-prazo seirmg-favoritos-prazo-critico',
  }
  linhaDias.className = prazo.classificacao ? classesPorClassificacao[prazo.classificacao] : 'seirmg-favoritos-prazo'
  linhaDias.textContent = prazo.diasTexto
  td.appendChild(linhaDias)

  const linhaData = document.createElement('div')
  linhaData.className = 'seirmg-favoritos-prazo-data'
  linhaData.textContent = prazo.dataTexto
  td.appendChild(linhaData)

  return td
}

function montarCelulaAtribuicao(linhaNativa: Element): HTMLTableCellElement {
  const td = document.createElement('td')
  const atribuicao = obterTextoAtribuido(linhaNativa)
  if (!atribuicao) {
    td.className = 'seirmg-favoritos-vazio'
    td.textContent = '—'
    return td
  }
  td.textContent = atribuicao
  return td
}

function montarCelulaRemover(item: FavoritoProcesso): HTMLTableCellElement {
  const td = document.createElement('td')
  const botaoRemover = document.createElement('span')
  botaoRemover.className = 'seirmg-favorito-estrela'
  botaoRemover.dataset.nup = item.numero
  botaoRemover.innerHTML = starIconSvg
  botaoRemover.title = 'Remover dos favoritos'
  botaoRemover.addEventListener('click', () => {
    alternarFavorito(item).catch((error) => {
      console.error('[SEIRMG] Falha ao remover favorito:', error)
    })
  })
  td.appendChild(botaoRemover)
  return td
}

function montarLinhaPainelFavoritos(
  item: FavoritoProcesso,
  linhaNativa: Element | undefined,
  config: ControleProcessosConfig['prazos']
): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const especificacao = linhaNativa ? (obterEspecificacaoDaLinha(linhaNativa) ?? item.especificacao) : item.especificacao

  if (!linhaNativa) {
    const tdFechado = montarCelulaProcesso(item, false, especificacao)
    tdFechado.colSpan = 4
    tr.appendChild(tdFechado)
    tr.appendChild(montarCelulaRemover(item))
    return tr
  }

  tr.appendChild(montarCelulaProcesso(item, true, especificacao))
  tr.appendChild(montarCelulaMarcadores(linhaNativa))
  tr.appendChild(montarCelulaPrazo(linhaNativa, config))
  tr.appendChild(montarCelulaAtribuicao(linhaNativa))
  tr.appendChild(montarCelulaRemover(item))
  return tr
}
```

- [ ] **Step 7: Reescrever `renderizarPainelFavoritos`**

Troque toda a função (bloco que começa em `function renderizarPainelFavoritos(): void {` e contém o `thead` com `['Processo', '']`):

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
    tabela.style.tableLayout = 'fixed'

    const colgroup = document.createElement('colgroup')
    ;[30, 24, 20, 18, 8].forEach((largura) => {
      const col = document.createElement('col')
      col.style.width = `${largura}%`
      colgroup.appendChild(col)
    })
    tabela.appendChild(colgroup)

    const thead = document.createElement('thead')
    const trHead = document.createElement('tr')
    ;['Processo', 'Marcadores', 'Prazo', 'Atribuição', ''].forEach((rotulo) => {
      const th = document.createElement('th')
      th.className = 'infraTh'
      th.textContent = rotulo
      trHead.appendChild(th)
    })
    thead.appendChild(trHead)
    tabela.appendChild(thead)

    const tbody = document.createElement('tbody')
    const linhasAbertas = mapaLinhasAbertasNaPagina()
    ordenarFavoritosPorData(itensFavoritados).forEach((item) => {
      tbody.appendChild(montarLinhaPainelFavoritos(item, linhasAbertas.get(item.numero), configPrazosAtual))
    })
    tabela.appendChild(tbody)
    painel.appendChild(tabela)

    referencia.insertAdjacentElement('afterend', painel)
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar painel de favoritos:', error)
  }
}
```

- [ ] **Step 8: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Rodar toda a suíte de testes**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam.

- [ ] **Step 10: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros.

- [ ] **Step 11: Commit**

```bash
cd /c/sei/seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): painel de Favoritos com marcador, prazo, atribuição e especificação"
```

---

## Verificação final (fora do escopo de qualquer task individual)

Depois que todas as tasks estiverem completas e revisadas, a revisão final de branch deve confirmar:

1. `bunx tsc --noEmit`, `bun run test` e `bun run build` passam na branch completa.
2. Numa instância SEI real (ou build carregada no Chrome): ativar Favoritos, favoritar um processo com marcador(es) e prazo — a linha do painel mostra as pílulas de marcador, "N dias" colorido por alerta/crítico e a data (vence/desde), e a atribuição, tudo na mesma linha.
3. Favoritar um processo sem marcador/sem prazo/sem atribuição — as colunas correspondentes mostram "—", sem quebrar o layout.
4. Favoritar um processo, depois navegar pra uma página do Controle de Processos onde ele não aparece (ou simular removendo-o da tabela) — a linha do painel "achata" (processo + especificação ocupando o espaço das 4 colunas), sem marcador/prazo/atribuição.
5. Especificação com texto longo quebra linha (aumenta a altura da linha), nunca corta com reticências.
6. Nenhuma tentativa de mostrar o indicador de "documento novo" (triângulo amarelo) — confirmado como fora de escopo desta plan.
7. Regressão: o fluxo do núcleo continua funcionando — favoritar/desfavoritar pela estrela da tabela nativa E pelo painel, processo favoritado-e-aberto some da tabela nativa, `favoritos.ativo = false` não altera nada visível.
