# SEIRMG — Lote G2b-1: Agrupamento Simples de Processos — Design

## Contexto

Item `G2b` do `docs/ROADMAP-LOTES.md` ("Agrupar lista de processos por data/marcador/tipo/responsável (Sei Pro)"), investigado a partir do código-fonte real `C:\sei\seipro\dist\js\sei-pro.js:44-680,1252-1330,1807-1920`.

**O G2b original é, na prática, 4 subsistemas empacotados juntos:**
1. Agrupamento por critério derivável direto da tabela (marcador, tipo, responsável, ponto de controle) — sem chamada de rede extra.
2. Agrupamento por data (autuação/recebimento/envio/último acesso) e por unidade de envio — exige raspar o histórico do processo via AJAX (`getDadosProcedimentosControlar`/`configDataRecebimentoPro`) porque essas datas não estão na tabela nativa.
3. Visualização Kanban (`jKanban`, arrastar-e-soltar, ordem/fixação persistidas por usuário).
4. Exportação CSV (usa os mesmos dados raspados do item 2).

**Decisão de escopo (usuário, ver histórico da sessão):** este lote (`G2b-1`) cobre só o item 1. Os itens 2, 3 e 4 ficam como itens separados no roadmap (`G2b-2` agrupamento por data/unidade de envio, `G2b-3` Kanban, `G2b-4` CSV) para brainstorm próprio quando chegar a vez.

**Correção de escopo feita durante o brainstorming:** "unidade de envio" (`senddepart` no original) foi inicialmente cogitada como critério simples, mas o próprio código-fonte mostra que ela também depende de `getArrayProcessoRecebido` (dado raspado via AJAX, `sei-pro.js:73`) — por isso foi movida para o item 2 (`G2b-2`), não faz parte deste lote.

## Escopo

- Só as tabelas **Recebidos** e **Gerados** (`#tblProcessosRecebidos`, `#tblProcessosGerados`) — mesma restrição do Lote E3b. A tabela **Detalhado** nunca recebe agrupamento (o próprio Sei Pro original só insere o controle de agrupamento quando `#tblProcessosDetalhado` está ausente da página — `sei-pro.js:530`), mas continua recebendo ordenação (E3) e filtros (E/E2) normalmente, sem alteração de comportamento.
- 4 critérios: marcador, tipo, responsável, ponto de controle. Config novo, opt-in via `criterio: 'nenhum'` como padrão (equivalente a "Sem agrupamento").
- Convive com ordenação por coluna (E3), rolagem infinita (E3b) e filtros (busca rápida, atribuição, bloco — E/E2): ordenação por coluna passa a ordenar *dentro* de cada grupo; linhas novas da rolagem infinita são reagrupadas; cabeçalhos de grupo somem se todas as linhas do grupo estiverem ocultas por filtro.
- Persistido em `SyncConfig` (sincroniza entre sessões/dispositivos do usuário), diferente da ordenação (E3, que é só estado em memória por página).
- Fora de escopo: agrupamento por data/unidade de envio (AJAX), Kanban, exportação CSV — viram `G2b-2`/`G2b-3`/`G2b-4` no roadmap.

## Arquitetura

### 1. Lógica pura nova — `features/controle-processos/agrupamento.ts` (testada)

```ts
export type CriterioAgrupamento = 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'

export function extrairTipoProcesso(onmouseover: string): string
export function extrairTextoPontoControle(onmouseover: string): string

export interface LinhaParaAgrupar {
  id: string
  chaveGrupo: string | null
}

export interface GrupoOrdenado {
  chaveGrupo: string | null
  ids: string[]
}

export function agruparLinhas(
  linhas: LinhaParaAgrupar[],
  ordemDentroDoGrupo?: Map<string, number>
): GrupoOrdenado[]
```

- `extrairTipoProcesso`: 2º argumento entre aspas simples do `onmouseover` do link do processo (`mostrarDica('Especificação','Tipo')`) — paralela a `extrairEspecificacaoParaCor`/`extrairEspecificacaoParaExibicao` (Lote D), que já usam o 1º argumento desse mesmo `onmouseover` para a "especificação". Implementação: `onmouseover.split("'")[3] ?? ''` (índices 1 e 3 são os dois argumentos entre aspas simples).
- `extrairTextoPontoControle`: 2º argumento entre aspas simples do `onmouseover` do link `andamento_situacao_gerenciar`, mesmo padrão de extração.
- `agruparLinhas`: recebe a lista de linhas já com a chave de grupo extraída (o content-script decide qual extrator usar, conforme o critério ativo) e devolve os grupos na ordem final de exibição:
  1. Agrupa por `chaveGrupo` (`null`/string vazia caem no grupo `null`, que vira o rótulo "Sem Grupo").
  2. Ordena os grupos por `chaveGrupo` alfabeticamente (`localeCompare`), com o grupo `null` sempre por último, independente de ordem alfabética.
  3. Dentro de cada grupo, se `ordemDentroDoGrupo` for passado (mapa id → posição, vindo da ordenação de coluna ativa do E3), ordena os `ids` do grupo por essa posição; senão preserva a ordem de entrada.
- Não depende de DOM — recebe/devolve só `string`/`id`, testável isoladamente.

### 2. Extração de marcador e responsável (reaproveitamento, sem função nova)

- **Marcador**: mesma coleta de âncoras que `aplicarUmTipoDePrazo`/`prazos.ts` já fazem (`td > a[href*='acao=andamento_marcador_gerenciar']`), mas usando o 2º argumento do `onmouseover` (nome do marcador) em vez do 1º (texto de data usado por `calcularDiasDoMarcador`). Como é um padrão de extração diferente do de `prazos.ts` (`extrairTextoMarcador` pega o 1º argumento), esta função nasce em `agrupamento.ts` também: `extrairNomeMarcador(onmouseover): string`, usando `onmouseover.split("'")[3] ?? ''` como as demais.
- **Responsável**: texto do link `td:nth-child(4) a` — mesma coluna que `obterTextoAtribuido` (já existente no content-script, usado pelo filtro de atribuição do E2) já lê. Reaproveitado diretamente, sem nova função.

### 3. Config — `lib/storage.ts`

```ts
export interface AgrupamentoConfig {
  criterio: 'nenhum' | 'marcador' | 'tipo' | 'responsavel' | 'pontoControle'
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
}
```

`DEFAULT_SYNC_CONFIG.controleProcessos.agrupamento = { criterio: 'nenhum' }`. Sem campo `ativo` separado — `criterio: 'nenhum'` já representa "desligado", mesma semântica do `<select>` original do Sei Pro ("Sem agrupamento").

### 4. UI — `content-scripts/procedimento_controlar/index.ts`

Novo `<select id="seirmg-agrupamento-criterio">` com as opções "Sem agrupamento / Por marcador / Por tipo / Por responsável / Por ponto de controle", inserido via `divFiltro.prepend(select)` — mesma área e mesmo padrão de inserção que `montarFiltroAtribuicao` já usa (`#divFiltro`). Ao `change`, grava `criterio` no `SyncConfig` (`createSyncConfigStore().set(...)`) e chama `reaplicarOrdemDaTabela` nas duas tabelas.

Cabeçalho de grupo: `<tr class="tableHeader infraCaption seirmg-cabecalho-grupo">` com um único `<td colspan="N">`, `N` calculado dinamicamente a partir de `tabela.querySelector('thead > tr').children.length` (cobre o caso de `aplicarPrazos` já ter adicionado colunas extra), contendo `"{rótulo do grupo} ({quantidade} processos)"`. Reaproveita as classes nativas `tableHeader`/`infraCaption` do SEI para herdar o estilo visual já existente na página (mesmo princípio usado pelo Sei Pro original, `sei-pro.js:445-452`).

### 5. Ponto central de integração — `reaplicarOrdemDaTabela(idTabela: string): void`

Substitui as chamadas hoje espalhadas (`ordenarTabelaPelaColuna` aplicando direto, `reaplicarOrdenacaoAtual`, cada filtro chamando `aplicarVisibilidade` isoladamente) por um único fluxo, chamado a partir de 4 gatilhos: clique no cabeçalho de coluna, troca do `<select>` de agrupamento, filtro mudou (busca/atribuição/bloco), linhas novas chegaram via rolagem infinita.

```ts
function reaplicarOrdemDaTabela(idTabela: string): void {
  try {
    // 1. Filtros (comportamento já existente, sem mudança)
    const linhas = linhasDaTabela(idTabela)
    const estado = estadoFiltrosPorTabela.get(idTabela) ?? {}
    const ids = linhas.map((linha, index) => linha.id || String(index))
    aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))

    // 2. Agrupamento (só Recebidos/Gerados) + ordenação dentro do grupo
    // criterioAgrupamentoAtivo é uma única variável module-level (não por tabela): o
    // <select> é um só pra página inteira, controlando Recebidos e Gerados juntos —
    // mesmo comportamento do <select id="selectGroupTablePro"> único do Sei Pro original.
    const tabelaSuportaAgrupamento = idTabela === '#tblProcessosRecebidos' || idTabela === '#tblProcessosGerados'
    if (tabelaSuportaAgrupamento && criterioAgrupamentoAtivo !== 'nenhum') {
      aplicarAgrupamento(idTabela, criterioAgrupamentoAtivo)
    } else {
      removerCabecalhosDeGrupo(idTabela)
      reaplicarOrdenacaoAtual(idTabela) // comportamento atual do E3, sem grupos
    }

    // 3. Esconde cabeçalho de grupo cujas linhas estejam todas display:none
    ocultarCabecalhosDeGrupoVazios(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao reaplicar ordem da tabela:', error)
  }
}
```

`aplicarAgrupamento`: extrai a chave de cada linha conforme o critério (usando os extratores da seção 1/2), monta `ordemDentroDoGrupo` a partir de `estadoOrdenacaoPorTabela` (E3) se houver coluna ativa, chama `agruparLinhas`, e materializa no DOM — reordena os `<tr>` via `tbody.appendChild` (mesma técnica de `aplicarOrdenacaoNaTabela`, E3) intercalando um `<tr>` de cabeçalho antes do primeiro id de cada grupo. Cabeçalhos antigos são removidos e recriados a cada chamada (idempotente, mesmo padrão de `aplicarPrazos` recriando colunas — aqui não há duplicação porque removemos antes de inserir).

`ordenarTabelaPelaColuna` (E3) e o gatilho de linhas novas da rolagem infinita (`reaplicarTratamentosNasLinhasNovas`, E3b) passam a terminar chamando `reaplicarOrdemDaTabela(idTabela)` em vez de aplicar sua própria reordenação isolada.

### 6. Compatibilidade com seleção múltipla e política de guards

`montarSelecaoMultipla` (seleção em lote, base do Lote F) depende só da posição relativa dos `<input type="checkbox">` visíveis no DOM (`tabela.querySelectorAll('input[type="checkbox"]')`, indexado). Como `aplicarAgrupamento` sempre reordena os mesmos nós `<tr>` (nunca clona ou recria), e os `<tr>` de cabeçalho de grupo não têm checkbox, a seleção por shift-click continua funcionando sem nenhuma mudança nessa função — os índices calculados por `calcularIndicesParaClicar` seguem batendo com a ordem visual agrupada.

Toda função nova de topo (`montarAgrupamento`, `reaplicarOrdemDaTabela`, `aplicarAgrupamento`) segue a política padrão já estabelecida no projeto: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca propaga exceção.

### 7. Opções — nenhuma mudança em `options/index.html`/`options/main.ts`

Diferente dos demais recursos de Controle de Processos, o agrupamento não tem um toggle na tela de Opções — o controle é o próprio `<select>` inserido na página do SEI (paridade com o Sei Pro original, que também não tinha essa opção na tela de configurações). `criterio: 'nenhum'` cobre o caso "desligado" sem precisar de tela extra.

## Testes

`agrupamento.test.ts`: `extrairTipoProcesso`/`extrairTextoPontoControle`/`extrairNomeMarcador` (extração do 2º argumento; string vazia quando não há segundo argumento); `agruparLinhas` (grupo `null` vira "Sem Grupo" e fica sempre por último mesmo com nomes que ordenariam antes alfabeticamente; grupos nomeados em ordem alfabética; dentro do grupo, respeita `ordemDentroDoGrupo` quando fornecido; preserva ordem de entrada quando `ordemDentroDoGrupo` é omitido; múltiplas linhas no mesmo grupo).

`storage.test.ts`: teste de round-trip para `controleProcessos.agrupamento`, mesmo padrão dos demais campos de `ControleProcessosConfig`.

O restante (`<select>` na página, cabeçalho de grupo com colspan dinâmico, `reaplicarOrdemDaTabela`, integração com E3/E3b/E/E2) é wiring de DOM não coberto por teste automatizado — mesma convenção já estabelecida para este arquivo, verificado via typecheck/build.
