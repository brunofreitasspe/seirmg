# SEIRMG — Lote K: Ferramentas de IA no editor de documentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um painel de IA na tela de edição de documento do SEI, com ChatGPT/Gemini/Claude por API oficial (chave própria do usuário) e JusIA por link de atalho, com confirmação obrigatória de "não sigiloso" a cada uso e resposta sempre em pré-visualização antes de inserir no documento.

**Architecture:** Primeiro content script do projeto pra tela de edição de documento (CKEditor 4) — não existe `acao=` único conhecido pra essa tela, então usa o mesmo match amplo do `core` (`*controlador.php?acao=*`) e detecta a presença do editor via polling do global `CKEDITOR`, mesma técnica do Sei Pro original (`sei-pro-editor.js`). Chamadas às APIs de IA (`api.openai.com`/`generativelanguage.googleapis.com`/`api.anthropic.com`) passam pelo background via relay de mensagem (`seirmg:fetch-ia`, mesmo padrão de `seirmg:fetch-sei` já existente) — são requisições completamente diferentes das que causaram os problemas de deslogamento do SEI (`controlador.php`), não passam pelo `sessionGate`. Lógica pura (montagem de prompt, montagem/parse de requisição por provedor) isolada em `src/features/ferramentas-ia/`, testável sem rede/DOM; wiring de CKEditor/painel no content script sem teste direto (mesma política já aplicada ao resto do projeto).

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Bun, Vitest (`environment: 'jsdom'`), Lucide static icons + `@lobehub/icons-static-svg` (ícones oficiais OpenAI/Gemini/Claude, MIT).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-11-seirmg-lote-k-ferramentas-ia-design.md`.
- **Nunca automatizar/raspar a sessão de consumidor** de `chat.openai.com`/`gemini.google.com`/`claude.ai`/`ia.jusbrasil.com.br`/`notebooklm.google.com` — decisão de princípio, não implementar nada nessa linha em nenhuma task.
- ChatGPT/Gemini/Claude: API oficial, chave de API do próprio usuário guardada em `SyncConfig.ferramentasIA`. JusIA: sem API — copia texto selecionado + abre `https://ia.jusbrasil.com.br` numa aba nova, sem chamada de rede nossa. NotebookLM fora de escopo (sem chave de API simples disponível).
- **Confirmação explícita obrigatória a cada uso** ("Confirmo que este documento não é sigiloso/restrito") é a trava principal e confiável — nunca substituir por só detecção automática. Detecção automática do ícone de restrição de acesso (quando localizável com confiança pro documento atual) é um bloqueio **adicional**, não a única trava.
- Resposta da IA **nunca** insere automaticamente no documento — sempre aparece em pré-visualização com botões "Inserir"/"Descartar".
- Ícones oficiais: OpenAI (`openai.svg`), Gemini (`gemini-color.svg`), Claude (`claude-color.svg`) via `@lobehub/icons-static-svg` (import `?raw`, mesmo padrão de `lucide-static`), embutidos no bundle. JusIA usa `<img src="https://ia.jusbrasil.com.br/favicon.ico">` carregado ao vivo — nunca bundlar o logo deles (sem licença clara).
- `ferramentasIA.ativo` default `false` — opt-in, mesmo precedente de `favoritos`/`rolagemInfinita` (muda a tela estruturalmente, tem implicação de custo/privacidade real).
- Modelo por provedor é campo de texto livre nas Opções (não dropdown alimentado por API) — YAGNI, evita ficar preso a uma lista de modelos desatualizada.
- Todo código que chama `chrome.*`/faz I/O assíncrono num listener/top-level script deve ter try/catch (log via `console.error('[SEIRMG] ...', error)`, nunca rethrow) — política já estabelecida no projeto.

---

### Task 1: Storage — tipos e config padrão de Ferramentas de IA

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Produces: `export type ProvedorIA = 'openai' | 'gemini' | 'claude'`, `export interface ProvedorIAConfig { apiKey: string; modelo: string }`, `export interface FerramentasIAConfig { ativo: boolean; provedorAtivo: ProvedorIA; openai: ProvedorIAConfig; gemini: ProvedorIAConfig; claude: ProvedorIAConfig }`. `SyncConfig` ganha `ferramentasIA: FerramentasIAConfig`. Tasks 2-7 consomem `ProvedorIA`/`ProvedorIAConfig`/`FerramentasIAConfig` importados de `../../lib/storage` (ou `../lib/storage` dependendo da profundidade).

- [ ] **Step 1: Escrever/atualizar os testes (devem falhar)**

Em `src/lib/storage.test.ts`, encontre o teste que verifica o `SyncConfig` padrão (provavelmente algo como `'inclui SyncConfig padrão quando vazio'` ou similar, comparando `await store.get()` inteiro ou por seções — procure por `documentoExterno: {` no arquivo de teste pra achar o teste certo) e adicione `ferramentasIA` ao objeto esperado:

```ts
      ferramentasIA: {
        ativo: false,
        provedorAtivo: 'openai',
        openai: { apiKey: '', modelo: 'gpt-4o-mini' },
        gemini: { apiKey: '', modelo: 'gemini-2.0-flash' },
        claude: { apiKey: '', modelo: 'claude-3-5-haiku-20241022' },
      },
```

Também adicione um novo teste, no mesmo padrão dos outros testes de "persiste alteração de X" já existentes no arquivo (copie a estrutura de um teste de persistência existente, ex. o de `controleProcessos.favoritos` ou `documentoExterno`):

```ts
  it('persiste alteração de ferramentasIA', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      ferramentasIA: {
        ativo: true,
        provedorAtivo: 'claude' as const,
        openai: { apiKey: 'sk-teste', modelo: 'gpt-4o-mini' },
        gemini: { apiKey: '', modelo: 'gemini-2.0-flash' },
        claude: { apiKey: 'sk-ant-teste', modelo: 'claude-3-5-haiku-20241022' },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

(Use a mesma função `criarAreaFalsa()` e o mesmo import de `DEFAULT_SYNC_CONFIG`/`createSyncConfigStore` já presentes no topo do arquivo de teste existente.)

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `ferramentasIA` não existe em `ControleProcessosConfig`/`SyncConfig`, e o teste de persistência falha por `TypeScript`/comparação incompleta.

- [ ] **Step 3: Adicionar os tipos e o valor padrão em `storage.ts`**

Em `src/lib/storage.ts`, logo após a interface `DocumentoExternoConfig` (linhas 92-99) e antes de `SyncConfig` (linha 101), adicione:

```ts
export type ProvedorIA = 'openai' | 'gemini' | 'claude'

export interface ProvedorIAConfig {
  apiKey: string
  modelo: string
}

export interface FerramentasIAConfig {
  ativo: boolean
  provedorAtivo: ProvedorIA
  openai: ProvedorIAConfig
  gemini: ProvedorIAConfig
  claude: ProvedorIAConfig
}
```

Modifique `SyncConfig` (linhas 101-109) pra incluir o novo campo:

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
}
```

Em `DEFAULT_SYNC_CONFIG` (dentro do bloco que termina em `documentoExterno: { ... }`, por volta das linhas 185-192), adicione o campo `ferramentasIA` logo depois:

```ts
  documentoExterno: {
    ativo: true,
    formato: 'N',
    tipoConferencia: '',
    nivelAcesso: 'P',
    hipoteseLegal: '',
    tipoDocumentoPadraoArrastar: 'Anexo',
  },
  ferramentasIA: {
    ativo: false,
    provedorAtivo: 'openai',
    openai: { apiKey: '', modelo: 'gpt-4o-mini' },
    gemini: { apiKey: '', modelo: 'gemini-2.0-flash' },
    claude: { apiKey: '', modelo: 'claude-3-5-haiku-20241022' },
  },
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os modificados/adicionados).

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos. (Se `src/options/main.ts` já tiver algum handler que reconstrói `SyncConfig` inteiro sem usar `{...config, ...}`, isso apareceria aqui — não é esperado, todos os handlers existentes já usam spread, mas confira.)

- [ ] **Step 6: Commit**

```bash
cd /c/sei/seirmg
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): adiciona FerramentasIAConfig ao SyncConfig"
```

---

### Task 2: Lógica pura de prompts

**Files:**
- Create: `src/features/ferramentas-ia/prompts.ts`
- Test: `src/features/ferramentas-ia/prompts.test.ts`

**Interfaces:**
- Produces: `export type TipoPromptPronto = 'resumir' | 'revisar' | 'formal'`, `montarPromptPronto(tipo: TipoPromptPronto, textoSelecionado: string): string`, `montarPromptComContexto(instrucaoOuPergunta: string, textoSelecionado: string | null): string`. Task 6 consome as duas funções.

- [ ] **Step 1: Escrever os testes (devem falhar — módulo não existe)**

Crie `src/features/ferramentas-ia/prompts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarPromptComContexto, montarPromptPronto } from './prompts'

describe('montarPromptPronto', () => {
  it('monta o prompt de resumir com o texto selecionado', () => {
    const resultado = montarPromptPronto('resumir', 'Texto de exemplo do processo.')
    expect(resultado).toContain('Resuma')
    expect(resultado).toContain('Texto de exemplo do processo.')
  })

  it('monta o prompt de revisar com o texto selecionado', () => {
    const resultado = montarPromptPronto('revisar', 'Texto com erro de portugues.')
    expect(resultado).toContain('Revise')
    expect(resultado).toContain('Texto com erro de portugues.')
  })

  it('monta o prompt de formal com o texto selecionado', () => {
    const resultado = montarPromptPronto('formal', 'Oi, tudo bem?')
    expect(resultado).toContain('formal')
    expect(resultado).toContain('Oi, tudo bem?')
  })
})

describe('montarPromptComContexto', () => {
  it('inclui o texto selecionado como contexto quando presente', () => {
    const resultado = montarPromptComContexto('Isso está claro?', 'Cláusula terceira do contrato.')
    expect(resultado).toContain('Cláusula terceira do contrato.')
    expect(resultado).toContain('Isso está claro?')
  })

  it('usa só a instrução/pergunta quando não há texto selecionado', () => {
    const resultado = montarPromptComContexto('Redija um parágrafo sobre prazo recursal.', null)
    expect(resultado).toBe('Redija um parágrafo sobre prazo recursal.')
  })
})
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/ferramentas-ia/prompts.test.ts`
Expected: FAIL com "Cannot find module './prompts'".

- [ ] **Step 3: Implementar `src/features/ferramentas-ia/prompts.ts`**

```ts
export type TipoPromptPronto = 'resumir' | 'revisar' | 'formal'

const INSTRUCOES_PRONTAS: Record<TipoPromptPronto, string> = {
  resumir: 'Resuma o seguinte trecho de forma clara e objetiva:',
  revisar: 'Revise o seguinte trecho, corrigindo erros de português e clareza, sem mudar o sentido:',
  formal: 'Reescreva o seguinte trecho num tom mais formal, adequado a um documento oficial:',
}

export function montarPromptPronto(tipo: TipoPromptPronto, textoSelecionado: string): string {
  return `${INSTRUCOES_PRONTAS[tipo]}\n\n${textoSelecionado}`
}

export function montarPromptComContexto(instrucaoOuPergunta: string, textoSelecionado: string | null): string {
  if (!textoSelecionado) return instrucaoOuPergunta
  return `Com base neste trecho:\n\n${textoSelecionado}\n\n${instrucaoOuPergunta}`
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/ferramentas-ia/prompts.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /c/sei/seirmg
git add src/features/ferramentas-ia/prompts.ts src/features/ferramentas-ia/prompts.test.ts
git commit -m "feat(ferramentas-ia): adiciona lógica pura de montagem de prompts"
```

---

### Task 3: Lógica pura de adaptadores de API (OpenAI/Gemini/Claude)

**Files:**
- Create: `src/features/ferramentas-ia/adaptadores.ts`
- Test: `src/features/ferramentas-ia/adaptadores.test.ts`

**Interfaces:**
- Consumes: `type { ProvedorIA } from '../../lib/storage'` (Task 1).
- Produces: `export interface RequisicaoIA { url: string; method: string; headers: Record<string, string>; body: string }`, `montarRequisicao(provedor: ProvedorIA, modelo: string, prompt: string, apiKey: string): RequisicaoIA`, `extrairResposta(provedor: ProvedorIA, corpoResposta: string): string | null`. Task 6 consome as duas funções.

- [ ] **Step 1: Escrever os testes (devem falhar — módulo não existe)**

Crie `src/features/ferramentas-ia/adaptadores.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairResposta, montarRequisicao } from './adaptadores'

describe('montarRequisicao', () => {
  it('monta requisição da OpenAI com Authorization Bearer', () => {
    const req = montarRequisicao('openai', 'gpt-4o-mini', 'Olá', 'sk-teste')
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(req.method).toBe('POST')
    expect(req.headers.Authorization).toBe('Bearer sk-teste')
    expect(JSON.parse(req.body)).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Olá' }],
    })
  })

  it('monta requisição do Gemini com a chave na URL', () => {
    const req = montarRequisicao('gemini', 'gemini-2.0-flash', 'Olá', 'chave-teste')
    expect(req.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=chave-teste'
    )
    expect(req.headers.Authorization).toBeUndefined()
    expect(JSON.parse(req.body)).toEqual({ contents: [{ parts: [{ text: 'Olá' }] }] })
  })

  it('monta requisição do Claude com x-api-key e anthropic-version', () => {
    const req = montarRequisicao('claude', 'claude-3-5-haiku-20241022', 'Olá', 'sk-ant-teste')
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk-ant-teste')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.parse(req.body)).toEqual({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Olá' }],
    })
  })
})

describe('extrairResposta', () => {
  it('extrai o texto da resposta da OpenAI', () => {
    const corpo = JSON.stringify({ choices: [{ message: { content: 'Resposta da OpenAI' } }] })
    expect(extrairResposta('openai', corpo)).toBe('Resposta da OpenAI')
  })

  it('extrai o texto da resposta do Gemini', () => {
    const corpo = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Resposta do Gemini' }] } }] })
    expect(extrairResposta('gemini', corpo)).toBe('Resposta do Gemini')
  })

  it('extrai o texto da resposta do Claude', () => {
    const corpo = JSON.stringify({ content: [{ text: 'Resposta do Claude' }] })
    expect(extrairResposta('claude', corpo)).toBe('Resposta do Claude')
  })

  it('retorna null quando o corpo não tem o formato esperado', () => {
    expect(extrairResposta('openai', JSON.stringify({ erro: 'algo deu errado' }))).toBeNull()
  })

  it('retorna null quando o corpo não é JSON válido', () => {
    expect(extrairResposta('openai', 'não é json')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/ferramentas-ia/adaptadores.test.ts`
Expected: FAIL com "Cannot find module './adaptadores'".

- [ ] **Step 3: Implementar `src/features/ferramentas-ia/adaptadores.ts`**

```ts
import type { ProvedorIA } from '../../lib/storage'

export interface RequisicaoIA {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

export function montarRequisicao(
  provedor: ProvedorIA,
  modelo: string,
  prompt: string,
  apiKey: string
): RequisicaoIA {
  if (provedor === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: prompt }] }),
    }
  }

  if (provedor === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  }

  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: modelo, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  }
}

interface RespostaOpenAI {
  choices?: Array<{ message?: { content?: string } }>
}
interface RespostaGemini {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}
interface RespostaClaude {
  content?: Array<{ text?: string }>
}

export function extrairResposta(provedor: ProvedorIA, corpoResposta: string): string | null {
  try {
    const json: unknown = JSON.parse(corpoResposta)

    if (provedor === 'openai') {
      return (json as RespostaOpenAI).choices?.[0]?.message?.content ?? null
    }
    if (provedor === 'gemini') {
      return (json as RespostaGemini).candidates?.[0]?.content?.parts?.[0]?.text ?? null
    }
    return (json as RespostaClaude).content?.[0]?.text ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Rodar os testes e verificar que passam**

Run: `cd /c/sei/seirmg && bunx vitest run src/features/ferramentas-ia/adaptadores.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /c/sei/seirmg
git add src/features/ferramentas-ia/adaptadores.ts src/features/ferramentas-ia/adaptadores.test.ts
git commit -m "feat(ferramentas-ia): adiciona adaptadores de requisição/resposta por provedor"
```

---

### Task 4: Background — relay de fetch pras APIs de IA + host_permissions

**Files:**
- Create: `src/lib/fetchIaViaBackground.ts`
- Modify: `src/background/index.ts`
- Modify: `manifest.config.ts`

**Interfaces:**
- Consumes: `type { Result } from './result'` (já existe).
- Produces: `fetchIA(url: string, options: { method: string; headers: Record<string, string>; body: string }): Promise<Result<string>>` em `src/lib/fetchIaViaBackground.ts` — mensagem `seirmg:fetch-ia` tratada em `background/index.ts`. Task 6 consome `fetchIA`.

Sem teste direto pro relay em si (wiring de `chrome.runtime.sendMessage`/`onMessage`, mesma política do resto do projeto — mesmo padrão de `src/lib/fetchViaBackground.ts`, que também não tem teste).

- [ ] **Step 1: Criar `src/lib/fetchIaViaBackground.ts`**

Mesmo padrão de `src/lib/fetchViaBackground.ts` (já existente, leia-o pra referência de estilo), mas pra chamadas às APIs de IA (não ao SEI):

```ts
import type { Result } from './result'

export async function fetchIA(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string }
): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({
      type: 'seirmg:fetch-ia',
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    })
    return resposta as Result<string>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
```

- [ ] **Step 2: Adicionar o handler no background**

Em `src/background/index.ts`, troque o import do topo:

```ts
import { fetchTextComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
```

por (adicionando `fetchText` de `../lib/result`, usado direto — chamada à API de IA não passa pelo `sessionGate`, que é específico pra `controlador.php`):

```ts
import { fetchTextComGate, registrarNavegacaoReal, abrirCircuitBreaker } from './sessionGate'
import { fetchText } from '../lib/result'
```

Adicione a interface e type guard, logo após `MensagemFetchSei`/`ehMensagemFetchSei` (já existentes no arquivo — procure por `interface MensagemFetchSei`):

```ts
interface MensagemFetchIA {
  type: 'seirmg:fetch-ia'
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

function ehMensagemFetchIA(mensagem: unknown): mensagem is MensagemFetchIA {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:fetch-ia'
  )
}
```

Adicione o listener, logo após o listener existente de `ehMensagemFetchSei` (procure por `if (!ehMensagemFetchSei(mensagem)) return false` pra achar o bloco e inserir depois do `})` que o fecha):

```ts
chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchIA(mensagem)) return false
  fetchText(mensagem.url, { method: mensagem.method, headers: mensagem.headers, body: mensagem.body })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})
```

- [ ] **Step 3: Adicionar os hosts das APIs de IA no manifest**

Em `manifest.config.ts`, troque:

```ts
  permissions: ['storage', 'notifications', 'tabs', 'alarms'],
  host_permissions: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
  ],
```

por:

```ts
  permissions: ['storage', 'notifications', 'tabs', 'alarms'],
  host_permissions: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
  ],
```

- [ ] **Step 4: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar toda a suíte de testes**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam (nenhum teste direto cobre o relay, mas a suíte completa não deve quebrar).

- [ ] **Step 6: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros. Confira em `dist/manifest.json` que os três hosts de API aparecem em `host_permissions`.

- [ ] **Step 7: Commit**

```bash
cd /c/sei/seirmg
git add src/lib/fetchIaViaBackground.ts src/background/index.ts manifest.config.ts
git commit -m "feat(ferramentas-ia): adiciona relay de fetch pras APIs de IA no background"
```

---

### Task 5: Opções — nova seção "Inteligência Artificial" na aba Editor de Documentos

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `FerramentasIAConfig`/`ProvedorIA` (Task 1).
- Produces: seção nova na aba já existente "Editor de Documentos" (`#painel-editor`), lida/gravada por `carregarAbaEditor` (já existente).

Sem teste direto (wiring de DOM na página de Opções, mesma política já aplicada aos outros campos desta mesma aba).

- [ ] **Step 1: Adicionar a seção "Inteligência Artificial" em `src/options/index.html`**

Em `src/options/index.html`, insira o bloco abaixo imediatamente antes de `<button id="editor-salvar">` (linha 177, dentro de `#painel-editor`, logo depois do campo "Tipo de documento padrão ao criar por arraste" da seção "Arrastar e Soltar"):

```html
      <h3>Inteligência Artificial</h3>
      <label>
        <input type="checkbox" id="ia-ativo" />
        Ativar ferramentas de IA no editor de documentos
      </label>
      <br />
      <h4>ChatGPT (OpenAI)</h4>
      <label>Chave de API: <input type="password" id="ia-openai-key" /></label>
      <br />
      <label>Modelo: <input type="text" id="ia-openai-modelo" placeholder="gpt-4o-mini" /></label>
      <br />
      <h4>Gemini (Google)</h4>
      <label>Chave de API: <input type="password" id="ia-gemini-key" /></label>
      <br />
      <label>Modelo: <input type="text" id="ia-gemini-modelo" placeholder="gemini-2.0-flash" /></label>
      <br />
      <h4>Claude (Anthropic)</h4>
      <label>Chave de API: <input type="password" id="ia-claude-key" /></label>
      <br />
      <label>Modelo: <input type="text" id="ia-claude-modelo" placeholder="claude-3-5-haiku-20241022" /></label>
      <br />
```

- [ ] **Step 2: Ler e gravar os novos campos em `src/options/main.ts`**

Em `src/options/main.ts`, dentro de `carregarAbaEditor` (já existente), logo após a declaração de `inputTipoPadraoArrastar` (por volta das linhas 325-327):

```ts
    const inputTipoPadraoArrastar = document.getElementById(
      'editor-doc-externo-tipo-padrao-arrastar'
    ) as HTMLInputElement | null
    const inputIaAtivo = document.getElementById('ia-ativo') as HTMLInputElement | null
    const inputIaOpenaiKey = document.getElementById('ia-openai-key') as HTMLInputElement | null
    const inputIaOpenaiModelo = document.getElementById('ia-openai-modelo') as HTMLInputElement | null
    const inputIaGeminiKey = document.getElementById('ia-gemini-key') as HTMLInputElement | null
    const inputIaGeminiModelo = document.getElementById('ia-gemini-modelo') as HTMLInputElement | null
    const inputIaClaudeKey = document.getElementById('ia-claude-key') as HTMLInputElement | null
    const inputIaClaudeModelo = document.getElementById('ia-claude-modelo') as HTMLInputElement | null
    const status = document.getElementById('editor-status')
```

(Note: `const status = document.getElementById('editor-status')` já existe logo depois — não duplique, só insira as oito constantes novas antes dela.)

Logo após a linha que seta `inputTipoPadraoArrastar.value` (por volta das linhas 335-337):

```ts
    if (inputTipoPadraoArrastar) {
      inputTipoPadraoArrastar.value = config.documentoExterno.tipoDocumentoPadraoArrastar
    }
    if (inputIaAtivo) inputIaAtivo.checked = config.ferramentasIA.ativo
    if (inputIaOpenaiKey) inputIaOpenaiKey.value = config.ferramentasIA.openai.apiKey
    if (inputIaOpenaiModelo) inputIaOpenaiModelo.value = config.ferramentasIA.openai.modelo
    if (inputIaGeminiKey) inputIaGeminiKey.value = config.ferramentasIA.gemini.apiKey
    if (inputIaGeminiModelo) inputIaGeminiModelo.value = config.ferramentasIA.gemini.modelo
    if (inputIaClaudeKey) inputIaClaudeKey.value = config.ferramentasIA.claude.apiKey
    if (inputIaClaudeModelo) inputIaClaudeModelo.value = config.ferramentasIA.claude.modelo
```

No handler de salvar, dentro do objeto `atualizado` (por volta das linhas 341-351), troque:

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
        }
```

por:

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
          ferramentasIA: {
            ativo: inputIaAtivo?.checked ?? false,
            provedorAtivo: config.ferramentasIA.provedorAtivo,
            openai: {
              apiKey: inputIaOpenaiKey?.value ?? '',
              modelo: inputIaOpenaiModelo?.value.trim() || 'gpt-4o-mini',
            },
            gemini: {
              apiKey: inputIaGeminiKey?.value ?? '',
              modelo: inputIaGeminiModelo?.value.trim() || 'gemini-2.0-flash',
            },
            claude: {
              apiKey: inputIaClaudeKey?.value ?? '',
              modelo: inputIaClaudeModelo?.value.trim() || 'claude-3-5-haiku-20241022',
            },
          },
        }
```

(`provedorAtivo` não tem campo próprio nas Opções nesta spec — é trocado direto no painel do editor, ver Task 6/7 — as Opções só passam adiante o valor já existente em `config`.)

- [ ] **Step 3: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
cd /c/sei/seirmg
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): adiciona seção de Ferramentas de IA na aba Editor de Documentos"
```

---

### Task 6: Content script — detectar CKEditor, botão, painel completo (ChatGPT/Gemini/Claude)

**Files:**
- Create: `src/content-scripts/documento_editar/index.ts`
- Modify: `manifest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `montarPromptPronto`/`montarPromptComContexto` (Task 2); `montarRequisicao`/`extrairResposta`/`type RequisicaoIA` (Task 3); `fetchIA` (Task 4); `createSyncConfigStore`, `type FerramentasIAConfig`, `type ProvedorIA` (Task 1, já existente).
- Produces: content script novo, registrado no manifest, que insere o botão de IA na barra do CKEditor e monta o painel completo pros três provedores de API. Task 7 estende este mesmo arquivo (modo JusIA + bloqueio de restrição).

⚠️ **Risco documentado na spec, não verificado numa instância SEI real**: inserção de botão na barra do CKEditor 4 e substituição de texto selecionado via `editor.getSelection()`/`editor.insertHtml()`. Marcar como pendente de validação manual (mesmo tratamento do Lote F).

Sem teste direto pro wiring de DOM/CKEditor (mesma política do resto do projeto). Lógica pura já testada nas Tasks 2-3.

- [ ] **Step 1: Instalar a dependência de ícones oficiais**

Run: `cd /c/sei/seirmg && bun add @lobehub/icons-static-svg`
Expected: adiciona `"@lobehub/icons-static-svg": "^1.42.0"` (ou versão mais recente disponível) em `dependencies` no `package.json`, atualiza `bun.lock`.

- [ ] **Step 2: Registrar o content script no manifest**

Em `manifest.config.ts`, adicione uma nova entrada em `content_scripts` (mesmo array das outras entradas já existentes — siga o padrão de uma entrada como a do `core`, com `matches` idêntico):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/documento_editar/index.ts'],
      all_frames: true,
      run_at: 'document_idle',
    },
```

`all_frames: true` é defensivo: não se sabe ainda (sem instância real pra checar) se a tela de edição de documento do SEI carrega dentro de um iframe de `controlador.php` (padrão comum em outras telas do SEI, ex. `ifrVisualizacao` na visualização de processo) ou como página de topo. Com `all_frames: true`, o script roda nos dois casos — onde `CKEDITOR` não existir, a detecção do Step 5 simplesmente não encontra nada e não faz nada (sem efeito colateral).

- [ ] **Step 3: Criar o content script com detecção do CKEditor, estilos e estado**

Crie `src/content-scripts/documento_editar/index.ts`:

```ts
import { montarPromptComContexto, montarPromptPronto, type TipoPromptPronto } from '../../features/ferramentas-ia/prompts'
import { montarRequisicao, extrairResposta } from '../../features/ferramentas-ia/adaptadores'
import { fetchIA } from '../../lib/fetchIaViaBackground'
import { createSyncConfigStore } from '../../lib/storage'
import type { ProvedorIA, FerramentasIAConfig } from '../../lib/storage'
import openaiIconSvg from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import geminiIconSvg from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import claudeIconSvg from '@lobehub/icons-static-svg/icons/claude-color.svg?raw'

const ESTILO_PAINEL_IA = `
  #seirmg-botao-ia {
    height: 24px;
    padding: 0 8px;
    background: #fff;
    border: 1px solid #017fff;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #017fff;
    font-weight: bold;
    cursor: pointer;
    margin: 2px;
  }
  #seirmg-painel-ia {
    position: fixed;
    top: 60px;
    right: 20px;
    width: 420px;
    max-width: calc(100vw - 40px);
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
    z-index: 10000;
    font-family: Arial, Helvetica, sans-serif;
    color: #222;
    overflow: hidden;
  }
  .seirmg-ia-cabecalho {
    background: #017fff;
    color: #fff;
    padding: 10px 14px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .seirmg-ia-cabecalho span:last-child {
    cursor: pointer;
  }
  .seirmg-ia-provedores {
    display: flex;
    border-bottom: 1px solid #eee;
  }
  .seirmg-ia-provedor {
    flex: 1;
    text-align: center;
    padding: 10px 4px;
    font-size: 12px;
    color: #666;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .seirmg-ia-icone-provedor {
    display: inline-flex;
  }
  .seirmg-ia-icone-provedor svg {
    width: 18px;
    height: 18px;
  }
  .seirmg-ia-provedor.ativo {
    background: #eef6ff;
    border-bottom: 2px solid #017fff;
    font-weight: bold;
    color: #017fff;
  }
  .seirmg-ia-confirmacao {
    padding: 10px 14px;
    background: #fff8e1;
    border-bottom: 1px solid #f0d9a0;
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .seirmg-ia-confirmacao.confirmado {
    background: #eef7ee;
    border-bottom: 1px solid #cde5cd;
    color: #2e7d32;
  }
  .seirmg-ia-bloqueio {
    padding: 10px 14px;
    background: #fdecea;
    border-bottom: 1px solid #f3c1bb;
    color: #c0392b;
    font-size: 12px;
  }
  .seirmg-ia-modos {
    display: flex;
    border-bottom: 1px solid #eee;
    font-size: 12px;
  }
  .seirmg-ia-modo {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    color: #666;
    cursor: pointer;
  }
  .seirmg-ia-modo.ativo {
    border-bottom: 2px solid #017fff;
    color: #017fff;
    font-weight: bold;
  }
  .seirmg-ia-corpo {
    padding: 14px;
  }
  .seirmg-ia-selecao-info {
    font-size: 11px;
    color: #888;
    margin-bottom: 6px;
  }
  .seirmg-ia-corpo textarea {
    width: 100%;
    height: 60px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
  }
  .seirmg-ia-botao-enviar {
    margin-top: 10px;
    width: 100%;
    padding: 9px;
    background: #017fff;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
  .seirmg-ia-botao-enviar:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  .seirmg-ia-prontos-botao {
    display: block;
    width: 100%;
    margin-bottom: 8px;
    padding: 9px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .seirmg-ia-resposta {
    border: 1px solid #017fff;
    border-radius: 4px;
    padding: 10px;
    background: #fafcff;
    margin-top: 12px;
  }
  .seirmg-ia-resposta-rotulo {
    font-size: 11px;
    color: #017fff;
    font-weight: bold;
    margin-bottom: 6px;
  }
  .seirmg-ia-resposta-texto {
    font-size: 13px;
    color: #333;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .seirmg-ia-resposta-acoes {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .seirmg-ia-resposta-acoes button {
    flex: 1;
    padding: 9px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
  .seirmg-ia-inserir {
    background: #017fff;
    color: #fff;
    border: none;
    font-weight: bold;
  }
  .seirmg-ia-descartar {
    background: #fff;
    color: #666;
    border: 1px solid #ccc;
  }
`

function injetarEstilos(): void {
  if (document.getElementById('seirmg-estilo-ia')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-ia'
  style.textContent = ESTILO_PAINEL_IA
  document.head.appendChild(style)
}

const ICONES_PROVEDOR: Record<ProvedorIA, string> = {
  openai: openaiIconSvg,
  gemini: geminiIconSvg,
  claude: claudeIconSvg,
}

const ROTULOS_PROVEDOR: Record<ProvedorIA, string> = {
  openai: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
}

const MODOS = [
  { id: 'livre', rotulo: 'Prompt livre' },
  { id: 'prontos', rotulo: 'Prontos' },
  { id: 'redigir', rotulo: 'Redigir' },
] as const
type ModoPainel = (typeof MODOS)[number]['id']

interface EstadoPainel {
  provedor: ProvedorIA
  modo: ModoPainel
  confirmado: boolean
}
```

- [ ] **Step 4: Rodar typecheck (arquivo incompleto — só confirma que não há erro de sintaxe até aqui)**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: erros de "declared but never used" pras constantes/tipos acima (`ICONES_PROVEDOR`, `ROTULOS_PROVEDOR`, `MODOS`, `EstadoPainel`, `injetarEstilos`) — **esperado nesta etapa intermediária**, porque nada os consome ainda. Serão consumidos nos próximos steps deste mesmo arquivo. Não corrija agora, só confirme que não há erro de sintaxe/import quebrado.

- [ ] **Step 5: Continuar o mesmo arquivo — estado do painel, extração de dados do editor e montagem do HTML**

No mesmo arquivo `src/content-scripts/documento_editar/index.ts`, adicione ao final:

```ts
let estadoAtual: EstadoPainel = { provedor: 'openai', modo: 'livre', confirmado: false }
let respostaAtual: string | null = null
let enviandoAtual = false

function obterTextoSelecionado(editor: { getSelection: () => { getSelectedText: () => string } | null }): string {
  try {
    return editor.getSelection()?.getSelectedText()?.trim() ?? ''
  } catch {
    return ''
  }
}

function montarHtmlProvedores(config: FerramentasIAConfig): string {
  const provedoresComChave = (['openai', 'gemini', 'claude'] as const).filter(
    (provedor) => config[provedor].apiKey.trim() !== ''
  )

  return provedoresComChave
    .map((provedor) => {
      const ativo = provedor === estadoAtual.provedor ? ' ativo' : ''
      return `
        <div class="seirmg-ia-provedor${ativo}" data-acao="provedor" data-provedor="${provedor}">
          <span class="seirmg-ia-icone-provedor">${ICONES_PROVEDOR[provedor]}</span>
          ${ROTULOS_PROVEDOR[provedor]}
        </div>
      `
    })
    .join('')
}

function montarHtmlModos(): string {
  return MODOS.map(({ id, rotulo }) => {
    const ativo = id === estadoAtual.modo ? ' ativo' : ''
    return `<div class="seirmg-ia-modo${ativo}" data-acao="modo" data-modo="${id}">${rotulo}</div>`
  }).join('')
}

function escaparHtml(texto: string): string {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}

function montarHtmlResposta(): string {
  if (respostaAtual === null) return ''
  return `
    <div class="seirmg-ia-resposta">
      <div class="seirmg-ia-resposta-rotulo">RESPOSTA — ${ROTULOS_PROVEDOR[estadoAtual.provedor]}</div>
      <div class="seirmg-ia-resposta-texto">${escaparHtml(respostaAtual)}</div>
    </div>
    <div class="seirmg-ia-resposta-acoes">
      <button class="seirmg-ia-inserir" data-acao="inserir">Inserir no documento</button>
      <button class="seirmg-ia-descartar" data-acao="descartar">Descartar</button>
    </div>
  `
}

function montarHtmlCorpo(textoSelecionado: string): string {
  const desabilitado = !estadoAtual.confirmado || enviandoAtual
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em>`
    : 'Nenhum texto selecionado.'

  if (estadoAtual.modo === 'prontos') {
    const semSelecao = textoSelecionado === ''
    const rotulos: Record<TipoPromptPronto, string> = {
      resumir: 'Resumir',
      revisar: 'Revisar/corrigir português',
      formal: 'Deixar mais formal',
    }
    const botoes = (Object.keys(rotulos) as TipoPromptPronto[])
      .map(
        (tipo) => `
        <button class="seirmg-ia-prontos-botao" data-acao="enviar-pronto" data-tipo="${tipo}"
          ${desabilitado || semSelecao ? 'disabled' : ''}>${rotulos[tipo]}</button>
      `
      )
      .join('')
    return `
      <div class="seirmg-ia-selecao-info">${textoInfo}</div>
      ${botoes}
      ${semSelecao ? '<div class="seirmg-ia-selecao-info">Selecione um trecho no documento pra usar os prompts prontos.</div>' : ''}
      ${montarHtmlResposta()}
    `
  }

  const rotuloBotao = estadoAtual.modo === 'redigir' ? 'Gerar' : 'Perguntar'
  const placeholder =
    estadoAtual.modo === 'redigir'
      ? 'Descreva o que você quer redigir...'
      : 'Digite sua pergunta sobre o texto selecionado...'
  const textoBotao = enviandoAtual
    ? 'Enviando...'
    : !estadoAtual.confirmado
      ? `${rotuloBotao} (marque a confirmação acima)`
      : rotuloBotao

  return `
    <div class="seirmg-ia-selecao-info">${textoInfo}</div>
    <textarea id="seirmg-ia-instrucao" placeholder="${placeholder}" ${desabilitado ? 'disabled' : ''}></textarea>
    <button class="seirmg-ia-botao-enviar" data-acao="enviar-${estadoAtual.modo}" ${desabilitado ? 'disabled' : ''}>${textoBotao}</button>
    ${montarHtmlResposta()}
  `
}

function montarHtmlPainel(config: FerramentasIAConfig, textoSelecionado: string): string {
  const confirmacaoClasse = estadoAtual.confirmado ? ' confirmado' : ''
  const confirmacaoTexto = estadoAtual.confirmado
    ? '✓ Confirmado: documento não sigiloso/restrito.'
    : 'Confirmo que este documento <strong>não é sigiloso/restrito</strong> — o texto enviado sai do ambiente do SEI para um serviço externo.'
  const checkbox = estadoAtual.confirmado
    ? ''
    : '<input type="checkbox" id="seirmg-ia-checkbox-confirmar" data-acao="confirmar">'

  return `
    <div class="seirmg-ia-cabecalho">
      <span>Ferramentas de IA</span>
      <span data-acao="fechar">✕</span>
    </div>
    <div class="seirmg-ia-provedores">${montarHtmlProvedores(config)}</div>
    <div class="seirmg-ia-confirmacao${confirmacaoClasse}">${checkbox}<span>${confirmacaoTexto}</span></div>
    <div class="seirmg-ia-modos">${montarHtmlModos()}</div>
    <div class="seirmg-ia-corpo">${montarHtmlCorpo(textoSelecionado)}</div>
  `
}
```

- [ ] **Step 6: Continuar o mesmo arquivo — envio à API, atualização do painel e evento delegado**

No mesmo arquivo, adicione ao final:

```ts
interface EditorCKEditor {
  getSelection: () => { getSelectedText: () => string } | null
  insertHtml: (html: string) => void
}

function atualizarPainel(config: FerramentasIAConfig, editor: EditorCKEditor): void {
  const painel = document.getElementById('seirmg-painel-ia')
  if (!painel) return
  painel.innerHTML = montarHtmlPainel(config, obterTextoSelecionado(editor))
}

async function enviar(prompt: string, config: FerramentasIAConfig, editor: EditorCKEditor): Promise<void> {
  enviandoAtual = true
  respostaAtual = null
  atualizarPainel(config, editor)

  try {
    const provedorConfig = config[estadoAtual.provedor]
    const requisicao = montarRequisicao(estadoAtual.provedor, provedorConfig.modelo, prompt, provedorConfig.apiKey)
    const resultado = await fetchIA(requisicao.url, {
      method: requisicao.method,
      headers: requisicao.headers,
      body: requisicao.body,
    })

    if (!resultado.ok) {
      respostaAtual = `Erro ao consultar ${ROTULOS_PROVEDOR[estadoAtual.provedor]}: ${resultado.error}`
    } else {
      respostaAtual = extrairResposta(estadoAtual.provedor, resultado.data) ?? 'Não foi possível interpretar a resposta.'
    }
  } catch (error) {
    respostaAtual = `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    enviandoAtual = false
    atualizarPainel(config, editor)
  }
}

function tratarCliquePainel(evento: MouseEvent, config: FerramentasIAConfig, editor: EditorCKEditor): void {
  if (!(evento.target instanceof HTMLElement)) return
  const elemento = evento.target.closest<HTMLElement>('[data-acao]')
  if (!elemento) return
  const acao = elemento.dataset.acao

  if (acao === 'fechar') {
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'provedor') {
    const provedor = elemento.dataset.provedor as ProvedorIA
    estadoAtual = { ...estadoAtual, provedor }
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'modo') {
    const modo = elemento.dataset.modo as ModoPainel
    estadoAtual = { ...estadoAtual, modo }
    respostaAtual = null
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'confirmar' && elemento instanceof HTMLInputElement) {
    estadoAtual = { ...estadoAtual, confirmado: elemento.checked }
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'descartar') {
    respostaAtual = null
    atualizarPainel(config, editor)
    return
  }

  if (acao === 'inserir') {
    if (respostaAtual) editor.insertHtml(escaparHtml(respostaAtual).replace(/\n/g, '<br>'))
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'enviar-livre' || acao === 'enviar-redigir') {
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const instrucao = textarea?.value.trim() ?? ''
    if (!instrucao || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = obterTextoSelecionado(editor)
    const prompt = montarPromptComContexto(instrucao, textoSelecionado || null)
    enviar(prompt, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pra IA:', error)
    })
    return
  }

  if (acao === 'enviar-pronto') {
    const tipo = elemento.dataset.tipo as TipoPromptPronto
    const textoSelecionado = obterTextoSelecionado(editor)
    if (!textoSelecionado || !estadoAtual.confirmado || enviandoAtual) return
    const prompt = montarPromptPronto(tipo, textoSelecionado)
    enviar(prompt, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pronto pra IA:', error)
    })
  }
}

function montarPainel(config: FerramentasIAConfig, editor: EditorCKEditor): void {
  document.getElementById('seirmg-painel-ia')?.remove()
  estadoAtual = { provedor: config.provedorAtivo, modo: 'livre', confirmado: false }
  respostaAtual = null
  enviandoAtual = false

  const painel = document.createElement('div')
  painel.id = 'seirmg-painel-ia'
  document.body.appendChild(painel)
  painel.addEventListener('click', (evento) => tratarCliquePainel(evento, config, editor))

  atualizarPainel(config, editor)
}
```

- [ ] **Step 7: Continuar o mesmo arquivo — detecção do CKEditor, botão na barra e bootstrap**

No mesmo arquivo, adicione ao final:

```ts
interface JanelaComCKEditor {
  CKEDITOR?: { instances: Record<string, EditorCKEditor> }
}

function esperarCKEditor(callback: () => void, tentativasRestantes = 30): void {
  if (typeof (window as unknown as JanelaComCKEditor).CKEDITOR !== 'undefined') {
    callback()
    return
  }
  if (tentativasRestantes <= 0) return
  setTimeout(() => esperarCKEditor(callback, tentativasRestantes - 1), 200)
}

function obterInstanciaCKEditor(): EditorCKEditor | null {
  const instances = (window as unknown as JanelaComCKEditor).CKEDITOR?.instances
  if (!instances) return null
  return Object.values(instances)[0] ?? null
}

function inserirBotaoNaBarra(editor: EditorCKEditor, config: FerramentasIAConfig): void {
  if (document.getElementById('seirmg-botao-ia')) return
  const marcadorInicioBarra = document.querySelector('.cke_toolbox .cke_toolbar:first-child .cke_toolbar_start')
  if (!marcadorInicioBarra) return

  const botao = document.createElement('span')
  botao.id = 'seirmg-botao-ia'
  botao.textContent = '✨ IA'
  botao.title = 'Ferramentas de IA'
  botao.addEventListener('click', () => montarPainel(config, editor))
  marcadorInicioBarra.insertAdjacentElement('afterend', botao)
}

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.ferramentasIA.ativo) return

    injetarEstilos()
    esperarCKEditor(() => {
      const editor = obterInstanciaCKEditor()
      if (!editor) return
      inserirBotaoNaBarra(editor, config.ferramentasIA)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar ferramentas de IA no editor:', error)
  }
}

bootstrap()
```

- [ ] **Step 8: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros. Confirma que todas as constantes/tipos declarados nos Steps 3/5/6/7 agora têm consumidor (nenhum `noUnusedLocals`).

- [ ] **Step 9: Rodar toda a suíte de testes**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam (nenhum teste direto cobre este arquivo — wiring de DOM/CKEditor).

- [ ] **Step 10: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros. Confirme em `dist/manifest.json` que a nova entrada de `content_scripts` aparece com `all_frames: true`, e que os imports `?raw` de `@lobehub/icons-static-svg` resolveram (build não falha por import não encontrado).

- [ ] **Step 11: Nota de verificação manual (não automatizável nesta plan)**

Este content script é o primeiro do projeto a mexer com CKEditor — **`inserirBotaoNaBarra` (seletor `.cke_toolbox .cke_toolbar:first-child .cke_toolbar_start`) e `obterTextoSelecionado`/`editor.insertHtml` não foram verificados contra uma instância SEI real**. Mesmo tratamento de risco já documentado no Lote F: registrar aqui que a validação manual numa instância real fica pendente (não é bloqueante pra completar esta task — é um risco aceito e documentado na spec, seção "Riscos / verificação pendente").

- [ ] **Step 12: Commit**

```bash
cd /c/sei/seirmg
git add src/content-scripts/documento_editar/index.ts manifest.config.ts package.json bun.lock
git commit -m "feat(ferramentas-ia): adiciona painel de IA no editor (ChatGPT/Gemini/Claude)"
```

---

### Task 7: Content script — modo JusIA + bloqueio best-effort por ícone de restrição

**Files:**
- Modify: `src/content-scripts/documento_editar/index.ts` (Task 6)

**Interfaces:**
- Consumes: tudo que já existe no arquivo desde a Task 6.
- Produces: aba JusIA no painel (sempre visível, sem chave); bloqueio adicional quando o documento atual for detectado como restrito na árvore.

Sem teste direto (wiring de DOM). Verificação por typecheck + build + a mesma nota de verificação manual da Task 6 (JusIA/bloqueio também não verificados contra instância real).

- [ ] **Step 1: Ampliar o tipo de provedor do painel pra incluir JusIA**

Em `src/content-scripts/documento_editar/index.ts`, troque a interface `EstadoPainel` (adicionada na Task 6):

```ts
interface EstadoPainel {
  provedor: ProvedorIA
  modo: ModoPainel
  confirmado: boolean
}
```

por:

```ts
type ProvedorPainel = ProvedorIA | 'jusia'

interface EstadoPainel {
  provedor: ProvedorPainel
  modo: ModoPainel
  confirmado: boolean
}
```

- [ ] **Step 2: Mostrar a aba do JusIA sempre, com favicon ao vivo (sem bundlar logo)**

Troque `montarHtmlProvedores` (Task 6):

```ts
function montarHtmlProvedores(config: FerramentasIAConfig): string {
  const provedoresComChave = (['openai', 'gemini', 'claude'] as const).filter(
    (provedor) => config[provedor].apiKey.trim() !== ''
  )

  return provedoresComChave
    .map((provedor) => {
      const ativo = provedor === estadoAtual.provedor ? ' ativo' : ''
      return `
        <div class="seirmg-ia-provedor${ativo}" data-acao="provedor" data-provedor="${provedor}">
          <span class="seirmg-ia-icone-provedor">${ICONES_PROVEDOR[provedor]}</span>
          ${ROTULOS_PROVEDOR[provedor]}
        </div>
      `
    })
    .join('')
}
```

por:

```ts
function montarHtmlProvedores(config: FerramentasIAConfig): string {
  const provedoresComChave = (['openai', 'gemini', 'claude'] as const).filter(
    (provedor) => config[provedor].apiKey.trim() !== ''
  )

  const abasApi = provedoresComChave
    .map((provedor) => {
      const ativo = provedor === estadoAtual.provedor ? ' ativo' : ''
      return `
        <div class="seirmg-ia-provedor${ativo}" data-acao="provedor" data-provedor="${provedor}">
          <span class="seirmg-ia-icone-provedor">${ICONES_PROVEDOR[provedor]}</span>
          ${ROTULOS_PROVEDOR[provedor]}
        </div>
      `
    })
    .join('')

  const ativoJusia = estadoAtual.provedor === 'jusia' ? ' ativo' : ''
  const abaJusia = `
    <div class="seirmg-ia-provedor${ativoJusia}" data-acao="provedor" data-provedor="jusia">
      <img src="https://ia.jusbrasil.com.br/favicon.ico" alt="" onerror="this.style.visibility='hidden'">
      JusIA
    </div>
  `

  return abasApi + abaJusia
}
```

- [ ] **Step 3: Corpo do painel específico do JusIA (sem abas de modo, sem checkbox de API)**

Troque `montarHtmlPainel` (Task 6):

```ts
function montarHtmlPainel(config: FerramentasIAConfig, textoSelecionado: string): string {
  const confirmacaoClasse = estadoAtual.confirmado ? ' confirmado' : ''
  const confirmacaoTexto = estadoAtual.confirmado
    ? '✓ Confirmado: documento não sigiloso/restrito.'
    : 'Confirmo que este documento <strong>não é sigiloso/restrito</strong> — o texto enviado sai do ambiente do SEI para um serviço externo.'
  const checkbox = estadoAtual.confirmado
    ? ''
    : '<input type="checkbox" id="seirmg-ia-checkbox-confirmar" data-acao="confirmar">'

  return `
    <div class="seirmg-ia-cabecalho">
      <span>Ferramentas de IA</span>
      <span data-acao="fechar">✕</span>
    </div>
    <div class="seirmg-ia-provedores">${montarHtmlProvedores(config)}</div>
    <div class="seirmg-ia-confirmacao${confirmacaoClasse}">${checkbox}<span>${confirmacaoTexto}</span></div>
    <div class="seirmg-ia-modos">${montarHtmlModos()}</div>
    <div class="seirmg-ia-corpo">${montarHtmlCorpo(textoSelecionado)}</div>
  `
}
```

por:

```ts
function montarHtmlCorpoJusia(textoSelecionado: string): string {
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em> (copiado pra área de transferência ao clicar)`
    : 'Nenhum texto selecionado — o JusIA abre sem nada copiado.'

  return `
    <div class="seirmg-ia-selecao-info">${textoInfo}</div>
    <button class="seirmg-ia-botao-enviar" data-acao="ir-jusia" ${!estadoAtual.confirmado ? 'disabled' : ''}>
      ${estadoAtual.confirmado ? 'Ir pro JusIA' : 'Ir pro JusIA (marque a confirmação acima)'}
    </button>
  `
}

function montarHtmlPainel(
  config: FerramentasIAConfig,
  textoSelecionado: string,
  documentoRestrito: boolean
): string {
  const confirmacaoClasse = estadoAtual.confirmado ? ' confirmado' : ''
  const confirmacaoTexto = estadoAtual.confirmado
    ? '✓ Confirmado: documento não sigiloso/restrito.'
    : 'Confirmo que este documento <strong>não é sigiloso/restrito</strong> — o texto enviado sai do ambiente do SEI para um serviço externo.'
  const checkbox = estadoAtual.confirmado
    ? ''
    : '<input type="checkbox" id="seirmg-ia-checkbox-confirmar" data-acao="confirmar">'

  const blocoConfirmacao = documentoRestrito
    ? '<div class="seirmg-ia-bloqueio">⚠ Este documento parece ter acesso restrito/sigiloso (detectado automaticamente) — ferramentas de IA bloqueadas.</div>'
    : `<div class="seirmg-ia-confirmacao${confirmacaoClasse}">${checkbox}<span>${confirmacaoTexto}</span></div>`

  const modosOuVazio = estadoAtual.provedor === 'jusia' ? '' : `<div class="seirmg-ia-modos">${montarHtmlModos()}</div>`
  const corpo =
    estadoAtual.provedor === 'jusia' ? montarHtmlCorpoJusia(textoSelecionado) : montarHtmlCorpo(textoSelecionado)

  return `
    <div class="seirmg-ia-cabecalho">
      <span>Ferramentas de IA</span>
      <span data-acao="fechar">✕</span>
    </div>
    <div class="seirmg-ia-provedores">${montarHtmlProvedores(config)}</div>
    ${blocoConfirmacao}
    ${documentoRestrito ? '' : modosOuVazio}
    <div class="seirmg-ia-corpo">${documentoRestrito ? '' : corpo}</div>
  `
}
```

- [ ] **Step 4: Detecção best-effort do ícone de restrição pro documento atual**

No mesmo arquivo, adicione (antes de `atualizarPainel`, que precisa chamar esta função):

```ts
function obterIdDocumentoAtual(): string | null {
  return new URLSearchParams(window.location.search).get('id_documento')
}

function detectarDocumentoRestrito(): boolean {
  const idDocumento = obterIdDocumentoAtual()
  if (!idDocumento) return false
  return document.getElementById(`anchorNA${idDocumento}`) !== null
}
```

- [ ] **Step 5: Encadear a detecção e o novo tipo em `atualizarPainel`, `montarPainel` e `tratarCliquePainel`**

Troque `atualizarPainel` (Task 6):

```ts
function atualizarPainel(config: FerramentasIAConfig, editor: EditorCKEditor): void {
  const painel = document.getElementById('seirmg-painel-ia')
  if (!painel) return
  painel.innerHTML = montarHtmlPainel(config, obterTextoSelecionado(editor))
}
```

por:

```ts
function atualizarPainel(config: FerramentasIAConfig, editor: EditorCKEditor): void {
  const painel = document.getElementById('seirmg-painel-ia')
  if (!painel) return
  painel.innerHTML = montarHtmlPainel(config, obterTextoSelecionado(editor), detectarDocumentoRestrito())
}
```

Em `tratarCliquePainel` (Task 6), troque o bloco que trata `acao === 'provedor'`:

```ts
  if (acao === 'provedor') {
    const provedor = elemento.dataset.provedor as ProvedorIA
    estadoAtual = { ...estadoAtual, provedor }
    atualizarPainel(config, editor)
    return
  }
```

por:

```ts
  if (acao === 'provedor') {
    const provedor = elemento.dataset.provedor as ProvedorPainel
    estadoAtual = { ...estadoAtual, provedor }
    respostaAtual = null
    atualizarPainel(config, editor)
    return
  }
```

E adicione um novo bloco de tratamento, logo antes do `if (acao === 'enviar-pronto') { ... }` já existente:

```ts
  if (acao === 'ir-jusia') {
    if (!estadoAtual.confirmado) return
    const textoSelecionado = obterTextoSelecionado(editor)
    if (textoSelecionado) {
      navigator.clipboard.writeText(textoSelecionado).catch((error) => {
        console.error('[SEIRMG] Falha ao copiar texto pra área de transferência:', error)
      })
    }
    window.open('https://ia.jusbrasil.com.br', '_blank')
    return
  }

```

- [ ] **Step 6: Estreitar `estadoAtual.provedor` de volta pra `ProvedorIA` nos pontos que só lidam com API**

Agora que `EstadoPainel.provedor` é `ProvedorPainel` (`ProvedorIA | 'jusia'`), `enviar` e os blocos `enviar-livre`/`enviar-redigir`/`enviar-pronto` de `tratarCliquePainel` (Task 6) precisam de uma checagem explícita antes de tratar `estadoAtual.provedor` como `ProvedorIA` — sem isso, `config[estadoAtual.provedor]` dentro de `enviar` não compila (`'jusia'` não é uma chave válida de `FerramentasIAConfig`).

Troque a assinatura de `enviar` (Task 6):

```ts
async function enviar(prompt: string, config: FerramentasIAConfig, editor: EditorCKEditor): Promise<void> {
  enviandoAtual = true
  respostaAtual = null
  atualizarPainel(config, editor)

  try {
    const provedorConfig = config[estadoAtual.provedor]
    const requisicao = montarRequisicao(estadoAtual.provedor, provedorConfig.modelo, prompt, provedorConfig.apiKey)
    const resultado = await fetchIA(requisicao.url, {
      method: requisicao.method,
      headers: requisicao.headers,
      body: requisicao.body,
    })

    if (!resultado.ok) {
      respostaAtual = `Erro ao consultar ${ROTULOS_PROVEDOR[estadoAtual.provedor]}: ${resultado.error}`
    } else {
      respostaAtual = extrairResposta(estadoAtual.provedor, resultado.data) ?? 'Não foi possível interpretar a resposta.'
    }
  } catch (error) {
    respostaAtual = `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    enviandoAtual = false
    atualizarPainel(config, editor)
  }
}
```

por:

```ts
async function enviar(
  prompt: string,
  provedor: ProvedorIA,
  config: FerramentasIAConfig,
  editor: EditorCKEditor
): Promise<void> {
  enviandoAtual = true
  respostaAtual = null
  atualizarPainel(config, editor)

  try {
    const provedorConfig = config[provedor]
    const requisicao = montarRequisicao(provedor, provedorConfig.modelo, prompt, provedorConfig.apiKey)
    const resultado = await fetchIA(requisicao.url, {
      method: requisicao.method,
      headers: requisicao.headers,
      body: requisicao.body,
    })

    if (!resultado.ok) {
      respostaAtual = `Erro ao consultar ${ROTULOS_PROVEDOR[provedor]}: ${resultado.error}`
    } else {
      respostaAtual = extrairResposta(provedor, resultado.data) ?? 'Não foi possível interpretar a resposta.'
    }
  } catch (error) {
    respostaAtual = `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    enviandoAtual = false
    atualizarPainel(config, editor)
  }
}
```

Troque os dois blocos de `tratarCliquePainel` que chamam `enviar` (Task 6):

```ts
  if (acao === 'enviar-livre' || acao === 'enviar-redigir') {
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const instrucao = textarea?.value.trim() ?? ''
    if (!instrucao || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = obterTextoSelecionado(editor)
    const prompt = montarPromptComContexto(instrucao, textoSelecionado || null)
    enviar(prompt, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pra IA:', error)
    })
    return
  }

  if (acao === 'enviar-pronto') {
    const tipo = elemento.dataset.tipo as TipoPromptPronto
    const textoSelecionado = obterTextoSelecionado(editor)
    if (!textoSelecionado || !estadoAtual.confirmado || enviandoAtual) return
    const prompt = montarPromptPronto(tipo, textoSelecionado)
    enviar(prompt, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pronto pra IA:', error)
    })
  }
```

por:

```ts
  if (acao === 'enviar-livre' || acao === 'enviar-redigir') {
    if (estadoAtual.provedor === 'jusia') return
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const instrucao = textarea?.value.trim() ?? ''
    if (!instrucao || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = obterTextoSelecionado(editor)
    const prompt = montarPromptComContexto(instrucao, textoSelecionado || null)
    enviar(prompt, estadoAtual.provedor, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pra IA:', error)
    })
    return
  }

  if (acao === 'enviar-pronto') {
    if (estadoAtual.provedor === 'jusia') return
    const tipo = elemento.dataset.tipo as TipoPromptPronto
    const textoSelecionado = obterTextoSelecionado(editor)
    if (!textoSelecionado || !estadoAtual.confirmado || enviandoAtual) return
    const prompt = montarPromptPronto(tipo, textoSelecionado)
    enviar(prompt, estadoAtual.provedor, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar prompt pronto pra IA:', error)
    })
  }
```

- [ ] **Step 7: Typecheck**

Run: `cd /c/sei/seirmg && bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Rodar toda a suíte de testes**

Run: `cd /c/sei/seirmg && bun run test`
Expected: todos os testes passam.

- [ ] **Step 9: Build**

Run: `cd /c/sei/seirmg && bun run build`
Expected: build sem erros.

- [ ] **Step 10: Nota de verificação manual (não automatizável nesta plan)**

Mesma observação da Task 6: **`detectarDocumentoRestrito` (correlação entre `id_documento` da URL e o id do ícone `anchorNA{id}` na árvore) não foi verificada contra uma instância SEI real** — é best-effort por design (spec já documenta isso), não é a única trava (checkbox de confirmação continua obrigatório independente desta detecção funcionar ou não). Registrar como pendente de validação manual, não bloqueante.

- [ ] **Step 11: Commit**

```bash
cd /c/sei/seirmg
git add src/content-scripts/documento_editar/index.ts
git commit -m "feat(ferramentas-ia): adiciona modo JusIA e bloqueio best-effort por restrição de acesso"
```

---

## Verificação final (fora do escopo de qualquer task individual)

Depois que todas as tasks estiverem completas e revisadas, a revisão final de branch deve confirmar:

1. `bunx tsc --noEmit`, `bun run test` e `bun run build` passam na branch completa.
2. `ferramentasIA.ativo = false` (padrão) não altera nenhum comportamento visível — sem botão de IA em nenhuma tela do editor.
3. Nenhuma chamada de rede é feita pra `chat.openai.com`/`gemini.google.com`/`claude.ai`/`ia.jusbrasil.com.br`/`notebooklm.google.com` em nenhum lugar do código (grep pelo domínio) — só `api.openai.com`/`generativelanguage.googleapis.com`/`api.anthropic.com` (chamadas de API) e `ia.jusbrasil.com.br` (só como `window.open`/`<img src>`, nunca `fetch`).
4. Numa instância SEI real (ou build carregada no Chrome, com pelo menos uma chave de API real cadastrada): abrir um documento pra edição, confirmar que o botão "✨ IA" aparece na barra do CKEditor (**item de risco não verificado nesta plan** — se não aparecer, revisar o seletor em `inserirBotaoNaBarra`), abrir o painel, marcar a confirmação, testar prompt livre/prontos/redigir com pelo menos um provedor configurado, confirmar que a resposta aparece em pré-visualização e só entra no documento ao clicar "Inserir".
5. Testar o modo JusIA: confirma que copia o texto selecionado e abre `ia.jusbrasil.com.br` numa aba nova, sem nenhuma chamada de rede nossa.
6. Se possível, testar num documento com acesso restrito/sigiloso pra confirmar (ou não) a detecção automática — de qualquer forma, confirmar que o checkbox de confirmação continua sendo exigido independente disso.
7. Confirmar que as Opções (aba "Editor de Documentos") salvam e recarregam corretamente a chave/modelo dos três provedores e o toggle de ativação.
