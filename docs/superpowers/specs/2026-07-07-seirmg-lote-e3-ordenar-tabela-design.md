# SEIRMG — Lote E3: Ordenar tabelas de Controle de Processos por cabeçalho — Design

## Contexto

`docs/ROADMAP-LOTES.md` lista o item **E3** como "Controle de Processos — agrupar/rolagem/ordenação (Sei Pro)", originalmente marcado como "sem código-fonte lido byte-a-byte". Ao investigar `C:\sei\seipro\dist\js\sei-pro.js` (arquivo de distribuição, legível, não minificado) e `pages/*.md`, ficou claro que o item cobre três funcionalidades distintas, de riscos muito diferentes:

1. **Ordenar/filtrar tabelas ao clicar no cabeçalho** (`pages/ORDENARTABELA.md`) — implementada no Sei Pro via o plugin de terceiros `jquery.tablesorter.combined.min.js`, aplicado a várias tabelas do sistema (`#tblProcessosRecebidos`, `#tblProcessosGerados`, `#tblProcessosDetalhado`, tabela de distribuição, tabela de histórico, tabela de ações em lote).
2. **Rolagem infinita na pesquisa de processos** (`pages/ROLAGEMINFINITA.md`) — via POST recursivo ao `frmProcedimentoControlar` com campo oculto de paginação (`hdnRecebidosPaginaAtual` etc.), dependente de nomes de campo internos do SEI não verificáveis sem instância real.
3. **Agrupar lista de processos** (`pages/AGRUPAR.md`) — acoplado ao kanban próprio do Sei Pro, exportação CSV, biblioteca `chosen.js`, `jmespath`, e raspagem de histórico do processo via AJAX para inferir data de recebimento/envio.

Decisão do usuário: **este lote (E3) cobre apenas o item 1** (ordenar por cabeçalho). O item 2 (rolagem infinita) fica para um lote futuro (E3b) com aviso de risco explícito, no mesmo padrão do Lote F. O item 3 (agrupar) fica para um lote futuro de alto risco (no padrão do já postergado G2).

Da parte 1, a "filtragem" já está coberta pela busca rápida do Lote E (`buscaRapida.ts` + `txtPesquisaRapida`, wired em `content-scripts/procedimento_controlar/index.ts`). O que falta é exclusivamente a **ordenação por clique no cabeçalho**.

Este design cobre apenas as três tabelas de Controle de Processos já tratadas pelo content script existente (`#tblProcessosRecebidos`, `#tblProcessosGerados`, `#tblProcessosDetalhado`) — não as demais tabelas do sistema (distribuição, histórico, ações em lote), que ficam fora de escopo deste lote.

## Arquitetura

Lógica pura nova em `src/features/controle-processos/ordenarTabela.ts` (testada). Wiring estende o content script já existente `src/content-scripts/procedimento_controlar/index.ts` (mesmo arquivo que já cuida de filtros, seleção múltipla e prazos para essas três tabelas) — nenhum content script novo, nenhuma dependência nova (sem tablesorter, sem jQuery).

## Componentes

### `features/controle-processos/ordenarTabela.ts`

```ts
export type TipoColuna = 'texto' | 'numero' | 'data'

export function detectarTipoColuna(valores: string[]): TipoColuna
export function compararValores(a: string, b: string, tipo: TipoColuna): number
export function ordenarIds(
  linhas: Array<{ id: string; valor: string }>,
  tipo: TipoColuna,
  direcao: 'asc' | 'desc'
): string[]
```

- `detectarTipoColuna`: todos os valores não vazios são numéricos (`/^-?\d+([.,]\d+)?$/`) → `'numero'`; todos os valores não vazios batem `dd/mm/yyyy` → `'data'`; caso contrário → `'texto'`. Valores vazios são ignorados na detecção (não travam o tipo em `'texto'` por causa de uma célula em branco).
- `compararValores`: `'numero'` compara como float (vírgula tratada como separador decimal); `'data'` converte `dd/mm/yyyy` para `yyyy-mm-dd` e compara como string; `'texto'` usa `localeCompare` (pt-BR). Valores vazios sempre ordenam por último, independente da direção.
- `ordenarIds`: aplica `compararValores` sobre pares `{id, valor}`, inverte o resultado quando `direcao === 'desc'`, retorna a lista de `id` na nova ordem.

### Wiring em `content-scripts/procedimento_controlar/index.ts`

Nova função `montarOrdenacaoTabelas()`, chamada no `bootstrap()` depois de `corrigirTabelasNativas()` (precisa do `<thead>` corrigido antes de anexar os listeners de clique):

- Para cada tabela em `IDS_TABELAS`, itera os `<th>` do `thead > tr`. Ignora `<th>` sem texto (coluna de checkbox).
- Cada `<th>` sortável ganha `cursor: pointer` e um listener de clique.
- Estado de ordenação por tabela (`Map<string, { indiceColuna: number; direcao: 'asc' | 'desc' } | null>`), independente do `estadoFiltrosPorTabela` já existente (ordenação não é filtro).
- Ao clicar num `<th>`:
  - Se é a mesma coluna já ordenada: inverte a direção.
  - Se é uma coluna diferente: nova ordenação, direção inicial `'asc'`.
  - Coleta `{id, valor}` de cada `<tr>` do `tbody` (mesmo padrão de `id: linha.id || String(index)` já usado pelos filtros), lendo `linha.children[indiceColuna].textContent`.
  - Chama `detectarTipoColuna` sobre os valores coletados, depois `ordenarIds`.
  - Reordena os nós `<tr>` no DOM via `tbody.append(...)` na nova ordem (mover um nó existente com `append` não duplica — o DOM remove o nó da posição antiga automaticamente). Isso preserva o `style.display` que os filtros já aplicaram nas linhas.
  - Atualiza o indicador visual (▲/▼) no `<th>` clicado; remove indicador dos demais `<th>` da mesma tabela.
- Todo o corpo do listener de clique fica em `try/catch`, loga via `console.error('[SEIRMG] Falha ao ordenar tabela:', error)`, no mesmo padrão do resto do arquivo.

## Fora de escopo (explícito)

- Persistência da ordenação entre reloads — a busca rápida (Lote E) também não persiste; manter consistência em vez de introduzir uma exceção.
- As demais tabelas do sistema (distribuição, histórico, ações em lote) — só as três tabelas de Controle de Processos.
- Rolagem infinita e agrupamento — lotes futuros (E3b e um lote de alto risco a definir).

## Testes

`ordenarTabela.test.ts` cobre:
- `detectarTipoColuna`: números, datas `dd/mm/yyyy`, texto, mistura com valores vazios.
- `compararValores`: cada tipo, incluindo empate e valores vazios (sempre por último).
- `ordenarIds`: asc/desc, tipos diferentes, lista vazia.

O wiring em `content-scripts/procedimento_controlar/index.ts` não é coberto por teste automatizado, seguindo a convenção já estabelecida para esse arquivo (lógica pura testada, DOM wiring verificado via build/typecheck).
