# SEIRMG — Lote E: Controle de Processos — Núcleo de Filtros e Seleção (Design)

> Spec do Lote E (escopo reduzido) do roteiro em `docs/ROADMAP-LOTES.md`. Porta o núcleo de `filtra_processos` (motor de filtro genérico + busca rápida "OU"), `selecionarMultiplosProcessos.js`, `confirmarAntesConcluir.js` e `corrigirTabelas.js` do Sei++. Filtro por atribuição e filtro por bloco (que reaproveitam o mesmo motor, mas fazem chamadas AJAX próprias) ficam para um Lote E2.

## Contexto

Descoberta importante ao ler o código-fonte: as tabelas nativas do SEI (`#tblProcessosDetalhado`/`#tblProcessosGerados`/`#tblProcessosRecebidos`) **não têm `<thead>`** — a linha de cabeçalho é a primeira `<tr>` dentro do `<tbody>`. `corrigirTabelas.js` move essa linha para um `<thead>` recém-criado. O `content-scripts/procedimento_controlar/index.ts` do Lote D já assumia `thead > tr` para inserir os cabeçalhos "Dias"/"Prazo" — sem essa correção rodando **antes**, esse cabeçalho nunca aparece (célula extra sem rótulo). Esta spec corrige isso, integrando `corrigirTabelasNativas()` como o primeiro passo do bootstrap já existente.

`filtra_processos/index.js` é um motor de filtro **composto**: múltiplos filtros nomeados (busca rápida, atribuição, bloco) registram independentemente quais linhas cada um "aprova"; uma linha só fica visível se aprovada por **todos** os filtros atualmente registrados (AND). O mecanismo original usa atributos DOM (`data-filtro`) como armazenamento; esta spec reimplementa a mesma semântica com estruturas de dados puras, testáveis, para que o Lote E2 (filtro por atribuição/bloco) plugue nele sem mudanças.

## Arquitetura

Lógica pura testável em `features/controle-processos/`, wiring fino não-testado estendendo o `content-scripts/procedimento_controlar/index.ts` já existente (Lote D) — mesmo arquivo, não um content script novo, porque a ordem de execução importa (corrigir tabela **antes** de aplicar prazos/cores/especificação) e todas essas features atuam na mesma tela.

### `features/controle-processos/filtroTabela.ts`

Reimplementação pura do motor de `filtra_processos/index.js`, decoupled de jQuery/atributos DOM:

```ts
export type EstadoFiltros = Record<string, Record<string, boolean>>

export function registrarFiltro(
  estado: EstadoFiltros,
  sufixo: string,
  resultadoPorLinha: Record<string, boolean>
): EstadoFiltros

export function removerFiltro(estado: EstadoFiltros, sufixo: string): EstadoFiltros

export function calcularVisibilidade(estado: EstadoFiltros, linhaIds: string[]): Record<string, boolean>
```

`estado` mapeia sufixo-do-filtro → (id-da-linha → passou/não passou). `calcularVisibilidade` retorna, para cada linha, se ela passa em **todos** os filtros atualmente registrados (equivalente ao `atualizaFiltro` original, que só mostra uma linha se ela tem a marca "mostrar" de cada filtro ativo na tabela).

### `features/controle-processos/buscaRapida.ts`

Porte de `pesquisarInformacoes.js`:

```ts
export function parseTermosBusca(textoOriginal: string): string[]
export function linhaCasaBusca(textoLinha: string, termos: string[]): boolean
```

`parseTermosBusca`: texto vazio → `[]` (sem filtro); texto no formato `[termo1 termo2]` → array com os termos separados por espaço (busca "OU"); qualquer outro texto → array de um único termo. `linhaCasaBusca`: verdadeiro se o texto da linha contém **qualquer um** dos termos (case-insensitive, mesma semântica do `indexOf` original).

### `features/controle-processos/selecaoMultipla.ts`

Porte de `selecionarMultiplosProcessos.js`:

```ts
export function calcularIndicesParaClicar(indiceInicial: number, indiceFinal: number): number[]
```

Dado o índice do checkbox marcado anteriormente e o índice do checkbox marcado agora (com Shift pressionado), retorna os índices **estritamente entre** os dois (mesma exclusão de extremos do `efetuarClique` original — os dois extremos já estão no estado correto, só os do meio precisam de clique sintético).

### Wiring — `content-scripts/procedimento_controlar/index.ts` (estendido)

Adiciona, no início do `bootstrap()` já existente, **antes** de `aplicarPrazos`/`aplicarCorProcesso`/`aplicarEspecificacao`:

1. **`corrigirTabelasNativas()`**: para cada uma das 3 tabelas, se não tiver `<thead>`, cria um e move a primeira `<tr>` de `tbody` para dentro dele — mesma lógica de `corrigirTabelas.js`.
2. **Busca rápida**: listener `input`/`change` em `#txtPesquisaRapida`; a cada mudança, para cada tabela, calcula `parseTermosBusca` + `linhaCasaBusca` por linha, chama `registrarFiltro`/`removerFiltro` (estado mantido em `Map<Element, EstadoFiltros>` por tabela, módulo-level) e aplica a visibilidade resultante via `calcularVisibilidade` — linhas escondidas têm `style.display = 'none'`, checkbox desmarcado (se estava marcado) e desabilitado; linhas visíveis voltam a `style.display = 'table-row'` e o checkbox é reabilitado. Atualiza o texto do `<caption>` com a contagem de linhas visíveis.
3. **Seleção múltipla**: rastreia `shiftKey` via listener `keydown`/`keyup` no `document`; ao clicar num checkbox de linha com Shift pressionado, usa `calcularIndicesParaClicar` para disparar clique sintético nos checkboxes intermediários (guard contra recursão infinita via flag `desativarClick`, mesmo padrão do original).
4. **Confirmar antes de concluir**: localiza o botão `#divComandos > a[onclick*="acao=procedimento_concluir"]`; envolve o `onclick` original num `confirm('Deseja mesmo concluir os processos selecionados?')`.

Todo o bootstrap continua dentro do `try/catch` já existente — falha em qualquer uma dessas 4 novas etapas loga e não impede as demais (cada etapa em seu próprio `try/catch` interno, seguindo o padrão já usado no restante do arquivo).

## Testes

Vitest cobrindo `filtroTabela.ts` (registrar/remover filtro, composição AND de múltiplos filtros, remoção restaura visibilidade), `buscaRapida.ts` (parse de termo único, sintaxe `[a b]`, texto vazio, case-insensitivity), `selecaoMultipla.ts` (intervalo direto, invertido, adjacente sem meio, mesmo índice). O wiring estendido em `content-scripts/procedimento_controlar/index.ts` não é coberto por TDD (mesmo padrão já estabelecido) — verificado via build.

## Tratamento de erros

Cada uma das 4 novas etapas do bootstrap roda isolada em `try/catch`, loga via `console.error('[SEIRMG] ...', error)`. Falha em `corrigirTabelasNativas()` não impede as demais etapas de tentar rodar (ainda que sem `<thead>` corrigido, `aplicarPrazos` já tem seu próprio guard `if (theadRow)`).

## Fora de escopo (Lote E2)

- Filtro por atribuição (`filtraPorAtribuicao.js`) — reaproveita `filtroTabela.ts` sem mudanças, mas precisa de UI própria (select de atribuição) e preferência persistida.
- Filtro por bloco (`carregaInformacaoBlocos.js`) — reaproveita `filtroTabela.ts`, mas depende de chamadas `fetch` para 3 telas de bloco diferentes.
- Agrupar lista de processos, rolagem infinita, ordenação por cabeçalho persistente (Sei Pro) — sem código-fonte lido byte-a-byte (só documentação), ficam para avaliação em lote futuro dedicado.

## Fora de escopo (permanente, nesta entrega)

- Nenhuma feature flag nova em `lib/storage.ts` — busca rápida, seleção múltipla, confirmação e correção de tabela ficam sempre ativas quando o content script roda, mesmo tratamento já dado a `core`/`tema` (sem toggle).
