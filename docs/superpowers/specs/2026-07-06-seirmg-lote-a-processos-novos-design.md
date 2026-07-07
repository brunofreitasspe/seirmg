# SEIRMG — Lote A: Notificação de Processos Novos + Popup (Design)

> Spec resultante do processo de brainstorming feito em 2026-07-06. Primeiro lote de migração das ~30 funcionalidades restantes do Sei++ (ver `ANALISE.md`, decomposição em "Lotes A-H" discutida na mesma sessão). Porta `background/notifyProcessos.js` e `background/api.js` do Sei++ (`C:\sei\seiplus`), adaptando o mecanismo de deduplicação/notificação para o padrão mais rico já estabelecido no SEIRMG pela feature de bloco de assinatura.

## Contexto

O Sei++ original notifica sobre processos novos assim: a cada 5 minutos, um alarme conta quantos processos estão marcados como "não visualizados" na tela **Controle de Processos** (`controlador.php?acao=procedimento_controlar`, tabela `#tblProcessosDetalhado`, coluna do número do processo tem a classe CSS nativa `processoVisualizado` quando já visto); se essa contagem for > 0 e o badge do ícone da extensão estiver vazio, dispara UMA notificação genérica ("Novo processo") e marca o badge como não-vazio; abrir o popup limpa o badge, liberando a próxima notificação. Em caso de erro inesperado, desativa a feature inteira automaticamente.

Essa entrega porta essa funcionalidade para o SEIRMG, mas com três adaptações já validadas com o usuário (não são fidelidade ao original):

1. **Notificação por processo, com dedup rico** — cada processo novo gera sua própria notificação (com o número do processo), e cada processo só é notificado **uma vez, para sempre** (dedup permanente por ID) — não o mecanismo genérico "notifica se badge vazio" do original.
2. **Erro não desativa a feature** — segue o padrão já estabelecido no SEIRMG (loga e tenta de novo no próximo ciclo do alarme), sem a lógica de auto-desativação do original.
3. **Badge do ícone é um contador "desde a última vez que você olhou"**, não um booleano — soma a cada novo processo notificado, zera ao abrir o popup.

## Decisões validadas com o usuário (2026-07-06)

- Badges continuam **separados**: bloco de assinatura usa o badge NA PÁGINA (ao lado do logo do SEI, já existente); processos novos usa o badge do ÍCONE da extensão (`chrome.action.setBadgeText`) — são conceitos diferentes (bloco pendente vs. processo ainda não visto), não devem ser somados num só indicador.
- Configuração (ativar/desativar + intervalo de verificação) fica na aba de Opções hoje chamada "Bloco de Assinatura e Notificações", **renomeada para "Notificações"**, com uma segunda seção dentro dela ("Processos Novos") ao lado da seção existente ("Bloco de Assinatura").
- Sem a distinção "não autenticado vs. erro genérico" do original — todo erro de checagem simplesmente loga e tenta de novo no próximo ciclo.
- Manifest: **nenhuma mudança**. `host_permissions` já cobre `*://*.br/*controlador.php?acao=*` e o equivalente `.org` de forma ampla (inclui `acao=procedimento_controlar`); `permissions` já tem `storage`/`notifications`/`alarms`/`tabs`. Esta feature não tem tela dedicada nem observador em tempo real (o Sei++ original também não tem — `notifyProcessos.js` é 100% background), então nenhum content script novo é necessário.

## Arquitetura

Espelha de perto a estrutura já usada pelo bloco de assinatura, com uma diferença deliberada explicada abaixo (seção "Fetch com retentativa").

### Lógica pura testável (`src/features/processos-novos/`)

- `types.ts` — `interface ProcessoItem { id: string; numero: string; visualizado: boolean }`. Deliberadamente mínimo: o Sei++ original extrai um JSON bem mais rico (`atribuido`, `tipoProcesso`, `interessados`, `anotacao`, `marcador`, `especificacao` — ver `C:\sei\seiplus\background\api.js`'s `listarProcessos()`), mas nenhum desses campos é usado pelo fluxo de notificação real (só `processoVisualizado` é lido em `notifyProcessos()`) — portar os campos extras seria YAGNI puro aqui. `id` é o `id` nativo do `<tr>` (já estável no DOM do SEI, sem precisar de fallback como o bloco de assinatura precisou).
- `parser.ts` — `parseProcessosControlarTable(root: ParentNode): ProcessoItem[]`. Lê `#tblProcessosDetalhado > tbody > tr[id]`; para cada linha, `id = tr.id`, `numero` e `visualizado` extraídos da 3ª célula (`td:nth-child(3) > a`, texto e `classList.contains('processoVisualizado')` respectivamente) — mesmos seletores do Sei++ original. Sem branch de versão do SEI (o original tampouco tem).
- `diffNaoVisualizados.ts` — mesma forma de `diffPendentes` do bloco de assinatura: `export function ehNaoVisualizado(item: ProcessoItem): boolean` (`!item.visualizado`) e `export function diffNaoVisualizados(itens: ProcessoItem[], jaNotificados: NotificadoState, agoraIso: string): { novos: ProcessoItem[]; estadoAtualizado: NotificadoState }`. Dedup permanente — nunca re-notifica o mesmo processo (diferente do bloco de assinatura, que agora repete lembretes; essa diferença de comportamento entre as duas features é intencional e já validada).

### Fetch com retentativa (`src/background/processosNovos/fetchListaProcessos.ts`)

O Sei++ original (`api.js`'s `fetchListaDetalhada`) tem uma peculiaridade: a tela de Controle de Processos às vezes responde com um formulário intermediário de redirecionamento em vez da tabela real (campo oculto `hdnTipoVisualizacao` não é `'D'`) — nesse caso, refaz a requisição **uma vez** com a URL corrigida do `action` do formulário; se ainda não vier certo, é erro (nunca uma segunda retentativa, evita loop).

Diferença deliberada do padrão do bloco de assinatura: lá, a função injetada em `verificarBlocoAssinatura` devolve `Result<string>` (HTML crú) e o parse pra `Document` acontece dentro do módulo de checagem. Aqui, como a própria lógica de retentativa **precisa** inspecionar o DOM (ler `#hdnTipoVisualizacao` e o `action` do formulário) para decidir se retenta, faz mais sentido essa função já devolver `Result<Document>` — evita fazer o parse pra DOM duas vezes (uma pra decidir se retenta, outra pra extrair as linhas), o que o padrão do bloco de assinatura teria obrigado. Isso também é mais fiel à estrutura do Sei++ original, que já retorna um `Document` de `fetchListaDetalhada` reaproveitado por `listarProcessos`.

```ts
export interface FetchListaProcessosDeps {
  fetchText?: typeof fetchText
}

export async function fetchListaProcessos(
  baseUrlSei: string,
  deps: FetchListaProcessosDeps = {}
): Promise<Result<Document>> {
  const fetchTextFn = deps.fetchText ?? fetchText
  const url = `${baseUrlSei}/controlador.php?acao=procedimento_controlar`
  const corpo = new URLSearchParams()
  corpo.append('hdnTipoVisualizacao', 'D')

  const primeiraTentativa = await fetchTextFn(url, { method: 'POST', body: corpo })
  if (!primeiraTentativa.ok) return primeiraTentativa

  const doc = new DOMParser().parseFromString(primeiraTentativa.data, 'text/html')
  const form = doc.querySelector('#frmProcedimentoControlar')
  const tipoVisualizacao = form?.querySelector<HTMLInputElement>('#hdnTipoVisualizacao')?.value

  if (tipoVisualizacao === 'D') return { ok: true, data: doc }

  const acaoRedirecionamento = form?.getAttribute('action')
  if (!acaoRedirecionamento) {
    return { ok: false, error: 'Formulário de redirecionamento sem action' }
  }

  const segundaTentativa = await fetchTextFn(`${baseUrlSei}${acaoRedirecionamento}`, {
    method: 'POST',
    body: corpo,
  })
  if (!segundaTentativa.ok) return segundaTentativa

  return { ok: true, data: new DOMParser().parseFromString(segundaTentativa.data, 'text/html') }
}
```

(A injeção de dependência segue `deps: X = {}` + `??` dentro do corpo — o mesmo padrão usado em `blocoAssinaturaPipeline.ts`/`blocoAssinaturaCheck.ts`, não o `= { fetchText }` no próprio parâmetro default.)

### Background (`src/background/`)

- `alarms/processosNovosCheck.ts` — espelha `blocoAssinaturaCheck.ts`:
  ```ts
  export const ALARM_NAME_PROCESSOS_NOVOS = 'seirmg-check-processos-novos'

  export interface ProcessosNovosCheckDeps {
    fetchProcessosDocument: () => Promise<Result<Document>>
    processarItens?: (itens: ProcessoItem[]) => Promise<void>
  }

  export async function verificarProcessosNovos(deps: ProcessosNovosCheckDeps): Promise<void> {
    const processarItens = deps.processarItens ?? processarItensProcessosNovos
    const resultado = await deps.fetchProcessosDocument()
    if (!resultado.ok) return

    try {
      const itens = parseProcessosControlarTable(resultado.data)
      await processarItens(itens)
    } catch (error) {
      console.error('[SEIRMG] Falha ao processar itens de processos novos:', error)
    }
  }
  ```
- `processosNovosPipeline.ts` — espelha `blocoAssinaturaPipeline.ts`, mas **sem** a opção `sempreNotificarPendentes` (não se aplica aqui — decisão já validada: nunca repetir notificação de um processo já informado):
  ```ts
  export interface ProcessosNovosPipelineDeps {
    syncStore?: SyncStore
    localStore?: LocalStore
    notificar?: typeof notificarNovoProcesso
    agoraIso?: string
  }

  export async function processarItensProcessosNovos(
    itens: ProcessoItem[],
    deps: ProcessosNovosPipelineDeps = {}
  ): Promise<void> {
    const syncStore = deps.syncStore ?? createSyncConfigStore()
    const localStore = deps.localStore ?? createLocalConfigStore()
    const notificar = deps.notificar ?? notificarNovoProcesso
    const agoraIso = deps.agoraIso ?? new Date().toISOString()

    const config = await syncStore.get()
    if (!config.processosNovos.ativo) return

    const localConfig = await localStore.get()
    const { novos, estadoAtualizado } = diffNaoVisualizados(
      itens,
      localConfig.processosNovosNotificado,
      agoraIso
    )

    novos.forEach((item) => notificar(item, config.processosNovos.tocarSom))

    await localStore.set({
      ...localConfig,
      processosNovosNotificado: estadoAtualizado,
      processosNovosBadgeCount: localConfig.processosNovosBadgeCount + novos.length,
    })
  }
  ```
- `notifications/notify.ts` — ganha `notificarNovoProcesso` como função irmã de `notificarNovoBloco` (sem refatorar a existente, mesma decisão já aplicada no bloco de assinatura):
  ```ts
  export function notificarNovoProcesso(item: ProcessoItem, tocarSom: boolean): void {
    chrome.notifications.create(`seirmg-processo-novo-${item.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
      title: 'SEIRMG — Processo novo',
      message: `Processo ${item.numero} está com pendência de visualização.`,
      priority: 2,
      silent: !tocarSom,
    })
  }
  ```
- `background/index.ts` — adiciona, seguindo os padrões já estabelecidos (listener separado por preocupação, guard `.catch()`/try-catch em todo código assíncrono novo):
  - `agendarAlarmeProcessosNovos()` (mirror de `agendarAlarme`), chamada junto no mesmo `onInstalled`.
  - `verificarProcessosNovosViaFetch()` (mirror de `verificarBlocoAssinaturaViaFetch`), usando `fetchListaProcessos(baseUrlSei)` como a dependência injetada; ao final, lê o `localConfig` atualizado e sincroniza o badge do ícone via uma pequena função `atualizarBadgeIcone(count: number)` (`chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })`).
  - Um segundo `chrome.alarms.onAlarm.addListener`, dedicado só a `ALARM_NAME_PROCESSOS_NOVOS`, guardado com `.catch()` — não reaproveita o listener existente do bloco de assinatura (mesmo padrão de "um listener por preocupação" já usado para `seirmg:sei-detectado`).

### Popup (`src/popup/`)

- `index.html` ganha uma segunda seção (status + contagem + botão "Abrir Controle de Processos"), ao lado da seção existente do bloco de assinatura.
- `main.ts`: no `render()`, lê `localConfig.processosNovosBadgeCount` pra exibir a contagem; se `> 0`, zera esse contador (`localStore.set`) e limpa o badge do ícone (`chrome.action.setBadgeText({ text: '' })`) diretamente — sem round-trip pelo background, já que o popup tem acesso direto à API `chrome.action`. O botão "Abrir Controle de Processos" navega para `${baseUrlSei}/controlador.php?acao=procedimento_controlar` (a tela específica, não a raiz do SEI) e usa o **mesmo padrão de reaproveitar aba existente** já estabelecido para o botão do bloco de assinatura (verifica `chrome.tabs.query` antes de criar uma aba nova) — consistência deliberada, não é escopo novo.

### Options UI (`src/options/`)

- A aba hoje rotulada "Bloco de Assinatura e Notificações" (`data-aba="assinatura"`, `painel-assinatura`) é renomeada para **"Notificações"**. Diferente do rótulo visível, os identificadores internos (`data-aba`, id do painel) também são renomeados para `notificacoes`/`painel-notificacoes` — evita um id interno "assinatura" que não reflete mais o conteúdo real do painel (que passa a ter duas seções). Isso não afeta `tabs.ts` (a lógica de troca de aba é genérica, já testada, não precisa mudar).
- Dentro do painel, uma nova seção "Processos Novos" (ativo/intervalo em minutos, padrão 5/som), no mesmo estilo visual da seção existente "Bloco de Assinatura".

## Modelo de dados (extensão do schema em `lib/storage.ts`)

```ts
export interface ProcessosNovosConfig {
  ativo: boolean
  intervaloMinutos: number
  tocarSom: boolean
}

export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  processosNovos: ProcessosNovosConfig       // NOVO
}

export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  ultimaVerificacaoImediata?: string
  processosNovosNotificado: NotificadoState   // NOVO — dedup permanente
  processosNovosBadgeCount: number            // NOVO — contador "desde o último popup", soma a cada novo
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
}
```

`DEFAULT_SYNC_CONFIG.processosNovos = { ativo: true, intervaloMinutos: 5, tocarSom: true }` (5 min = mesmo padrão do Sei++ original). `DEFAULT_LOCAL_CONFIG.processosNovosNotificado = {}`, `processosNovosBadgeCount = 0`.

**Decisão deliberada**: não adicionamos um flag correspondente em `SyncConfig.featureFlags` (ex.: `processosNovosNotificacoes`). O backlog de hardening da sessão anterior já identificou que `featureFlags.blocoAssinaturaNotificacoes` existe mas nunca é lido — o gate real é sempre `blocoAssinatura.ativo`. Não vamos replicar esse padrão morto para a feature nova; `processosNovos.ativo` já é o único gate necessário.

## Tratamento de erros

Sem exceção não tratada cruzando fronteira de mensageria/callback de plataforma, mesmo padrão já estabelecido:
- `fetchListaProcessos` nunca lança — usa `fetchText` (que já nunca lança) e retorna `Result<Document>`; o único caminho de erro síncrono (`form`/`action` ausentes) também retorna `{ ok: false, ... }`, não lança.
- `verificarProcessosNovos` sai em silêncio se o fetch falhar; guarda o parse+delegate com try/catch, loga e segue.
- `verificarProcessosNovosViaFetch` (chamada só pelo `chrome.alarms.onAlarm` listener) é guardada com `.catch()` no listener, mesmo padrão do bloco de assinatura.
- Sem a distinção "não autenticado" do original — todo erro (rede, autenticação expirada, parse) cai no mesmo caminho de log-e-segue.

## Testes

- **Testável (Vitest, sem DOM real do SEI)**: `parser.ts` (fixtures de tabela HTML via jsdom, casos: visualizado/não visualizado, múltiplas linhas, tabela vazia), `diffNaoVisualizados.ts` (mesmos casos de `diffPendentes`: novo, já notificado, preserva estado não relacionado), `fetchListaProcessos.ts` (DI no `fetchText`: sucesso direto, sucesso após 1 retentativa, falha na retentativa, falha no fetch inicial), `processosNovosPipeline.ts` (mesmos 3 casos base de `blocoAssinaturaPipeline.ts`: notifica+persiste, desativado, já notificado — mais o incremento correto de `processosNovosBadgeCount`), `processosNovosCheck.ts` (fetch falha → silencioso; sucesso → parse e delega; `processarItens` rejeita → não propaga).
- **Não testável (wiring)**: `background/index.ts` (segundo alarme, sincronização do badge do ícone), `popup/main.ts`, `options/index.html`/`main.ts` — mesmo padrão já estabelecido no restante do projeto (chrome.* não é mockável de forma útil).

## Manifest

Nenhuma mudança. `permissions` já inclui `storage`/`notifications`/`alarms`/`tabs`; `host_permissions` já cobre `acao=procedimento_controlar` via o padrão amplo existente (`*controlador.php?acao=*`). Sem content script novo (feature 100% background+popup+opções, mesma característica do Sei++ original).

## Fora de escopo deste lote

- Qualquer outro campo do JSON rico que `listarProcessos()` extraía no Sei++ original (`atribuido`, `tipoProcesso`, `interessados`, `anotacao`, `marcador`, `especificacao`) — não usados pelo fluxo de notificação, não portados.
- Os demais Lotes B-H da migração do Sei++ (ver decomposição em `ANALISE.md`/conversa de 2026-07-06) — cada um terá seu próprio ciclo spec→plano→implementação.
