# SEIRMG — Scaffold do Projeto + Notificação de Bloco de Assinatura (Etapa 2 + Etapa 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a extensão SEIRMG do zero (TypeScript + Vite + CRXJS + Bun), com toda a infraestrutura central (storage tipado, motor de tema, options UI nativa, popup) e a funcionalidade nova de notificação de bloco de assinatura pendente (MutationObserver + `chrome.alarms` + `chrome.notifications`), produzindo uma extensão real, instalável no Chrome, com essa feature-chave funcionando de ponta a ponta.

**Architecture:** Ver `docs/superpowers/specs/2026-07-06-seirmg-arquitetura-design.md`. Manifest V3 único gerado por `@crxjs/vite-plugin` a partir de `manifest.config.ts`. Um content script por tela/ação do SEI. Lógica pura e testável isolada em `src/features/*` e `src/lib/*`; wiring de `chrome.*` (não testável por TDD) fica fino nas camadas `background/index.ts` e `content-scripts/*/index.ts`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun (gerenciador de pacotes/scripts), Vitest (+ jsdom), ESLint (flat config, `typescript-eslint`), jQuery (dependência de pacote, ainda não usada nesta entrega), `lucide-static` (ícones).

## Global Constraints

- Manifest V3 apenas, alvo Google Chrome (não precisa compatibilidade cross-browser).
- Sem migração automática de dados dos projetos antigos (Sei++/Sei Pro) — decisão validada do usuário.
- Sem módulo "Atividades" do Sei Pro e sem mapeamento processo↔cartão do Planka nesta entrega (fora de escopo).
- Ícones: logo oficial "SEI!" (fornecido em `icones/icones.png`) para o ícone da extensão; `lucide-static` para ícones de UI — nunca Font Awesome Pro.
- Tema: motor único (preset `claro`/`black`/`super-black`/`custom`), aplicado via classe CSS — não recriar os dois mecanismos antigos em paralelo.
- Indicador de pendência consolidado: badge fixo ao lado do logo do SEI (estilo Sei++), não contador de favicon.
- Toda chamada de rede usa timeout curto e nunca lança exceção não tratada através de uma fronteira de mensageria (background ↔ content script).
- Sem commits git obrigatórios entre passos (usuário não tem git configurado no momento) — os passos de `git add`/`git commit` do template abaixo são **opcionais**: execute-os apenas se o ambiente tiver git disponível e configurado; caso contrário, pule para o próximo passo sem interromper a tarefa.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── package.json / bun.lock / tsconfig.json / vite.config.ts / vitest.config.ts / eslint.config.js / .gitignore
├── manifest.config.ts
├── scripts/crop-icons.py
├── src/
│   ├── vite-env.d.ts
│   ├── lib/
│   │   ├── result.ts (+ .test.ts)
│   │   ├── storage.ts (+ .test.ts)
│   │   ├── theme.ts (+ .test.ts)
│   │   └── seiVersion.ts (+ .test.ts)
│   ├── features/bloco-assinatura/
│   │   ├── types.ts
│   │   ├── parser.ts (+ .test.ts)
│   │   └── diffPendentes.ts (+ .test.ts)
│   ├── background/
│   │   ├── index.ts
│   │   ├── blocoAssinaturaPipeline.ts (+ .test.ts)
│   │   ├── notifications/notify.ts (+ .test.ts)
│   │   └── alarms/blocoAssinaturaCheck.ts (+ .test.ts)
│   ├── content-scripts/
│   │   ├── core/index.ts, core/badge.ts, core/theme.css
│   │   └── rel_bloco_protocolo_listar/index.ts
│   ├── options/index.html, style.css, main.ts, tabs.ts (+ .test.ts)
│   ├── popup/index.html, main.ts
│   └── assets/icons/icon-{16,32,48,128}.png
├── README.md
└── CHANGELOG-UNIFICACAO.md
```

---

### Task 1: Scaffold do projeto (package.json, TS, git-ignore, dependências)

**Files:**
- Create: `C:\sei\seirmg\package.json`
- Create: `C:\sei\seirmg\tsconfig.json`
- Create: `C:\sei\seirmg\.gitignore`
- Create: `C:\sei\seirmg\eslint.config.js`

**Interfaces:** Nenhuma (configuração pura).

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "seirmg",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  }
}
```

- [ ] **Step 2: Instalar dependências com Bun**

Run:
```bash
cd C:\sei\seirmg
bun add jquery lucide-static
bun add -d vite @crxjs/vite-plugin typescript vitest jsdom @types/chrome @types/jquery eslint typescript-eslint @eslint/js globals
```

Expected: comandos terminam sem erro; `bun.lock` e `node_modules/` são criados.

- [ ] **Step 3: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["chrome", "vite/client"],
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src", "manifest.config.ts", "vite.config.ts"]
}
```

- [ ] **Step 4: Criar `.gitignore`**

```
node_modules
dist
.vite
*.log
```

- [ ] **Step 5: Criar `eslint.config.js`**

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
)
```

- [ ] **Step 6: Verificar que o TypeScript reconhece a configuração**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: `error TS18003: No inputs were found` (esperado — ainda não há arquivos em `src/`; confirma que o tsconfig é válido e será substituído por um erro diferente assim que existir código).

---

### Task 2: Manifest, build config e primeira extensão instalável

**Files:**
- Create: `C:\sei\seirmg\vite.config.ts`
- Create: `C:\sei\seirmg\manifest.config.ts`
- Create: `C:\sei\seirmg\src\vite-env.d.ts`
- Create: `C:\sei\seirmg\src\background\index.ts` (placeholder mínimo, substituído na Task 12)
- Create: `C:\sei\seirmg\src\assets\icons\icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` (placeholder 1x1 temporário — substituídos na Task 15)

**Interfaces:** Nenhuma ainda — este é o esqueleto mínimo para provar que o pipeline de build funciona.

- [ ] **Step 1: Criar ícones placeholder temporários (serão substituídos na Task 15)**

Run (na raiz do projeto):
```bash
python -c "
from PIL import Image
for tamanho in (16, 32, 48, 128):
    Image.new('RGBA', (tamanho, tamanho), (1, 127, 255, 255)).save(f'src/assets/icons/icon-{tamanho}.png')
"
```
Expected: 4 arquivos PNG criados em `src/assets/icons/`.

- [ ] **Step 2: Criar `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const content: string
  export default content
}
```

- [ ] **Step 3: Criar `src/background/index.ts` (placeholder mínimo)**

```ts
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SEIRMG] instalado')
})
```

- [ ] **Step 4: Criar `manifest.config.ts`**

```ts
import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'SEIRMG',
  description: 'Extensão unificada para o Sistema Eletrônico de Informações (SEI)',
  version: pkg.version,
  icons: {
    16: 'src/assets/icons/icon-16.png',
    32: 'src/assets/icons/icon-32.png',
    48: 'src/assets/icons/icon-48.png',
    128: 'src/assets/icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'src/assets/icons/icon-16.png',
      32: 'src/assets/icons/icon-32.png',
    },
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  permissions: ['storage', 'notifications', 'alarms'],
  host_permissions: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
  ],
  content_scripts: [
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/core/index.ts'],
      css: ['src/content-scripts/core/theme.css'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=bloco_assinatura_listar*',
        '*://*.org/*controlador.php?acao=bloco_assinatura_listar*',
      ],
      js: ['src/content-scripts/rel_bloco_protocolo_listar/index.ts'],
      run_at: 'document_idle',
    },
  ],
})
```

Nota: `src/content-scripts/core/index.ts`, `core/theme.css` e `rel_bloco_protocolo_listar/index.ts` ainda não existem — serão criados nas Tasks 13 e 14. O build desta task falhará até lá; isso é esperado e verificado no próximo passo apenas para confirmar a mensagem de erro correta (arquivo não encontrado), não sucesso completo.

- [ ] **Step 5: Criar `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
})
```

- [ ] **Step 6: Criar arquivos placeholder mínimos para os content scripts referenciados (substituídos nas Tasks 13/14), só para o build passar nesta task**

```ts
// src/content-scripts/core/index.ts
export {}
```
```css
/* src/content-scripts/core/theme.css */
```
```ts
// src/content-scripts/rel_bloco_protocolo_listar/index.ts
export {}
```

E os HTML mínimos referenciados no manifest:
```html
<!-- src/popup/index.html -->
<!doctype html>
<html><body><div id="app">SEIRMG</div></body></html>
```
```html
<!-- src/options/index.html -->
<!doctype html>
<html><body><div id="app">Opções SEIRMG</div></body></html>
```

- [ ] **Step 7: Rodar o build e confirmar que gera um `dist/manifest.json` válido**

Run: `cd C:\sei\seirmg && bun run build`
Expected: saída sem erros, pasta `dist/` criada contendo `manifest.json`, `src/background/index.ts` compilado, `src/popup/index.html`, `src/options/index.html` e os ícones.

- [ ] **Step 8: Carregar a extensão no Chrome para confirmar que instala sem erros**

Instrução manual (documentar no README na Task 19): abrir `chrome://extensions`, ativar "Modo do desenvolvedor", clicar "Carregar sem compactação" e selecionar `C:\sei\seirmg\dist`.
Expected: extensão "SEIRMG" aparece na lista sem erros vermelhos.

---

### Task 3: `lib/result.ts` — wrapper tipado de fetch com timeout

**Files:**
- Create: `C:\sei\seirmg\src\lib\result.ts`
- Test: `C:\sei\seirmg\src\lib\result.test.ts`
- Create: `C:\sei\seirmg\vitest.config.ts`

**Interfaces:**
- Produces: `type Result<T> = { ok: true; data: T } | { ok: false; error: string }`; `fetchText(url: string, options?: FetchWithTimeoutOptions): Promise<Result<string>>`

- [ ] **Step 1: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/lib/result.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchText } from './result'

describe('fetchText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna ok com o texto da resposta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('conteudo') })
    )
    const resultado = await fetchText('https://exemplo.br')
    expect(resultado).toEqual({ ok: true, data: 'conteudo' })
  })

  it('retorna erro quando a resposta HTTP não é ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') })
    )
    const resultado = await fetchText('https://exemplo.br')
    expect(resultado).toEqual({ ok: false, error: 'HTTP 500' })
  })

  it('retorna erro quando a requisição estoura o timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const resultado = await fetchText('https://exemplo.br', { timeoutMs: 10 })
    expect(resultado.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `bunx vitest run src/lib/result.test.ts`
Expected: FAIL — `Cannot find module './result'`

- [ ] **Step 4: Implementar `src/lib/result.ts`**

```ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number
}

export async function fetchText(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Result<string>> {
  const { timeoutMs = 8000, ...init } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }
    const text = await response.text()
    return { ok: true, data: text }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/result.test.ts`
Expected: PASS (3 testes)

---

### Task 4: `lib/storage.ts` — storage tipado (sync/local)

**Files:**
- Create: `C:\sei\seirmg\src\lib\storage.ts`
- Test: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `SyncConfig`, `LocalConfig`, `ThemeConfig`, `ThemePreset`, `NotificadoState`, `DEFAULT_SYNC_CONFIG`, `DEFAULT_LOCAL_CONFIG`, `StorageArea`, `createSyncConfigStore(area?: StorageArea): { get(): Promise<SyncConfig>; set(c: SyncConfig): Promise<void> }`, `createLocalConfigStore(area?: StorageArea): { get(): Promise<LocalConfig>; set(c: LocalConfig): Promise<void> }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/storage.test.ts
import { describe, expect, it } from 'vitest'
import {
  createLocalConfigStore,
  createSyncConfigStore,
  DEFAULT_LOCAL_CONFIG,
  DEFAULT_SYNC_CONFIG,
  type StorageArea,
} from './storage'

function criarAreaFalsa(): StorageArea {
  const dados = new Map<string, unknown>()
  return {
    async get<T>(keys: string | string[] | null) {
      const chaves = keys === null ? Array.from(dados.keys()) : Array.isArray(keys) ? keys : [keys]
      const resultado: Record<string, T> = {}
      chaves.forEach((chave) => {
        if (dados.has(chave)) resultado[chave] = dados.get(chave) as T
      })
      return resultado
    },
    async set(items: Record<string, unknown>) {
      Object.entries(items).forEach(([chave, valor]) => dados.set(chave, valor))
    },
  }
}

describe('createSyncConfigStore', () => {
  it('retorna a configuração padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect(await store.get()).toEqual(DEFAULT_SYNC_CONFIG)
  })

  it('persiste e recupera alterações', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = { ...DEFAULT_SYNC_CONFIG, tema: { preset: 'black' as const } }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
})

describe('createLocalConfigStore', () => {
  it('retorna a configuração padrão quando vazio', async () => {
    const store = createLocalConfigStore(criarAreaFalsa())
    expect(await store.get()).toEqual(DEFAULT_LOCAL_CONFIG)
  })

  it('persiste o estado de itens já notificados', async () => {
    const area = criarAreaFalsa()
    const store = createLocalConfigStore(area)
    const atualizado = {
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaNotificado: { abc: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `Cannot find module './storage'`

- [ ] **Step 3: Implementar `src/lib/storage.ts`**

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
}

export type ThemePreset = 'claro' | 'black' | 'super-black' | 'custom'

export interface ThemeConfig {
  preset: ThemePreset
  customColor?: string
}

export interface BlocoAssinaturaConfig {
  ativo: boolean
  intervaloMinutos: number
  tocarSom: boolean
}

export interface SyncConfig {
  schemaVersion: 1
  featureFlags: FeatureFlags
  tema: ThemeConfig
  blocoAssinatura: BlocoAssinaturaConfig
}

export interface NotificadoState {
  [itemId: string]: { notificadoEm: string }
}

export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  baseUrlSei?: string
  seiVersionAtLeast4?: boolean
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  schemaVersion: 1,
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
  },
  tema: { preset: 'claro' },
  blocoAssinatura: {
    ativo: true,
    intervaloMinutos: 15,
    tocarSom: true,
  },
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
}

export interface StorageArea {
  get<T>(keys: string | string[] | null): Promise<Record<string, T>>
  set(items: Record<string, unknown>): Promise<void>
}

function wrapChromeStorageArea(area: chrome.storage.StorageArea): StorageArea {
  return {
    get<T>(keys: string | string[] | null) {
      return new Promise((resolve) => {
        area.get(keys, (result) => resolve(result as Record<string, T>))
      })
    },
    set(items: Record<string, unknown>) {
      return new Promise((resolve) => {
        area.set(items, () => resolve())
      })
    },
  }
}

export function createSyncConfigStore(area?: StorageArea) {
  const storageArea = area ?? wrapChromeStorageArea(chrome.storage.sync)
  return {
    async get(): Promise<SyncConfig> {
      const result = await storageArea.get<SyncConfig>('config')
      return result.config ?? DEFAULT_SYNC_CONFIG
    },
    async set(config: SyncConfig): Promise<void> {
      await storageArea.set({ config })
    },
  }
}

export function createLocalConfigStore(area?: StorageArea) {
  const storageArea = area ?? wrapChromeStorageArea(chrome.storage.local)
  return {
    async get(): Promise<LocalConfig> {
      const result = await storageArea.get<LocalConfig>('localConfig')
      return result.localConfig ?? DEFAULT_LOCAL_CONFIG
    },
    async set(config: LocalConfig): Promise<void> {
      await storageArea.set({ localConfig: config })
    },
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (4 testes)

---

### Task 5: `lib/theme.ts` — motor de tema

**Files:**
- Create: `C:\sei\seirmg\src\lib\theme.ts`
- Test: `C:\sei\seirmg\src\lib\theme.test.ts`
- Create: `C:\sei\seirmg\src\content-scripts\core\theme.css` (substitui o placeholder da Task 2)

**Interfaces:**
- Consumes: `ThemeConfig`, `ThemePreset` (de `../lib/storage`, Task 4)
- Produces: `computeThemeClassName(theme: ThemeConfig): string`, `applyTheme(target: HTMLElement, theme: ThemeConfig): void`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/theme.test.ts
import { describe, expect, it } from 'vitest'
import { applyTheme, computeThemeClassName } from './theme'

describe('computeThemeClassName', () => {
  it('retorna vazio para o tema claro', () => {
    expect(computeThemeClassName({ preset: 'claro' })).toBe('')
  })

  it('retorna a classe do preset black', () => {
    expect(computeThemeClassName({ preset: 'black' })).toBe('seirmg-theme-black')
  })
})

describe('applyTheme', () => {
  it('aplica a classe do preset e remove as demais', () => {
    const el = document.createElement('div')
    el.classList.add('seirmg-theme-black')
    applyTheme(el, { preset: 'super-black' })
    expect(el.classList.contains('seirmg-theme-black')).toBe(false)
    expect(el.classList.contains('seirmg-theme-super-black')).toBe(true)
  })

  it('define a cor customizada via variável CSS quando o preset é custom', () => {
    const el = document.createElement('div')
    applyTheme(el, { preset: 'custom', customColor: '#017fff' })
    expect(el.style.getPropertyValue('--seirmg-accent-color')).toBe('#017fff')
  })

  it('remove a variável de cor customizada quando o preset não é custom', () => {
    const el = document.createElement('div')
    el.style.setProperty('--seirmg-accent-color', '#ff0000')
    applyTheme(el, { preset: 'claro' })
    expect(el.style.getPropertyValue('--seirmg-accent-color')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/lib/theme.test.ts`
Expected: FAIL — `Cannot find module './theme'`

- [ ] **Step 3: Implementar `src/lib/theme.ts`**

```ts
import type { ThemeConfig, ThemePreset } from './storage'

const PRESET_CLASS: Record<ThemePreset, string> = {
  claro: '',
  black: 'seirmg-theme-black',
  'super-black': 'seirmg-theme-super-black',
  custom: 'seirmg-theme-custom',
}

const THEME_CLASSES = Object.values(PRESET_CLASS).filter(Boolean)

export function computeThemeClassName(theme: ThemeConfig): string {
  return PRESET_CLASS[theme.preset]
}

export function applyTheme(target: HTMLElement, theme: ThemeConfig): void {
  THEME_CLASSES.forEach((className) => target.classList.remove(className))
  const className = computeThemeClassName(theme)
  if (className) target.classList.add(className)

  if (theme.preset === 'custom' && theme.customColor) {
    target.style.setProperty('--seirmg-accent-color', theme.customColor)
  } else {
    target.style.removeProperty('--seirmg-accent-color')
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/theme.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Criar `src/content-scripts/core/theme.css`**

Nota de escopo: esta entrega estabelece o *mecanismo* do motor de tema (classe + variável CSS). A paleta visual completa (portada de `sei-slim.css`/`themes/black.css` dos projetos originais, ~400 regras) é trabalho de um plano futuro de migração de features — aqui ficam só as regras mínimas que provam o mecanismo funcionando.

```css
:root {
  --seirmg-accent-color: #017fff;
}

.seirmg-theme-black {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}

.seirmg-theme-super-black {
  background-color: #000000 !important;
  color: #ffffff !important;
}

.seirmg-theme-custom a,
.seirmg-theme-custom .infraBotao {
  color: var(--seirmg-accent-color) !important;
}
```

---

### Task 6: `lib/seiVersion.ts` — detecção de versão do SEI

**Files:**
- Create: `C:\sei\seirmg\src\lib\seiVersion.ts`
- Test: `C:\sei\seirmg\src\lib\seiVersion.test.ts`

**Interfaces:**
- Produces: `detectarSeiVersionAtLeast4(doc: Document): boolean`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/lib/seiVersion.test.ts
import { describe, expect, it } from 'vitest'
import { detectarSeiVersionAtLeast4 } from './seiVersion'

function criarDocumentoComScript(src: string | null): Document {
  const doc = document.implementation.createHTMLDocument('teste')
  if (src) {
    const script = doc.createElement('script')
    script.setAttribute('src', src)
    doc.body.appendChild(script)
  }
  return doc
}

describe('detectarSeiVersionAtLeast4', () => {
  it('retorna true para versão 4.x', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript('js/sei.js?4.0.1'))).toBe(true)
  })

  it('retorna true para versão 5.x', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript('js/sei.js?5.0.0'))).toBe(true)
  })

  it('retorna false para versão 3.x', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript('js/sei.js?3.2.0'))).toBe(false)
  })

  it('assume true quando a versão não é detectável', () => {
    expect(detectarSeiVersionAtLeast4(criarDocumentoComScript(null))).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/lib/seiVersion.test.ts`
Expected: FAIL — `Cannot find module './seiVersion'`

- [ ] **Step 3: Implementar `src/lib/seiVersion.ts`**

```ts
export function detectarSeiVersionAtLeast4(doc: Document): boolean {
  const script = doc.querySelector('script[src*="sei.js?"]')
  const src = script?.getAttribute('src') ?? ''
  const match = src.match(/sei\.js\?(\d+)/)
  if (!match) return true
  const primeiroDigito = Number(match[1][0])
  return primeiroDigito >= 4
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/seiVersion.test.ts`
Expected: PASS (4 testes)

---

### Task 7: `features/bloco-assinatura/parser.ts` — parser do bloco de assinatura (porte de `verificarBlocoAssinatura.js`)

**Files:**
- Create: `C:\sei\seirmg\src\features\bloco-assinatura\types.ts`
- Create: `C:\sei\seirmg\src\features\bloco-assinatura\parser.ts`
- Test: `C:\sei\seirmg\src\features\bloco-assinatura\parser.test.ts`

**Contexto**: porte fiel de `C:\sei\seiplus\cs_modules\core\idle\verificarBlocoAssinatura.js`, que lê `#divInfraAreaTabela > table > tbody > tr` e classifica cada linha (cada linha = um **bloco**, não um documento individual) usando os índices de coluna 4 (Estado) e 6 (Disponibilização) para SEI >= 4.0.0.0, ou 2 e 4 para versões anteriores. Esta versão estende o original (que só contava totais) para também extrair um **ID estável por linha** (href do primeiro link da linha, com fallback para hash do texto) — necessário para o deduplicador de notificações da Task 8.

**Interfaces:**
- Consumes: nenhuma
- Produces: `type EstadoBloco = 'disponibilizado_para_area' | 'disponibilizado_pela_area' | 'aberto' | 'retornado'`; `interface BlocoAssinaturaItem { id: string; numero: string; link: string; estado: EstadoBloco }`; `parseBlocoAssinaturaTable(root: ParentNode, options: { seiVersionAtLeast4: boolean }): BlocoAssinaturaItem[]`; `resumirBlocos(itens: BlocoAssinaturaItem[]): { totalDisponibilizadoParaArea: number; totalDisponibilizadoPelaArea: number; totalAberto: number; totalRetornado: number }`

- [ ] **Step 1: Criar `src/features/bloco-assinatura/types.ts`**

```ts
export type EstadoBloco =
  | 'disponibilizado_para_area'
  | 'disponibilizado_pela_area'
  | 'aberto'
  | 'retornado'

export interface BlocoAssinaturaItem {
  id: string
  numero: string
  link: string
  estado: EstadoBloco
}

export interface BlocoAssinaturaResumo {
  totalDisponibilizadoParaArea: number
  totalDisponibilizadoPelaArea: number
  totalAberto: number
  totalRetornado: number
}
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// src/features/bloco-assinatura/parser.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { parseBlocoAssinaturaTable, resumirBlocos } from './parser'

function montarLinha(celulas: string[]): string {
  return `<tr>${celulas.map((c) => `<td>${c}</td>`).join('')}</tr>`
}

function montarTabelaV4(linhasDados: string[]): string {
  const cabecalho = montarLinha(['', 'Nº', 'Tipo', 'Data', 'Estado', 'Unidade', 'Disponibilização'])
  return `<div id="divInfraAreaTabela"><table><tbody>${cabecalho}${linhasDados.join('')}</tbody></table></div>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseBlocoAssinaturaTable (SEI >= 4.0)', () => {
  it('classifica disponibilizado para a área quando a disponibilização está em branco', () => {
    const linha = montarLinha([
      '', '<a href="/bloco/1">1</a>', 'Assinatura', '01/01/2026', 'Disponibilizado', 'UNIDADE-A', '',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const itens = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })

    expect(itens).toEqual([
      { id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'disponibilizado_para_area' },
    ])
  })

  it('classifica disponibilizado pela área quando a disponibilização está preenchida', () => {
    const linha = montarLinha([
      '', '<a href="/bloco/2">2</a>', 'Assinatura', '01/01/2026', 'Disponibilizado', 'UNIDADE-A', 'SETIC',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.estado).toBe('disponibilizado_pela_area')
  })

  it.each([
    ['Aberto', 'aberto'],
    ['Gerado', 'aberto'],
    ['Retornado', 'retornado'],
    ['Recebido', 'disponibilizado_para_area'],
  ])('classifica estado "%s" como "%s"', (textoEstado, esperado) => {
    const linha = montarLinha([
      '', '<a href="/bloco/3">3</a>', 'Assinatura', '01/01/2026', textoEstado, 'UNIDADE-A', '',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.estado).toBe(esperado)
  })

  it('ignora a linha de cabeçalho', () => {
    document.body.innerHTML = montarTabelaV4([])
    expect(parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })).toHaveLength(0)
  })

  it('usa um id de fallback quando a linha não tem link', () => {
    const linha = montarLinha(['', '5', 'Assinatura', '01/01/2026', 'Aberto', 'UNIDADE-A', ''])
    document.body.innerHTML = montarTabelaV4([linha])
    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.id.startsWith('linha:')).toBe(true)
  })
})

describe('resumirBlocos', () => {
  it('conta os itens por estado', () => {
    const resumo = resumirBlocos([
      { id: '1', numero: '1', link: '', estado: 'disponibilizado_para_area' },
      { id: '2', numero: '2', link: '', estado: 'disponibilizado_para_area' },
      { id: '3', numero: '3', link: '', estado: 'disponibilizado_pela_area' },
      { id: '4', numero: '4', link: '', estado: 'aberto' },
      { id: '5', numero: '5', link: '', estado: 'retornado' },
    ])
    expect(resumo).toEqual({
      totalDisponibilizadoParaArea: 2,
      totalDisponibilizadoPelaArea: 1,
      totalAberto: 1,
      totalRetornado: 1,
    })
  })
})
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `bunx vitest run src/features/bloco-assinatura/parser.test.ts`
Expected: FAIL — `Cannot find module './parser'`

- [ ] **Step 4: Implementar `src/features/bloco-assinatura/parser.ts`**

```ts
import type { BlocoAssinaturaItem, BlocoAssinaturaResumo, EstadoBloco } from './types'

export interface ParseBlocoAssinaturaOptions {
  seiVersionAtLeast4: boolean
}

function classificarEstado(
  textoEstado: string,
  textoDisponibilizacao: string
): EstadoBloco | undefined {
  if (textoEstado === 'Disponibilizado') {
    return textoDisponibilizacao.trim() !== ''
      ? 'disponibilizado_pela_area'
      : 'disponibilizado_para_area'
  }
  if (textoEstado === 'Aberto' || textoEstado === 'Gerado') return 'aberto'
  if (textoEstado === 'Retornado') return 'retornado'
  if (textoEstado === 'Recebido') return 'disponibilizado_para_area'
  return undefined
}

function extrairIdEstavel(row: Element, numero: string, link: string): string {
  if (link) return link
  return `linha:${numero}:${row.textContent?.trim().slice(0, 80) ?? ''}`
}

export function parseBlocoAssinaturaTable(
  root: ParentNode,
  options: ParseBlocoAssinaturaOptions
): BlocoAssinaturaItem[] {
  const linhas = Array.from(root.querySelectorAll('#divInfraAreaTabela > table > tbody > tr'))
  const indiceEstado = options.seiVersionAtLeast4 ? 4 : 2
  const indiceDisponibilizacao = options.seiVersionAtLeast4 ? 6 : 4

  const itens: BlocoAssinaturaItem[] = []

  linhas.forEach((linha, index) => {
    if (index === 0) return // linha de cabeçalho

    const celulas = linha.children
    const celulaEstado = celulas.item(indiceEstado)
    if (!celulaEstado) return

    const celulaDisponibilizacao = celulas.item(indiceDisponibilizacao)
    const textoEstado = celulaEstado.textContent?.trim() ?? ''
    const textoDisponibilizacao = celulaDisponibilizacao?.textContent?.trim() ?? ''
    const estado = classificarEstado(textoEstado, textoDisponibilizacao)
    if (!estado) return

    const primeiraCelulaLink = linha.querySelector('a')
    const numero = primeiraCelulaLink?.textContent?.trim() ?? `linha-${index}`
    const link = primeiraCelulaLink?.getAttribute('href') ?? ''

    itens.push({
      id: extrairIdEstavel(linha, numero, link),
      numero,
      link,
      estado,
    })
  })

  return itens
}

export function resumirBlocos(itens: BlocoAssinaturaItem[]): BlocoAssinaturaResumo {
  return itens.reduce<BlocoAssinaturaResumo>(
    (resumo, item) => {
      switch (item.estado) {
        case 'disponibilizado_para_area':
          resumo.totalDisponibilizadoParaArea++
          break
        case 'disponibilizado_pela_area':
          resumo.totalDisponibilizadoPelaArea++
          break
        case 'aberto':
          resumo.totalAberto++
          break
        case 'retornado':
          resumo.totalRetornado++
          break
      }
      return resumo
    },
    {
      totalDisponibilizadoParaArea: 0,
      totalDisponibilizadoPelaArea: 0,
      totalAberto: 0,
      totalRetornado: 0,
    }
  )
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/bloco-assinatura/parser.test.ts`
Expected: PASS (8 testes)

---

### Task 8: `features/bloco-assinatura/diffPendentes.ts` — deduplicação de notificação

**Files:**
- Create: `C:\sei\seirmg\src\features\bloco-assinatura\diffPendentes.ts`
- Test: `C:\sei\seirmg\src\features\bloco-assinatura\diffPendentes.test.ts`

**Interfaces:**
- Consumes: `BlocoAssinaturaItem`, `EstadoBloco` (Task 7); `NotificadoState` (Task 4)
- Produces: `diffPendentes(itens: BlocoAssinaturaItem[], jaNotificados: NotificadoState, agoraIso: string): { novos: BlocoAssinaturaItem[]; estadoAtualizado: NotificadoState }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/features/bloco-assinatura/diffPendentes.test.ts
import { describe, expect, it } from 'vitest'
import { diffPendentes } from './diffPendentes'
import type { BlocoAssinaturaItem } from './types'

const itemPendente: BlocoAssinaturaItem = { id: 'a', numero: '1', link: '/a', estado: 'disponibilizado_para_area' }
const itemAberto: BlocoAssinaturaItem = { id: 'b', numero: '2', link: '/b', estado: 'aberto' }
const itemPelaArea: BlocoAssinaturaItem = { id: 'c', numero: '3', link: '/c', estado: 'disponibilizado_pela_area' }
const itemRetornado: BlocoAssinaturaItem = { id: 'd', numero: '4', link: '/d', estado: 'retornado' }

describe('diffPendentes', () => {
  it('considera novo um item pendente ainda não notificado', () => {
    const { novos, estadoAtualizado } = diffPendentes([itemPendente], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([itemPendente])
    expect(estadoAtualizado).toEqual({ a: { notificadoEm: '2026-07-06T10:00:00.000Z' } })
  })

  it('não repete notificação para item já notificado', () => {
    const { novos } = diffPendentes(
      [itemPendente],
      { a: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(novos).toEqual([])
  })

  it('ignora itens disponibilizados pela própria área (não são pendência)', () => {
    const { novos } = diffPendentes([itemPelaArea], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([])
  })

  it('ignora itens retornados (não são pendência)', () => {
    const { novos } = diffPendentes([itemRetornado], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([])
  })

  it('trata "aberto" como pendente', () => {
    const { novos } = diffPendentes([itemAberto], {}, '2026-07-06T10:00:00.000Z')
    expect(novos).toEqual([itemAberto])
  })

  it('preserva o estado de notificações anteriores não relacionadas', () => {
    const { estadoAtualizado } = diffPendentes(
      [itemAberto],
      { z: { notificadoEm: '2026-01-01T00:00:00.000Z' } },
      '2026-07-06T10:00:00.000Z'
    )
    expect(estadoAtualizado).toEqual({
      z: { notificadoEm: '2026-01-01T00:00:00.000Z' },
      b: { notificadoEm: '2026-07-06T10:00:00.000Z' },
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/features/bloco-assinatura/diffPendentes.test.ts`
Expected: FAIL — `Cannot find module './diffPendentes'`

- [ ] **Step 3: Implementar `src/features/bloco-assinatura/diffPendentes.ts`**

```ts
import type { NotificadoState } from '../../lib/storage'
import type { BlocoAssinaturaItem } from './types'

export interface DiffResultado {
  novos: BlocoAssinaturaItem[]
  estadoAtualizado: NotificadoState
}

export function diffPendentes(
  itens: BlocoAssinaturaItem[],
  jaNotificados: NotificadoState,
  agoraIso: string
): DiffResultado {
  const pendentes = itens.filter(
    (item) => item.estado === 'disponibilizado_para_area' || item.estado === 'aberto'
  )
  const novos = pendentes.filter((item) => !(item.id in jaNotificados))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  novos.forEach((item) => {
    estadoAtualizado[item.id] = { notificadoEm: agoraIso }
  })

  return { novos, estadoAtualizado }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/bloco-assinatura/diffPendentes.test.ts`
Expected: PASS (6 testes)

---

### Task 9: `background/notifications/notify.ts` — criação de notificação nativa

**Files:**
- Create: `C:\sei\seirmg\src\background\notifications\notify.ts`
- Test: `C:\sei\seirmg\src\background\notifications\notify.test.ts`

**Interfaces:**
- Consumes: `BlocoAssinaturaItem` (Task 7)
- Produces: `buildNotificationId(item: BlocoAssinaturaItem): string`; `notificarNovoBloco(item: BlocoAssinaturaItem, tocarSom: boolean): void`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/background/notifications/notify.test.ts
import { describe, expect, it } from 'vitest'
import { buildNotificationId } from './notify'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

describe('buildNotificationId', () => {
  it('prefixa o id do item', () => {
    const item: BlocoAssinaturaItem = { id: 'abc123', numero: '10', link: '/x', estado: 'aberto' }
    expect(buildNotificationId(item)).toBe('seirmg-bloco-assinatura-abc123')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/background/notifications/notify.test.ts`
Expected: FAIL — `Cannot find module './notify'`

- [ ] **Step 3: Implementar `src/background/notifications/notify.ts`**

```ts
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'

export const NOTIFICATION_ID_PREFIX = 'seirmg-bloco-assinatura-'

export function buildNotificationId(item: BlocoAssinaturaItem): string {
  return `${NOTIFICATION_ID_PREFIX}${item.id}`
}

export function notificarNovoBloco(item: BlocoAssinaturaItem, tocarSom: boolean): void {
  chrome.notifications.create(buildNotificationId(item), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/assets/icons/icon-128.png'),
    title: 'SEIRMG — Bloco de assinatura pendente',
    message: `Bloco ${item.numero} está com pendência de assinatura.`,
    priority: 2,
    silent: !tocarSom,
  })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/notifications/notify.test.ts`
Expected: PASS (1 teste)

---

### Task 10: `background/blocoAssinaturaPipeline.ts` — orquestração (diff + notificar + persistir)

**Files:**
- Create: `C:\sei\seirmg\src\background\blocoAssinaturaPipeline.ts`
- Test: `C:\sei\seirmg\src\background\blocoAssinaturaPipeline.test.ts`

**Interfaces:**
- Consumes: `diffPendentes` (Task 8); `createSyncConfigStore`, `createLocalConfigStore`, `DEFAULT_SYNC_CONFIG`, `DEFAULT_LOCAL_CONFIG` (Task 4); `notificarNovoBloco` (Task 9); `BlocoAssinaturaItem` (Task 7)
- Produces: `processarItensBlocoAssinatura(itens: BlocoAssinaturaItem[], deps?: BlocoAssinaturaPipelineDeps): Promise<void>` — usada pelo alarme (Task 11) e pelo listener de mensagens do content script (Task 12)

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/background/blocoAssinaturaPipeline.test.ts
import { describe, expect, it, vi } from 'vitest'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { DEFAULT_LOCAL_CONFIG, DEFAULT_SYNC_CONFIG } from '../lib/storage'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const item: BlocoAssinaturaItem = { id: 'x', numero: '9', link: '/x', estado: 'aberto' }

describe('processarItensBlocoAssinatura', () => {
  it('notifica e persiste quando há item novo pendente', async () => {
    const notificar = vi.fn()
    let localSalvo: unknown

    await processarItensBlocoAssinatura([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => DEFAULT_LOCAL_CONFIG,
        set: async (config) => {
          localSalvo = config
        },
      },
      notificar,
      agoraIso: '2026-07-06T10:00:00.000Z',
    })

    expect(notificar).toHaveBeenCalledWith(item, DEFAULT_SYNC_CONFIG.blocoAssinatura.tocarSom)
    expect(localSalvo).toEqual({
      ...DEFAULT_LOCAL_CONFIG,
      blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-06T10:00:00.000Z' } },
    })
  })

  it('não notifica quando a feature está desativada nas opções', async () => {
    const notificar = vi.fn()

    await processarItensBlocoAssinatura([item], {
      syncStore: {
        get: async () => ({
          ...DEFAULT_SYNC_CONFIG,
          blocoAssinatura: { ...DEFAULT_SYNC_CONFIG.blocoAssinatura, ativo: false },
        }),
        set: async () => {},
      },
      localStore: { get: async () => DEFAULT_LOCAL_CONFIG, set: async () => {} },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })

  it('não notifica novamente um item já registrado como notificado', async () => {
    const notificar = vi.fn()

    await processarItensBlocoAssinatura([item], {
      syncStore: { get: async () => DEFAULT_SYNC_CONFIG, set: async () => {} },
      localStore: {
        get: async () => ({
          ...DEFAULT_LOCAL_CONFIG,
          blocoAssinaturaNotificado: { x: { notificadoEm: '2026-07-01T00:00:00.000Z' } },
        }),
        set: async () => {},
      },
      notificar,
    })

    expect(notificar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/background/blocoAssinaturaPipeline.test.ts`
Expected: FAIL — `Cannot find module './blocoAssinaturaPipeline'`

- [ ] **Step 3: Implementar `src/background/blocoAssinaturaPipeline.ts`**

```ts
import { diffPendentes } from '../features/bloco-assinatura/diffPendentes'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import { notificarNovoBloco } from './notifications/notify'

type SyncStore = ReturnType<typeof createSyncConfigStore>
type LocalStore = ReturnType<typeof createLocalConfigStore>

export interface BlocoAssinaturaPipelineDeps {
  syncStore?: SyncStore
  localStore?: LocalStore
  notificar?: typeof notificarNovoBloco
  agoraIso?: string
}

export async function processarItensBlocoAssinatura(
  itens: BlocoAssinaturaItem[],
  deps: BlocoAssinaturaPipelineDeps = {}
): Promise<void> {
  const syncStore = deps.syncStore ?? createSyncConfigStore()
  const localStore = deps.localStore ?? createLocalConfigStore()
  const notificar = deps.notificar ?? notificarNovoBloco
  const agoraIso = deps.agoraIso ?? new Date().toISOString()

  const config = await syncStore.get()
  if (!config.blocoAssinatura.ativo) return

  const localConfig = await localStore.get()
  const { novos, estadoAtualizado } = diffPendentes(
    itens,
    localConfig.blocoAssinaturaNotificado,
    agoraIso
  )
  if (novos.length === 0) return

  novos.forEach((item) => notificar(item, config.blocoAssinatura.tocarSom))
  await localStore.set({ ...localConfig, blocoAssinaturaNotificado: estadoAtualizado })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/blocoAssinaturaPipeline.test.ts`
Expected: PASS (3 testes)

---

### Task 11: `background/alarms/blocoAssinaturaCheck.ts` — verificação periódica via `chrome.alarms`

**Files:**
- Create: `C:\sei\seirmg\src\background\alarms\blocoAssinaturaCheck.ts`
- Test: `C:\sei\seirmg\src\background\alarms\blocoAssinaturaCheck.test.ts`

**Interfaces:**
- Consumes: `fetchText`, `Result` (Task 3); `parseBlocoAssinaturaTable`, `ParseBlocoAssinaturaOptions` (Task 7); `processarItensBlocoAssinatura` (Task 10)
- Produces: `ALARM_NAME: string`; `verificarBlocoAssinatura(deps: BlocoAssinaturaCheckDeps): Promise<void>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/background/alarms/blocoAssinaturaCheck.test.ts
import { describe, expect, it, vi } from 'vitest'
import { verificarBlocoAssinatura } from './blocoAssinaturaCheck'

describe('verificarBlocoAssinatura', () => {
  it('interrompe silenciosamente quando o fetch falha', async () => {
    const processarItens = vi.fn()
    await verificarBlocoAssinatura({
      fetchBlocoAssinaturaHtml: async () => ({ ok: false, error: 'timeout' }),
      parseOptions: { seiVersionAtLeast4: true },
      processarItens,
    })
    expect(processarItens).not.toHaveBeenCalled()
  })

  it('faz parse do HTML retornado e delega os itens para processarItens', async () => {
    const processarItens = vi.fn()
    const html = `<div id="divInfraAreaTabela"><table><tbody>
      <tr><td></td><td>Nº</td><td>Tipo</td><td>Data</td><td>Estado</td><td>Unidade</td><td>Disp</td></tr>
      <tr><td></td><td><a href="/bloco/1">1</a></td><td>Assinatura</td><td>01/01/2026</td><td>Aberto</td><td>UNIDADE-A</td><td></td></tr>
    </tbody></table></div>`

    await verificarBlocoAssinatura({
      fetchBlocoAssinaturaHtml: async () => ({ ok: true, data: html }),
      parseOptions: { seiVersionAtLeast4: true },
      processarItens,
    })

    expect(processarItens).toHaveBeenCalledWith([
      { id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'aberto' },
    ])
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/background/alarms/blocoAssinaturaCheck.test.ts`
Expected: FAIL — `Cannot find module './blocoAssinaturaCheck'`

- [ ] **Step 3: Implementar `src/background/alarms/blocoAssinaturaCheck.ts`**

```ts
import type { Result } from '../../lib/result'
import {
  parseBlocoAssinaturaTable,
  type ParseBlocoAssinaturaOptions,
} from '../../features/bloco-assinatura/parser'
import type { BlocoAssinaturaItem } from '../../features/bloco-assinatura/types'
import { processarItensBlocoAssinatura } from '../blocoAssinaturaPipeline'

export const ALARM_NAME = 'seirmg-check-bloco-assinatura'

export interface BlocoAssinaturaCheckDeps {
  fetchBlocoAssinaturaHtml: () => Promise<Result<string>>
  parseOptions: ParseBlocoAssinaturaOptions
  processarItens?: (itens: BlocoAssinaturaItem[]) => Promise<void>
}

export async function verificarBlocoAssinatura(deps: BlocoAssinaturaCheckDeps): Promise<void> {
  const processarItens = deps.processarItens ?? processarItensBlocoAssinatura

  const resultado = await deps.fetchBlocoAssinaturaHtml()
  if (!resultado.ok) return

  const dom = new DOMParser().parseFromString(resultado.data, 'text/html')
  const itens = parseBlocoAssinaturaTable(dom, deps.parseOptions)
  await processarItens(itens)
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/background/alarms/blocoAssinaturaCheck.test.ts`
Expected: PASS (2 testes)

---

### Task 12: `background/index.ts` — wiring completo do service worker

**Files:**
- Modify: `C:\sei\seirmg\src\background\index.ts` (substitui o placeholder da Task 2)

**Contexto**: esta camada só conecta `chrome.*` (alarms, notifications, runtime, tabs, windows) à lógica já testada nas tasks anteriores. Não é coberta por TDD (chrome.* não é mockável de forma útil aqui) — a verificação é manual (Step 3).

**Interfaces:**
- Consumes: `ALARM_NAME`, `verificarBlocoAssinatura` (Task 11); `processarItensBlocoAssinatura` (Task 10); `fetchText` (Task 3); `createLocalConfigStore`, `createSyncConfigStore` (Task 4); `BlocoAssinaturaItem` (Task 7)

- [ ] **Step 1: Substituir `src/background/index.ts`**

```ts
import { ALARM_NAME, verificarBlocoAssinatura } from './alarms/blocoAssinaturaCheck'
import { processarItensBlocoAssinatura } from './blocoAssinaturaPipeline'
import { fetchText } from '../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../lib/storage'
import type { BlocoAssinaturaItem } from '../features/bloco-assinatura/types'

const ACAO_BLOCO_ASSINATURA = 'bloco_assinatura_listar'

interface MensagemItensBloco {
  type: 'seirmg:bloco-assinatura:itens'
  itens: BlocoAssinaturaItem[]
}

function ehMensagemItensBloco(mensagem: unknown): mensagem is MensagemItensBloco {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:bloco-assinatura:itens'
  )
}

async function agendarAlarme(): Promise<void> {
  const config = await createSyncConfigStore().get()
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: config.blocoAssinatura.intervaloMinutos })
}

async function verificarBlocoAssinaturaViaFetch(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  await verificarBlocoAssinatura({
    fetchBlocoAssinaturaHtml: () =>
      fetchText(`${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`),
    parseOptions: { seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true },
  })
}

chrome.runtime.onInstalled.addListener(() => {
  agendarAlarme()
})

chrome.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name !== ALARM_NAME) return
  verificarBlocoAssinaturaViaFetch()
})

chrome.runtime.onMessage.addListener((mensagem) => {
  if (!ehMensagemItensBloco(mensagem)) return
  processarItensBlocoAssinatura(mensagem.itens)
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return

  const url = `${localConfig.baseUrlSei}/controlador.php?acao=${ACAO_BLOCO_ASSINATURA}`
  const [abaExistente] = await chrome.tabs.query({ url: `${localConfig.baseUrlSei}/*` })

  if (abaExistente?.id) {
    chrome.tabs.update(abaExistente.id, { active: true, url })
    if (abaExistente.windowId) chrome.windows.update(abaExistente.windowId, { focused: true })
  } else {
    chrome.tabs.create({ url })
  }
  chrome.notifications.clear(notificationId)
})
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `bunx vitest run`
Expected: todos os testes das Tasks 3-11 continuam passando.

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo (o `tsc` roda implicitamente via Vite/esbuild — se houver erro de tipo, rode `bun run typecheck` para ver o detalhe).

---

### Task 13: Content script `core` — bootstrap comum + badge de pendência

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\core\badge.ts`
- Modify: `C:\sei\seirmg\src\content-scripts\core\index.ts` (substitui o placeholder da Task 2)

**Interfaces:**
- Consumes: `createLocalConfigStore`, `createSyncConfigStore` (Task 4); `applyTheme` (Task 5); `detectarSeiVersionAtLeast4` (Task 6)
- Produces: `renderBadge(): Promise<void>` (consumida também pela Task 14)

- [ ] **Step 1: Criar `src/content-scripts/core/badge.ts`**

```ts
import { createLocalConfigStore } from '../../lib/storage'

const BADGE_ID = 'seirmg-badge-pendencias'

export async function renderBadge(): Promise<void> {
  const existente = document.getElementById(BADGE_ID)
  if (existente) existente.remove()

  const localConfig = await createLocalConfigStore().get()
  // conta itens rastreados como pendentes; remoção ao assinar/resolver fica para um plano futuro
  const totalPendente = Object.keys(localConfig.blocoAssinaturaNotificado).length
  if (totalPendente === 0) return

  const logo = document.querySelector('#lnkInfraLogo, #divLogoSEI, .infraLogo')
  const container = logo?.parentElement ?? document.body

  const badge = document.createElement('span')
  badge.id = BADGE_ID
  badge.textContent = String(totalPendente)
  badge.title = `${totalPendente} pendência(s) de assinatura`
  badge.style.cssText =
    'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:10px;' +
    'background:#e46e64;color:#fff;font-size:11px;font-weight:bold;vertical-align:top;'

  container.appendChild(badge)
}
```

- [ ] **Step 2: Substituir `src/content-scripts/core/index.ts`**

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { applyTheme } from '../../lib/theme'
import { detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso sem erros de tipo.

---

### Task 14: Content script `rel_bloco_protocolo_listar` — parse em tempo real na tela do bloco

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\rel_bloco_protocolo_listar\index.ts` (substitui o placeholder da Task 2)

**Interfaces:**
- Consumes: `parseBlocoAssinaturaTable` (Task 7); `createLocalConfigStore` (Task 4); `renderBadge` (Task 13)

- [ ] **Step 1: Substituir `src/content-scripts/rel_bloco_protocolo_listar/index.ts`**

```ts
import { parseBlocoAssinaturaTable } from '../../features/bloco-assinatura/parser'
import { createLocalConfigStore } from '../../lib/storage'
import { renderBadge } from '../core/badge'

async function processarPagina(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  const itens = parseBlocoAssinaturaTable(document, {
    seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
  })

  if (itens.length > 0) {
    chrome.runtime.sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens })
  }

  await renderBadge()
}

processarPagina()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
```

- [ ] **Step 2: Rodar o build**

Run: `bun run build`
Expected: sucesso sem erros de tipo.

---

### Task 15: Ícones — recorte do logo SEI! e integração do Lucide

**Files:**
- Create: `C:\sei\seirmg\scripts\crop-icons.py`
- Modify: `C:\sei\seirmg\src\assets\icons\icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` (substituem os placeholders da Task 2)

**Contexto**: coordenadas obtidas por análise da imagem `icones/icones.png` (1136×940px), localizando o retângulo de conteúdo não-branco de cada ícone (via `PIL`/`numpy`), depois centralizando um recorte quadrado sobre o conteúdo detectado.

- [ ] **Step 1: Criar `scripts/crop-icons.py`**

```python
from PIL import Image

SRC = "icones/icones.png"
OUT_DIR = "src/assets/icons"

REGIONS = {
    "icon-128.png": (75, 32, 529, 486),
    "icon-48.png": (646, 88, 1047, 489),
    "icon-32.png": (57, 569, 420, 811),
    "icon-16.png": (747, 605, 945, 803),
}

SIZES = {
    "icon-128.png": 128,
    "icon-48.png": 48,
    "icon-32.png": 32,
    "icon-16.png": 16,
}

def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    for filename, box in REGIONS.items():
        recorte = im.crop(box)
        tamanho = SIZES[filename]
        redimensionado = recorte.resize((tamanho, tamanho), Image.LANCZOS)
        redimensionado.save(f"{OUT_DIR}/{filename}")
        print(f"gerado {OUT_DIR}/{filename} ({tamanho}x{tamanho})")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Rodar o script**

Run: `cd C:\sei\seirmg && python scripts/crop-icons.py`
Expected: imprime as 4 linhas "gerado ...", arquivos sobrescritos em `src/assets/icons/`.

- [ ] **Step 3: Verificar visualmente o resultado**

Abrir cada um dos 4 arquivos gerados (ex.: com a ferramenta de leitura de imagem) e confirmar que mostram o logo "SEI!" completo, centralizado, sem cortar bordas. Se algum ícone estiver com corte ruim, ajustar a caixa (`REGIONS`) correspondente em `scripts/crop-icons.py` e rodar novamente antes de prosseguir.

- [ ] **Step 4: Confirmar que `lucide-static` foi instalado (Task 1) e testar um import**

Run:
```bash
node -e "console.log(require('fs').existsSync('node_modules/lucide-static/icons/bell.svg'))"
```
Expected: `true`

---

### Task 16: Options UI — casca de abas + aba "Bloco de Assinatura e Notificações" funcional

**Files:**
- Create: `C:\sei\seirmg\src\options\index.html`
- Create: `C:\sei\seirmg\src\options\style.css`
- Create: `C:\sei\seirmg\src\options\tabs.ts`
- Test: `C:\sei\seirmg\src\options\tabs.test.ts`
- Create: `C:\sei\seirmg\src\options\main.ts` (substitui o placeholder mínimo da Task 2)

**Interfaces:**
- Consumes: `createSyncConfigStore` (Task 4); `ALARM_NAME` (Task 11)
- Produces: `idPainelParaAba(aba: string): string`; `ativarAba(botoes: NodeListOf<Element>, paineis: NodeListOf<Element>, abaAlvo: string): void`

- [ ] **Step 1: Escrever o teste que falha para `tabs.ts`**

```ts
// src/options/tabs.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ativarAba, idPainelParaAba } from './tabs'

describe('idPainelParaAba', () => {
  it('monta o id do painel a partir do nome da aba', () => {
    expect(idPainelParaAba('geral')).toBe('painel-geral')
  })
})

describe('ativarAba', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-aba="geral" class="ativa"></button>
      <button data-aba="aparencia"></button>
      <section id="painel-geral" class="ativo"></section>
      <section id="painel-aparencia"></section>
    `
  })

  it('marca o botão e o painel correspondentes como ativos', () => {
    const botoes = document.querySelectorAll('button')
    const paineis = document.querySelectorAll('section')

    ativarAba(botoes, paineis, 'aparencia')

    expect(document.querySelector('[data-aba="geral"]')?.classList.contains('ativa')).toBe(false)
    expect(document.querySelector('[data-aba="aparencia"]')?.classList.contains('ativa')).toBe(true)
    expect(document.getElementById('painel-geral')?.classList.contains('ativo')).toBe(false)
    expect(document.getElementById('painel-aparencia')?.classList.contains('ativo')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bunx vitest run src/options/tabs.test.ts`
Expected: FAIL — `Cannot find module './tabs'`

- [ ] **Step 3: Implementar `src/options/tabs.ts`**

```ts
export function idPainelParaAba(aba: string): string {
  return `painel-${aba}`
}

export function ativarAba(
  botoes: NodeListOf<Element>,
  paineis: NodeListOf<Element>,
  abaAlvo: string
): void {
  botoes.forEach((botao) => {
    botao.classList.toggle('ativa', botao.getAttribute('data-aba') === abaAlvo)
  })
  paineis.forEach((painel) => {
    painel.classList.toggle('ativo', painel.id === idPainelParaAba(abaAlvo))
  })
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/options/tabs.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Criar `src/options/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Opções — SEIRMG</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <h1>SEIRMG — Opções</h1>
    <nav id="abas">
      <button data-aba="geral" class="aba-btn ativa">Geral</button>
      <button data-aba="aparencia" class="aba-btn">Aparência</button>
      <button data-aba="processos" class="aba-btn">Processos</button>
      <button data-aba="editor" class="aba-btn">Editor de Documentos</button>
      <button data-aba="assinatura" class="aba-btn">Bloco de Assinatura e Notificações</button>
      <button data-aba="integracoes" class="aba-btn">Integrações</button>
      <button data-aba="sobre" class="aba-btn">Sobre</button>
    </nav>

    <section id="painel-geral" class="painel ativo">
      <p>Em breve: ativar/desativar cada funcionalidade herdada individualmente.</p>
    </section>
    <section id="painel-aparencia" class="painel">
      <p>Em breve: seleção de tema (claro, black, super-black, custom).</p>
    </section>
    <section id="painel-processos" class="painel">
      <p>Em breve: prazos, cores de marcadores e agrupamento.</p>
    </section>
    <section id="painel-editor" class="painel">
      <p>Em breve: funcionalidades herdadas do editor de documentos do Sei Pro.</p>
    </section>
    <section id="painel-assinatura" class="painel">
      <h2>Bloco de Assinatura e Notificações</h2>
      <label>
        <input type="checkbox" id="assinatura-ativo" />
        Ativar notificação de bloco de assinatura pendente
      </label>
      <br />
      <label>
        Intervalo de verificação (minutos):
        <input type="number" id="assinatura-intervalo" min="5" max="120" />
      </label>
      <br />
      <label>
        <input type="checkbox" id="assinatura-som" />
        Tocar som ao notificar
      </label>
      <br />
      <button id="assinatura-salvar">Salvar</button>
      <span id="assinatura-status"></span>
    </section>
    <section id="painel-integracoes" class="painel">
      <p>Em breve: configuração da integração com o Planka.</p>
    </section>
    <section id="painel-sobre" class="painel">
      <p>SEIRMG unifica as extensões Sei++ e Sei Pro para o Sistema Eletrônico de Informações (SEI).</p>
    </section>

    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Criar `src/options/style.css`**

```css
body {
  font-family: system-ui, sans-serif;
  max-width: 720px;
  margin: 24px auto;
  color: #1a1a1a;
}
#abas {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 16px;
}
.aba-btn {
  padding: 8px 12px;
  border: 1px solid #ccc;
  background: #f5f5f5;
  cursor: pointer;
  border-radius: 4px;
}
.aba-btn.ativa {
  background: #017fff;
  color: #fff;
  border-color: #017fff;
}
.painel {
  display: none;
}
.painel.ativo {
  display: block;
}
```

- [ ] **Step 7: Substituir `src/options/main.ts`**

```ts
import bellIconSvg from 'lucide-static/icons/bell.svg?raw'
import { ativarAba } from './tabs'
import { createSyncConfigStore } from '../lib/storage'

const botoesAba = document.querySelectorAll('.aba-btn')
const paineis = document.querySelectorAll('.painel')

const botaoAssinatura = document.querySelector('[data-aba="assinatura"]')
if (botaoAssinatura) {
  botaoAssinatura.innerHTML = `${bellIconSvg} Bloco de Assinatura e Notificações`
}

botoesAba.forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-aba')
    if (aba) ativarAba(botoesAba, paineis, aba)
  })
})

async function carregarAbaAssinatura(): Promise<void> {
  const store = createSyncConfigStore()
  const config = await store.get()

  const inputAtivo = document.getElementById('assinatura-ativo') as HTMLInputElement | null
  const inputIntervalo = document.getElementById('assinatura-intervalo') as HTMLInputElement | null
  const inputSom = document.getElementById('assinatura-som') as HTMLInputElement | null
  const status = document.getElementById('assinatura-status')

  if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
  if (inputIntervalo) inputIntervalo.value = String(config.blocoAssinatura.intervaloMinutos)
  if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom

  document.getElementById('assinatura-salvar')?.addEventListener('click', async () => {
    const atualizado = {
      ...config,
      blocoAssinatura: {
        ativo: inputAtivo?.checked ?? true,
        intervaloMinutos: Number(inputIntervalo?.value ?? 15),
        tocarSom: inputSom?.checked ?? true,
      },
    }
    await store.set(atualizado)
    chrome.alarms.create('seirmg-check-bloco-assinatura', {
      periodInMinutes: atualizado.blocoAssinatura.intervaloMinutos,
    })
    if (status) {
      status.textContent = 'Salvo!'
      setTimeout(() => {
        status.textContent = ''
      }, 2000)
    }
  })
}

carregarAbaAssinatura()
```

- [ ] **Step 8: Rodar toda a suíte e o build**

Run: `bunx vitest run && bun run build`
Expected: todos os testes passam, build sem erros.

---

### Task 17: Popup — status consolidado

**Files:**
- Create: `C:\sei\seirmg\src\popup\index.html` (substitui o placeholder mínimo da Task 2)
- Create: `C:\sei\seirmg\src\popup\main.ts`

**Interfaces:**
- Consumes: `createLocalConfigStore` (Task 4)

- [ ] **Step 1: Substituir `src/popup/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>SEIRMG</title>
    <style>
      body { font-family: system-ui, sans-serif; width: 260px; padding: 12px; }
      #status { font-weight: bold; }
      #abrir-bloco { margin-top: 8px; width: 100%; }
    </style>
  </head>
  <body>
    <div id="status">Carregando...</div>
    <div id="contagem"></div>
    <button id="abrir-bloco">Abrir bloco de assinatura</button>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Criar `src/popup/main.ts`**

```ts
import { createLocalConfigStore } from '../lib/storage'

async function render(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  const total = Object.keys(localConfig.blocoAssinaturaNotificado).length

  const status = document.getElementById('status')
  const contagem = document.getElementById('contagem')
  if (status) status.textContent = total > 0 ? 'Pendências encontradas' : 'Tudo em dia'
  if (contagem) {
    contagem.textContent = total > 0 ? `${total} bloco(s) com pendência de assinatura` : ''
  }
}

document.getElementById('abrir-bloco')?.addEventListener('click', async () => {
  const localConfig = await createLocalConfigStore().get()
  if (!localConfig.baseUrlSei) return
  chrome.tabs.create({
    url: `${localConfig.baseUrlSei}/controlador.php?acao=bloco_assinatura_listar`,
  })
})

render()
```

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso sem erros de tipo.

---

### Task 18: Verificação manual de ponta a ponta (smoke test)

**Files:** nenhum arquivo novo — checklist de verificação.

- [ ] **Step 1: Build limpo**

Run: `cd C:\sei\seirmg && rm -rf dist && bun run build`
Expected: sucesso.

- [ ] **Step 2: Carregar no Chrome**

`chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação → selecionar `dist/`.
Expected: ícone SEI! aparece na barra, sem erros na página de extensões.

- [ ] **Step 3: Abrir a página de opções**

Clicar com o botão direito no ícone → Opções (ou `chrome-extension://<id>/src/options/index.html`).
Expected: abre em nova aba, 7 abas visíveis, clicar entre elas alterna o painel visível, aba "Bloco de Assinatura e Notificações" mostra os campos e o ícone de sino do Lucide ao lado do nome da aba.

- [ ] **Step 4: Salvar configuração da aba de assinatura**

Alterar o intervalo para `20`, desmarcar "Tocar som", clicar "Salvar".
Expected: mensagem "Salvo!" aparece por 2s; reabrir a página de opções confirma que os valores persistiram.

- [ ] **Step 5: Testar em uma página real do SEI (se houver acesso a um ambiente de teste)**

Abrir uma tela qualquer do SEI (`controlador.php?acao=...`) com a extensão carregada.
Expected: nenhum erro no console da página (F12); se o usuário estiver logado e a URL detectada corretamente, `chrome.storage.local.localConfig.baseUrlSei` estará preenchido (verificável em `chrome://extensions` → "Inspecionar views" → Console → `chrome.storage.local.get(console.log)`).

- [ ] **Step 6: Testar a tela de bloco de assinatura (se houver acesso)**

Navegar até a tela de Bloco de Assinatura (`acao=bloco_assinatura_listar`).
Expected: nenhum erro no console; se houver blocos pendentes, o badge aparece ao lado do logo do SEI após alguns segundos.

Documentar no README (Task 19) que os Steps 5 e 6 dependem de acesso a um ambiente SEI real e não são verificáveis apenas com `bun run build`/`vitest`.

---

### Task 19: `README.md`

**Files:**
- Create: `C:\sei\seirmg\README.md`

- [ ] **Step 1: Criar `README.md`**

```markdown
# SEIRMG

Extensão unificada para o Sistema Eletrônico de Informações (SEI), consolidando as funcionalidades das extensões **Sei++** e **Sei Pro** em um único projeto, com Manifest V3, para Google Chrome.

## Status desta entrega

Esta primeira entrega cobre:
- Infraestrutura completa do projeto (TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest).
- Storage tipado (`chrome.storage.sync`/`local`), motor de tema (claro/black/super-black/custom) e página de opções nativa com 7 abas.
- **Funcionalidade nova**: notificação nativa do sistema operacional quando há bloco de assinatura pendente, combinando `MutationObserver` (tempo real, quando a tela do bloco está aberta) e `chrome.alarms` (verificação periódica em segundo plano, mesmo com o SEI fechado), com deduplicação de notificações já enviadas.

A migração completa das ~100 funcionalidades herdadas de Sei++ e Sei Pro (ver `ANALISE.md`) é trabalho de planos de implementação subsequentes — as demais abas de opções ("Geral", "Processos", "Editor de Documentos", "Integrações") estão como esqueleto ("Em breve") nesta entrega.

## Funcionalidades herdadas (mapeadas em `ANALISE.md`)

Consulte `ANALISE.md` para a lista completa de funcionalidades de cada projeto original e o status de cada uma. Resumo:
- **Sei++**: notificação de processos novos, badge de bloco de assinatura, seleção em massa de documentos para assinar, forçar reabertura de processo, filtros de tabela, temas dark, anotações, entre outras.
- **Sei Pro**: ~80 funcionalidades documentadas oficialmente (editor de texto avançado, ações em lote, favoritos, prazos, kanban de processos, etc.) — ver `CHANGELOG-UNIFICACAO.md` para o que fica fora do escopo inicial (módulo Atividades) e o que é adaptado (Projetos → integração com Planka).

## Instalação local (modo desenvolvedor)

1. Instale as dependências:
   ```bash
   bun install
   ```
2. Gere o build:
   ```bash
   bun run build
   ```
3. No Chrome, acesse `chrome://extensions`.
4. Ative o **Modo do desenvolvedor** (canto superior direito).
5. Clique em **Carregar sem compactação** e selecione a pasta `dist/` gerada no passo 2.
6. A extensão "SEIRMG" deve aparecer na lista, sem erros.

Para desenvolvimento com recarregamento automático:
```bash
bun run dev
```

## Testes

```bash
bun run test        # roda a suíte uma vez
bun run test:watch  # modo watch
bun run typecheck   # checagem de tipos sem emitir arquivos
bun run lint        # ESLint
```

## Estrutura do projeto

Ver `docs/superpowers/specs/2026-07-06-seirmg-arquitetura-design.md` para o design completo de arquitetura.
```

---

### Task 20: `CHANGELOG-UNIFICACAO.md` + checagem final de lint/build

**Files:**
- Create: `C:\sei\seirmg\CHANGELOG-UNIFICACAO.md`

- [ ] **Step 1: Criar `CHANGELOG-UNIFICACAO.md`**

```markdown
# Changelog da Unificação — SEIRMG

## O que foi unificado nesta entrega

- Infraestrutura de projeto criada do zero (TypeScript + Vite + `@crxjs/vite-plugin` + Bun + Vitest), substituindo os dois processos de build divergentes de Sei++ (sem bundler, ESM puro) e Sei Pro (sem bundler, scripts globais, injeção dinâmica via `$.getScript`).
- Storage consolidado num schema único tipado (`chrome.storage.sync`/`local`), resolvendo a colisão real de chaves `CheckTypes`/`InstallOrUpdate`/`version` que existiam com o mesmo nome (e formatos diferentes) em ambos os projetos originais.
- Motor de tema único (baseado no mecanismo do Sei Pro: classe CSS + variável de cor customizável), com os temas fixos `black`/`super-black` do Sei++ recriados como presets do novo motor — antes eram dois mecanismos de tema totalmente incompatíveis (`storage.theme` vs `localStorage.darkModePro`).
- Página de opções migrada de duas abordagens divergentes (injetada dentro do SEI no Sei++; `default_popup` apontando direto para `options.html` no Sei Pro) para uma única página de opções nativa da extensão (`options_ui`, `open_in_tab: true`), organizada em abas por categoria.
- **Nova funcionalidade**: notificação nativa de bloco de assinatura pendente, combinando o parser de DOM do bloco de assinatura (portado de `verificarBlocoAssinatura.js` do Sei++) com a infraestrutura de `chrome.alarms`/`chrome.notifications` (também originada no Sei++, antes usada só para "processos novos"). O Sei Pro tinha uma funcionalidade parecida mas mais limitada (`initCheckNaoAssinados`, reativa, sem notificação nativa, restrita a documentos não assinados na unidade atual) — não havia, em nenhum dos dois projetos, monitoramento em segundo plano do bloco de assinatura com notificação do sistema operacional.
- Indicador de pendência consolidado num único badge (estilo Sei++, ao lado do logo do SEI), eliminando a duplicidade com o contador no favicon da aba que o Sei Pro también tinha.
- Ícone da extensão: logo oficial do sistema SEI! fornecido pelo usuário, recortado nos 4 tamanhos padrão do Chrome.

## O que foi removido/não migrado nesta entrega, e por quê

- **Módulo "Atividades" do Sei Pro** (`sei-pro-atividades.js`, ~26.700 linhas): fora de escopo. Depende de um servidor externo próprio do autor original, não documentado publicamente e não disponível para a autarquia. Decisão validada com o usuário em 06/07/2026.
- **Módulo "Projetos" do Sei Pro** (Kanban/Gantt via Google Sheets + OAuth pessoal do usuário): a versão com Google Sheets não foi portada. Em seu lugar, esta entrega prepara (mas não conclui) uma integração com uma instância **Planka** já operada pela autarquia em rede interna — o cliente HTTP configurável e a tela de status de conexão ficam para um plano de implementação futuro; o mapeamento processo↔cartão não está incluído nesta entrega.
- **Font Awesome Pro**: o Sei Pro redistribuía a versão comercial (licenciada) da Font Awesome Pro dentro do próprio pacote da extensão. O SEIRMG usa **Lucide** (`lucide-static`, licença ISC/open source) para todos os ícones de UI daqui em diante — nenhum ícone dependente de licença comercial foi portado.
- **Migração automática de dados dos usuários** (configurações salvas em Sei++/Sei Pro): tecnicamente inviável (cada extensão tem `chrome.storage` isolado por ID) e descartada por decisão do usuário — quem já usa Sei++/Sei Pro reconfigura manualmente no SEIRMG.
- **~100 funcionalidades restantes de Sei++ e Sei Pro** (ver `ANALISE.md`, seções 3.1-3.3): ainda não portadas nesta entrega. Nenhuma foi descartada — a decisão foi sequenciar a migração em planos de implementação futuros, feature por feature ou em pequenos lotes coesos, em vez de tentar portar tudo de uma vez (risco de regressão e de um plano raso demais para revisar com qualidade).

## Conflitos resolvidos durante a unificação

Ver `ANALISE.md`, seção 3.4, para a lista completa de conflitos de nomenclatura/storage/seletores DOM identificados entre os dois projetos originais e como cada um foi endereçado na arquitetura do SEIRMG.
```

- [ ] **Step 2: Checagem final de sintaxe/lint em todos os arquivos**

Run:
```bash
cd C:\sei\seirmg
bun run typecheck
bun run lint
bun run test
bun run build
```
Expected: os 4 comandos terminam com código de saída 0 (sem erros de tipo, sem erros de lint, todos os testes passando, build gerado em `dist/`).

- [ ] **Step 3: Validar o `manifest.json` gerado**

Run: `node -e "JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido')"`
Expected: `manifest.json válido`

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: arquitetura de pastas (Task 1-2), storage tipado (Task 4), motor de tema (Task 5), options UI nativa em abas (Task 16), notificação de bloco de assinatura completa — parser + dedup + alarme + notificação + clique + badge (Tasks 7-14), ícones SEI!+Lucide (Task 15), stub de Planka **explicitamente adiado** (não faz parte deste plano — documentado no CHANGELOG), README e CHANGELOG (Tasks 19-20). Todas as seções da spec de arquitetura têm uma task correspondente, exceto a integração Planka (adiada por decisão consciente, registrada no CHANGELOG).
2. **Placeholders**: nenhum "TBD"/"TODO" aberto nos arquivos de código; os textos "Em breve" nas abas não implementadas são copy real e intencional, não lacunas de plano.
3. **Consistência de tipos**: `BlocoAssinaturaItem`/`EstadoBloco` (Task 7) usados de forma consistente em `diffPendentes` (Task 8), `notify.ts` (Task 9), `blocoAssinaturaPipeline.ts` (Task 10), `blocoAssinaturaCheck.ts` (Task 11) e nos dois content scripts (Tasks 13-14) — mesmos nomes de campo (`id`, `numero`, `link`, `estado`) em todo lugar. `SyncConfig`/`LocalConfig` (Task 4) consistentes entre `storage.ts`, `theme.ts`, `blocoAssinaturaPipeline.ts` e `background/index.ts`.
