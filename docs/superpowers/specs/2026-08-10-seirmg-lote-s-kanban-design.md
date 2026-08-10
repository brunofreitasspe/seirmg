# SEIRMG — Lote S: Kanban de Processos — Design

## Contexto

Pedido direto do usuário (fora do ciclo lote-a-lote formal de investigação de código-fonte de terceiros):
trazer pro SEIRMG uma visão Kanban do Controle de Processos, usando como referência a extensão
`C:\sei\seikaban` ("SEI Kanban por Etiquetas", `content-script.js`, 946 linhas, autor terceiro) —
mas corrigindo os problemas que essa referência tem:

1. Sem ícone na tela de Opções (a referência nem tem tela de Opções).
2. Os cards da visão Kanban não mostram o marcador/etiqueta do processo (só usam ele pra decidir
   a cor de fundo da coluna e o agrupamento — o card em si nunca desenha o nome/cor do marcador).
3. As colunas são só por etiqueta — mistura processos de `Recebidos` e `Gerados` numa coluna só,
   sem diferenciar de qual tabela nativa cada processo veio.
4. `manifest.json` da referência é restrito a um domínio único (`sei.sistemas.ro.gov.br`) — não
   serve fora daquele órgão.

Requisito adicional do usuário, sem equivalente na referência: colunas automáticas fixas
(**Recebidos**, **Gerados**, **Favoritos**) + qualquer número de listas criadas por ele, com
drag-and-drop de verdade movendo o card entre colunas (pertencimento exclusivo — um card mora
numa lista por vez).

Mockup aprovado pelo usuário antes deste documento:
`https://claude.ai/code/artifact/4f0c49e0-2baa-4365-a868-df40c9845eca`.

**Ponto 4 (domínio único) já sai resolvido de graça**: o SEIRMG nunca usa `matches`/
`host_permissions` de domínio fixo — o `manifest.config.ts` já casa com qualquer SEI
(`*://*.br/*controlador.php?acao=*`, `*://*.org/*controlador.php?acao=*`). Construir o Kanban
como mais um bloco de `content-scripts/procedimento_controlar/index.ts` (que já roda assim) é
suficiente; não há nenhum trabalho extra de generalização de domínio a fazer.

## Escopo

- Board na página de Controle de Processos, ativado por um botão "📊 Visão Kanban" que troca a
  visualização das tabelas nativas por colunas — mesma mecânica de troca de visão que a
  referência já usa (esconder as tabelas, mostrar o board; botão "Voltar à visualização padrão"
  desfaz).
- 3 colunas automáticas, sempre presentes quando o Kanban está ativo: **Recebidos**, **Gerados**,
  **Favoritos**. Calculadas ao vivo a cada abertura do board (não são um estado salvo).
- N colunas criadas pelo usuário ("listas"), nomeadas por ele, persistidas em `SyncConfig`
  (sincroniza entre sessões/dispositivos, mesmo padrão de `agrupamento`/`favoritos`).
- **Pertencimento exclusivo**: um processo mora em exatamente uma coluna por vez.
  - Card nasce em `Recebidos` ou `Gerados` (fato do SEI — de qual tabela nativa a linha veio).
  - Favoritar um processo (feature já existente, Lote L) o move pra `Favoritos`, saindo de
    `Recebidos`/`Gerados` — mesmo comportamento que a opção "Ativar favoritos" já tem hoje pra
    tabela nativa (esconde de lá, mostra só no painel de Favoritos), agora espelhado no board.
  - Arrastar um card pra uma lista sua o move pra lá, saindo de onde estava.
  - Um "×" no card, visível só dentro de listas suas, devolve o card ao automático (limpa a
    posição manual; ele reaparece em `Recebidos`/`Gerados`/`Favoritos` conforme o caso).
  - **Não** dá pra arrastar um card de volta pra `Recebidos`/`Gerados` manualmente — não são
    colunas-alvo de drop (não é uma decisão do usuário, é fato do SEI). `Favoritos` também não é
    alvo de drop — só a ação de favoritar (já existente) move um card pra lá.
- Card mostra: número (com botão copiar), **chip colorido do marcador** (nome + cor, corrigindo o
  ponto 2), tipo/especificação, badges (⚠️ documento incluído/assinado, não recebido), prazo,
  atribuição. **Nível de acesso, data/hora e unidade geradora ficam de fora do card** — a
  referência só resolve esses 3 campos por heurística de célula/imagem ("tenta achar uma célula
  que parece com isso"), e o SEIRMG não tem hoje um seletor próprio validado pra eles; decisão
  tomada durante a implementação (revisão da Task 3) foi não portar a adivinhação da referência,
  em vez de arriscar mostrar dado errado no card. Pode ser revisitado depois se alguém validar
  seletores reais numa instância SEI. Também leva a estrela de favoritar/desfavoritar (já
  existente) — é o único jeito de mover um card pra/de `Favoritos`.
- Toolbar do board: pesquisa em tempo real, filtro por ano, filtro "Não recebido", filtro
  "documento alterado", "Maximizar", "+ Nova lista" — portados da referência (mesma lógica de
  filtro combinado em AND), com ícones Lucide (consistente com o resto do projeto).
- Drag-and-drop nativo do navegador (HTML5 Drag and Drop API) — sem dependência nova.
- Gerenciamento de listas (criar, renomear, excluir) acontece **no board**, não na tela de
  Opções — a aba de Opções só liga/desliga a feature. Excluir uma lista devolve todos os cards
  dela ao automático (não apaga processo nem some com nada, só limpa a posição manual).
- Nova aba "Kanban" na tela de Opções (ícone `kanban.svg` do Lucide, resolvendo o ponto 1), com
  o checkbox "Ativar Kanban no Controle de Processos".

**Fora de escopo desta rodada** (posso trazer de volta se você pedir):

- Reordenar as colunas de listas suas (nascem em ordem de criação, fixa).
- Drag handle/reordenação de cards *dentro* da mesma coluna (a ordem dentro da coluna segue a
  ordem de chegada — mesmo critério que a referência já usa pra etiquetas).
- Acessibilidade via teclado pro drag-and-drop (a própria referência não tinha; native HTML5 DnD
  não é operável por teclado sem trabalho extra — documentar como limitação conhecida).
- Cor customizada por lista sua (nasce numa cor neutra fixa; só as automáticas e o chip de
  marcador têm cor).

## Arquitetura

### 1. Lógica pura nova — `features/controle-processos/kanban.ts` (testada)

```ts
export type OrigemAutomatica = 'recebidos' | 'gerados'
export type ColunaKanban =
  | { tipo: 'automatica'; chave: OrigemAutomatica | 'favoritos' }
  | { tipo: 'lista'; id: string }

export interface KanbanLista {
  id: string
  nome: string
  ordem: number
}

export interface KanbanCardPosicao {
  numero: string
  listaId: string
}

// Card nasce em recebidos/gerados; favoritar sobrepõe; posição manual sobrepõe tudo.
export function calcularColuna(
  origem: OrigemAutomatica,
  favoritado: boolean,
  listaIdManual: string | null
): ColunaKanban

export function montarPosicoesAtualizadas(
  posicoes: KanbanCardPosicao[],
  numero: string,
  listaId: string | null // null = volta ao automático (remove a entrada)
): KanbanCardPosicao[]

export function criarLista(
  listasAtuais: KanbanLista[],
  nome: string
): { lista: KanbanLista; listas: KanbanLista[] }

export function renomearLista(listas: KanbanLista[], id: string, novoNome: string): KanbanLista[]

// Também limpa, em `posicoes`, qualquer card que apontava pra essa lista (volta ao automático).
export function removerLista(
  listas: KanbanLista[],
  posicoes: KanbanCardPosicao[],
  id: string
): { listas: KanbanLista[]; posicoes: KanbanCardPosicao[] }

export function linhaNaoRecebida(linha: Element): boolean
export function linhaTemDocumentoAlterado(linha: Element): boolean
export function extrairAnoProcesso(numero: string): string | null
```

- `calcularColuna`/`montarPosicoesAtualizadas`/`criarLista`/`renomearLista`/`removerLista`: sem
  DOM, só dados — mesmo padrão de `agrupamento.ts`/`favoritos.ts`, testáveis isoladamente.
- `linhaNaoRecebida`/`linhaTemDocumentoAlterado`/`extrairAnoProcesso`: extratores de linha com
  seletor real (não heurística de "qual célula pode ser isso") — ver seção 3 abaixo pra por que
  nível de acesso/data-hora/unidade geradora não têm função equivalente.
- Cor e nome do marcador **não** precisam de extração nova: `obterMarcadoresDaLinha`
  (`features/controle-processos/favoritosRender.ts`, já existente — ver seção 4) já devolve nome,
  estilo (cor real do SEI) e ícone nativo por marcador, prontos pra desenhar o chip. Não há
  `extrairCorMarcador`/porta de `extrairCorDoSvg` do seikaban — essa era a ideia original antes
  de eu achar que o SEIRMG já resolve isso melhor (estilo/ícone nativos, não um mapeamento de
  nome-de-arquivo-pra-hex).
- Ids de lista: `crypto.randomUUID()` no momento da criação (já disponível no contexto de
  extensão MV3, sem dependência nova).

### 2. Config — `lib/storage.ts`

```ts
export interface KanbanConfig {
  ativo: boolean
  listas: KanbanLista[]
  posicoes: KanbanCardPosicao[]
}

export interface ControleProcessosConfig {
  // ...campos existentes
  kanban: KanbanConfig
}
```

`DEFAULT_SYNC_CONFIG.controleProcessos.kanban = { ativo: false, listas: [], posicoes: [] }`.
Sincroniza entre dispositivos — mesmo tratamento de `agrupamento`/`favoritos`.

### 3. Extração de card por linha (reaproveitamento)

Campos com seletor real e validado, reaproveitados sem duplicar: número e link vêm de
`.processoVisualizado`/`.processoNaoVisualizado`, igual `extrairHrefDaLinha`/
`extrairFavoritoDaLinha` (`features/controle-processos/favoritos.ts`) já fazem; marcador vem de
`obterMarcadoresDaLinha` (seção 4 abaixo); tipo/especificação vêm de `extrairTipoProcesso`/
`extrairEspecificacaoParaExibicao`, já existentes; atribuição vem de `obterTextoAtribuido`, já
existente; prazo vem de `obterControleDePrazoDaLinha`, já existente. "Não recebido" usa a classe
nativa `.processoNaoVisualizado` (mais confiável que a heurística de imagem da referência).
"Documento alterado" reaproveita o seletor direto da referência (`img[src*="exclamacao.svg"]`,
não é uma heurística de "qual célula pode ser isso", risco baixo).

**Decisão tomada durante a implementação (revisão da Task 3):** nível de acesso, data/hora e
unidade geradora ficam de fora do card. A referência só resolve esses 3 campos por heurística de
célula/imagem ("tenta achar uma célula que pareça uma data"), e o SEIRMG não tem hoje seletor
próprio validado pra eles — mesmo princípio de "não reinventar o que já foi validado ao vivo" do
resto do projeto, aplicado no sentido de "não portar o que a referência também está só
adivinhando". Pode ser revisitado depois se alguém validar seletores reais numa instância SEI.

Origem automática (`recebidos`/`gerados`): qual tabela (`#tblProcessosRecebidos` ou
`#tblProcessosGerados`) a linha pertence — mesma checagem que `TABELAS_COM_AGRUPAMENTO`/
`tabelaSuportaAgrupamento` já fazem pra outros fins.

Favoritado: `numero` está em `config.controleProcessos.favoritos.itens` — reaproveita o array já
mantido pelo Lote L, sem recalcular nada. **Isso vale independente do toggle "esconde da
listagem nativa"** (`processos-favoritos-ativo`) estar ligado ou não — o board sempre deduplica
pelo `calcularColuna`, então um processo favoritado nunca aparece ao mesmo tempo em `Favoritos` e
em `Recebidos`/`Gerados` no Kanban, mesmo que ele ainda apareça na tabela nativa (se aquele toggle
estiver desligado).

### 4. UI — novo módulo `content-scripts/shared/kanbanCard.ts` (paralelo a `plankaCard.ts`)

`montarConteudoCardKanban(dados): HTMLElement` — monta número + botão copiar (mesmo padrão
`navigator.clipboard.writeText` + tooltip "Copiado!" que `procedimento_visualizar/index.ts:421`
já usa), chips de marcador (nome, estilo/cor e ícone nativo, um por marcador — dados de
`obterMarcadoresDaLinha`), badges, prazo, atribuição. Reaproveitado tanto no board principal
quanto — se fizer sentido depois — em qualquer outro lugar que precise do mesmo card.

**Estrela de favorito no card**: como o Kanban esconde as tabelas nativas enquanto ativo, o card
precisa da mesma estrela de favoritar/desfavoritar que já existe por linha (`criarEstrela`/
`alternarFavorito`, `procedimento_controlar/index.ts:864-877`) — senão o usuário perde essa ação
ao entrar na visão Kanban. Reaproveita as duas funções direto, sem duplicar; favoritar/
desfavoritar no card dispara o mesmo `alternarFavorito` já usado na tabela e no painel de
Favoritos, e o board re-renderiza (o card muda de coluna automaticamente via `calcularColuna`).

### 5. UI — `content-scripts/procedimento_controlar/index.ts`

- Botão "📊 Visão Kanban" inserido acima das tabelas, só quando `config.controleProcessos.kanban.ativo`.
  Ao clicar, esconde `#tblProcessosRecebidos`/`#tblProcessosGerados` junto com o `div[id*="divTabela"]`
  pai de cada uma (`#divTabelaProcesso` em layouts que colocam Detalhado/Gerados/Recebidos em
  colunas Bootstrap, comentário em `procedimento_controlar/index.ts` por volta da linha 1140) e
  monta o board. **Correção pós-revisão final:** essa técnica de esconder o `div` pai é nova deste
  lote — `renderizarPainelFavoritos` **não** faz isso (ele só usa `#divTabelaProcesso` como ponto
  de inserção e esconde linhas individuais via `calcularVisibilidade`), a afirmação original aqui
  estava errada. Isso importa porque o container do board precisa ser inserido **fora** dessa
  subárvore escondida (ex.: no mesmo `#divInfraAreaTelaD` onde o botão "Visão Kanban" já é
  inserido), nunca como filho/descendente do `div[id*="divTabela"]` recém-escondido — senão o
  board nasce com `display: none` herdado e fica invisível.
- Board: colunas automáticas primeiro (`Recebidos`, `Gerados`, `Favoritos`), depois as listas do
  usuário na ordem de `KanbanConfig.listas` (por `ordem`), depois um botão "+ Nova lista".
- Drag-and-drop: `draggable="true"` nos cards; `dragstart` grava `numero` via
  `event.dataTransfer.setData`; só as colunas de lista (não as automáticas) escutam `dragover`
  (com `preventDefault` pra habilitar o drop) e `drop` (lê o `numero`, chama
  `montarPosicoesAtualizadas`, persiste em `SyncConfig`, re-renderiza o board inteiro — mesmo
  padrão idempotente de recriar DOM que `aplicarAgrupamento` já usa pros cabeçalhos de grupo).
- "×" no card (só dentro de coluna de lista): mesma chamada com `listaId: null`.
- "+ Nova lista": campo de texto inline → `criarLista` → persiste → re-renderiza.
- Menu "⋯" no cabeçalho de cada coluna de lista: renomear (`renomearLista`) / excluir
  (`removerLista`, com confirmação simples — quantos cards voltam ao automático).
- Toolbar (pesquisa, filtro de ano, "Não recebido", "documento alterado", "Maximizar"): portada
  da referência, ícones Lucide em vez de emoji solto (`search.svg`, `inbox.svg`, `maximize-2.svg`).
- Toda função nova de topo segue a política padrão do projeto: guard `try/catch`, loga via
  `console.error('[SEIRMG] ...', error)`, nunca propaga exceção.

### 6. Opções — `options/index.html` / `options/main.ts`

Nova aba `data-aba="kanban"` no `<nav id="abas">`, com `ICONES_ABA.kanban = kanbanIconSvg`
(`lucide-static/icons/kanban.svg`) — resolve o ponto 1 do pedido original. Painel novo,
`#painel-kanban`, só com:

```html
<label>
  <input type="checkbox" id="kanban-ativo" />
  Ativar Kanban no Controle de Processos
</label>
```

Gerenciamento de listas fica só no board (ver seção 5) — a tela de Opções não duplica essa UI.

## Testes

`kanban.test.ts`: `calcularColuna` (origem sozinha; favoritado sobrepõe origem; posição manual
sobrepõe favoritado e origem; volta ao automático quando `listaIdManual` é `null`);
`montarPosicoesAtualizadas` (adiciona, atualiza, remove por `listaId: null`, não mexe nas outras
entradas); `criarLista`/`renomearLista`/`removerLista` (ids únicos, ordem sequencial, remover lista
some com ela e limpa as posições que apontavam pra ela, preserva as demais); `linhaNaoRecebida`/
`linhaTemDocumentoAlterado`/`extrairAnoProcesso` (seletor bate/não bate, formato de número
válido/inválido).

`storage.test.ts`: round-trip de `controleProcessos.kanban` (`ativo`/`listas`/`posicoes`), mesmo
padrão dos demais campos de `ControleProcessosConfig`.

Extração de campo por linha, montagem do board, drag-and-drop e wiring de Opções: DOM não coberto
por teste automatizado — mesma convenção já estabelecida neste arquivo, verificado via
typecheck/build e validação manual numa instância SEI real (como todo recurso novo de
`procedimento_controlar`).
