# SEIRMG — Dashboard (página própria, estatísticas e histórico de eventos) — Design

## Contexto

Hoje o SEIRMG já produz vários dados por processo, mas cada um vive isolado no seu próprio canto:

- **Favoritos** (`SyncConfig.controleProcessos.favoritos.itens`, `FavoritoProcesso[]`) — só aparecem inline, num
  painel dentro da tela `procedimento_controlar` (`renderizarPainelFavoritos`, em
  `content-scripts/procedimento_controlar/index.ts`), com prazo/marcadores/atribuição ao vivo ou "congelados"
  (`ultimoSnapshot`, ver spec `2026-07-21-seirmg-favoritos-prazo-congelado-design.md`).
- **Prazos** (`SyncConfig.controleProcessos.prazos`) — só existem como colunas extras na tabela nativa e como
  classificação (`classificarPrazo`, `features/controle-processos/prazos.ts`) usada pra destacar linhas.
- **Tarefas** (`SyncConfig.tarefas.itens`) — um checklist pessoal, com painel próprio, mas nenhuma visão agregada
  de "o que está vencido".
- **Histórico de processos visitados** (`LocalConfig.historicoProcessosVisitados`) — só guarda os últimos 10
  acessos (`registrarProcessoVisitado`, `features/procedimento-visualizar/historico.ts`), um único tipo de evento
  (acesso), só pra alimentar a lista "Processos recentes" do popup.

Não existe hoje nenhum lugar que agregue esses dados numa visão só, nem um histórico de eventos mais rico
(envio, documento recebido, assinatura, conclusão) — o usuário viu isso numa extensão-protótipo própria ("SEI
Flow") e quer o equivalente aqui, sem alterar nada do que já existe.

Mockup aprovado (visual companion, 2026-08-03): 4 abas — Visão Geral, Favoritos, Prazos, Tarefas — usando as
mesmas variáveis de cor/espaçamento de `src/options/style.css` e o ícone real da extensão
(`src/assets/icons/icon-48.png`) ao lado do título.

## Decisões validadas com o usuário (2026-08-03)

- **"Tags" = marcador nativo do SEI**, não um sistema de tag colorida customizada novo. O Dashboard usa
  `marcadoresNomes` (já capturado em `SnapshotFavorito`), não introduz um conceito de tag novo.
- **Histórico expandido, não só o que já existe:** novo log de eventos separado de
  `historicoProcessosVisitados` (que continua intocado, alimentando só o popup como hoje).
- **Paridade quase completa com o protótipo:** 5 tipos de evento — `acesso`, `enviado`, `documento`,
  `assinatura`, `concluido` — cobrindo métricas por período, linha do tempo, exportação CSV e relatório HTML.
- **Nada de dashboard embutido nas Opções:** a página em si é uma aba própria do navegador
  (`chrome.tabs.create`), igual ao popup/opções — só um checkbox liga/desliga fica nas Opções.
- **Checkbox "Ativar Dashboard" na aba Geral**, junto do toggle do Painel de Tarefas.
- **Botão "Abrir Dashboard" no popup só aparece quando `config.dashboard.ativo`** (mesmo padrão do bloco
  "Processos recentes" atual), posicionado acima do card de status do bloco de assinatura.
- **Captura de eventos é condicionada a `config.dashboard.ativo`** — desligado, nada novo é gravado (mesmo
  princípio de opt-in já usado por `historicoProcessos.ativo`).

## Arquitetura

### `src/lib/storage.ts`

```ts
export type TipoEventoHistorico = 'acesso' | 'enviado' | 'documento' | 'assinatura' | 'concluido'

export interface EventoHistorico {
  tipo: TipoEventoHistorico
  numero: string
  tipoProcesso?: string
  especificacao?: string
  ocorridoEm: string // ISO
}

export interface DashboardConfig {
  ativo: boolean
}
```

- `SyncConfig` ganha `dashboard: DashboardConfig` (default `{ ativo: false }`).
- `LocalConfig` ganha `historicoEventos: EventoHistorico[]` (default `[]`) — local, não sync (mesmo lugar que já
  guarda `historicoProcessosVisitados`; evita competir pela cota de 8KB do `chrome.storage.sync` à medida que o
  log cresce).

### `src/features/dashboard/historicoEventos.ts` (novo, puro, testável)

```ts
export function registrarEvento(
  eventosAtuais: EventoHistorico[],
  novo: EventoHistorico,
  limite = 500
): EventoHistorico[]
```

Mesmo formato de `registrarProcessoVisitado` (que já existe e não muda): acrescenta no fim e apara pelo limite —
mas **sem** deduplicar por número (diferente do histórico de visitas, aqui cada evento é um registro
independente, mesmo processo pode aparecer várias vezes).

```ts
export function filtrarPorPeriodo(eventos: EventoHistorico[], inicio: Date, fim: Date): EventoHistorico[]
export function calcularMetricas(eventos: EventoHistorico[]): Record<TipoEventoHistorico, number>
export function agruparPorDia(eventos: EventoHistorico[]): Array<{ data: string; eventos: EventoHistorico[] }>
```

### `src/features/dashboard/periodo.ts` (novo, puro, testável)

```ts
export type Periodo = 'hoje' | '7dias' | '30dias' | '90dias' | 'ano'
export function calcularIntervalo(periodo: Periodo, agora: Date): { inicio: Date; fim: Date; rotulo: string }
```

### `src/features/dashboard/relatorio.ts` (novo, puro, testável)

Reusa `montarLinhaCsv`/`escaparCampoCsv`, já existentes em `features/controle-processos/favoritosExportar.ts` —
não duplica lógica de escape de CSV.

```ts
export function montarCsvHistorico(eventos: EventoHistorico[]): string
export function montarHtmlRelatorio(
  eventos: EventoHistorico[],
  intervalo: { inicio: Date; fim: Date; rotulo: string }
): string
```

`montarHtmlRelatorio` gera um documento HTML autocontido (aberto em nova aba via `Blob`/`URL.createObjectURL`,
mesmo padrão do protótipo), reaproveitando as cores por tipo de evento definidas no mockup.

### `src/features/controle-processos/favoritosRender.ts` (novo — extraído)

Hoje `montarCelulaMarcadoresCongelados`, `montarCelulaPrazoCongelado`, `montarCelulaAtribuicao` e `criarIcone`
são funções privadas de `content-scripts/procedimento_controlar/index.ts`. Passam a ser exportadas deste novo
módulo em `features/` (puras, recebem dados já extraídos — não tocam DOM da página do SEI) para serem
reaproveitadas tanto pelo painel inline quanto pela aba "Favoritos" do Dashboard, sem duplicar HTML/CSS.
`procedimento_controlar/index.ts` passa a importar dali em vez de definir localmente — comportamento do painel
inline não muda.

### Captura dos 5 tipos de evento

Todos os gravadores checam `syncConfig.dashboard?.ativo` antes de escrever (opt-in) e usam
`registrarEvento`/`LocalConfig.historicoEventos`.

| Evento | Arquivo | Mecanismo |
|---|---|---|
| `acesso` | `content-scripts/procedimento_visualizar/index.ts` | Já existe `registrarHistoricoVisita(numero, tipo)` (grava em `historicoProcessosVisitados`, gate `historicoProcessos.ativo`). Ganha uma chamada irmã, gate `dashboard.ativo`, gravando em `historicoEventos` — sem alterar a gravação existente. |
| `enviado` | `content-scripts/procedimento_enviar/index.ts` | Novo listener de clique no botão de confirmação de envio (`#sbmEnviar`, mesmo seletor confirmado no Lote Q). Captura **no momento do clique**, antes de qualquer navegação/AJAX subsequente — não depende de saber se o resultado é uma navegação real ou uma atualização in-place. |
| `documento` (recebido) | `content-scripts/documento_receber/index.ts` | Novo listener nos botões `#divInfraBarraComandosSuperior #btnSalvar` / `#divInfraBarraComandosInferior #btnSalvar` (já referenciados neste arquivo para o aviso de autopreenchimento) — captura no clique, mesmo raciocínio do item acima. |
| `assinatura` | `content-scripts/documento_assinar/index.ts` (**novo arquivo + nova entrada no manifest**) | `acao=documento_assinar` abre como janela popup real (confirmado ao vivo em 2026-07-20, ver `ROADMAP-LOTES.md`) — content script roda em `document_idle` nessa janela e grava o evento direto. |
| `concluido` | `content-scripts/core/index.ts` | Novo listener delegado de clique (fase de captura, sem `preventDefault` — só observa) detectando `onclick` contendo `concluirProcesso(` (individual) ou `acao=procedimento_concluir` (em lote, dentro de `acaoControleProcessos(...)`). Em lote, gera um evento por processo com checkbox marcado na tabela atual. |

### `src/dashboard/index.html` + `src/dashboard/main.ts` (nova página)

Segue exatamente o padrão de `src/popup` e `src/options` (script módulo, sem framework, `style.css` própria
reaproveitando as variáveis `--seirmg-*` já usadas em Opções). 4 abas client-side (troca de `display`, sem
roteamento):

1. **Visão Geral** — pills de período (Hoje/7 dias/30 dias/90 dias/Ano), 5 cards de métrica, linha do tempo
   agrupada por dia, botões "Exportar CSV" / "Gerar Relatório".
2. **Favoritos** — tabela read-only reaproveitando `favoritosRender.ts` + `controleProcessos.favoritos.itens`.
3. **Prazos** — favoritos cujo `ultimoSnapshot.prazoDataTexto` classifica como alerta/crítico/vencido via
   `classificarPrazo` (reuso direto, `controleProcessos.prazos.alerta`/`.critico` como limites).
4. **Tarefas** — itens de `SyncConfig.tarefas.itens` vencidos ou próximos do vencimento, reusando
   `features/tarefas/urgencia.ts`/`diffVencidas.ts`.

Aberta via `chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })`, nunca
`chrome.runtime.openOptionsPage()` (que é reservado pra página de Opções).

**A confirmar na implementação:** como registrar essa página nova pro `@crxjs/vite-plugin` empacotar (ela não é
`action.default_popup` nem `options_ui.page`) — provável solução é referenciá-la em
`manifest.config.ts` → `web_accessible_resources`, mesmo mecanismo que o protótipo usou pra sua própria página de
dashboard, mas isso precisa ser validado com um build real antes de contar como resolvido.

### `src/options/index.html` + `main.ts` (aba Geral)

Novo checkbox, ao lado do "Ativar Painel de Tarefas":

```html
<label>
  <input type="checkbox" id="geral-dashboard-ativo" />
  Ativar Dashboard (estatísticas e histórico de eventos, acessível pelo popup)
</label>
```

`carregarAbaGeral()` passa a ler/gravar `config.dashboard.ativo` do mesmo jeito que já faz para
`config.tarefas.ativo`.

### `src/popup/index.html` + `main.ts`

Novo botão, inserido **antes** do `<div id="status">`:

```html
<button id="abrir-dashboard" class="..." style="display: none">Abrir Dashboard</button>
```

`render()` em `popup/main.ts` passa a também ler `createSyncConfigStore().get()` (hoje só lê `localConfig`) e
mostrar o botão quando `config.dashboard.ativo`, com `onclick` chamando
`chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })`.

## Pontos a confirmar durante a implementação (TDD + validação ao vivo)

Mesma disciplina já usada no projeto (ex.: Lote Q corrigido 3x após testes numa instância real) — nenhum destes
vira código sem confirmação:

- **Seletor exato de `#sbmEnviar`** e se o clique realmente dispara antes de qualquer possível re-render AJAX
  que pudesse remover o listener.
- **Em qual tela exatamente aparece o `onclick="concluirProcesso();"` individual** (suspeita: barra de ícones de
  um processo aberto, `arvore_visualizar`/`procedimento_visualizar`) — necessário para saber de onde extrair o
  número do processo naquele momento.
- **Estrutura do DOM da janela `acao=documento_assinar`** — de onde extrair o número do processo ali (provável
  reuso adaptado do padrão já usado em `obterNumeroProcesso()`, hoje privado em
  `procedimento_visualizar/index.ts`, a extrair para um helper compartilhado).
- Mecanismo de empacotamento da página `src/dashboard` pelo `@crxjs/vite-plugin` (ver seção acima).

## Fora de escopo

- Qualquer novo conceito de "tag colorida customizada" — usa só marcador nativo.
- Migração/backfill do histórico de eventos — o log começa vazio a partir da ativação do Dashboard, sem
  reconstruir eventos passados.
- Notificações/alarmes baseados no Dashboard (ex. avisar quando um prazo entra em crítico) — só visualização.
- Edição de favoritos/tarefas a partir do Dashboard — as 3 abas de dado (Favoritos/Prazos/Tarefas) são somente
  leitura, com link para abrir o processo; toda edição continua nos fluxos já existentes (painel inline, painel
  de tarefas).

## Testes

- `historicoEventos.test.ts`: `registrarEvento` (acrescenta, apara no limite, não deduplica por número),
  `filtrarPorPeriodo` (dentro/fora do intervalo, bordas inclusivas), `calcularMetricas` (contagem por tipo,
  lista vazia), `agruparPorDia` (agrupamento correto, ordem preservada).
- `periodo.test.ts`: `calcularIntervalo` para cada um dos 5 períodos, incluindo bordas de "hoje" e virada de ano
  para "ano".
- `relatorio.test.ts`: `montarCsvHistorico` (cabeçalho, escape de campos com `;`/aspas/quebra de linha, reuso de
  `escaparCampoCsv`), `montarHtmlRelatorio` (métricas corretas no HTML gerado, período vazio não quebra).
- `favoritosRender.test.ts`: mesmos casos que já cobrem `montarCelulaMarcadoresCongelados`/
  `montarCelulaPrazoCongelado` hoje (só muda a localização do arquivo, não o comportamento).
- Wiring nos content scripts (captura dos 5 eventos, checkbox em Opções, botão condicional no popup): sem teste
  automatizado, mesmo padrão já estabelecido no projeto — verificado via `tsc --noEmit`/`bun run test`/
  `bun run build` e depois validação manual numa instância SEI real para cada um dos 5 eventos.
