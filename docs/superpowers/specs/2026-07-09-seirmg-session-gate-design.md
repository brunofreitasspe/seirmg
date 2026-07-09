# SEIRMG — Session Gate: mitigação de logout automático causado por chamadas de fundo

> Spec resultante de brainstorming em 2026-07-09, a partir de uma proposta externa de correção para o problema de deslogamento automático — um problema já conhecido no Sei++ original (nunca mitigado lá: `seiplus/background/fetchSei.js` faz `fetch()` puro, sem serialização, delay ou circuit breaker).

## Contexto

O diagnóstico (confirmado por investigação anterior nesta sessão de trabalho, ver commits `49324cd`/`4ef5c13`/`19ecb3a`) é que chamadas de rede feitas pela extensão fora do fluxo de navegação real de uma aba — principalmente as dos alarmes em background (`verificarBlocoAssinaturaViaFetch`, `verificarProcessosNovosViaFetch`) — competem pelos mesmos cookies de sessão que o SEI usa para detectar sessão simultânea/token de página, e podem levar o servidor a invalidar a sessão da aba visível.

Já existe uma mitigação parcial no código: `background/index.ts`'s `verificarImediatoSeNecessario()` aplica um delay fixo de 5s (`ATRASO_VERIFICACAO_IMEDIATA_MS`) só no caminho disparado pela mensagem `seirmg:sei-detectado` (navegação real detectada). Isso **não cobre**:
- os dois alarmes periódicos (`chrome.alarms`, a cada 5/15 min), que rodam independente de navegação e podem coincidir com uma navegação real;
- os ~7 pontos de `fetchText` em content scripts (lote de reabertura, rolagem infinita, anotação, autopreenchimento de documento externo, filtro por bloco) — hoje são `fetch()` direto na aba, sem nenhuma coordenação com as chamadas de fundo nem entre si (duas abas do SEI abertas ao mesmo tempo podem disparar fetches concorrentes);
- detecção de sessão inválida — hoje nenhuma chamada verifica se a resposta é a tela de login.

## Decisões validadas com o usuário (2026-07-09)

- O gate deve cobrir **todas** as chamadas de fetch da extensão a `controlador.php`, não só as de fundo — inclui os pontos em content scripts.
- Para isso funcionar de verdade (mutex único, sem depender de estado compartilhado entre contextos JS separados), **toda** chamada de content script passa a ser roteada através do background via mensagem — o background é quem executa o fetch de fato.
- Delay pós-navegação: 1,5s (valor da proposta original). Circuit breaker: 5 min (idem).
- O delay fixo de 5s já existente no caminho de "verificação imediata" é mantido como está — não conflita com o gate genérico (o gate aplica no máximo o restante do próprio delay de 1,5s, que a essa altura já terá decorrido).

## Arquitetura

### Camada 1 — lógica pura testável: `src/lib/sessionGate.ts`

```ts
export function ehPaginaDeLogin(html: string): boolean {
  return html.includes('frmLogin')
}

export function calcularEsperaPosNavegacao(
  ultimaNavegacaoIso: string | undefined,
  agoraIso: string,
  atrasoMs: number
): number {
  if (!ultimaNavegacaoIso) return 0
  const decorrido = new Date(agoraIso).getTime() - new Date(ultimaNavegacaoIso).getTime()
  return Math.max(0, atrasoMs - decorrido)
}

export function circuitBreakerAberto(
  sessaoInvalidaAteIso: string | undefined,
  agoraIso: string
): boolean {
  if (!sessaoInvalidaAteIso) return false
  return new Date(sessaoInvalidaAteIso).getTime() > new Date(agoraIso).getTime()
}
```

Detecção de login: mesma técnica do Sei++ original (`seiplus/background/api.js`'s `isAuthenticated`, que faz `doc.querySelector('#frmLogin')`) — aqui feita por substring no HTML bruto (mais barata que um parse via offscreen document só para essa checagem).

### Camada 2 — orquestração: `src/background/sessionGate.ts`

Não testada (wiring de `chrome.*`/`setTimeout`, mesmo padrão de `background/index.ts` e `verificacaoImediataEmAndamento`).

```ts
import { fetchText, type FetchWithTimeoutOptions, type Result } from '../lib/result'
import { createLocalConfigStore } from '../lib/storage'
import { ehPaginaDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from '../lib/sessionGate'

const ATRASO_POS_NAVEGACAO_MS = 1500
const DURACAO_CIRCUIT_BREAKER_MINUTOS = 5

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let filaMutex: Promise<unknown> = Promise.resolve()

function serializar<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = filaMutex.then(tarefa, tarefa)
  filaMutex = execucao.catch(() => undefined)
  return execucao
}

export async function registrarNavegacaoReal(): Promise<void> {
  const store = createLocalConfigStore()
  const config = await store.get()
  await store.set({
    ...config,
    ultimaNavegacaoRealSei: new Date().toISOString(),
    sessaoInvalidaAte: undefined, // navegação real bem-sucedida prova que a sessão voltou
  })
}

export function fetchTextComGate(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  return serializar(async () => {
    const config = await createLocalConfigStore().get()
    const agoraIso = new Date().toISOString()

    if (circuitBreakerAberto(config.sessaoInvalidaAte, agoraIso)) {
      return { ok: false, error: 'Sessão do SEI inválida — chamadas de fundo pausadas temporariamente' }
    }

    const espera = calcularEsperaPosNavegacao(config.ultimaNavegacaoRealSei, agoraIso, ATRASO_POS_NAVEGACAO_MS)
    if (espera > 0) await aguardar(espera)

    const resultado = await fetchText(url, options)
    if (resultado.ok && ehPaginaDeLogin(resultado.data)) {
      const store = createLocalConfigStore()
      const configAtual = await store.get()
      await store.set({
        ...configAtual,
        sessaoInvalidaAte: new Date(Date.now() + DURACAO_CIRCUIT_BREAKER_MINUTOS * 60 * 1000).toISOString(),
      })
      console.error('[SEIRMG] Sessão do SEI parece inválida (tela de login detectada) — pausando chamadas por', DURACAO_CIRCUIT_BREAKER_MINUTOS, 'min')
      return { ok: false, error: 'Sessão do SEI inválida (tela de login detectada)' }
    }

    return resultado
  })
}
```

O mutex em memória é suficiente (não precisa persistir em storage): todas as chamadas — de fundo e as roteadas de content scripts — passam a rodar dentro do mesmo service worker, então nunca há duas em voo ao mesmo tempo, mesmo com múltiplas abas do SEI abertas.

### Roteamento de content scripts via background

Novo arquivo `src/lib/fetchViaBackground.ts` (usado só por content scripts, mesma assinatura de `fetchText`):

```ts
import type { Result } from './result'

export async function fetchText(
  url: string,
  options: { method?: string; body?: URLSearchParams } = {}
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-sei',
      url,
      method: options.method,
      body: options.body?.toString(),
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
```

`background/index.ts` ganha um novo listener (mesmo padrão dos já existentes: guard de tipo + `responder`/`return true`):

```ts
interface MensagemFetchSei {
  type: 'seirmg:fetch-sei'
  url: string
  method?: string
  body?: string
}

function ehMensagemFetchSei(mensagem: unknown): mensagem is MensagemFetchSei {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:fetch-sei'
  )
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchSei(mensagem)) return false
  fetchTextComGate(mensagem.url, {
    method: mensagem.method,
    body: mensagem.body !== undefined ? new URLSearchParams(mensagem.body) : undefined,
  })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})
```

Reconstruir `URLSearchParams` a partir da string (em vez de mandar a string crua pro `fetch`) preserva o header `Content-Type: application/x-www-form-urlencoded;charset=UTF-8` que o `fetch` nativo define automaticamente para corpos `URLSearchParams` — sem isso o SEI poderia não parsear o body corretamente.

Content scripts afetados (só a linha de import muda, nenhuma lógica): `procedimento_controlar/index.ts`, `documento_receber/index.ts`, `procedimento_visualizar/index.ts`, `controle_unidade_gerar/index.ts` — trocam `import { fetchText } from '../../lib/result'` por `import { fetchText } from '../../lib/fetchViaBackground'`.

### Pontos de fundo existentes passam a usar o gate

- `background/index.ts`'s `verificarBlocoAssinaturaViaFetch`: `fetchText(url)` → `fetchTextComGate(url)`.
- `background/processosNovos/fetchListaProcessos.ts`: o default de `deps.fetchText` passa de `fetchTextReal` (importado de `lib/result`) para `fetchTextComGate` (importado de `background/sessionGate`).
- `background/index.ts`'s listener de `seirmg:sei-detectado`: ganha uma chamada a `registrarNavegacaoReal()` (além do já existente `verificarImediatoSeNecessario()`).

### Schema de storage

`src/lib/storage.ts`'s `LocalConfig` ganha dois campos opcionais (sem entrada em `DEFAULT_LOCAL_CONFIG`, mesmo padrão de `ultimaVerificacaoImediata?`/`baseUrlSei?`):

```ts
export interface LocalConfig {
  // ...existentes
  ultimaNavegacaoRealSei?: string   // NOVO — timestamp ISO da última navegação real detectada
  sessaoInvalidaAte?: string        // NOVO — timestamp ISO até quando o circuit breaker fica aberto
}
```

## Tratamento de erros

- `fetchTextComGate` nunca lança — segue o contrato de `Result<T>` já estabelecido em todo o projeto.
- Circuit breaker aberto ou tela de login detectada resultam em `{ ok: false, error }`, tratado pelos callers exatamente como qualquer outra falha de rede já é tratada hoje (cada content script já tem seu próprio `console.error`/mensagem de status ao usuário em caso de falha — nenhum caller precisa de tratamento novo).
- Falha de `chrome.runtime.sendMessage` (ex.: extensão recarregada/contexto invalidado) é capturada em `fetchViaBackground.ts` e devolvida como `Result` de erro, nunca lançada — mesmo contrato.

## Testes

- `src/lib/sessionGate.test.ts` (novo): `ehPaginaDeLogin` (com/sem `frmLogin`), `calcularEsperaPosNavegacao` (sem navegação prévia → 0; navegação recente → resta a diferença; navegação antiga → 0), `circuitBreakerAberto` (sem data → false; data futura → true; data passada → false).
- `src/background/processosNovos/fetchListaProcessos.test.ts`: sem mudança de comportamento (continua injetando `fetchText` mockado via `deps`, agora só o *default* de produção troca — os testes não usam o default).
- `src/background/sessionGate.ts`, `src/lib/fetchViaBackground.ts`, o novo listener em `background/index.ts` e a troca de import nos content scripts: não testados — wiring de `chrome.*`/timers, consistente com o resto do projeto (ver spec `2026-07-06-seirmg-bloco-assinatura-correcao-design.md`, seção de testes).

## Fora de escopo

- Nenhum sinal visível ao usuário quando o circuit breaker abre (ex.: notificação "sua sessão parece ter expirado"). A mitigação é só de engenharia; se quiser esse aviso depois, é um incremento separado.
- Não há retry automático após o circuit breaker fechar — a próxima chamada de fundo ou de content script, dentro ou depois da janela de 5 min, simplesmente tenta normalmente.
- Não altera o comportamento de `mostrarAnotacao`/`rel_bloco_protocolo_listar` (bloco de assinatura na tela) além do já existente — esse content script não faz fetch de rede próprio hoje (usa `MutationObserver` + mensagem para o pipeline).
- Não muda o valor do delay de 5s já existente na checagem imediata (`ATRASO_VERIFICACAO_IMEDIATA_MS`).
