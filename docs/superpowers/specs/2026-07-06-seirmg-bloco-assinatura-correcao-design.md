# SEIRMG — Correção do Bloco de Assinatura: checagem imediata + notificação recorrente + badge correto

> Spec resultante do processo de brainstorming feito em 2026-07-06, depois que o usuário testou a extensão de ponta a ponta e reportou dois problemas reais de uso na feature de bloco de assinatura (já entregue no plano `2026-07-06-seirmg-scaffold-e-notificacao-assinatura.md`). Corrige comportamento já implementado — não porta nenhuma funcionalidade nova do Sei++.

## Contexto

A feature de notificação de bloco de assinatura (Tasks 7-14 do primeiro plano de implementação) tem hoje três limitações, encontradas em uso real:

1. **Sem checagem imediata.** `chrome.alarms.create(ALARM_NAME, { periodInMinutes })` (em `background/index.ts`'s `agendarAlarme()`) só agenda o primeiro disparo `intervaloMinutos` no futuro (padrão 15 min) — nunca dispara uma checagem logo ao instalar a extensão ou ao acessar o SEI depois de um período sem uso.
2. **Notificação de uma vez só.** `diffPendentes` (`features/bloco-assinatura/diffPendentes.ts`) marca um item como notificado permanentemente em `LocalConfig.blocoAssinaturaNotificado` — um bloco que continua pendente por dias só gera uma notificação, na primeira vez em que é visto.
3. **Badge/popup nunca diminuem.** `badge.ts` e `popup/main.ts` contam `Object.keys(localConfig.blocoAssinaturaNotificado).length` — esse mapa só cresce (é o dedup "já notificado alguma vez"), então o número exibido é "quantos blocos já foram notificados desde sempre", não "quantos estão pendentes agora". Já documentado como limitação conhecida no comentário de `badge.ts:10` e no backlog de hardening da sessão anterior.

Essas três limitações têm uma causa raiz comum: o pipeline usa **um único conceito de "já visto"** (`blocoAssinaturaNotificado`) para três finalidades diferentes que precisam de regras distintas — decidir se notifica, decidir a frequência da notificação, e decidir o que contar no badge. Este design separa essas três finalidades.

## Decisões validadas com o usuário (2026-07-06)

- Notificação deve se repetir **a cada ciclo do alarme em segundo plano** enquanto o bloco continuar pendente — não mais "uma vez e nunca mais".
- A visita real à tela do bloco (`MutationObserver`) **não** deve repetir notificação a cada disparo — só na primeira vez que um item aparece como pendente naquela sessão (evita notificar várias vezes em segundos ao ordenar/paginar a tabela).
- Deve existir uma checagem **imediata** ao detectar uma sessão do SEI (não esperar o intervalo completo do alarme), mas limitada a **no mínimo 2 minutos entre checagens imediatas**, para não disparar a cada clique dentro do SEI. O alarme periódico continua rodando por trás como reforço, cobrindo o caso do SEI estar fechado.
- Badge/popup devem refletir "pendente agora" (recalculado a cada checagem), não "notificado alguma vez".

## Arquitetura da correção

### Dois caminhos de notificação, duas regras diferentes

O pipeline (`background/blocoAssinaturaPipeline.ts`) já é chamado de dois lugares distintos:

- **Caminho de mensagem** (`background/index.ts`'s `chrome.runtime.onMessage` listener, disparado pelo content script `rel_bloco_protocolo_listar/index.ts` a cada parse da tabela, incluindo cada gatilho do `MutationObserver`): deve manter o comportamento atual — notifica só a primeira vez que um item aparece pendente.
- **Caminho de alarme/checagem imediata** (`background/alarms/blocoAssinaturaCheck.ts`'s `verificarBlocoAssinatura`, disparado pelo `chrome.alarms.onAlarm` e pelo novo gatilho de "SEI detectado"): deve notificar **todos** os itens atualmente pendentes, mesmo que já tenham sido notificados antes.

`processarItensBlocoAssinatura` ganha uma opção nova para diferenciar os dois:

```ts
export interface BlocoAssinaturaPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoBloco
  agoraIso?: string
  sempreNotificarPendentes?: boolean   // NOVO — default false
}
```

Quando `sempreNotificarPendentes: true`, a função notifica **todos** os itens pendentes retornados pelo parser (ignora o filtro de "já notificado" do `diffPendentes` para decidir quem notificar), mas ainda usa `diffPendentes` normalmente para decidir o que persistir em `blocoAssinaturaNotificado` (esse mapa continua existindo, só para o caminho de mensagem usar). `verificarBlocoAssinatura` (chamado pelo alarme) passa `sempreNotificarPendentes: true`; o listener de mensagem em `background/index.ts` não passa nada (usa o default `false`).

**Correção de fluxo importante (encontrada na autorrevisão desta spec):** o pipeline atual tem um `if (novos.length === 0) return` que sai antes de persistir qualquer coisa — isso está errado para o novo requisito, por dois motivos: (1) num ciclo de alarme (`sempreNotificarPendentes: true`), pode não haver nenhum item "novo" (todos já foram vistos antes) mas ainda existirem itens pendentes que precisam ser re-notificados; o early-return atual pularia a notificação inteira nesse caso; (2) `blocoAssinaturaPendenteAtual` (ver próxima seção) precisa ser atualizado a cada execução, mesmo quando não há nada para notificar (ex: um bloco foi assinado e não está mais pendente — isso também é uma mudança que precisa refletir no badge). A nova versão remove esse early-return: sempre computa a lista de pendentes atuais, sempre persiste, e só decide condicionalmente **quem notificar**:

```ts
export async function processarItensBlocoAssinatura(
  itens: BlocoAssinaturaItem[],
  deps: BlocoAssinaturaPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoBloco
  const agoraIso = deps.agoraIso ?? new Date().toISOString()
  const sempreNotificarPendentes = deps.sempreNotificarPendentes ?? false

  const config = await syncStore.get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await localStore.get()
  const pendentesAgora = itens.filter(ehPendente)
  const { novos, estadoAtualizado } = diffPendentes(
    itens,
    localConfig.blocoAssinaturaNotificado,
    agoraIso
  )

  const quemNotificar = sempreNotificarPendentes ? pendentesAgora : novos
  quemNotificar.forEach((item) => notificar(item, config.blocoAssinatura.tocarSom))

  await localStore.set({
    ...localConfig,
    blocoAssinaturaNotificado: estadoAtualizado,
    blocoAssinaturaPendenteAtual: pendentesAgora.map((item) => item.id),
  })
}
```

`ehPendente` é um pequeno helper novo, **exportado por `diffPendentes.ts`** (extrai o predicado `item.estado === 'disponibilizado_para_area' || item.estado === 'aberto'` que já existe ali dentro, reaproveitado pelo pipeline em vez de duplicar a lista de estados). A função `diffPendentes` em si não muda de assinatura nem de comportamento — só passa a delegar seu filtro interno pra esse helper.

Efeito colateral aceitável: `localStore.set` agora roda em toda chamada do pipeline (antes só rodava quando havia itens novos) — é uma escrita local extra, sem custo relevante (`chrome.storage.local` não tem os limites de taxa que `chrome.storage.sync` tem).

### Checagem imediata ao acessar o SEI

Novo tipo de mensagem, análogo ao já existente `seirmg:bloco-assinatura:itens`:

```ts
interface MensagemSeiDetectado {
  type: 'seirmg:sei-detectado'
}
```

`content-scripts/core/index.ts`'s `bootstrap()` envia essa mensagem (`chrome.runtime.sendMessage`) a cada execução — ela já roda em toda página do SEI que casa com o content script `core` (praticamente todo acesso autenticado).

`background/index.ts` recebe a mensagem num novo listener. Compara `LocalConfig.ultimaVerificacaoImediata` (novo campo, timestamp ISO, opcional) com o momento atual; se a diferença for menor que 2 minutos, ignora (não faz nada). Caso contrário, atualiza o timestamp e chama `verificarBlocoAssinaturaViaFetch()` (a mesma função que o alarme chama) imediatamente — sem esperar o próximo tick do `chrome.alarms`.

### Badge/popup: contagem "pendente agora"

Cada execução do pipeline (`processarItensBlocoAssinatura`, os dois caminhos) agora também grava a lista de IDs vistos como pendentes **nesta execução específica** — sobrescrevendo o valor anterior, não acumulando:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState        // inalterado: dedup só do caminho de mensagem
  blocoAssinaturaPendenteAtual: string[]             // NOVO — ids pendentes na última checagem, sobrescrito a cada execução
  ultimaVerificacaoImediata?: string                 // NOVO — throttle da checagem imediata
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
}
```

`badge.ts` e `popup/main.ts` passam a contar `localConfig.blocoAssinaturaPendenteAtual.length` em vez de `Object.keys(localConfig.blocoAssinaturaNotificado).length`.

**Consequência importante:** como o caminho de mensagem (visitas reais à página) roda com muito mais frequência que o alarme, `blocoAssinaturaPendenteAtual` fica atualizado quase em tempo real quando você está no SEI, e é atualizado a cada tick do alarme quando você não está. Isso é estritamente melhor que o comportamento atual (nunca atualiza pra baixo).

## Arquivos afetados

- `src/lib/storage.ts` — adicionar `blocoAssinaturaPendenteAtual: string[]` e `ultimaVerificacaoImediata?: string` a `LocalConfig` e a `DEFAULT_LOCAL_CONFIG`.
- `src/background/blocoAssinaturaPipeline.ts` — novo parâmetro `sempreNotificarPendentes`; gravar `blocoAssinaturaPendenteAtual` em toda execução (independente de haver itens novos ou não — mesmo sem novidade, a lista de pendentes atuais pode ter mudado, ex: um bloco foi assinado e saiu da lista).
- `src/background/alarms/blocoAssinaturaCheck.ts` — passar `sempreNotificarPendentes: true` ao chamar o pipeline.
- `src/background/index.ts` — novo listener de mensagem `seirmg:sei-detectado` com throttle de 2 min; `agendarAlarme`/o listener de `onMessage` existente para itens do bloco continuam como estão (não passam `sempreNotificarPendentes`).
- `src/content-scripts/core/index.ts` — `bootstrap()` envia a mensagem `seirmg:sei-detectado` (dentro do try/catch existente).
- `src/content-scripts/core/badge.ts` — trocar a fonte da contagem.
- `src/popup/main.ts` — trocar a fonte da contagem.
- `src/features/bloco-assinatura/diffPendentes.ts` — a função `diffPendentes` em si **não muda de assinatura nem de comportamento**; ganha só um pequeno helper novo exportado (`ehPendente`), usado pelo pipeline para computar a lista de pendentes atuais sem duplicar a lista de estados.

## Tratamento de erros

Sem mudança nos padrões já estabelecidos: o novo listener de mensagem em `background/index.ts` segue o mesmo padrão dos demais (guard try/catch ou `.catch()`, loga e segue, nunca lança). O throttle de 2 minutos é uma simples comparação de timestamp, sem I/O adicional que possa falhar.

## Testes

- `background/blocoAssinaturaPipeline.test.ts` — novos casos: `sempreNotificarPendentes: true` notifica um item já presente em `blocoAssinaturaNotificado`; `sempreNotificarPendentes: false` (ou omitido) mantém o comportamento atual (não notifica item já notificado); `blocoAssinaturaPendenteAtual` é gravado corretamente em ambos os modos, inclusive quando não há itens novos para notificar.
- `lib/storage.ts` — `DEFAULT_LOCAL_CONFIG` atualizado; teste existente de round-trip do `createLocalConfigStore` continua cobrindo os campos novos automaticamente (são só mais chaves no mesmo objeto).
- `background/index.ts` (novo listener) e `content-scripts/core/index.ts` (envio da mensagem) — não testados, consistente com o resto desse arquivo (wiring de `chrome.*`, não testável de forma útil aqui).

## Fora de escopo desta correção

- Nenhuma funcionalidade nova do Sei++/Sei Pro é portada aqui — isso é tratado nos "Lotes" de migração (ver `ANALISE.md` e a conversa de decomposição em 2026-07-06).
- Não é reavaliado o mecanismo de dedup do caminho de mensagem (`diffPendentes` continua notificando cada item só uma vez, permanentemente, via o mapa persistido `blocoAssinaturaNotificado` — não é "uma vez por sessão", é "uma vez para sempre" nesse caminho; comportamento já validado com o usuário, que evita tanto o spam ao navegar quanto notificações repetidas em visitas futuras à mesma página).
- Não há mudança na frequência mínima de 2 minutos por configuração do usuário — é um valor fixo no código, não exposto na UI de Opções.
