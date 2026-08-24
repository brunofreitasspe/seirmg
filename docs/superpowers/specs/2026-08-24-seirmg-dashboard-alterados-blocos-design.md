# SEIRMG — Dashboard: aba "Alterados" + card ao vivo de Blocos de Assinatura — Design

## Contexto

O painel nativo do SEI (`acao=painel_controle_visualizar`) tem várias tabelas que a gente não precisa
duplicar — a maioria é agregado de todos os processos abertos na unidade, algo que exigiria buscar páginas que o
usuário nem sempre visita, ficando sempre defasado comparado ao painel nativo (que está a um clique). Duas peças,
porém, valem a pena porque a extensão **já tem a lógica de detecção pronta**, só não expõe no Dashboard:

- **"Alterados"** — o painel nativo marca com `exclamacao.svg` todo processo onde um documento foi incluído ou
  assinado desde a última visita. A extensão já detecta exatamente isso —
  `linhaTemDocumentoAlterado()` (`features/controle-processos/kanban.ts`), hoje só usada pelo filtro do Kanban.
  Isso é um sinal de "estado atual" que o Dashboard não tem — as 4 abas de hoje (spec
  `2026-08-03-seirmg-dashboard-design.md`) só mostram histórico de eventos e dados congelados/favoritados, nunca
  "isso mudou e você não viu".
- **Blocos de Assinatura pendentes** — o painel nativo mostra blocos abertos por situação (Recebidos/Retornados).
  A extensão já busca e conta isso ao vivo hoje — `consultarBlocosDisponibilizados()`
  (`content-scripts/core/index.ts`), acionada pelo popup (`consultarBlocosAoVivo`,
  `popup/main.ts`) via `chrome.tabs.sendMessage` numa aba do SEI aberta — mas só devolve um total agregado
  (`disponibilizado_para_area`), sem quebra por situação, e não aparece no Dashboard.

## Decisões validadas com o usuário (2026-08-24)

- **Alterados vira lista completa**, não só um card com número — nova aba do Dashboard, mesmo padrão de
  UI/dados da aba Prazos (spec `2026-08-07-seirmg-dashboard-prazos-globais-design.md`): snapshot local, sem
  expiração por tempo, só sai da lista quando revisitado e constatado que não está mais alterado.
- **Blocos de Assinatura é consulta ao vivo, sem storage novo** — reusa o mecanismo que o popup já usa
  (`chrome.tabs.query` + `chrome.tabs.sendMessage` pra uma aba do SEI aberta), não um snapshot persistido.
- **Sem quebra por documentos/sem-assinatura** — contar isso exigiria abrir a página de cada bloco
  individualmente (N+1 requisições). Escopo reduzido, a pedido do usuário, pra só contagem de blocos por estado.
- **Sem forçar o mapeamento pros rótulos "Recebidos/Retornados" do painel nativo** — os 4 estados que a
  extensão já classifica (`aberto` / `disponibilizado_para_area` / `disponibilizado_pela_area` / `retornado`)
  não têm mapeamento confirmado pra esses 2 grupos. O card usa os rótulos que a extensão já usa internamente
  (ver seção Arquitetura), evitando uma junção não validada.

## Arquitetura

### 1. Aba "Alterados"

#### `src/lib/storage.ts`

```ts
export interface SnapshotAlteradoProcesso {
  numero: string
  especificacao?: string
  link: string | null
  vistoEm: string // ISO — informativo, não usado para expirar nada
}
```

- `LocalConfig` ganha `snapshotAlteradosProcessos: SnapshotAlteradoProcesso[]` (default `[]`) — local, não sync,
  mesmo raciocínio já usado para `snapshotPrazosProcessos`.

#### `src/features/dashboard/snapshotAlterados.ts` (novo, puro, testável)

```ts
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
): SnapshotAlteradoProcesso[]
```

Mesmas 3 regras de `atualizarSnapshotPrazos` (`features/dashboard/snapshotPrazos.ts`), adaptadas pra um sinal
booleano em vez de texto de prazo:

- Linha visível com `alterado = true` → grava ou atualiza a entrada (`vistoEm` = `agoraIso`).
- Linha visível com `alterado = false` (não está mais alterado) → remove a entrada, se existir.
- Processo que não aparece em `linhasVisiveis` (não foi revisitado nesta página) → entrada existente permanece
  intocada.

Retorna a lista resultante (imutável — não modifica `atuais`).

#### Captura no content script (`procedimento_controlar/index.ts`)

Dentro de `bootstrap()`, no mesmo ponto onde já roda `capturarSnapshotGlobalDePrazos(todasAsLinhas)`:

```ts
if (config.dashboard?.ativo) {
  capturarSnapshotGlobalDeAlterados(todasAsLinhas)
}
```

Gate só `dashboard.ativo` — diferente da captura de prazos, não depende de `controleProcessos.prazos.ativo`,
já que "alterado" não é um conceito de prazo.

`capturarSnapshotGlobalDeAlterados(linhas: Element[])`:

1. Mapeia cada linha pra `LinhaVisivelComAlterado` combinando `extrairFavoritoDaLinha(linha, agoraIso)` (numero,
   link, especificacao — já existe, reuso direto, mesmo usado na captura de prazos) com
   `linhaTemDocumentoAlterado(linha)` (já existe, `features/controle-processos/kanban.ts`, exportada — passa a
   ser consumida também aqui, sem mudar o comportamento do Kanban). Linhas sem `numero` são ignoradas.
2. Lê `LocalConfig` atual, chama `atualizarSnapshotAlterados`, grava de volta só se mudou — mesmo padrão
   read-modify-write já usado pra prazos.

Limitação assumida (igual à de prazos): só varre as linhas já renderizadas no carregamento da página.

#### `src/dashboard/main.ts` — `renderizarAlterados()` (nova)

- Lê `localConfig.snapshotAlteradosProcessos ?? []`.
- Sem classificação de severidade (é binário — ou está alterado, ou não está na lista). Ordena por `vistoEm`
  descendente (mais recente primeiro).
- Tabela: Processo | Especificação | Abrir — reusa `montarCelulaAbrirProcesso` (já existe em `main.ts`, usada
  pelas abas Favoritos e Prazos).
- Título da seção segue o padrão da aba Favoritos: "⚠ Alterados (N)".

#### `src/dashboard/index.html`

Nova aba, 5ª posição, depois de "Tarefas":

```html
<button class="tab-btn" data-tab="alterados">Alterados</button>
...
<div class="view" id="view-alterados"></div>
```

### 2. Card "Blocos de Assinatura" na Visão Geral

Sem mudança de storage — consulta ao vivo, mesmo mecanismo que `popup/main.ts` já usa.

#### `src/content-scripts/core/index.ts` — `consultarBlocosDisponibilizados()` estendida

```ts
interface RespostaBlocosDisponibilizados {
  ok: boolean
  total?: number // mantém — compat com o popup, = disponibilizado_para_area (comportamento atual, não muda)
  porEstado?: { aberto: number; disponibilizadoParaArea: number; disponibilizadoPelaArea: number; retornado: number }
  error?: string
}
```

`consultarBlocosDisponibilizados()` já faz `parseListaBlocosAssinatura(doc)` — só precisa agregar por `estado`
além do filtro que já existe pro `total`. `total` não muda de significado (usado hoje pelo indicador de
pendência do popup); `porEstado` é aditivo.

#### `src/dashboard/main.ts` — nova função `consultarBlocosAoVivo()`

Mesma lógica de `popup/main.ts::consultarBlocosAoVivo` (`chrome.tabs.query` pra achar uma aba do SEI aberta,
`chrome.tabs.sendMessage` com `{ type: 'seirmg:consultar-blocos-disponibilizados' }`), extraída pra um helper
compartilhável ou duplicada com o mesmo padrão — **a confirmar na implementação** se compensa extrair pra
`features/bloco-assinatura/` (ambos, popup e dashboard, passam a chamar a versão compartilhada) ou se a
duplicação pontual é aceitável (dois call sites só).

Card novo na Visão Geral (`renderizarVisaoGeral()`), abaixo dos `cards-metricas` existentes:

- Rótulos usam o vocabulário que a extensão já classifica, não os do painel nativo: **Abertos** (estado
  `aberto`), **Disponibilizados p/ sua área** (estado `disponibilizado_para_area`, pendente de abrir),
  **Retornados** (estado `retornado`). `disponibilizado_pela_area` fica fora do card (blocos que a própria
  unidade mandou pra outra área, não é "pendência" desta unidade).
- Estado "indisponível" (sem aba do SEI aberta ou falha na consulta) — mesmo tratamento gracioso que o popup já
  tem: card mostra "Abra uma aba do SEI pra ver blocos pendentes" em vez de números.

## Fora de escopo

- Contagem de documentos / documentos sem assinatura por bloco — exigiria N+1 requisições (uma por bloco),
  descartado nesta rodada.
- Qualquer tentativa de replicar os rótulos exatos "Recebidos/Retornados" do painel nativo — sem mapeamento
  confirmado dos 4 estados já classificados pra esses 2 grupos.
- Tabelas de Tipos de Processo / Marcadores / Atribuições / Grupos de Blocos do painel nativo — agregados de
  todos os processos da unidade, exigiriam fonte de dado nova (scraping de página não necessariamente
  visitada); o painel nativo já mostra isso a um clique, não compensa duplicar.
- Card com contagem de "Alterados" na Visão Geral — decisão do usuário foi só a lista/aba, sem duplicar como
  card resumido também.

## Testes

- `snapshotAlterados.test.ts`: upsert de linha alterada (nova e atualização de existente), remoção quando
  deixa de estar alterada numa linha revisitada, processo não visto permanece intocado, lista vazia de entrada
  não quebra.
- `kanban.test.ts` (já existe): sem mudança — `linhaTemDocumentoAlterado` não muda de comportamento, só ganha
  um novo consumidor.
- Agregação por estado em `consultarBlocosDisponibilizados` (ou onde a lógica de contagem for extraída): testar
  com os 4 estados presentes, lista vazia, e só um estado presente.
- Wiring nos content scripts (captura em `procedimento_controlar`, extensão da mensagem em `core/index.ts`,
  render das duas peças no Dashboard): sem teste automatizado, mesmo padrão já estabelecido no projeto —
  verificado via `tsc --noEmit`/`bun run test`/`bun run build` e validação manual numa instância SEI real.

## Pontos a confirmar durante a implementação

- Se vale extrair `consultarBlocosAoVivo` pra um módulo compartilhado entre popup e dashboard, ou se duplicar
  pontualmente é aceitável (só dois call sites).
- Confirmar ao vivo que `linhaTemDocumentoAlterado()` continua funcionando igual quando chamada no mesmo loop
  de `capturarSnapshotGlobalDePrazos` (não há motivo pra não funcionar — mesma linha, mesmo DOM — mas todo
  wiring novo neste projeto é validado ao vivo antes de contar como resolvido).
