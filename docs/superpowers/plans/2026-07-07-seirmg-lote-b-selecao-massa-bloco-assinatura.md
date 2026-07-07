# SEIRMG — Lote B: Seleção em Massa no Bloco de Assinatura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar `selecionarDocumentosAssinar.js` do Sei++ para o SEIRMG — botões de seleção em massa de documentos (Todos/Nenhum/Sem assinatura/Sem minha assinatura/Com minha assinatura) na tela do bloco de assinatura, atrás de uma feature flag exposta na aba Geral das opções.

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-b-selecao-massa-bloco-assinatura-design.md`. Mesmo padrão já usado pelo bloco de assinatura e processos novos: lógica pura testável em `features/`, wiring fino não-testado em `content-scripts/`/`options/`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma mudança de manifest (nenhuma permissão nova, nenhum content script novo — extensão do já existente `rel_bloco_protocolo_listar`).
- Feature atrás de `featureFlags.selecaoEmMassaBlocoAssinatura` (default `true`), exposta na aba Geral das opções.
- Falha ao extrair nome do usuário, ou qualquer exceção dentro do wiring do content script, sempre loga via `console.error('[SEIRMG] ...', error)` e nunca quebra a página — nunca lança exceção não tratada.
- Sem alarme/background envolvido — feature é puramente de content script + options.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── lib/storage.ts (modificado)
│   ├── features/bloco-assinatura/
│   │   └── selecaoDocumentos.ts (+ .test.ts, novo)
│   ├── content-scripts/rel_bloco_protocolo_listar/index.ts (modificado)
│   └── options/index.html, main.ts (modificados)
```

---

### Task 1: `features/bloco-assinatura/selecaoDocumentos.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\bloco-assinatura\selecaoDocumentos.ts`
- Test: `C:\sei\seirmg\src\features\bloco-assinatura\selecaoDocumentos.test.ts`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\rel_bloco_protocolo_listar\selecionarDocumentosAssinar.js`. As 3 funções puras isolam toda a lógica de decisão do módulo original (extração do nome do usuário, localização da coluna "Assinaturas", predicado de seleção por tipo).

**Interfaces:**
- Consumes: nenhuma
- Produces: `type TipoSelecaoDocumentos = 'todos' | 'nenhum' | 'sem-assinatura' | 'sem-minha-assinatura' | 'com-minha-assinatura'`; `extrairNomeUsuario(tituloUsuario: string): string | null`; `encontrarIndiceColunaAssinaturas(cabecalhos: string[]): number`; `deveSelecionar(tipo: TipoSelecaoDocumentos, textoAssinaturas: string, usuario: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/features/bloco-assinatura/selecaoDocumentos.test.ts
import { describe, expect, it } from 'vitest'
import { deveSelecionar, encontrarIndiceColunaAssinaturas, extrairNomeUsuario } from './selecaoDocumentos'

describe('extrairNomeUsuario', () => {
  it('extrai o nome no formato "NOME - usuário"', () => {
    expect(extrairNomeUsuario('João da Silva - joao.silva')).toBe('João da Silva')
  })

  it('extrai o nome no formato "NOME (usuário/órgão)"', () => {
    expect(extrairNomeUsuario('João da Silva (joao.silva/SEIRMG)')).toBe('João da Silva')
  })

  it('retorna null quando não casa nenhum formato', () => {
    expect(extrairNomeUsuario('joao.silva')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(extrairNomeUsuario('')).toBeNull()
  })
})

describe('encontrarIndiceColunaAssinaturas', () => {
  it('encontra o índice de "Assinaturas" em posição arbitrária', () => {
    expect(encontrarIndiceColunaAssinaturas(['Sequência', 'Protocolo', 'Assinaturas', 'Situação'])).toBe(2)
  })

  it('retorna o default 6 quando não há coluna "Assinaturas"', () => {
    expect(encontrarIndiceColunaAssinaturas(['Sequência', 'Protocolo'])).toBe(6)
  })

  it('retorna o default 6 para lista vazia', () => {
    expect(encontrarIndiceColunaAssinaturas([])).toBe(6)
  })
})

describe('deveSelecionar', () => {
  it('"todos" sempre seleciona', () => {
    expect(deveSelecionar('todos', '', 'joao')).toBe(true)
    expect(deveSelecionar('todos', 'Assinado por João', 'joao')).toBe(true)
  })

  it('"nenhum" nunca seleciona', () => {
    expect(deveSelecionar('nenhum', '', 'joao')).toBe(false)
    expect(deveSelecionar('nenhum', 'Assinado por João', 'joao')).toBe(false)
  })

  it('"sem-assinatura" seleciona só documentos sem nenhuma assinatura', () => {
    expect(deveSelecionar('sem-assinatura', '', 'João')).toBe(true)
    expect(deveSelecionar('sem-assinatura', 'Assinado por Maria', 'João')).toBe(false)
  })

  it('"sem-minha-assinatura" seleciona documentos sem assinatura ou só com a de outro usuário', () => {
    expect(deveSelecionar('sem-minha-assinatura', '', 'João')).toBe(true)
    expect(deveSelecionar('sem-minha-assinatura', 'Assinado por Maria', 'João')).toBe(true)
    expect(deveSelecionar('sem-minha-assinatura', 'Assinado por João', 'João')).toBe(false)
  })

  it('"com-minha-assinatura" seleciona só documentos que incluem a assinatura do usuário', () => {
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por João e Maria', 'João')).toBe(true)
    expect(deveSelecionar('com-minha-assinatura', 'Assinado por Maria', 'João')).toBe(false)
    expect(deveSelecionar('com-minha-assinatura', '', 'João')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/bloco-assinatura/selecaoDocumentos.test.ts`
Expected: FAIL — `Cannot find module './selecaoDocumentos'`

- [ ] **Step 3: Implementar `src/features/bloco-assinatura/selecaoDocumentos.ts`**

```ts
export type TipoSelecaoDocumentos =
  | 'todos'
  | 'nenhum'
  | 'sem-assinatura'
  | 'sem-minha-assinatura'
  | 'com-minha-assinatura'

export function extrairNomeUsuario(tituloUsuario: string): string | null {
  const matchTraco = tituloUsuario.match(/(.+)\s-\s/)
  if (matchTraco) return matchTraco[1]

  const matchParenteses = tituloUsuario.match(/(.+)\s\(.*/)
  if (matchParenteses) return matchParenteses[1]

  return null
}

const INDICE_COLUNA_ASSINATURAS_PADRAO = 6

export function encontrarIndiceColunaAssinaturas(cabecalhos: string[]): number {
  const indice = cabecalhos.indexOf('Assinaturas')
  return indice === -1 ? INDICE_COLUNA_ASSINATURAS_PADRAO : indice
}

export function deveSelecionar(
  tipo: TipoSelecaoDocumentos,
  textoAssinaturas: string,
  usuario: string
): boolean {
  const assinaturas = textoAssinaturas.trim()

  switch (tipo) {
    case 'todos':
      return true
    case 'nenhum':
      return false
    case 'sem-assinatura':
      return assinaturas.length === 0
    case 'sem-minha-assinatura':
      return !(assinaturas.length > 0 && assinaturas.includes(usuario))
    case 'com-minha-assinatura':
      return assinaturas.length > 0 && assinaturas.includes(usuario)
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/bloco-assinatura/selecaoDocumentos.test.ts`
Expected: PASS (12 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/bloco-assinatura/selecaoDocumentos.ts src/features/bloco-assinatura/selecaoDocumentos.test.ts
git commit -m "feat(bloco-assinatura): add pure selection helpers for mass document selection"
```

---

### Task 2: `lib/storage.ts` — feature flag `selecaoEmMassaBlocoAssinatura`

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `FeatureFlags.selecaoEmMassaBlocoAssinatura: boolean`; `DEFAULT_SYNC_CONFIG.featureFlags.selecaoEmMassaBlocoAssinatura = true`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do `describe('createSyncConfigStore', ...)` já existente em `src/lib/storage.test.ts`:

```ts
  it('inclui selecaoEmMassaBlocoAssinatura ativo por padrão', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).featureFlags.selecaoEmMassaBlocoAssinatura).toBe(true)
  })

  it('persiste alteração de featureFlags.selecaoEmMassaBlocoAssinatura', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      featureFlags: { ...DEFAULT_SYNC_CONFIG.featureFlags, selecaoEmMassaBlocoAssinatura: false },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — `selecaoEmMassaBlocoAssinatura` é `undefined` (campo ainda não existe em `FeatureFlags`/`DEFAULT_SYNC_CONFIG`)

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Modificar `FeatureFlags`:

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
}
```

Modificar `DEFAULT_SYNC_CONFIG.featureFlags`:

```ts
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
    selecaoEmMassaBlocoAssinatura: true,
  },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (12 testes — 10 já existentes + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add selecaoEmMassaBlocoAssinatura feature flag"
```

---

### Task 3: `content-scripts/rel_bloco_protocolo_listar/index.ts` — wiring da seleção em massa

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\rel_bloco_protocolo_listar\index.ts`

**Contexto**: esta camada só conecta DOM (`document.querySelector`, listeners de clique) à lógica já testada da Task 1. Não é coberta por TDD (mesmo padrão de todo `content-scripts/` já existente no projeto) — a verificação é o build + typecheck.

**Interfaces:**
- Consumes: `deveSelecionar`, `encontrarIndiceColunaAssinaturas`, `extrairNomeUsuario`, `TipoSelecaoDocumentos` (Task 1, `../../features/bloco-assinatura/selecaoDocumentos`); `createSyncConfigStore` (`../../lib/storage`)

- [ ] **Step 1: Substituir `src/content-scripts/rel_bloco_protocolo_listar/index.ts`**

Arquivo atual:

```ts
import { parseBlocoAssinaturaTable } from '../../features/bloco-assinatura/parser'
import { createLocalConfigStore } from '../../lib/storage'
import { renderBadge } from '../core/badge'

async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    chrome.runtime.sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens }).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar itens do bloco de assinatura:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar página de bloco de assinatura:', error)
  }
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

Substituir por (adiciona `montarSelecaoDocumentos`, chamada uma única vez no bootstrap, ao lado do já existente `processarPagina()`/`MutationObserver`):

```ts
import { parseBlocoAssinaturaTable } from '../../features/bloco-assinatura/parser'
import {
  deveSelecionar,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  type TipoSelecaoDocumentos,
} from '../../features/bloco-assinatura/selecaoDocumentos'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { renderBadge } from '../core/badge'

const ID_SELECAO_DOCUMENTOS = 'seirmg-selecao-documentos-assinar'

async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    chrome.runtime.sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens }).catch((error) => {
      console.error('[SEIRMG] Falha ao enviar itens do bloco de assinatura:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao processar página de bloco de assinatura:', error)
  }
}

function estaNaTelaDoBloco(): boolean {
  const barraLocalizacao = document.querySelector('#divInfraBarraLocalizacao')
  return (
    (barraLocalizacao?.textContent?.includes('Bloco de Assinatura') ?? false) &&
    document.querySelector('#btnAssinar') !== null
  )
}

function aplicarSelecao(tipo: TipoSelecaoDocumentos, usuario: string): void {
  const tabela = document.querySelector('#divInfraAreaTabela')
  if (!tabela) return

  const cabecalhos = Array.from(tabela.querySelectorAll('tr > th')).map(
    (th) => th.textContent?.trim() ?? ''
  )
  const indiceAssinaturas = encontrarIndiceColunaAssinaturas(cabecalhos)

  const linhas = tabela.querySelectorAll('tbody > tr[id^="trSeq"], tbody > tr[id^="trPos"]')
  linhas.forEach((linha) => {
    const checkbox = linha.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!checkbox) return

    const celulaAssinaturas = linha.querySelectorAll('td')[indiceAssinaturas]
    const textoAssinaturas = celulaAssinaturas?.textContent?.trim() ?? ''
    const selecionado = deveSelecionar(tipo, textoAssinaturas, usuario)

    if (selecionado !== checkbox.checked) checkbox.click()
  })
}

async function montarSelecaoDocumentos(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.selecaoEmMassaBlocoAssinatura) return

    if (!estaNaTelaDoBloco()) return
    if (document.getElementById(ID_SELECAO_DOCUMENTOS)) return

    const tituloUsuario = document.querySelector('#lnkUsuarioSistema')?.getAttribute('title') ?? ''
    const usuario = extrairNomeUsuario(tituloUsuario)
    if (!usuario) {
      console.error('[SEIRMG] Falha ao obter o nome do usuário para seleção em massa de documentos.')
      return
    }

    const caption = document.querySelector('#divInfraAreaTabela caption.infraCaption')
    if (!caption) return

    const container = document.createElement('div')
    container.id = ID_SELECAO_DOCUMENTOS
    container.innerHTML = `
      <span>Selecionar:</span>
      <a href="#" data-tipo="todos">Todos</a>
      <a href="#" data-tipo="nenhum">Nenhum</a>
      <a href="#" data-tipo="sem-assinatura">Sem nenhuma assinatura</a>
      <a href="#" data-tipo="sem-minha-assinatura">Sem a minha assinatura</a>
      <a href="#" data-tipo="com-minha-assinatura">Com a minha assinatura</a>
    `
    caption.insertAdjacentElement('beforeend', container)

    container.addEventListener('click', (evento) => {
      const alvo = evento.target
      if (!(alvo instanceof HTMLAnchorElement)) return
      evento.preventDefault()

      const tipo = alvo.dataset.tipo as TipoSelecaoDocumentos | undefined
      if (!tipo) return

      aplicarSelecao(tipo, usuario)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar seleção em massa de documentos:', error)
  }
}

processarPagina()
montarSelecaoDocumentos()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
```

- [ ] **Step 2: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (95 testes no total — 81 antes deste plano + 12 (Task 1) + 2 (Task 2) = 95)

- [ ] **Step 3: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/rel_bloco_protocolo_listar/index.ts
git commit -m "feat(bloco-assinatura): wire mass document selection UI into content script"
```

---

### Task 4: `options/index.html` + `options/main.ts` — aba Geral

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build. Primeira implementação real da aba Geral (hoje só texto placeholder).

**Interfaces:**
- Consumes: `createSyncConfigStore` (`../lib/storage`)

- [ ] **Step 1: Substituir a seção `#painel-geral` em `src/options/index.html`**

Trecho atual:

```html
    <section id="painel-geral" class="painel ativo">
      <p>Em breve: ativar/desativar cada funcionalidade herdada individualmente.</p>
    </section>
```

Substituir por:

```html
    <section id="painel-geral" class="painel ativo">
      <h2>Geral</h2>
      <label>
        <input type="checkbox" id="geral-selecao-massa-ativo" />
        Ativar seleção em massa de documentos no bloco de assinatura
      </label>
      <br />
      <button id="geral-salvar">Salvar</button>
      <span id="geral-status"></span>
    </section>
```

- [ ] **Step 2: Adicionar `carregarAbaGeral` em `src/options/main.ts`**

Arquivo atual (trecho final):

```ts
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

Substituir por (adiciona `carregarAbaGeral` antes das duas funções já existentes, sem tocar nelas):

```ts
async function carregarAbaGeral(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputSelecaoMassa = document.getElementById(
      'geral-selecao-massa-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('geral-status')

    if (inputSelecaoMassa) {
      inputSelecaoMassa.checked = config.featureFlags.selecaoEmMassaBlocoAssinatura
    }

    document.getElementById('geral-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração da aba Geral:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Geral:', error)
  }
}

carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (95), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): implement Geral tab with selecaoEmMassaBlocoAssinatura toggle"
```

---

### Task 5: Checagem final (typecheck/lint/test/build/manifest)

**Files:** nenhum arquivo novo — checklist de verificação, mesmo padrão dos planos anteriores.

- [ ] **Step 1: Rodar a checagem completa**

Run:
```bash
cd C:\sei\seirmg
bun run typecheck
bun run lint
bun run test
bun run build
```
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 95 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: `extrairNomeUsuario`/`encontrarIndiceColunaAssinaturas`/`deveSelecionar` (Task 1), feature flag `selecaoEmMassaBlocoAssinatura` (Task 2), wiring completo com guarda de tela/idempotência/re-consulta do DOM no clique (Task 3), aba Geral (Task 4). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `TipoSelecaoDocumentos` (Task 1) usado identicamente em `content-scripts/rel_bloco_protocolo_listar/index.ts` (Task 3) e no atributo `data-tipo` dos links injetados. `FeatureFlags.selecaoEmMassaBlocoAssinatura` (Task 2) consumido identicamente pela Task 3 (guarda no content script) e pela Task 4 (checkbox na aba Geral).
4. **Contagem de testes**: 81 (baseline antes deste plano) + 12 (Task 1) + 2 (Task 2) = 95 testes esperados ao final da Task 3 em diante.
