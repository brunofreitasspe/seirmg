# SEIRMG — Checagem do Bloco de Assinatura via Aba Oculta

> Spec resultante de brainstorming em 2026-07-09, na sequência direta do session gate (`2026-07-09-seirmg-session-gate-design.md`). Depois do session gate no ar, o usuário continuou reproduzindo deslogamento em uso real (SEI Campinas) e, por eliminação sistemática de hipóteses (delay fixo, debounce, remoção da checagem imediata, `referrer` explícito no fetch — nenhuma resolveu, incluindo um teste isolado com o SEI parado, sem nenhum clique, onde só o alarme periódico rodando sozinho já bastou pra derrubar a sessão), chegamos à conclusão de que a causa não é timing/colisão de navegação: é que uma requisição `fetch()` feita pelo service worker não carrega os cabeçalhos que uma navegação real carrega (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, etc.) — cabeçalhos que o navegador gera automaticamente e que JavaScript não tem como forjar. O SEI (ou uma proteção na frente dele) parece tratar isso como tráfego suspeito e invalidar a sessão, independente de qualquer colisão de horário.

## Diagnóstico confirmado

- Testado e descartado: delay fixo de 5s pós-navegação (deslogou).
- Testado e descartado: debounce (só dispara após pausa real de navegação — deslogou mesmo assim, colidindo com um clique ~500ms após o fetch já ter começado).
- Testado e descartado: remover a checagem imediata, manter só o alarme periódico (deslogou de novo, isolado, sem nenhum clique por perto — SEI parado, extensão sozinha, a cada exato ciclo do alarme).
- Testado e descartado: setar `referrer`/`referrerPolicy` explicitamente no `fetch()` (deslogou igual).
- Teste de controle: extensão desligada + navegação rápida logo após login → sem deslogamento. Confirma que é a extensão, não o SEI sozinho.
- Teste de controle: extensão nunca existiu + tela bloqueada (Win+L) por muito tempo → sem deslogamento rápido. Descarta timeout natural curto do SEI como explicação.

Conclusão: a causa mais provável é a natureza da requisição (`fetch()` de service worker não se parece com navegação real), não o tempo em que ela acontece. Nenhuma mitigação de timing resolve isso — é preciso que a requisição seja, de fato, uma navegação real.

## Decisão de escopo (usuário, 2026-07-09)

- Só o **bloco de assinatura** entra neste lote — é a notificação mais importante pro usuário. Processos novos continua usando o `fetch()` atual (risco residual conhecido) e vira um lote separado depois.
- Intervalo padrão do alarme de bloco de assinatura cai de 15 para **5 minutos**, para facilitar o teste em uso real. Ajustável a qualquer momento pela tela de Opções.
- Usuário aceitou o trade-off de uma aba aparecer/sumir rapidamente na barra de abas a cada ciclo do alarme, dado que é a única forma encontrada de fazer a requisição parecer navegação real de verdade.

## Arquitetura

### Ideia central: reaproveitar o content script que já existe

`src/content-scripts/rel_bloco_protocolo_listar/index.ts` já roda em toda visita à tela do bloco de assinatura (o manifest já casa esse content script com `acao=bloco_assinatura_listar`) e já faz tudo que precisamos: lê a tabela do DOM real da página (`parseBlocoAssinaturaTable`) e manda os itens por mensagem (`seirmg:bloco-assinatura:itens`) para o background processar. Não precisamos duplicar nenhuma lógica de parsing — só precisamos fazer esse content script rodar numa aba que o background abre e fecha sozinho, e diferenciar essa execução automática de uma visita real do usuário (regras de notificação diferentes — ver abaixo).

### Fluxo

1. O alarme (`chrome.alarms.onAlarm`, `ALARM_NAME`) dispara `verificarBlocoAssinaturaViaAbaOculta(url)`, com `url = ${baseUrlSei}/controlador.php?acao=bloco_assinatura_listar&seirmgOrigem=alarme`.
2. Essa função roda dentro do mesmo mutex já existente em `background/sessionGate.ts` (serializa com qualquer `fetchTextComGate` em andamento — nunca duas ações autenticadas da extensão ao mesmo tempo) e respeita o mesmo circuit breaker (`sessaoInvalidaAte`) — se já estiver aberto, pula sem abrir aba nenhuma.
3. Abre a aba: `chrome.tabs.create({ url, active: false })` — não rouba o foco da janela atual.
4. `core/index.ts`, `tema/index.ts` e `rel_bloco_protocolo_listar/index.ts` rodam normalmente nessa aba (são os content scripts que já casam com essa URL). O `rel_bloco_protocolo_listar` lê o parâmetro `seirmgOrigem=alarme` da URL e inclui `origem: 'alarme'` na mensagem que já manda hoje.
5. O background espera essa mensagem chegar (correlacionando pelo `sender.tab.id` da aba que ele mesmo abriu) **ou** um timeout de 15s, o que vier primeiro.
6. Depois de decidido (mensagem ou timeout), o background usa `chrome.scripting.executeScript` pra checar se a aba caiu na tela de login (`document.getElementById('frmLogin') !== null`) — se sim, abre o circuit breaker (mesma lógica hoje usada em `fetchTextComGate`, extraída para reuso).
7. A aba é sempre fechada (`chrome.tabs.remove`) ao final, com ou sem sucesso.

### Regra de notificação: "alarme" vs "visita real"

O listener existente de `seirmg:bloco-assinatura:itens` em `background/index.ts` já decide, hoje, notificar só a primeira vez que um item aparece pendente (regra de visita real). O alarme precisa notificar **todos** os itens pendentes a cada ciclo (regra já usada por `sempreNotificarPendentes: true`). A mensagem ganha um campo opcional `origem?: 'alarme'` — quando presente, o listener passa `{ sempreNotificarPendentes: true }` para `processarItensBlocoAssinatura`; quando ausente (visita real do usuário), mantém o comportamento atual sem mudança nenhuma.

```ts
interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
  origem?: 'alarme'
}
```

### Novo módulo: `src/background/blocoAssinaturaAbaOculta.ts`

```ts
import { serializar, circuitBreakerEstaAberto, abrirCircuitBreaker } from './sessionGate'

const TIMEOUT_ABA_OCULTA_MS = 15000

function ehMensagemItensBlocoDaAba(mensagem: unknown, remetente: chrome.runtime.MessageSender, tabId: number): boolean {
  return (
    remetente.tab?.id === tabId &&
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

function aguardarMensagemOuTimeout(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    let resolvido = false
    const finalizar = () => {
      if (resolvido) return
      resolvido = true
      chrome.runtime.onMessage.removeListener(listener)
      clearTimeout(timer)
      resolve()
    }
    const listener = (mensagem: unknown, remetente: chrome.runtime.MessageSender) => {
      if (ehMensagemItensBlocoDaAba(mensagem, remetente, tabId)) finalizar()
    }
    chrome.runtime.onMessage.addListener(listener)
    const timer = setTimeout(finalizar, TIMEOUT_ABA_OCULTA_MS)
  })
}

async function paginaEhTelaDeLogin(tabId: number): Promise<boolean> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.getElementById('frmLogin') !== null,
    })
    return result === true
  } catch {
    return false
  }
}

export function verificarBlocoAssinaturaViaAbaOculta(url: string): Promise<void> {
  return serializar(async () => {
    if (await circuitBreakerEstaAberto()) {
      console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: circuit breaker aberto, pulando')
      return
    }

    console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: abrindo aba oculta', url, new Date().toISOString())
    const tab = await chrome.tabs.create({ url, active: false })
    if (!tab.id) return

    try {
      await aguardarMensagemOuTimeout(tab.id)
      console.log('[SEIRMG][diagnostico] verificarBlocoAssinaturaViaAbaOculta: aba concluída/timeout', new Date().toISOString())

      if (await paginaEhTelaDeLogin(tab.id)) {
        await abrirCircuitBreaker()
      }
    } finally {
      chrome.tabs.remove(tab.id).catch(() => {})
    }
  })
}
```

### `background/sessionGate.ts` ganha dois exports novos (extraídos, sem mudar comportamento)

`serializar` passa a ser exportado (era função privada do módulo). A lógica de "circuit breaker está aberto?" e "abrir circuit breaker" que hoje vive inline dentro de `fetchTextComGate` vira dois helpers exportados e reaproveitados também por `fetchTextComGate`:

```ts
export async function circuitBreakerEstaAberto(): Promise<boolean> {
  const config = await createLocalConfigStore().get()
  return circuitBreakerAberto(config.sessaoInvalidaAte, new Date().toISOString())
}

export async function abrirCircuitBreaker(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    sessaoInvalidaAte: new Date(Date.now() + DURACAO_CIRCUIT_BREAKER_MINUTOS * 60 * 1000).toISOString(),
  })
  console.error(
    '[SEIRMG] Sessão do SEI parece inválida (tela de login detectada) — pausando chamadas por',
    DURACAO_CIRCUIT_BREAKER_MINUTOS,
    'min'
  )
}
```

`fetchTextComGate` passa a chamar esses dois helpers em vez de repetir a lógica inline — comportamento idêntico, só eliminando duplicação.

### `background/index.ts`

- Nova função `checarBlocoAssinaturaViaAlarme()` monta a URL com `baseUrlSei` + `&seirmgOrigem=alarme` e chama `verificarBlocoAssinaturaViaAbaOculta(url)` (do novo módulo) — substitui `verificarBlocoAssinaturaViaFetch` (removida) como o que o alarme (`chrome.alarms.onAlarm` para `ALARM_NAME`) chama.
- `MensagemItensBloco` ganha o campo `origem?: 'alarme'`.
- O listener de `seirmg:bloco-assinatura:itens` passa `{ sempreNotificarPendentes: true }` quando `mensagem.origem === 'alarme'`.

### Manifesto

- Nova permissão: `"scripting"` (em `permissions`, junto de `storage`/`notifications`/`alarms`/`tabs`/`offscreen`). `host_permissions` já cobre a URL do bloco de assinatura, não muda.

### Config

- `DEFAULT_SYNC_CONFIG.blocoAssinatura.intervaloMinutos`: `15` → `5`.

## Arquivos removidos (consequência direta, não escopo extra)

Com o alarme passando a usar o content script existente (que já parseia e manda itens estruturados), o caminho antigo de "buscar HTML cru do bloco de assinatura e parsear via offscreen document" fica sem nenhum consumidor:

- `src/background/alarms/blocoAssinaturaCheck.ts` — remove a função `verificarBlocoAssinatura` e a interface `BlocoAssinaturaCheckDeps`; **mantém** `export const ALARM_NAME` (ainda usado por `src/options/main.ts` para reagendar o alarme).
- `src/background/alarms/blocoAssinaturaCheck.test.ts` — removido inteiro (só testava a função removida).
- `src/background/offscreenParser.ts` — remove `parseBlocoAssinaturaHtmlViaOffscreen` (sem outro consumidor).
- `src/offscreen/index.ts` — remove o caso `'blocoAssinatura'` do parser de mensagens (e o import de `parseBlocoAssinaturaTable`/`ParseBlocoAssinaturaOptions`, que ficam sem uso ali).

Processos novos não é afetado — continua usando `fetchListaProcessos`/`fetchTextComGate` sem nenhuma mudança.

## Tratamento de erros

- `verificarBlocoAssinaturaViaAbaOculta` nunca lança: qualquer falha (criação de aba, timeout, `executeScript`) é absorvida e a aba é sempre removida no `finally`, mesmo em erro.
- `paginaEhTelaDeLogin` captura qualquer exceção do `executeScript` (ex.: aba fechada antes da checagem) e retorna `false` nesse caso — não abre circuit breaker por engano só porque a checagem falhou tecnicamente.
- Se `chrome.tabs.create` não retornar um `tab.id` válido, a função retorna sem tentar mais nada (não há aba pra fechar).

## Testes

- Nenhum teste novo automatizado: este módulo é 100% wiring de `chrome.tabs`/`chrome.scripting`/`chrome.runtime.onMessage`, mesmo padrão de `background/index.ts` e `background/sessionGate.ts` (não testados, consistente com o resto do projeto).
- `blocoAssinaturaCheck.test.ts` é removido junto com a função que testava.
- Nenhum teste existente deveria quebrar: `rel_bloco_protocolo_listar` continua enviando a mesma mensagem, só com um campo opcional a mais.

## Fora de escopo

- Processos novos continua com `fetch()` direto — risco residual conhecido, vira lote separado depois.
- Nenhuma supressão dos outros content scripts (`core`, `tema`, `ponto_controle`) que também rodam nessa aba oculta — são idempotentes/inofensivos (renderização de badge, CSS de tema, ajuste de menu), e suprimi-los exigiria uma mudança maior (parâmetro de URL lido por cada um) sem benefício claro.
- Nenhuma tentativa de tornar a aba 100% invisível (janela minimizada, etc.) — o usuário já validou que o "flash" da aba na barra é aceitável.
