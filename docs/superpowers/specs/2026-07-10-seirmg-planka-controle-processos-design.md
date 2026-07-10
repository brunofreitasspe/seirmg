# SEIRMG — Planka na tela de Controle de Processos

> Spec resultante de brainstorming em 2026-07-10, **revisada no mesmo dia** após feedback
> de uso real: a extensão continuou abrindo o link "Ver Planka" em processos sem card
> nenhum, o que o usuário considerou poluição visual. A decisão original desta spec
> ("sob demanda, link sempre visível") foi **substituída** por uma checagem em lote que
> só mostra o link nas linhas que de fato têm card — ver seção "Decisão de arquitetura"
> abaixo. Nenhuma outra parte da integração Planka já implementada (specs
> `2026-07-09-seirmg-lote-o-planka-auth-n8n-design.md` e
> `2026-07-09-seirmg-lote-o-planka-extensao-design.md`, ambas mescladas em `main`) é
> reaberta aqui.

## Contexto

A integração Planka hoje só mostra o card (Tipo de Processo/Localização/Último
Comentário) na tela de um processo individual (`procedimento_visualizar`), buscado
automaticamente ao abrir a página. O usuário quer o mesmo tipo de informação também na
tela de **Controle de Processos** (`procedimento_controlar` — as tabelas
Recebidos/Gerados/Detalhado, onde cada linha lista um processo), **mas só nas linhas
que realmente têm um card correspondente no Planka** — sem link nenhum nas demais.

## Decisão de arquitetura: checagem em lote, link condicional

O backend n8n (`infra/planka-auth/`) tinha só um endpoint que consulta **um** processo
por vez, com todos os detalhes (tipo, localização, último comentário). Buscar
automaticamente o card completo de cada linha ao carregar a página geraria
dezenas/centenas de chamadas simultâneas (a tabela pode ter centenas de linhas com a
rolagem infinita ativada) — por isso a primeira versão desta spec optou por um link
sempre visível, sob demanda.

Na prática isso significou link poluindo linhas sem card nenhum. Decisão revisada: um
**quarto workflow n8n**, dedicado a existência em lote — roteiro completo em
`infra/planka-auth/roteiro-verificar-processos-lote.md` — recebe uma lista de NUPs e
devolve só quais têm card (`{ "encontrados": [...] }`), sem os detalhes. A extensão faz
**uma chamada em lote** com todos os NUPs visíveis (não uma por linha), e só desenha o
link "📋 Ver Planka" nas linhas cujo NUP veio na resposta.

O clique continua dependendo de uma consulta individual ao workflow "Consultar
Processo" já existente (ver seção "Layout do resultado" abaixo) — a checagem em lote
não traz os detalhes, só decide onde o link aparece. Isso mantém o workflow "Consultar
Processo" (já em produção, usado por `procedimento_visualizar`) intocado.

## Armazenamento

`PlankaConfig` (`src/lib/storage.ts`) ganha mais um campo opcional, seguindo o mesmo
padrão de `urlCadastro`/`urlLogin`/`urlConsulta`:

```ts
export interface PlankaConfig {
  urlCadastro?: string
  urlLogin?: string
  urlConsulta?: string
  urlVerificarLote?: string // NOVO
  email?: string
  token?: string
  tokenExp?: number
}
```

Sem entrada em `DEFAULT_LOCAL_CONFIG` (campo opcional, mesmo padrão dos outros três).

## Opções (aba Integrações)

`src/options/index.html` ganha um novo campo de texto "URL de verificação em lote"
(`id="integracoes-planka-url-verificar-lote"`), ao lado dos três já existentes.
`carregarAbaIntegracoes()` (`src/options/main.ts`) passa a ler/gravar esse campo do
mesmo jeito que os outros três, e inclui sua origem no `Set` de origens pedido via
`chrome.permissions.request` no clique de "Entrar" (junto com `urlLogin`/`urlConsulta`
— na prática será quase sempre a mesma origem do n8n, mas o pedido de permissão cobre
explicitamente todos os campos preenchidos, sem assumir que são iguais).

Sem esse campo preenchido, a checagem em lote não roda e nenhum link "Ver Planka"
aparece no Controle de Processos — mesma filosofia "sem configuração, sem poluição
visual" já usada no resto da integração.

## Checagem em lote no Controle de Processos

`src/content-scripts/procedimento_controlar/index.ts`:

- Mesmo escopo de tabelas de `aplicarCorProcesso`/`aplicarPrazos`:
  `IDS_TABELAS = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']`.
- Extração do NUP por linha reaproveita o seletor já usado por
  `aplicarCorProcessoEmLinhas`/`aplicarEspecificacaoEmLinhas`/`extrairChaveDeAgrupamento`:
  `linha.querySelector('.processoVisualizado, .processoNaoVisualizado')` (`textContent`
  trimado é o NUP).
- No `bootstrap()`, depois de aplicar prazos/cor/especificação: se `planka.urlVerificarLote`
  e um token válido (`tokenValido`) existirem, coleta os NUPs de todas as linhas das 3
  tabelas e faz **uma única chamada** `POST urlVerificarLote` com
  `{ processos: [...] }`.
- Rolagem infinita: `reaplicarTratamentosNasLinhasNovas` ganha uma chamada equivalente,
  só com os NUPs das `linhas` novas recebidas como parâmetro (mesmo padrão já usado por
  `aplicarPrazosEmLinhas`/`aplicarCorProcessoEmLinhas`/`aplicarEspecificacaoEmLinhas`) —
  dispara uma nova chamada em lote (pequena) a cada página buscada pela rolagem
  infinita, só para as linhas que acabaram de entrar.
- Para cada NUP retornado em `encontrados`, insere o link na linha correspondente:
  `processo.insertAdjacentElement('afterend', link)` — mesmo ponto de inserção já usado
  por `aplicarEspecificacaoEmLinhas` (nas linhas que têm as duas coisas, aparecem lado a
  lado, especificação antes por ser aplicada primeiro no `bootstrap`).
- Texto do link: `📋 Ver Planka`, `href="#"`, com `preventDefault()` no clique.
- Falha na chamada em lote (rede, 401, 5xx): nenhum link aparece nessa leva de linhas,
  `console.error` (mesmo padrão de log do resto da integração) — nunca um widget
  quebrado na tela. Em 401 especificamente, limpa `token`/`tokenExp` de
  `LocalConfig.planka` (mesmo comportamento já existente em `procedimento_visualizar`),
  evitando repetir chamadas com token morto nas levas seguintes da mesma carga de
  página.

## Layout do resultado: popover flutuante (mantido da versão anterior desta spec)

Ao clicar no link de uma linha, dispara uma consulta individual ao webhook
`urlConsulta` (mesmo usado por `procedimento_visualizar`, workflow "Consultar
Processo" — nenhuma mudança nele) com `{ processo: nup }`, e abre um popover
posicionado perto do link clicado (não empurra as linhas da tabela, não afeta o layout
ao redor). Reaproveita o mesmo HTML/CSS já usado no card da tela de processo único
(`renderizarCardPlanka`/`ESTILO_PLANKA`, hoje só em `procedimento_visualizar/index.ts`)
— nesta implementação, extraídos para um módulo novo e compartilhado,
`src/content-scripts/shared/plankaCard.ts` (não é um entry point de content script no
manifesto, só um módulo importado pelos dois: `procedimento_visualizar/index.ts` passa
a importar de lá em vez de definir localmente). O container do popover é posicionado
(`position: absolute`, ancorado no link) em vez de anexado a `#container`:
- Duas pills: Tipo de Processo, Localização (omitidas individualmente se vierem
  `null`).
- Bloco de citação com o Último Comentário (omitido se `null`).
- 404 (card sumiu entre a checagem em lote e o clique — condição de corrida rara, mas
  possível se o card for arquivado/movido nesse intervalo): popover mostra "Nenhum card
  encontrado no Planka." em vez das pills/citação.
- Qualquer outro erro (401, 5xx, rede): popover mostra "Erro ao consultar o Planka." e
  loga `console.error`. Em 401, limpa o token salvo (mesmo comportamento já existente).

Só um popover fica aberto por vez — abrir um novo fecha o anterior. Clicar fora do
popover também fecha.

## Permissão de host

Nenhuma permissão nova além da já prevista: a origem de `urlVerificarLote` entra no
mesmo `chrome.permissions.request()` feito no login (aba Integrações, ver seção
"Opções" acima), junto com `urlLogin`/`urlConsulta`. Essa concessão vale para toda a
extensão, não só para a página onde foi pedida.

## Testes

Sem teste automatizado direto para a manipulação de DOM/chamada em lote/popover (mesma
política já aplicada ao resto dos content-scripts deste projeto — só lógica pura em
`src/features/` é testada via Vitest). A extração do NUP por linha reaproveita um
seletor já em produção nesta mesma página, sem lógica nova a testar isoladamente. Se a
montagem do body/parse da resposta de `urlVerificarLote` (`{ processos: [...] }` →
`{ encontrados: [...] }`) tiver alguma lógica de dedup/normalização não trivial, essa
parte pontual vira uma função pura testável em `src/features/planka/`, mesmo padrão já
usado por `decodificarPayloadJwtSemVerificar`/`tokenValido` (`src/features/planka/token.ts`).

## Fora de escopo

- Qualquer mudança no workflow "Consultar Processo" ou no schema do Postgres do
  Planka além do novo workflow "Verificar Processos em Lote" (ver
  `infra/planka-auth/roteiro-verificar-processos-lote.md`).
- Cache da checagem em lote entre navegações/reloads — cada carregamento da página
  refaz a chamada em lote do zero (mesma política de "sempre atual, sem cache" já
  aceita no resto da integração, ex. o card de `procedimento_visualizar` também
  reconsulta a cada visita).
- Atualização automática do link se um card for criado no Planka *depois* da checagem
  em lote já ter rodado (ex. usuário cria o card enquanto a tela de Controle de
  Processos já está aberta) — só uma nova carga de página refaz a checagem.
