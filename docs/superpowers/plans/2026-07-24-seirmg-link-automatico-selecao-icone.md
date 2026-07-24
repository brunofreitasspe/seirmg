# Converter número selecionado em link SEI, pelo ícone da extensão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecionar um número de processo/documento dentro do texto sendo editado no SEI e clicar
no ícone da extensão na barra de ferramentas do navegador substitui esse texto pelo hyperlink real
do processo/documento correspondente, sem nenhum passo intermediário.

**Architecture:** O ícone da extensão passa a ter dois modos por aba, alternados dinamicamente via
`chrome.action.setPopup`: modo normal (abre o popup de status/histórico, como hoje) e modo "seleção
candidata a número" (dispara `chrome.action.onClicked` em vez de abrir popup). A ponte CKEditor
main-world↔isolated-world já existente (Lote R) ganha um evento novo de mudança de seleção; o
content-script isolado usa esse evento pra decidir o modo do ícone. Ao clicar em modo "conversão", o
número selecionado é pesquisado no SEI (reaproveitando a caixa de Pesquisa Rápida nativa do próprio
SEI, acessada via `window.opener`, mesmo padrão já usado por `editor_montar/index.ts`) e o resultado
vira um link inserido no lugar da seleção.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin` (Manifest V3), Vitest + jsdom.

## Global Constraints

- Todo texto de UI/mensagens de erro em português (pt-BR), consistente com o resto do projeto.
- Nomes de função/variável em português, seguindo a convenção já usada em todo o código do SEIRMG.
- Nenhuma chamada de rede autônoma por timer/alarme — só em resposta direta a um clique do usuário
  (categoria de risco já validada no projeto; ver spec, seção "Riscos").
- `docs/superpowers/specs/2026-07-24-seirmg-link-automatico-selecao-icone-design.md` é a spec
  aprovada — qualquer divergência encontrada durante a implementação deve ser resolvida a favor do
  que está descrito lá, ou levantada com o usuário antes de prosseguir.

---

## Task 1: Config schema — `referenciaLink` em `SyncConfig`

**Files:**
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: `interface ReferenciaLinkConfig { ativo: boolean }`, campo `referenciaLink:
  ReferenciaLinkConfig` em `SyncConfig`, entrada `referenciaLink: { ativo: false }` em
  `DEFAULT_SYNC_CONFIG`.

- [ ] **Step 1: Adicionar a interface e o campo em `SyncConfig`**

Em `src/lib/storage.ts`, logo depois de `FormatacaoBasicaConfig`/antes de `TarefasConfig` (por volta
da linha 180), adicionar:

```ts
export interface ReferenciaLinkConfig {
  ativo: boolean
}
```

Em `SyncConfig` (por volta da linha 185-198), adicionar o campo depois de `formatacaoBasica`:

```ts
export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
  controleProcessos: ControleProcessosConfig
  pontoControle: PontoControleConfig
  documentoExterno: DocumentoExternoConfig
  ferramentasIA: FerramentasIAConfig
  corretorOrtografico: CorretorOrtograficoConfig
  formatacaoBasica: FormatacaoBasicaConfig
  referenciaLink: ReferenciaLinkConfig
  tarefas: TarefasConfig
  historicoProcessos: HistoricoProcessosConfig
}
```

Em `DEFAULT_SYNC_CONFIG` (por volta da linha 307-310), adicionar depois de `formatacaoBasica`:

```ts
  formatacaoBasica: {
    ativo: false,
    atalhos: [],
  },
  referenciaLink: {
    ativo: false,
  },
  tarefas: {
```

- [ ] **Step 2: Checar tipos**

Run: `npm run typecheck`
Expected: sem erros novos (outros consumidores de `SyncConfig` usam spread/default, não listagem
exaustiva de campos — não devem quebrar por um campo novo).

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: adiciona config referenciaLink (default desativado)"
```

---

## Task 2: Detecção de número — `features/referencia-link/numero.ts`

**Files:**
- Create: `src/features/referencia-link/numero.ts`
- Test: `src/features/referencia-link/numero.test.ts`

**Interfaces:**
- Produces: `extrairDigitos(texto: string): string`, `candidatoANumeroSei(textoSelecionado: string):
  boolean`.

- [ ] **Step 1: Escrever o teste primeiro**

Criar `src/features/referencia-link/numero.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairDigitos, candidatoANumeroSei } from './numero'

describe('extrairDigitos', () => {
  it('remove tudo que não é dígito, mantendo só os números', () => {
    expect(extrairDigitos('0011035-79.2020.8.13.0079')).toBe('0011035792020813 0079'.replace(/\s/g, ''))
  })

  it('retorna string vazia quando não há nenhum dígito', () => {
    expect(extrairDigitos('sem números aqui')).toBe('')
  })
})

describe('candidatoANumeroSei', () => {
  it('retorna true para um número de processo formatado (bem acima do mínimo de dígitos)', () => {
    expect(candidatoANumeroSei('0011035-79.2020.8.13.0079')).toBe(true)
  })

  it('retorna true para um número de documento sem formatação (7 dígitos)', () => {
    expect(candidatoANumeroSei('7294607')).toBe(true)
  })

  it('retorna false para um número curto (ano, item de lista etc.)', () => {
    expect(candidatoANumeroSei('2026')).toBe(false)
  })

  it('retorna false para texto sem nenhum dígito', () => {
    expect(candidatoANumeroSei('Despacho de encaminhamento')).toBe(false)
  })

  it('retorna false para uma sequência de dígitos absurdamente longa (provável colagem de tabela)', () => {
    expect(candidatoANumeroSei('1'.repeat(30))).toBe(false)
  })

  it('retorna true no limite mínimo exato (6 dígitos) e falso um abaixo dele', () => {
    expect(candidatoANumeroSei('123456')).toBe(true)
    expect(candidatoANumeroSei('12345')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/referencia-link/numero.test.ts`
Expected: FAIL — `Cannot find module './numero'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar**

Criar `src/features/referencia-link/numero.ts`:

```ts
const MIN_DIGITOS = 6
const MAX_DIGITOS = 25

export function extrairDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

// Mesma estratégia do Sei Pro (onlyNumber() em sei-functions-pro.js): extrai só os dígitos antes
// de pesquisar, então a seleção pode manter pontuação (pontos, barra, hífen) sem afetar a busca.
// Limites escolhidos pra evitar falso positivo em números pequenos que aparecem naturalmente num
// texto (ano, item de lista) sem exigir seleção só de dígitos, e pra não disparar numa colagem
// grande de números (ex.: uma tabela) que não seria um número de processo/documento de verdade.
export function candidatoANumeroSei(textoSelecionado: string): boolean {
  const digitos = extrairDigitos(textoSelecionado)
  return digitos.length >= MIN_DIGITOS && digitos.length <= MAX_DIGITOS
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/features/referencia-link/numero.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/referencia-link/numero.ts src/features/referencia-link/numero.test.ts
git commit -m "feat: detecção de número candidato a processo/documento SEI"
```

---

## Task 3: Resolver link a partir da URL final da pesquisa — `features/referencia-link/link.ts`

**Files:**
- Create: `src/features/referencia-link/link.ts`
- Test: `src/features/referencia-link/link.test.ts`

**Interfaces:**
- Produces: `extrairIdDoUrl(url: string, chave: 'id_procedimento' | 'id_documento'): string | null`,
  `construirLinkResultado(urlFinal: string): { href: string; tipo: 'processo' | 'documento' } | null`.

- [ ] **Step 1: Escrever o teste primeiro**

Criar `src/features/referencia-link/link.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairIdDoUrl, construirLinkResultado } from './link'

describe('extrairIdDoUrl', () => {
  it('extrai o valor do parâmetro pedido de uma URL absoluta', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=20637997&infra_hash=abc'
    expect(extrairIdDoUrl(url, 'id_procedimento')).toBe('20637997')
  })

  it('retorna null quando o parâmetro não existe na URL', () => {
    expect(extrairIdDoUrl('https://exemplo.br/sei/controlador.php?acao=x', 'id_documento')).toBeNull()
  })

  it('retorna null quando a URL é inválida', () => {
    expect(extrairIdDoUrl('::não é url::', 'id_procedimento')).toBeNull()
  })
})

describe('construirLinkResultado', () => {
  it('monta link de documento quando a URL final tem id_documento', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=documento_visualizar&id_documento=72946073&infra_hash=abc'
    expect(construirLinkResultado(url)).toEqual({
      href: 'controlador.php?acao=documento_visualizar&id_documento=72946073',
      tipo: 'documento',
    })
  })

  it('monta link de processo quando a URL final tem id_procedimento e não tem id_documento', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=20637997&infra_hash=abc'
    expect(construirLinkResultado(url)).toEqual({
      href: 'controlador.php?acao=procedimento_trabalhar&id_procedimento=20637997',
      tipo: 'processo',
    })
  })

  it('prioriza id_documento quando a URL final tem os dois parâmetros', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=x&id_procedimento=1&id_documento=2'
    expect(construirLinkResultado(url)?.tipo).toBe('documento')
  })

  it('retorna null quando a URL final não tem nenhum dos dois parâmetros (número não encontrado)', () => {
    const url = 'https://exemplo.br/sei/controlador.php?acao=procedimento_pesquisar&id_protocolo=0'
    expect(construirLinkResultado(url)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/features/referencia-link/link.test.ts`
Expected: FAIL — `Cannot find module './link'`.

- [ ] **Step 3: Implementar**

Criar `src/features/referencia-link/link.ts`:

```ts
export function extrairIdDoUrl(url: string, chave: 'id_procedimento' | 'id_documento'): string | null {
  try {
    return new URL(url).searchParams.get(chave)
  } catch {
    return null
  }
}

// Mesmo padrão "seguro" (sem infra_hash) já validado ao vivo pra processo em
// features/controle-processos/favoritos.ts (construirLinkSeguro) — infra_hash é válido só pro
// contexto (unidade/sessão) do momento em que foi gerado, então reconstruir o link só com o id
// evita reusar um hash desatualizado. id_documento é priorizado sobre id_procedimento porque é o
// dado mais específico quando os dois aparecem na mesma URL de resultado.
export function construirLinkResultado(
  urlFinal: string
): { href: string; tipo: 'processo' | 'documento' } | null {
  const idDocumento = extrairIdDoUrl(urlFinal, 'id_documento')
  if (idDocumento) {
    return { href: `controlador.php?acao=documento_visualizar&id_documento=${idDocumento}`, tipo: 'documento' }
  }

  const idProcedimento = extrairIdDoUrl(urlFinal, 'id_procedimento')
  if (idProcedimento) {
    return { href: `controlador.php?acao=procedimento_trabalhar&id_procedimento=${idProcedimento}`, tipo: 'processo' }
  }

  return null
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/features/referencia-link/link.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/referencia-link/link.ts src/features/referencia-link/link.test.ts
git commit -m "feat: resolve link seguro de processo/documento a partir da URL de pesquisa"
```

---

## Task 4: `fetchFinalUrl` em `lib/result.ts`

**Files:**
- Modify: `src/lib/result.ts`
- Modify: `src/lib/result.test.ts`

**Interfaces:**
- Consumes: nenhuma (módulo de base, sem dependências internas do projeto).
- Produces: `fetchFinalUrl(url: string, options?: FetchWithTimeoutOptions): Promise<Result<string>>`
  — mesmas opções de `fetchText`, mas `data` é `response.url` (URL final depois de redirecionamentos)
  em vez do corpo da resposta.

- [ ] **Step 1: Escrever os testes primeiro**

Adicionar ao final de `src/lib/result.test.ts` (mesmo arquivo, import atualizado):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchText, fetchFinalUrl } from './result'
```

```ts
describe('fetchFinalUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna ok com a URL final da resposta (depois de seguir redirecionamentos)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, url: 'https://exemplo.br/destino?id_procedimento=123' })
    )
    const resultado = await fetchFinalUrl('https://exemplo.br/pesquisa')
    expect(resultado).toEqual({ ok: true, data: 'https://exemplo.br/destino?id_procedimento=123' })
  })

  it('retorna erro quando a resposta HTTP não é ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const resultado = await fetchFinalUrl('https://exemplo.br/pesquisa')
    expect(resultado).toEqual({ ok: false, error: 'HTTP 404' })
  })

  it('retorna erro quando a requisição estoura o timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const resultado = await fetchFinalUrl('https://exemplo.br/pesquisa', { timeoutMs: 10 })
    expect(resultado.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/result.test.ts`
Expected: FAIL — `fetchFinalUrl is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `src/lib/result.ts` por (extrai a corrida-com-timeout comum entre
`fetchText` e a nova `fetchFinalUrl`, sem mudar o comportamento já testado de `fetchText`):

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

const TIMEOUT = Symbol('timeout')

async function corridaComTimeout<T>(
  fetchPromise: Promise<Result<T>>,
  controller: AbortController,
  timeoutMs: number
): Promise<Result<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<typeof TIMEOUT>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve(TIMEOUT)
    }, timeoutMs)
  })

  try {
    const resultado = await Promise.race([fetchPromise, timeoutPromise])
    if (resultado === TIMEOUT) return { ok: false, error: 'Timeout' }
    return resultado
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchText(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()

  const fetchPromise = (async (): Promise<Result<string>> => {
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }
      // response.text() sempre decodifica como UTF-8, ignorando o charset do header
      // Content-Type (limitação conhecida do fetch(), ao contrário do XMLHttpRequest antigo)
      // -- o SEI serve HTML em iso-8859-1, então acentos saíam corrompidos. Decodifica com o
      // charset real do header quando presente, caindo pra utf-8 (comportamento de antes) se
      // o header não declarar nenhum.
      const buffer = await response.arrayBuffer()
      const charsetMatch = response.headers.get('content-type')?.match(/charset=([^;]+)/i)
      const charset = charsetMatch ? charsetMatch[1].trim() : 'utf-8'
      const text = new TextDecoder(charset).decode(buffer)
      return { ok: true, data: text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })()

  return corridaComTimeout(fetchPromise, controller, timeoutMs)
}

// Usada quando só a URL final (depois de redirecionamentos do próprio SEI) importa, não o corpo
// da resposta -- caso da Pesquisa Rápida do SEI, que redireciona pra
// controlador.php?...&id_procedimento=... ou &id_documento=....
export async function fetchFinalUrl(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()

  const fetchPromise = (async (): Promise<Result<string>> => {
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }
      return { ok: true, data: response.url }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })()

  return corridaComTimeout(fetchPromise, controller, timeoutMs)
}
```

- [ ] **Step 4: Rodar e confirmar que passa (arquivo inteiro, garante que o refactor não quebrou `fetchText`)**

Run: `npx vitest run src/lib/result.test.ts`
Expected: PASS (7 testes: 4 de `fetchText` já existentes + 3 novos de `fetchFinalUrl`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/result.ts src/lib/result.test.ts
git commit -m "feat: adiciona fetchFinalUrl (URL final pós-redirect) em lib/result"
```

---

## Task 5: Plumbing de rede — detecção de login por URL, gate, wrapper de mensagem

**Files:**
- Modify: `src/lib/sessionGate.ts`
- Modify: `src/lib/sessionGate.test.ts`
- Modify: `src/background/sessionGate.ts`
- Create: `src/lib/mensagensLink.ts`
- Create: `src/lib/fetchFinalUrlViaBackground.ts`

**Interfaces:**
- Consumes: `fetchFinalUrl` (Task 4), `Result<T>` (`lib/result.ts`).
- Produces: `ehUrlDeLogin(url: string): boolean` (`lib/sessionGate.ts`);
  `fetchFinalUrlComGate(url: string, options?: FetchWithTimeoutOptions): Promise<Result<string>>`
  (`background/sessionGate.ts`); constantes `TIPO_LINK_SELECAO_ESTADO`, `TIPO_LINK_SELECAO_CONVERTER`,
  `TIPO_FETCH_SEI_FINAL_URL` (`lib/mensagensLink.ts`); `fetchFinalUrl(url, options): Promise<Result<string>>`
  do lado do content-script (`lib/fetchFinalUrlViaBackground.ts`, mesmo nome de `fetchViaBackground.ts`
  mas em arquivo/módulo diferente).

- [ ] **Step 1: Escrever o teste de `ehUrlDeLogin` primeiro**

Adicionar a `src/lib/sessionGate.test.ts`, junto do import existente:

```ts
import { ehPaginaDeLogin, ehUrlDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from './sessionGate'
```

```ts
describe('ehUrlDeLogin', () => {
  it('retorna true quando a URL final aponta para a tela de login', () => {
    expect(ehUrlDeLogin('https://exemplo.br/sei/login.php?sigla_sistema=SEI')).toBe(true)
  })

  it('retorna false quando a URL final é uma página normal do SEI', () => {
    expect(
      ehUrlDeLogin('https://exemplo.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=123')
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/sessionGate.test.ts`
Expected: FAIL — `ehUrlDeLogin is not a function`.

- [ ] **Step 3: Implementar `ehUrlDeLogin`**

Em `src/lib/sessionGate.ts`, adicionar (mesmo arquivo, junto de `ehPaginaDeLogin`):

```ts
export function ehUrlDeLogin(url: string): boolean {
  return url.includes('login.php')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/sessionGate.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos).

- [ ] **Step 5: Criar as constantes de mensagem compartilhadas**

Criar `src/lib/mensagensLink.ts`:

```ts
// Tipos de mensagem compartilhados entre background/index.ts e
// content-scripts/documento_editar/referenciaLink.ts -- compartilhados só em tempo de build (cada
// contexto é bundlado separadamente), mesmo padrão de protocolo.ts pro par main/isolated world.
export const TIPO_LINK_SELECAO_ESTADO = 'seirmg:link-selecao-estado'
export const TIPO_LINK_SELECAO_CONVERTER = 'seirmg:link-selecao-converter'
export const TIPO_FETCH_SEI_FINAL_URL = 'seirmg:fetch-sei-final-url'
```

- [ ] **Step 6: Implementar `fetchFinalUrlComGate`**

Em `src/background/sessionGate.ts`, atualizar o import do topo e adicionar a função nova ao final do
arquivo:

```ts
import { fetchText, fetchFinalUrl, type FetchWithTimeoutOptions, type Result } from '../lib/result'
import { createLocalConfigStore } from '../lib/storage'
import { ehPaginaDeLogin, ehUrlDeLogin, calcularEsperaPosNavegacao, circuitBreakerAberto } from '../lib/sessionGate'
import { notificarSessaoInvalida } from './notifications/notify'
```

```ts
export function fetchFinalUrlComGate(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  return serializar(async () => {
    try {
      const config = await createLocalConfigStore().get()
      const agoraIso = new Date().toISOString()

      if (circuitBreakerAberto(config.sessaoInvalidaAte, agoraIso)) {
        return { ok: false, error: 'Sessão do SEI inválida — chamadas de fundo pausadas temporariamente' }
      }

      const espera = calcularEsperaPosNavegacao(config.ultimaNavegacaoRealSei, agoraIso, ATRASO_POS_NAVEGACAO_MS)
      if (espera > 0) await aguardar(espera)

      const resultado = await fetchFinalUrl(url, options)
      if (resultado.ok && ehUrlDeLogin(resultado.data)) {
        await abrirCircuitBreaker()
        return { ok: false, error: 'Sessão do SEI inválida (tela de login detectada)' }
      }

      return resultado
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
```

- [ ] **Step 7: Criar o wrapper do lado do content-script**

Criar `src/lib/fetchFinalUrlViaBackground.ts`:

```ts
import type { Result } from './result'
import { TIPO_FETCH_SEI_FINAL_URL } from './mensagensLink'

export async function fetchFinalUrl(
  url: string,
  options: { method?: string; body?: URLSearchParams } = {}
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: TIPO_FETCH_SEI_FINAL_URL,
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

- [ ] **Step 8: Checar tipos e rodar toda a suíte**

Run: `npm run typecheck && npm test`
Expected: sem erros; todos os testes existentes + os novos de `ehUrlDeLogin`/`fetchFinalUrl`
continuam passando.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sessionGate.ts src/lib/sessionGate.test.ts src/background/sessionGate.ts \
  src/lib/mensagensLink.ts src/lib/fetchFinalUrlViaBackground.ts
git commit -m "feat: plumbing de rede pra pesquisar número SEI (gate + wrapper + constantes)"
```

---

## Task 6: Ícone "esperto" — `background/index.ts`

**Files:**
- Modify: `src/background/index.ts`

**Interfaces:**
- Consumes: `fetchFinalUrlComGate` (Task 5, `./sessionGate`), `TIPO_LINK_SELECAO_ESTADO`,
  `TIPO_LINK_SELECAO_CONVERTER`, `TIPO_FETCH_SEI_FINAL_URL` (Task 5, `../lib/mensagensLink`).
- Produces: handler de mensagem que alterna `chrome.action.setPopup` por aba;
  `chrome.action.onClicked` que reenvia `TIPO_LINK_SELECAO_CONVERTER` pra aba clicada; handler de
  `TIPO_FETCH_SEI_FINAL_URL` que delega pra `fetchFinalUrlComGate`.

Este arquivo não tem teste dedicado hoje (`background/index.ts` não aparece em nenhum
`*.test.ts` — só a lógica pura que ele importa, ex. `blocoAssinaturaPipeline.ts`, é testada). Mantém
o mesmo padrão: sem teste novo aqui, cobertura via os módulos puros já testados nas tasks anteriores.

- [ ] **Step 1: Atualizar imports do topo do arquivo**

```ts
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchTextComGate, fetchFinalUrlComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
import { fetchText } from '../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { TIPO_LINK_SELECAO_ESTADO, TIPO_LINK_SELECAO_CONVERTER, TIPO_FETCH_SEI_FINAL_URL } from '../lib/mensagensLink'
import {
  NOTIFICATION_ID_PREFIX,
  NOTIFICATION_ID_LEMBRETE_BLOCO_ASSINATURA,
  NOTIFICATION_ID_BLOCO_DISPONIBILIZADO_PREFIX,
  NOTIFICATION_ID_TAREFA_VENCIDA_PREFIX,
  notificarLembreteBlocoAssinatura,
  notificarBlocoDisponibilizado,
} from './notifications/notify'
import { processarTarefasVencidas } from './tarefasPipeline'
import { ALARME_LEMBRETE_BLOCO_ASSINATURA, agendarLembreteBlocoAssinatura } from './lembreteBlocoAssinatura'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
```

- [ ] **Step 2: Adicionar os tipos e type guards das mensagens novas**

Junto das outras interfaces `Mensagem*`/funções `ehMensagem*` já existentes (por volta da linha 54):

```ts
interface MensagemFetchSeiFinalUrl {
  type: typeof TIPO_FETCH_SEI_FINAL_URL
  url: string
  method?: string
  body?: string
}

interface MensagemLinkSelecaoEstado {
  type: typeof TIPO_LINK_SELECAO_ESTADO
  ativo: boolean
}
```

```ts
function ehMensagemFetchSeiFinalUrl(mensagem: unknown): mensagem is MensagemFetchSeiFinalUrl {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === TIPO_FETCH_SEI_FINAL_URL
  )
}

function ehMensagemLinkSelecaoEstado(mensagem: unknown): mensagem is MensagemLinkSelecaoEstado {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === TIPO_LINK_SELECAO_ESTADO
  )
}
```

- [ ] **Step 3: Adicionar os listeners novos**

Junto dos outros `chrome.runtime.onMessage.addListener`/`chrome.action.*` já existentes, adicionar ao
final do arquivo (antes do listener de `chrome.notifications.onClicked`):

```ts
const POPUP_PADRAO_ICONE = 'src/popup/index.html'

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchSeiFinalUrl(mensagem)) return false
  fetchFinalUrlComGate(mensagem.url, {
    method: mensagem.method,
    body: mensagem.body !== undefined ? new URLSearchParams(mensagem.body) : undefined,
    headers: mensagem.body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
  })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})

chrome.runtime.onMessage.addListener((mensagem, remetente) => {
  if (!ehMensagemLinkSelecaoEstado(mensagem) || !remetente.tab?.id) return
  chrome.action
    .setPopup({ tabId: remetente.tab.id, popup: mensagem.ativo ? '' : POPUP_PADRAO_ICONE })
    .catch((error) => {
      console.error('[SEIRMG] Falha ao alternar popup do ícone da extensão:', error)
    })
})

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return
  chrome.tabs.sendMessage(tab.id, { type: TIPO_LINK_SELECAO_CONVERTER }).catch((error) => {
    console.error('[SEIRMG] Falha ao avisar a aba pra converter seleção em link:', error)
  })
})
```

- [ ] **Step 4: Checar tipos**

Run: `npm run typecheck`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/background/index.ts
git commit -m "feat: ícone da extensão alterna entre popup normal e conversão de link"
```

---

## Task 7: Evento de mudança de seleção na ponte CKEditor

**Files:**
- Modify: `src/content-scripts/documento_editar/protocolo.ts`
- Modify: `src/content-scripts/documento_editar/pontePrincipal.ts`
- Modify: `src/content-scripts/documento_editar/ponteEditor.ts`
- Modify: `src/content-scripts/documento_editar/ponteEditor.test.ts`

**Interfaces:**
- Produces: `EVENTO_SELECAO_MUDOU` + `interface DetalheSelecaoMudou { texto: string }`
  (`protocolo.ts`); `ClienteEditor.aoMudarSelecao(ouvinte: (texto: string) => void): () => void`
  (`ponteEditor.ts`).

- [ ] **Step 1: Adicionar o evento/tipo ao protocolo**

Em `src/content-scripts/documento_editar/protocolo.ts`, adicionar depois de `EVENTO_RESPOSTA`:

```ts
export const EVENTO_RESPOSTA = 'seirmg:resposta-editor'
export const EVENTO_SELECAO_MUDOU = 'seirmg:selecao-editor-mudou'
```

E depois de `DetalhePronto`:

```ts
export interface DetalhePronto {
  nome: string
}

export interface DetalheSelecaoMudou {
  texto: string
}
```

- [ ] **Step 2: Escrever o teste de `aoMudarSelecao` primeiro**

Em `src/content-scripts/documento_editar/ponteEditor.test.ts`, atualizar o import do protocolo:

```ts
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA, EVENTO_SELECAO_MUDOU } from './protocolo'
```

E adicionar dentro do `describe('criarClienteEditor', ...)`, junto dos outros `it(...)`:

```ts
  it('aoMudarSelecao chama o ouvinte com o texto do evento e permite cancelar', () => {
    cliente = criarClienteEditor(window)
    const chamadas: string[] = []
    const cancelar = cliente.aoMudarSelecao((texto) => chamadas.push(texto))

    window.dispatchEvent(new CustomEvent(EVENTO_SELECAO_MUDOU, { detail: { texto: 'abc' } }))
    expect(chamadas).toEqual(['abc'])

    cancelar()
    window.dispatchEvent(new CustomEvent(EVENTO_SELECAO_MUDOU, { detail: { texto: 'def' } }))
    expect(chamadas).toEqual(['abc'])
  })
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/content-scripts/documento_editar/ponteEditor.test.ts`
Expected: FAIL — `cliente.aoMudarSelecao is not a function`.

- [ ] **Step 4: Implementar `aoMudarSelecao` em `ponteEditor.ts`**

Atualizar o import do topo:

```ts
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA, EVENTO_SELECAO_MUDOU } from './protocolo'
import type {
  DescritorEstiloTexto,
  DetalheComando,
  DetalhePronto,
  DetalheResposta,
  DetalheSelecaoMudou,
  TipoComando,
} from './protocolo'
```

Atualizar a interface `ClienteEditor`:

```ts
export interface ClienteEditor {
  aguardarEditorPronto: (documentoGlobal?: Document) => Promise<EditorSEI>
  aoMudarSelecao: (ouvinte: (texto: string) => void) => () => void
  destruir: () => void
}
```

Dentro de `criarClienteEditor`, junto das outras variáveis de estado (`pendentes`, `ultimoPronto`
etc.), adicionar:

```ts
  const ouvintesSelecao = new Set<(texto: string) => void>()

  function tratarSelecaoMudou(evento: Event): void {
    const detalhe = (evento as CustomEvent<DetalheSelecaoMudou>).detail
    ouvintesSelecao.forEach((ouvinte) => ouvinte(detalhe.texto))
  }
```

Junto dos outros `janelaGlobal.addEventListener(...)` já existentes:

```ts
  janelaGlobal.addEventListener(EVENTO_RESPOSTA, tratarResposta)
  janelaGlobal.addEventListener(EVENTO_PRONTO, tratarPronto)
  janelaGlobal.addEventListener(EVENTO_SELECAO_MUDOU, tratarSelecaoMudou)
```

E no objeto retornado por `criarClienteEditor`:

```ts
  return {
    aguardarEditorPronto,
    aoMudarSelecao(ouvinte: (texto: string) => void): () => void {
      ouvintesSelecao.add(ouvinte)
      return () => ouvintesSelecao.delete(ouvinte)
    },
    destruir(): void {
      janelaGlobal.removeEventListener(EVENTO_RESPOSTA, tratarResposta)
      janelaGlobal.removeEventListener(EVENTO_PRONTO, tratarPronto)
      janelaGlobal.removeEventListener(EVENTO_SELECAO_MUDOU, tratarSelecaoMudou)
      ouvintesSelecao.clear()
    },
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/content-scripts/documento_editar/ponteEditor.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo o novo).

- [ ] **Step 6: Disparar o evento a partir do main world, em `pontePrincipal.ts`**

Atualizar o import do topo:

```ts
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA, EVENTO_SELECAO_MUDOU } from './protocolo'
import type { DescritorEstiloTexto, DetalheComando, DetalheResposta, DetalhePronto, DetalheSelecaoMudou, TipoComando } from './protocolo'
```

Adicionar `on` à interface `InstanciaCKEditor` (é o método de assinatura de evento nativo do
CKEditor 4, já usado internamente pelo próprio SEI):

```ts
interface InstanciaCKEditor {
  name: string
  getSelection: () => SelecaoCKEditor | null
  insertHtml: (html: string) => void
  insertText: (texto: string) => void
  editable?: () => { getText: () => string } | undefined
  document: { getBody: () => { $: HTMLElement }; getWindow: () => { $: Window } }
  fire: (evento: string) => void
  applyStyle: (estilo: unknown) => void
  execCommand: (nome: string) => void
  on: (evento: string, callback: () => void) => void
}
```

Adicionar a função que dispara o evento, junto das outras funções auxiliares do arquivo:

```ts
function dispararSelecaoMudou(janelaGlobal: Window, instancia: InstanciaCKEditor): void {
  const texto = instancia.getSelection?.()?.getSelectedText() ?? ''
  const detalhe: DetalheSelecaoMudou = { texto }
  janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_SELECAO_MUDOU, { detail: detalhe }))
}
```

Em `tentarAnunciar`, registrar o listener assim que a instância é encontrada (logo depois de
`instanciaAtual = instancia`):

```ts
  function tentarAnunciar(tentativasRestantes: number): void {
    const instancia = obterInstanciaEditavel(janelaGlobal)
    if (instancia) {
      instanciaAtual = instancia
      instancia.on('selectionChange', () => dispararSelecaoMudou(janelaGlobal, instancia))
      if (marcarIframeDaInstancia(instancia)) {
        reanunciarPeriodicamente(reanunciosMax)
        return
      }
    }
    if (tentativasRestantes <= 0) {
      if (instanciaAtual) reanunciarPeriodicamente(reanunciosMax)
      return
    }
    temporizador = setTimeout(() => tentarAnunciar(tentativasRestantes - 1), intervaloMs)
  }
```

Este arquivo (`pontePrincipal.ts`) roda no main world contra um `window.CKEDITOR` real — igual ao
resto da ponte (Lote R), não é testável de forma significativa fora de uma instância SEI real. Sem
teste novo aqui; a parte testável (`ponteEditor.ts`, isolated world) já foi cobrida no Step 5.

- [ ] **Step 7: Checar tipos e rodar toda a suíte**

Run: `npm run typecheck && npm test`
Expected: sem erros; suíte completa passando.

- [ ] **Step 8: Commit**

```bash
git add src/content-scripts/documento_editar/protocolo.ts \
  src/content-scripts/documento_editar/pontePrincipal.ts \
  src/content-scripts/documento_editar/ponteEditor.ts \
  src/content-scripts/documento_editar/ponteEditor.test.ts
git commit -m "feat: ponte CKEditor propaga mudança de seleção (main world -> isolated world)"
```

---

## Task 8: Toast de sucesso/erro

**Files:**
- Modify: `src/content-scripts/documento_editar/dom.ts`
- Create: `src/content-scripts/documento_editar/toast.ts`

**Interfaces:**
- Produces: `escaparHtml(texto: string): string` (movido pra `dom.ts`, compartilhado);
  `mostrarToastSucesso(mensagem: string): void`, `mostrarToastErro(mensagem: string): void`
  (`toast.ts`).

Sem teste dedicado — é UI pura de DOM/CSS (mesmo tratamento já dado ao menu do corretor ortográfico,
`corretorOrtografico.ts`, que também não tem teste específico pra sua parte visual).

- [ ] **Step 1: Mover `escaparHtml` pra `dom.ts` (compartilhado)**

Em `src/content-scripts/documento_editar/dom.ts`, adicionar:

```ts
export function injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void {
  if (documentoAlvo.getElementById(id)) return
  const estilo = documentoAlvo.createElement('style')
  estilo.id = id
  estilo.textContent = css
  documentoAlvo.head.appendChild(estilo)
}

export function escaparHtml(texto: string): string {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}
```

Em `src/content-scripts/documento_editar/index.ts`: remover a definição local de `escaparHtml`
(linhas 306-310 hoje) e importar de `dom.ts` — atualizar o import do topo do arquivo:

```ts
import { criarClienteEditor, type EditorSEI } from './ponteEditor'
import { escaparHtml } from './dom'
```

- [ ] **Step 2: Criar o módulo de toast**

Criar `src/content-scripts/documento_editar/toast.ts`:

```ts
import { escaparHtml, injetarEstiloSeAusente } from './dom'

const ID_ESTILO = 'seirmg-estilo-toast-referencia-link'
const ID_CONTAINER = 'seirmg-toast-referencia-link'
const DURACAO_SUCESSO_MS = 3000

const ESTILO_TOAST = `
  #${ID_CONTAINER} {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  #${ID_CONTAINER} .seirmg-toast-card {
    pointer-events: auto;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    color: #222;
    max-width: 360px;
  }
  #${ID_CONTAINER} .seirmg-toast-card.erro {
    border-left: 4px solid #dc3545;
  }
  #${ID_CONTAINER} .seirmg-toast-icone {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
  }
  #${ID_CONTAINER} .seirmg-toast-icone.sucesso {
    background: #017fff;
  }
  #${ID_CONTAINER} .seirmg-toast-icone.erro {
    background: #dc3545;
  }
  #${ID_CONTAINER} .seirmg-toast-texto {
    flex: 1;
  }
  #${ID_CONTAINER} .seirmg-toast-fechar {
    color: #999;
    font-weight: bold;
    cursor: pointer;
    margin-left: 4px;
  }
`

function removerToastAtual(): void {
  document.getElementById(ID_CONTAINER)?.remove()
}

function montarToast(html: string): HTMLElement {
  injetarEstiloSeAusente(document, ID_ESTILO, ESTILO_TOAST)
  removerToastAtual()
  const container = document.createElement('div')
  container.id = ID_CONTAINER
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

export function mostrarToastSucesso(mensagem: string): void {
  const container = montarToast(`
    <div class="seirmg-toast-card">
      <span class="seirmg-toast-icone sucesso">✓</span>
      <span class="seirmg-toast-texto">${escaparHtml(mensagem)}</span>
    </div>
  `)
  setTimeout(() => container.remove(), DURACAO_SUCESSO_MS)
}

export function mostrarToastErro(mensagem: string): void {
  const container = montarToast(`
    <div class="seirmg-toast-card erro">
      <span class="seirmg-toast-icone erro">⚠</span>
      <span class="seirmg-toast-texto">${escaparHtml(mensagem)}</span>
      <span class="seirmg-toast-fechar">✕</span>
    </div>
  `)
  container.querySelector('.seirmg-toast-fechar')?.addEventListener('click', () => container.remove())
}
```

- [ ] **Step 3: Checar tipos**

Run: `npm run typecheck`
Expected: sem erros (confirma que `index.ts` compila importando `escaparHtml` de `dom.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/documento_editar/dom.ts \
  src/content-scripts/documento_editar/toast.ts \
  src/content-scripts/documento_editar/index.ts
git commit -m "feat: toast de sucesso/erro centralizado (mockup aprovado no brainstorming)"
```

---

## Task 9: Feature completa — `referenciaLink.ts`

**Files:**
- Create: `src/content-scripts/documento_editar/referenciaLink.ts`

**Interfaces:**
- Consumes: `candidatoANumeroSei`, `extrairDigitos` (Task 2); `construirLinkResultado` (Task 3);
  `fetchFinalUrl` (Task 5, `lib/fetchFinalUrlViaBackground.ts`); `TIPO_LINK_SELECAO_ESTADO`,
  `TIPO_LINK_SELECAO_CONVERTER` (Task 5, `lib/mensagensLink.ts`); `ClienteEditor`, `EditorSEI` (Task 7,
  `ponteEditor.ts`); `mostrarToastSucesso`, `mostrarToastErro` (Task 8, `toast.ts`); `escaparHtml`
  (Task 8, `dom.ts`).
- Produces: `iniciarReferenciaLink(cliente: ClienteEditor, editor: EditorSEI): void`.

Sem teste dedicado — orquestra `chrome.runtime`/`window.opener`/rede real, mesmo tratamento de
"pendente de validação manual numa instância SEI real" já dado à ponte CKEditor (Lote R) e ao alerta
de bloco de assinatura (Lote Q). A lógica pura que ele usa (números, link) já está testada nas Tasks
2 e 3.

- [ ] **Step 1: Implementar**

Criar `src/content-scripts/documento_editar/referenciaLink.ts`:

```ts
import { candidatoANumeroSei, extrairDigitos } from '../../features/referencia-link/numero'
import { construirLinkResultado } from '../../features/referencia-link/link'
import { fetchFinalUrl } from '../../lib/fetchFinalUrlViaBackground'
import { TIPO_LINK_SELECAO_CONVERTER, TIPO_LINK_SELECAO_ESTADO } from '../../lib/mensagensLink'
import { escaparHtml } from './dom'
import { mostrarToastErro, mostrarToastSucesso } from './toast'
import type { ClienteEditor, EditorSEI } from './ponteEditor'

// Igual a editor_montar/index.ts (obterIframeArvoreViaOpener): a tela de edição de documento do
// SEI abre como janela separada, com `window.opener` apontando pra janela que a abriu -- e essa
// janela pode por sua vez estar dentro de outro frame, por isso o `.parent` extra. Só no frame de
// topo da janela do editor (window === window.top) essa relação existe; nos iframes internos dela
// (um por campo do documento) `window.opener` não teria nenhuma relação útil.
function localizarFormularioPesquisaRapida(): HTMLFormElement | null {
  if (window !== window.top) return null
  try {
    const janelaAbridora = window.opener as Window | null
    const documentoAbridor = janelaAbridora?.parent?.document
    return documentoAbridor?.querySelector<HTMLFormElement>('#frmProtocoloPesquisaRapida') ?? null
  } catch (error) {
    console.error('[SEIRMG] Falha ao acessar a pesquisa rápida via window.opener:', error)
    return null
  }
}

async function converterSelecaoEmLink(editor: EditorSEI): Promise<void> {
  const textoSelecionado = await editor.obterTextoSelecionado()
  if (!candidatoANumeroSei(textoSelecionado)) return

  const digitos = extrairDigitos(textoSelecionado)

  const formulario = localizarFormularioPesquisaRapida()
  if (!formulario) {
    mostrarToastErro('Não foi possível localizar a pesquisa do SEI')
    return
  }

  const resultado = await fetchFinalUrl(formulario.action, {
    method: 'POST',
    body: new URLSearchParams({ txtPesquisaRapida: digitos }),
  })

  if (!resultado.ok) {
    mostrarToastErro(`Erro ao pesquisar número "${digitos}" no SEI: ${resultado.error}`)
    return
  }

  const link = construirLinkResultado(resultado.data)
  if (!link) {
    mostrarToastErro(`Número "${digitos}" não encontrado no SEI`)
    return
  }

  await editor.inserirHtml(`<a href="${link.href}" target="_blank">${escaparHtml(textoSelecionado)}</a>`)
  mostrarToastSucesso('Link inserido no documento')
}

export function iniciarReferenciaLink(cliente: ClienteEditor, editor: EditorSEI): void {
  cliente.aoMudarSelecao((texto) => {
    const ativo = candidatoANumeroSei(texto)
    chrome.runtime.sendMessage({ type: TIPO_LINK_SELECAO_ESTADO, ativo }).catch((error) => {
      console.error('[SEIRMG] Falha ao avisar estado de seleção de link:', error)
    })
  })

  chrome.runtime.onMessage.addListener((mensagem) => {
    if ((mensagem as { type?: unknown })?.type !== TIPO_LINK_SELECAO_CONVERTER) return
    converterSelecaoEmLink(editor).catch((error) => {
      console.error('[SEIRMG] Falha ao converter seleção em link:', error)
      mostrarToastErro('Erro inesperado ao converter seleção em link')
    })
  })

  window.addEventListener('pagehide', () => {
    chrome.runtime.sendMessage({ type: TIPO_LINK_SELECAO_ESTADO, ativo: false }).catch(() => undefined)
  })
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/documento_editar/referenciaLink.ts
git commit -m "feat: converte seleção em link SEI ao clicar no ícone da extensão"
```

---

## Task 10: Ativar o recurso no bootstrap do editor

**Files:**
- Modify: `src/content-scripts/documento_editar/index.ts`

**Interfaces:**
- Consumes: `iniciarReferenciaLink` (Task 9), `config.referenciaLink` (Task 1).

- [ ] **Step 1: Importar e ativar dentro de `bootstrap()`**

Em `src/content-scripts/documento_editar/index.ts`, dentro de `bootstrap()` (por volta da linha
611-638), depois do bloco de `formatacaoBasica`:

```ts
    if (formatacaoBasica.ativo) {
      const { iniciarFormatacaoBasica } = await import('./formatacaoBasica')
      await iniciarFormatacaoBasica(editor, formatacaoBasica)
    }

    if (config.referenciaLink.ativo) {
      const { iniciarReferenciaLink } = await import('./referenciaLink')
      iniciarReferenciaLink(clienteEditorGlobal, editor)
    }
```

E atualizar a condição de saída antecipada logo no início de `bootstrap()`, que hoje é:

```ts
    if (!config.ferramentasIA.ativo && !config.corretorOrtografico.ativo && !formatacaoBasica.ativo) return
```

para:

```ts
    if (
      !config.ferramentasIA.ativo &&
      !config.corretorOrtografico.ativo &&
      !formatacaoBasica.ativo &&
      !config.referenciaLink.ativo
    ) {
      return
    }
```

- [ ] **Step 2: Checar tipos e rodar toda a suíte**

Run: `npm run typecheck && npm test`
Expected: sem erros; suíte completa passando.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/documento_editar/index.ts
git commit -m "feat: ativa referenciaLink no bootstrap do editor de documentos"
```

---

## Task 11: Toggle na tela de Opções

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, dentro de `<section id="painel-editor" class="painel">`, logo antes do
`<button id="editor-salvar">` (depois do bloco "Formatação Básica"):

```html
      <h3>Referência a Processo/Documento</h3>
      <label>
        <input type="checkbox" id="editor-referencia-link-ativo" />
        Ao selecionar um número de processo/documento no texto e clicar no ícone da extensão,
        converter a seleção em link do SEI automaticamente
      </label>
      <br />
      <button id="editor-salvar">Salvar</button>
      <span id="editor-status"></span>
```

- [ ] **Step 2: Ler e salvar o campo em `carregarAbaEditorDocumentos` (`src/options/main.ts`)**

Adicionar, junto das outras referências de input dessa função (por volta da linha 399-404):

```ts
    const inputReferenciaLinkAtivo = document.getElementById(
      'editor-referencia-link-ativo'
    ) as HTMLInputElement | null
```

Adicionar, junto de `if (inputFormatacaoBasicaAtivo) { ... }` (carregamento inicial):

```ts
    if (inputReferenciaLinkAtivo) {
      inputReferenciaLinkAtivo.checked = config.referenciaLink.ativo
    }
```

E dentro do handler de `editor-salvar`, no objeto `atualizado` (junto de `formatacaoBasica`):

```ts
        const atualizado = {
          ...config,
          documentoExterno: {
            ativo: inputAtivo?.checked ?? true,
            formato: (selectFormato?.value ?? 'N') as FormatoDocumento,
            tipoConferencia: inputTipoConferencia?.value ?? '',
            nivelAcesso: (selectNivelAcesso?.value ?? 'P') as NivelAcessoDocumento,
            hipoteseLegal: inputHipoteseLegal?.value ?? '',
            tipoDocumentoPadraoArrastar: inputTipoPadraoArrastar?.value.trim() || 'Anexo',
          },
          formatacaoBasica: {
            ...formatacaoBasica,
            ativo: inputFormatacaoBasicaAtivo?.checked ?? false,
            atalhos: parsearAtalhos(inputFormatacaoBasicaAtalhos?.value ?? ''),
          },
          referenciaLink: {
            ativo: inputReferenciaLinkAtivo?.checked ?? false,
          },
        }
```

- [ ] **Step 3: Checar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat: toggle de referência a processo/documento na tela de Opções"
```

---

## Task 12: Roadmap

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

- [ ] **Step 1: Atualizar a entrada do item J**

Na linha do item `J` (tabela "Roteiro", por volta da linha 207), atualizar a célula de descrição pra
registrar esta sub-entrega, mantendo o resto do texto já presente:

Trocar o início da célula de:

```
| J | **Editor de documentos — recursos avançados** | QR Code, hashcode/verificação de integridade, link de documento público, link curto, link de legislação federal, Legística, referência interna/a documentos do processo, ~30 campos dinâmicos, ...
```

para:

```
| J | **Editor de documentos — recursos avançados** | ~~Referência a documentos do processo (selecionar número no texto + clicar no ícone da extensão converte em hyperlink SEI)~~ — spec `docs/superpowers/specs/2026-07-24-seirmg-link-automatico-selecao-icone-design.md`, plano `docs/superpowers/plans/2026-07-24-seirmg-link-automatico-selecao-icone.md`. QR Code, hashcode/verificação de integridade, link de documento público, link curto, link de legislação federal, Legística, ~30 campos dinâmicos, ...
```

(mantém literalmente o restante do conteúdo da célula depois de "Legística," sem remover nada — só
risca o item já entregue e insere a referência à spec/plano, seguindo o mesmo padrão usado em outras
linhas da tabela "Já entregue".)

- [ ] **Step 2: Commit**

```bash
git add docs/ROADMAP-LOTES.md
git commit -m "docs: marca referência a processo/documento (Lote J) como entregue no roadmap"
```

---

## Validação final (checklist, não substitui teste ao vivo)

- [ ] `npm run typecheck` limpo
- [ ] `npm test` (suíte completa) verde
- [ ] `npm run lint` limpo
- [ ] `npm run build` gera `dist/` sem erros
- [ ] Extensão carregada no Chrome via `dist/`, opção "Referência a Processo/Documento" ativada nas
      Opções, e os itens da seção "Riscos e validação" da spec checados numa instância SEI real:
      existência de `#frmProtocoloPesquisaRapida`, presença de `window.opener` na janela do editor,
      link de documento sem hash funcionando, ícone alternando popup/conversão corretamente,
      seleção sobrevivendo ao clique no ícone fora do iframe.
