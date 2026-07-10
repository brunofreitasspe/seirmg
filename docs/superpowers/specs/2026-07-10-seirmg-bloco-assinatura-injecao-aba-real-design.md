# SEIRMG — Checagem proativa do bloco de assinatura via injeção na aba real do SEI

> Spec resultante de análise em 2026-07-10, após remoção (commit `100ca33`, mesmo dia) da
> checagem periódica via aba oculta por causar deslogamento automático. Retoma a
> funcionalidade com uma arquitetura diferente — nunca testada neste projeto — em vez de
> tentar consertar a aba oculta de novo. Usuário pediu pra só planejar (sem rodada extra de
> perguntas); decisões de design abaixo foram tomadas diretamente, documentadas para revisão.

## Contexto

Historinha completa em `project_seirmg_hardening` (memória) e no ledger
(`.superpowers/sdd/progress.md`), resumo:

1. `fetch()` cru do background — sem contexto de página (sem Referer real, sem acesso a
   campos ocultos da página).
2. Session gate (mutex + delay pós-navegação + circuit breaker de detecção de tela de
   login) — ainda `fetch()` do background, mas serializado/protegido.
3. Aba oculta (`chrome.tabs.create({active:false})`) — contexto de página real completo,
   mas **cria uma aba/navegação nova**.
4. Removido hoje (100ca33): mesmo com contexto completo, a aba oculta ainda causava
   deslogamento reportado pelo usuário (o toggle `ativo` também não gateava o alarme —
   bug real, também corrigido ao remover tudo).

Nenhuma dessas quatro tentativas testou a única opção que não cria contexto de navegação
novo nenhum: injetar (`chrome.scripting.executeScript`) o fetch dentro da aba do SEI que o
usuário **já tem aberta e logada**. Essa é exatamente a técnica que o Sei++ original usa
(`cs_modules/core/idle/verificarBlocoAssinatura.js`, disparado por navegação real dentro de
um content script já injetado na aba) — projeto irmão sem relatos de queda de sessão por
essa causa. A própria checagem "em tempo real" que o SEIRMG já tem (quando o usuário está
de fato na tela do bloco de assinatura, via `MutationObserver` em
`rel_bloco_protocolo_listar/index.ts`) nunca foi implicada no problema — e é exatamente essa
mesma categoria de acesso (aba real, sem navegação nova).

## Decisão de arquitetura

Reintroduzir a checagem periódica (`chrome.alarms`), mas trocar o mecanismo de acesso: em
vez de abrir uma aba nova, usar `chrome.scripting.executeScript` pra rodar o fetch dentro de
uma aba do SEI já aberta pelo usuário (achada via `chrome.tabs.query`). Se nenhuma aba do
SEI estiver aberta no momento do ciclo, o ciclo é pulado silenciosamente (sem notificação
proativa até a próxima aba SEI ser aberta e o próximo ciclo rodar) — troca aceita
conscientemente: prioriza nunca arriscar a sessão do usuário sobre garantir notificação
instantânea.

**Corrige também o bug real do incidente de hoje**: tanto o agendamento do alarme quanto o
handler passam a checar `config.blocoAssinatura.ativo` explicitamente — a versão removida
não fazia essa checagem, então desligar o toggle nas Opções não tinha efeito nenhum.

## Arquitetura

### Permissão nova no manifesto

`manifest.config.ts`: `permissions` ganha `'scripting'` de volta (removida hoje quando a
aba oculta foi excluída — `chrome.scripting.executeScript` exige essa permissão).

### Armazenamento

`BlocoAssinaturaConfig` (`src/lib/storage.ts`) ganha `intervaloMinutos` de volta (removido
hoje junto com a aba oculta):

```ts
export interface BlocoAssinaturaConfig {
  ativo: boolean
  intervaloMinutos: number
  tocarSom: boolean
}
```

Default: `5` (mesmo valor de antes). `src/options/index.html`'s aba Notificações ganha o
campo "Intervalo de verificação (minutos)" de volta, mesma posição/padrão de antes (min 5,
max 120), com leitura/gravação em `src/options/main.ts`.

### Novo módulo — lógica pura testável: `src/features/bloco-assinatura/verificacaoProativa.ts`

```ts
export function montarUrlBlocoAssinatura(baseUrlSei: string): string {
  return `${baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`
}
```

(Função mínima — a maior parte da lógica desta feature é orquestração de `chrome.*`,
sem lógica pura nova além do já existente `parseBlocoAssinaturaTable`/`ehPaginaDeLogin`,
ambos reaproveitados sem alteração.)

### Orquestração — `src/background/verificacaoProativaBlocoAssinatura.ts` (novo, sem teste
direto, mesmo padrão do resto de `background/`)

```ts
import { serializar, circuitBreakerEstaAberto, abrirCircuitBreaker } from './sessionGate'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { parseBlocoAssinaturaTable } from '../features/bloco-assinatura/parser'
import { ehPaginaDeLogin } from '../lib/sessionGate'
import { montarUrlBlocoAssinatura } from '../features/bloco-assinatura/verificacaoProativa'
import { createLocalConfigStore } from '../lib/storage'

export function verificarBlocoAssinaturaNaAbaReal(baseUrlSei: string): Promise<void> {
  return serializar(async () => {
    try {
      if (await circuitBreakerEstaAberto()) return

      const [abaSei] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
      if (!abaSei?.id) return

      const url = montarUrlBlocoAssinatura(baseUrlSei)
      const [{ result: html }] = await chrome.scripting.executeScript({
        target: { tabId: abaSei.id },
        func: (urlFetch: string) => fetch(urlFetch).then((r) => r.text()),
        args: [url],
      })

      if (typeof html !== 'string') return

      if (ehPaginaDeLogin(html)) {
        await abrirCircuitBreaker()
        return
      }

      const localConfig = await createLocalConfigStore().get()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const itens = parseBlocoAssinaturaTable(doc, {
        seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
      })

      await processarItensBlocoAssinatura(itens, { sempreNotificarPendentes: true })
    } catch (error) {
      console.error('[SEIRMG] Falha ao verificar bloco de assinatura na aba real:', error)
    }
  })
}
```

`processarItensBlocoAssinatura` (`src/background/blocoAssinaturaPipeline.ts`) recupera o
parâmetro `sempreNotificarPendentes` (removido hoje por não ter mais consumidor) — volta a
existir, com o mesmo comportamento de antes (renotificar tudo que ainda está pendente a
cada ciclo, não só itens novos).

### Alarme — `src/background/index.ts`

Reintroduz o agendamento e o handler, desta vez **gateados por `ativo`**:

```ts
async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  if (!config.blocoAssinatura.ativo) {
    chrome.alarms.clear(ALARM_NAME)
    return
  }
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function checarBlocoAssinaturaViaAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarBlocoAssinaturaNaAbaReal(localConfig.baseUrlSei)
}

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  checarBlocoAssinaturaViaAlarme().catch((error) => {
    console.error('[SEIRMG] Falha ao verificar bloco de assinatura via alarme:', error)
  })
})
```

`chrome.runtime.onInstalled` volta a chamar `agendarAlarme()`. `src/options/main.ts`'s
salvar da aba Notificações também chama `agendarAlarme()` de novo após salvar — **desta
vez a própria função decide se cria ou limpa o alarme conforme `ativo`**, resolvendo o
bug de hoje na raiz (antes, o salvamento sempre recriava o alarme incondicionalmente).

`ALARM_NAME` volta a existir (`src/background/alarms/blocoAssinaturaCheck.ts`, removido
hoje).

## Segurança/robustez

- `chrome.scripting.executeScript` roda no mundo isolado por padrão (`world: 'ISOLATED'`,
  o default) — o `fetch()` dentro dele herda cookies/sessão da aba real automaticamente,
  sem acessar ou interferir no JS da própria página do SEI.
- Se `chrome.tabs.query` não achar nenhuma aba do SEI aberta, ou se
  `chrome.scripting.executeScript` falhar (aba fechada entre o query e a injeção, página
  ainda carregando, etc.), o ciclo é abortado silenciosamente — nunca uma notificação
  quebrada, mesma filosofia já usada no resto da integração.
- Circuit breaker e mutex (`serializar`) já existentes são reaproveitados sem alteração —
  continuam protegendo contra chamadas concorrentes e pausando checagens por 5 min quando
  uma tela de login é detectada.

## Testes

`montarUrlBlocoAssinatura` ganha teste unitário simples. O resto (orquestração de
`chrome.tabs`/`chrome.scripting`/`chrome.alarms`) não tem teste automatizado direto, mesma
política já aplicada a todo o resto de `background/`.

## Fora de escopo

- Réplica de qualquer "ping" de keep-alive de sessão que o SEI possa ter — não investigado
  nesta rodada. Se o deslogamento persistir mesmo com essa mudança de mecanismo, essa é a
  próxima hipótese a validar.
- Reintroduzir a checagem de `processos-novos` (removida em `bc98127` por raciocínio
  parecido, mas usava `fetch()` cru — nunca chegou a ser migrada pra aba oculta nem para
  este novo mecanismo) — fora desta spec.

## Validação necessária (mesmo tratamento do Lote F)

Este mecanismo não pode ser validado automaticamente — precisa de teste manual numa
instância SEI real: (1) confirmar que a notificação dispara corretamente quando há
pendência; (2) confirmar, ao longo de várias horas de uso normal, que a sessão do usuário
não cai mais; (3) confirmar que a extensão se comporta bem quando nenhuma aba do SEI está
aberta no momento do ciclo (não deve gerar erro nem popup).
