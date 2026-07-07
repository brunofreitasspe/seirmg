# SEIRMG — Lote E2: Filtro por Atribuição + Filtro por Bloco (Design)

> Spec do Lote E2 do roteiro em `docs/ROADMAP-LOTES.md`. Porta `filtraPorAtribuicao.js` e `carregaInformacaoBlocos.js` do Sei++, reaproveitando o motor de filtro (`filtroTabela.ts`) entregue no Lote E.

## Contexto

Ambos os filtros originais plugam no mesmo motor composto (`filtrarTabela`/`removerFiltroTabela`, agora `registrarFiltro`/`removerFiltro`/`calcularVisibilidade` do Lote E) usado pela busca rápida — múltiplos filtros nomeados compõem por AND. Nesta entrega cada um ganha sua própria seção de lógica pura + wiring, plugando nos mesmos sufixos (`'PorAtribuicao'`, `'PorBloco'`).

**Adaptação importante em relação ao original**: `carregaInformacaoBlocos.js` resolve a URL das telas de bloco com `window.location.origin + '/sei/' + linkRelativo` — um caminho `/sei/` fixo, específico da instalação onde o Sei++ foi testado. Isso quebraria em instalações do SEI com outro caminho base. Esta spec usa a propriedade `.href` do próprio link já presente na página (resolvida pelo navegador para URL absoluta), em vez de reconstruir a URL manualmente.

**Simplificação em relação ao original**: `filtraPorAtribuicao.js` tem um modo alternativo de exibição (`SavedOptions.filtraporatribuicao === 'nome'`, usando `title.substr(15)`) — omitido aqui; usa-se sempre o texto do link como identificador e rótulo.

## Arquitetura

Lógica pura testável em `features/controle-processos/`, wiring fino não-testado estendendo (novamente) `content-scripts/procedimento_controlar/index.ts`.

### `features/controle-processos/filtroAtribuicao.ts`

```ts
export function extrairNomesAtribuidos(textos: string[]): string[]
export function linhaCasaAtribuicao(textoAtribuido: string | null, valorSelecionado: string): boolean
```

`extrairNomesAtribuidos`: recebe os textos dos links de atribuição de todas as linhas (4ª coluna, `td:nth-child(4) a`), retorna a lista única e ordenada (ignorando vazios). `linhaCasaAtribuicao`: `'*'` → sempre casa (opção "Ver todos"); `''` → casa só quando não há atribuído (link ausente ou texto vazio); qualquer outro valor → comparação exata de texto.

### `features/controle-processos/filtroBloco.ts`

```ts
export interface BlocoItem {
  numero: string
  href: string
  descricao: string
}

export function parseListaBlocos(root: ParentNode): BlocoItem[]
export function parseProcessosDoBloco(root: ParentNode): string[]
export function linhaCasaBloco(numeroProcesso: string, numerosDoBloco: string[]): boolean
```

`parseListaBlocos`: porta o parse de `carregaInformacaoBlocos.js` para a tela de listagem de um tipo de bloco — linhas `div.infraAreaTabela table > tbody > tr` com classe `infraTrClara`/`infraTrEscura`/`trVermelha`; número e link vêm da 2ª célula, descrição da penúltima célula. `parseProcessosDoBloco`: mesmo filtro de linhas, mas extrai só o número de processo da 3ª célula (tela de um bloco específico). `linhaCasaBloco`: verdadeiro se o número do processo está na lista de números do bloco selecionado.

### Schema novo — `lib/storage.ts`

`LocalConfig.atribuicaoSelecionada?: string` — preferência persistida (mesmo papel de `moduloFiltraPorAtribuicao` no original), opcional, ausência tratada como `'*'` (ver todos).

### Wiring — `content-scripts/procedimento_controlar/index.ts` (estendido de novo)

Adiciona ao `bootstrap()` (depois das etapas do Lote E, antes de `aplicarPrazos`/etc. — ordem não importa entre estas duas e as do Lote D, só precisam rodar depois de `corrigirTabelasNativas`):

1. **`montarFiltroAtribuicao()`**: coleta o texto do link de atribuição (`td:nth-child(4) a`) de cada linha das 3 tabelas, chama `extrairNomesAtribuidos`, monta um `<select>` com "Ver todos os processos" (`*`), "Ver processos não atribuídos" (``) e uma opção por nome encontrado, injeta em `#divFiltro` (fallback: não faz nada se o elemento não existir). Lê a preferência salva via `createLocalConfigStore().get()` para pré-selecionar; ao mudar, registra/remove o filtro `'PorAtribuicao'` (via `linhaCasaAtribuicao` por linha) e persiste a nova seleção.
2. **`montarFiltroBloco()`**: localiza os 3 links nativos de bloco já presentes na página (`a[href^="controlador.php?acao=bloco_interno_listar"]` etc., usando `.href` resolvido) e monta dois `<select>`s encadeados (tipo de bloco → bloco específico) injetados em `#divComandos`. Ao selecionar um tipo, busca (`fetch` direto — content script, sem round-trip pelo background) a tela de listagem daquele tipo e usa `parseListaBlocos` para popular o segundo select; ao selecionar um bloco específico, busca a tela do bloco e usa `parseProcessosDoBloco` para obter os números, registrando o filtro `'PorBloco'` via `linhaCasaBloco`. Escolher a opção vazia em qualquer um dos dois selects remove o filtro `'PorBloco'`.

Ambas as etapas reaproveitam `aplicarVisibilidade`/`estadoFiltrosPorTabela` já existentes no arquivo (Lote E) — nenhuma duplicação do mecanismo de aplicação de visibilidade.

Cada etapa roda isolada em `try/catch`, loga via `console.error('[SEIRMG] ...', error)` — falha numa não impede a outra nem as etapas já existentes.

## Testes

Vitest cobrindo `filtroAtribuicao.ts` (extração de nomes únicos/ordenados, ignorando vazios; predicado para `'*'`/`''`/valor específico) e `filtroBloco.ts` (`parseListaBlocos` e `parseProcessosDoBloco` com fixtures HTML via jsdom, `linhaCasaBloco`). O wiring (incluindo o `fetch` e a montagem dos `<select>`s encadeados) não é coberto por TDD — verificado via build.

## Tratamento de erros

Falha ao buscar a listagem de um tipo de bloco ou os processos de um bloco específico: loga e mantém o filtro anterior (não remove nem trava a UI) — mesmo espírito do original, que também só loga/alerta em caso de falha AJAX.

## Fora de escopo

- Sem cache entre trocas de tipo/bloco — cada seleção refaz o fetch (simplicidade; evita estado obsoleto entre sessões).
- Sem mudança de manifest — o `fetch` roda no content script, dentro dos `host_permissions` já concedidos para o domínio do SEI.
- Sem feature flag nova — mesmo tratamento das demais features desta tela (sempre ativas).
