# SEIRMG — Painel de Tarefas (checklist pessoal) — Design

> Nova melhoria (fora do ciclo lote-a-lote formal) — port de outra extensão que o usuário encontrou
> (`C:\sei\seinotas`, "SEI Notas" v4.5), com redesign completo do visual (aprovado via mockup nesta
> sessão) e ajustes de arquitetura pra seguir os padrões já estabelecidos do SEIRMG.

## Contexto

O usuário encontrou uma extensão de terceiros chamada "SEI Notas": um painel flutuante de
tarefas/checklist que aparece em qualquer página do SEI, com ícone de atalho, tarefas com
título/processo/vencimento/prioridade, histórico de concluídas, exportar/importar via arquivo, e
notificação de tarefas vencidas. O visual é datado (emoji, cores soltas, CSS simples) — o pedido é
portar a funcionalidade pro SEIRMG com um visual redesenhado seguindo o padrão já estabelecido da
extensão (aprovado via mockup: ver seção "Design visual" abaixo).

## Investigação (código-fonte de `C:\sei\seinotas`, lido nesta sessão)

- `manifest.json`: MV3, `content_scripts` casando `https://*/sei/*`, `https://*/sip/*`,
  `https://*.edu.br/sei/*`, `https://*.gov.br/sei/*`, `https://*.edu.br/sip/*`,
  `https://sei.go.gov.br/*` — roda em **qualquer** página do sistema, sem filtro por `acao`.
  Permissões: `storage`, `notifications`.
- `content.js`: cria um botão flutuante (ícone) que abre/fecha um painel arrastável. Tarefas têm
  `titulo`, `setor` (texto livre, processo SEI), `vencimento` (data), `prioridade`
  (`baixa`/`media`/`alta`), `concluido` (bool). CRUD completo inline (textarea de título, input de
  processo, input de data, select de prioridade, botões concluir/excluir). Popup separado lista as
  concluídas (reabrir/excluir permanente). Popup de ajuda com guia completo. Exporta seleção pra
  arquivo `.seinotas` (JSON com metadados: id de exportação, data, userAgent); importa marcando as
  tarefas importadas como `bloqueada` (título/processo/data não editáveis, só
  prioridade/concluir/excluir).
- **Achado importante sobre a chave de armazenamento**: o código computa
  `"sei_taskpad_" + window.location.pathname`, dando a entender que seria por processo/página — mas
  no SEI o `pathname` é sempre o mesmo (`/sei/controlador.php`, o que muda é a query string). Ou
  seja, na prática **já é um board único e global** por instância do SEI, não por processo (o
  próprio texto de ajuda do plugin confirma: "todas as anotações ficam visíveis em qualquer página
  do sistema"). O SEIRMG não precisa reproduzir esse cálculo de chave — pode usar uma chave fixa
  única.
- **Achado sobre notificação**: `verificarTarefasVencidas()` só dispara `chrome.runtime.sendMessage`
  (que aciona `chrome.notifications.create` no background) se `Notification.permission ===
  "granted"` — essa é a API de **notificação web**, que exige um prompt de permissão do navegador
  separado da permissão de extensão `notifications` já concedida via manifest. Isso mistura duas
  APIs diferentes e pode bloquear silenciosamente a notificação até o usuário conceder uma
  permissão de navegador que nem é necessária pra `chrome.notifications` funcionar. O SEIRMG já usa
  `chrome.notifications.create` em outros pontos (bloco de assinatura) sem esse checagem — não vamos
  reproduzir esse comportamento.
- `background.js`: só escuta uma mensagem (`TAREFA_VENCIDA`) e chama `chrome.notifications.create`.

## Decisões validadas com o usuário (2026-07-17)

- **Escopo de páginas**: painel global, aparece em qualquer tela do SEI — igual ao original, sem
  restringir a telas específicas.
- **Opt-in, controlado nas Opções**: a feature **não fica ativa o tempo todo** — vira uma opção nova
  na aba **Geral** das Opções (`SyncConfig.tarefas.ativo`), **desligada por padrão**. Só quando
  ligada é que o content script monta o painel.
- **Escopo funcional**: portar tudo (tarefas com prioridade/vencimento/processo, histórico de
  concluídas, notificação de vencidas, exportar/importar) — nada cortado.
- **Sem compatibilidade com o formato antigo**: usuário vai começar do zero no SEIRMG, então o
  formato de exportação/importação é próprio do SEIRMG, não precisa ler `.seinotas` do plugin
  original.
- **Armazenamento**: `chrome.storage.sync`, **uma chave fixa única** (não mais o cálculo por
  `pathname`, que na prática sempre dava o mesmo valor mesmo).
- **Notificação de vencidas**: reaproveita o mecanismo `chrome.notifications` que o SEIRMG já usa
  (sem checagem de `Notification.permission`, sem permissão nova no manifest — `notifications` já
  está declarada).

## Design visual (aprovado via mockup nesta sessão)

Layout escolhido: **agrupado por urgência** (Atrasadas / Hoje / Sem prazo — cada grupo com um rótulo
compacto colorido + ícone), em vez de lista plana. Cada tarefa é uma linha (não um card cheio):
ponto colorido de prioridade + título (uma linha, truncado) + data à direita; ao passar o mouse, a
data vira dois ícones de ação rápida (concluir/excluir) em vez de ficar sempre visível. Logo abaixo
dos grupos de pendentes, uma linha divisória fina e depois **as até 3 tarefas mais recentemente
concluídas** (ordenadas por `concluidoEm` desc), esmaecidas e riscadas — não o histórico inteiro,
só um lembrete rápido do que acabou de ser marcado, pra desfazer sem abrir o popup. O histórico
completo de concluídas continua no popup separado (mesmo botão "✔️"/histórico do original).

Botão de atalho: circular, azul (`--seirmg-accent-color`), ícone `list-checks` do lucide, com um
badge vermelho de contagem quando há tarefa(s) atrasada(s) (visível antes mesmo de abrir o painel).

Barra de ações no rodapé do painel: botão "+" (nova tarefa) vira um círculo azul preenchido,
"flutuando" acima da linha da barra (destaque visual pra ação mais usada); os outros botões
(histórico de concluídas, exportar, importar, ajuda) ficam como ícones neutros/discretos ao redor,
sem separadores verticais.

Header do painel: ícone de "mover" (grip) + título "Tarefas" + badge com contagem de pendentes
(estilo pill azul clara, não só texto solto).

Segue o motor de tema já existente do SEIRMG (claro/`seirmg-theme-black`/custom) — confirmado
visualmente nos dois temas durante o mockup, sem necessidade de CSS condicional novo além do que já
existe pro tema escuro (fundo escuro, texto claro, mesma estrutura).

Mockups ficam salvos em `.superpowers/brainstorm/1297-1784304951/content/` (git-ignorado, só
referência de sessão — o design final está descrito em texto acima e será formalizado em código no
plano de implementação).

## Arquitetura

### `lib/storage.ts` (novo tipo de config + novo storage)

```ts
export interface TarefasConfig {
  ativo: boolean
}
```

Adicionado a `SyncConfig` (`tarefas: TarefasConfig`) e a `DEFAULT_SYNC_CONFIG`
(`tarefas: { ativo: false }`).

Novo storage dedicado (chave fixa única, não é o `LocalConfig`/`SyncConfig` de configuração — são os
dados de verdade das tarefas, potencialmente maiores e mais voláteis):

```ts
export interface Tarefa {
  id: string // crypto.randomUUID()
  titulo: string
  processo: string
  vencimento: string // ISO date (yyyy-mm-dd) ou ''
  prioridade: 'baixa' | 'media' | 'alta'
  concluido: boolean
  concluidoEm?: string // ISO datetime, usado só pra ordenar/esmaecer no fim da lista
  bloqueada?: boolean // true em tarefas importadas -- título/processo/vencimento somente-leitura
}
```

`createTarefasStore()` seguindo o mesmo padrão de `createLocalConfigStore`/`createSyncConfigStore`
(uma chave fixa, ex. `'tarefas'`, em `chrome.storage.sync`). **Limite conhecido**: `chrome.storage.sync`
tem 8KB por item — documentar como comentário no código (não é um problema de uso normal, mas vale
saber se o usuário acumular muitas dezenas de tarefas com títulos longos).

### `features/tarefas/` (lógica pura, testada)

```ts
export type GrupoUrgencia = 'atrasadas' | 'hoje' | 'semPrazo' | 'proximas'

export function agruparPorUrgencia(tarefas: Tarefa[], hoje: Date): Record<GrupoUrgencia, Tarefa[]>
export function contarAtrasadas(tarefas: Tarefa[], hoje: Date): number
export function ordenarDentroDoGrupo(tarefas: Tarefa[]): Tarefa[] // por prioridade desc, depois vencimento asc
```

- `agruparPorUrgencia`: ignora tarefas `concluido: true` (essas vão pro final da lista renderizada
  separadamente, não entram em nenhum grupo de urgência). Classifica por comparação de data (mesma
  lógica de normalização de horário que `features/controle-processos/prazos.ts` já usa, reaproveitar
  o padrão). Tarefa sem `vencimento` cai em `semPrazo`.
- `contarAtrasadas`: usado tanto pro badge do botão flutuante quanto pro header do painel.

### `content-scripts/tarefas/index.ts` (wiring)

Novo content script, mesmo `matches` broto já usado por `core`/`ponto_controle`:

```ts
matches: [
  '*://*.br/*controlador.php?acao=*',
  '*://*.org/*controlador.php?acao=*',
],
js: ['src/content-scripts/tarefas/index.ts'],
run_at: 'document_idle',
```

No `bootstrap()`: lê `SyncConfig.tarefas.ativo` primeiro — se `false`, retorna sem montar nada
(feature opt-in). Se `true`: monta o botão flutuante + painel + popups (concluídas, ajuda), carrega
tarefas do storage, aplica `agruparPorUrgencia` pra renderizar, liga drag do painel (mesmo padrão
mousedown/mousemove/mouseup do original), liga handlers de CRUD (criar/editar/concluir/excluir),
exportar/importar (Blob + `<a download>`, mesmo padrão do original), e dispara a checagem de vencidas
pra notificação.

**Formato de exportação** (arquivo `.json` baixável, seleção de tarefas via checkbox como no
original):

```ts
interface ExportacaoTarefas {
  versaoSeirmg: string // pkg.json version no momento da exportação
  exportadoEm: string // ISO datetime
  tarefas: Array<Pick<Tarefa, 'titulo' | 'processo' | 'vencimento' | 'prioridade' | 'concluido'>>
}
```

Ao importar: tarefas importadas recebem um novo `id` (`crypto.randomUUID()`) e são adicionadas à
lista existente (append). Mantendo o comportamento do original (escopo confirmado como "portar
tudo"): tarefas importadas ganham `Tarefa.bloqueada: true` (novo campo opcional em `Tarefa`) — os
campos `titulo`/`processo`/`vencimento` ficam somente-leitura na UI (mesmo caso de uso original:
compartilhar tarefas entre dois usuários do SEIRMG sem que o destinatário altere os dados de
origem por engano); `prioridade`/`concluido`/exclusão continuam editáveis normalmente. Um selo
visual ("Importada") marca essas tarefas, reaproveitando o mesmo estilo de badge do resto do
painel (não o `⭐` do original).

### `background/` (notificação)

Novo `notificarTarefaVencida(tarefa: { id: string; titulo: string })` em
`background/notifications/notify.ts`, mesmo padrão de `notificarBlocoDisponibilizado` — usa
`chrome.notifications.create` direto, sem checar `Notification.permission`. Novo listener de
mensagem em `background/index.ts` pro tipo `seirmg:tarefa-vencida`. Notifica no máximo 1x por dia
por tarefa (mesmo controle de "já notificado hoje" que o original tinha, guardado junto do resto do
storage de tarefas ou numa entrada separada do `LocalConfig`).

### `options/` (toggle na aba Geral)

Novo checkbox "Ativar Painel de Tarefas" em `painel-geral` (`index.html` + `main.ts`, mesmo padrão
dos outros toggles da aba Geral) — grava `SyncConfig.tarefas.ativo`.

## Fora de escopo

- Compatibilidade com o formato `.seinotas` do plugin original (usuário vai começar do zero).
- Sincronizar/mesclar tarefas entre múltiplas instâncias/hosts de SEI diferentes (cada instância já
  tem seu próprio `chrome.storage.sync` isolado por extensão, não por instância SEI — irrelevante
  aqui, é global pra extensão).
- Qualquer associação automática entre uma tarefa e um processo real do SEI (ex. auto-preencher o
  campo "processo" a partir da tela atual) — o campo continua texto livre, como no original.

## Riscos / verificação pendente

⚠️ Feature nova, opt-in, sem tela SEI nativa envolvida diretamente (não lê/escreve nada do SEI, só
convive na página) — risco de deslogamento é baixo (nenhuma chamada de rede pro SEI, só
`chrome.storage`/`chrome.notifications`). Ainda assim, **pendente de validação manual**: confirmar
que o painel não conflita visualmente com nenhum elemento nativo do SEI em telas variadas, e que o
badge/notificação de atrasadas funciona corretamente ao longo de vários dias.

## Testes

`features/tarefas/*.test.ts`: `agruparPorUrgencia` (atrasada/hoje/sem prazo/próxima, ignora
concluídas), `contarAtrasadas`, `ordenarDentroDoGrupo` (prioridade desc, vencimento asc como
critério de desempate). Wiring em `content-scripts/tarefas/index.ts` sem teste automatizado, mesmo
padrão já estabelecido no projeto pra essa classe de arquivo.
