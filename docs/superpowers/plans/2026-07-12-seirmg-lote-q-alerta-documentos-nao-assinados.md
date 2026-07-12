# Lote Q — Alerta de documentos não assinados ao enviar processo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear o envio de um processo com confirmação explícita quando existem documentos internos não assinados na unidade atual, detectados via DOM real da árvore do processo.

**Architecture:** Novo content script na página `acao=procedimento_enviar` lê a árvore do processo (frame irmão `#ifrArvore`, acessado via `window.parent`, sem nenhuma chamada de rede) e intercepta em fase de captura o clique no botão nativo de confirmação (`#btnSalvar`). Se houver documentos internos sem assinatura na unidade atual, mostra um diálogo modal listando-os; só libera o clique original se o usuário confirmar.

**Tech Stack:** TypeScript + Vite + `@crxjs/vite-plugin`, Vitest (`environment: jsdom`), `chrome.storage.sync` via `src/lib/storage.ts`.

## Global Constraints

- Qualquer leitura de `chrome.*`/DOM cross-frame deve ser protegida por try/catch, logar via `console.error('[SEIRMG] ...', error)` e nunca travar o fluxo nativo (fail-open) — política padrão do projeto (ver spec).
- Detecção usa só o DOM da árvore, sem nenhuma chamada de rede — mais seguro que o padrão de `fetch`/aba oculta já descartado no projeto para outras features (ver `docs/superpowers/specs/2026-07-12-seirmg-lote-q-alerta-documentos-nao-assinados-design.md`).
- Documento pendente = `img[id^="icon{n}"]` (não `iconA{n}`) com `src` contendo `documento_interno`, `anchorUG{n}` cujo `<span>` bate com a unidade atual, e ausência de `anchorA{n}`.
- Toggle em Opções (aba "Processos"), ativado por padrão (`ativo: true`).
- Rodar `bun run typecheck`, `bun run lint` e `bun run test` (via `vitest run`) depois de cada task que altera `.ts`.

---

## File Structure

- **Create** `src/features/procedimento-enviar/detectarPendencias.ts` — função pura de extração.
- **Create** `src/features/procedimento-enviar/detectarPendencias.test.ts` — testes com HTML real da árvore.
- **Create** `src/features/procedimento-enviar/montarDialogo.ts` — construtor puro do `<dialog>`.
- **Create** `src/features/procedimento-enviar/montarDialogo.test.ts` — testes de estrutura do diálogo.
- **Create** `src/content-scripts/procedimento_enviar/index.ts` — wiring: config, leitura da árvore, interceptação do clique, abertura do diálogo.
- **Modify** `src/lib/storage.ts` — novo tipo `AlertaNaoAssinadosConfig`, campo em `ControleProcessosConfig`, valor padrão.
- **Modify** `manifest.config.ts` — novo `content_scripts` para `acao=procedimento_enviar`.
- **Modify** `src/options/index.html` — checkbox na aba "Processos".
- **Modify** `src/options/main.ts` — leitura/gravação do novo checkbox.
- **Modify** `src/content-scripts/core/theme.css` — estilos do diálogo (claro + `.seirmg-theme-black`).

---

### Task 1: Config schema

**Files:**
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: `AlertaNaoAssinadosConfig { ativo: boolean }`, campo `alertaNaoAssinados: AlertaNaoAssinadosConfig` em `ControleProcessosConfig`.

- [ ] **Step 1: Adicionar o tipo e o campo na interface**

Em `src/lib/storage.ts`, logo antes de `export interface ControleProcessosConfig {`, adicionar:

```ts
export interface AlertaNaoAssinadosConfig {
  ativo: boolean
}
```

E dentro de `ControleProcessosConfig`, adicionar o campo (mantendo os demais campos como estão):

```ts
export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
  favoritos: FavoritosConfig
  alertaNaoAssinados: AlertaNaoAssinadosConfig
}
```

- [ ] **Step 2: Adicionar o valor padrão**

Dentro de `DEFAULT_SYNC_CONFIG.controleProcessos`, depois do bloco `favoritos: { ... }`, adicionar:

```ts
    alertaNaoAssinados: {
      ativo: true,
    },
```

- [ ] **Step 3: Rodar typecheck e os testes existentes**

Run: `bun run typecheck`
Expected: sem erros.

Run: `bun run test -- storage`
Expected: todos os testes de `src/lib/storage.test.ts` continuam passando (o teste de round-trip usa `toEqual(DEFAULT_SYNC_CONFIG)`, então precisa que a interface e o default estejam sincronizados).

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(seirmg): adiciona config do alerta de documentos não assinados"
```

---

### Task 2: Função de detecção de pendências

**Files:**
- Create: `src/features/procedimento-enviar/detectarPendencias.ts`
- Test: `src/features/procedimento-enviar/detectarPendencias.test.ts`

**Interfaces:**
- Consumes: nenhuma (função pura sobre `Document`/`string`).
- Produces: `interface DocumentoPendente { id: string; nome: string }`, `function extrairDocumentosPendentes(doc: Document, unidadeAtual: string): DocumentoPendente[]`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/features/procedimento-enviar/detectarPendencias.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairDocumentosPendentes } from './detectarPendencias'

const ARVORE_HTML = `
<div id="divArvore">
  <span>
    <img src="svg/documento_interno.svg?11" id="icon100" title="Despacho">
    <a id="anchorUG100" href="#" class="infraArvoreInformacao"><span>HMMG-DIR ADM</span></a>
    <a id="anchor100" href="#">Despacho 1/2026</a>
    <a id="anchorA100" href="#" class="infraArvoreNoAcao"><img src="svg/assinatura2.svg?11" id="iconA100" title="Assinado por: FULANO"></a>
  </span>
  <span>
    <a id="anchorImg200" href="#"><img src="svg/documento_interno.svg?11" id="icon200" title="Menu cópia protocolo"></a>
    <a id="anchorUG200" href="#" class="infraArvoreInformacao"><span>HMMG-DIR ADM</span></a>
    <a id="anchor200" href="#">Ofício 2/2026</a>
  </span>
  <span>
    <a id="anchorImg300" href="#"><img src="svg/documento_interno.svg?11" id="icon300" title="Menu cópia protocolo"></a>
    <a id="anchorUG300" href="#" class="infraArvoreInformacao"><span>HMMG-DJUR</span></a>
    <a id="anchor300" href="#">Parecer 3/2026</a>
  </span>
  <span>
    <a id="anchorImg400" href="#"><img src="svg/documento_externo.svg?11" id="icon400" title="Menu cópia protocolo"></a>
    <a id="anchor400" href="#">Comprovante 4/2026</a>
  </span>
</div>
`

function parseArvore(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extrairDocumentosPendentes', () => {
  it('retorna só o documento interno não assinado da unidade atual', () => {
    const doc = parseArvore(ARVORE_HTML)
    expect(extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')).toEqual([{ id: '200', nome: 'Ofício 2/2026' }])
  })

  it('ignora documento assinado', () => {
    const doc = parseArvore(ARVORE_HTML)
    const pendentes = extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')
    expect(pendentes.find((p) => p.id === '100')).toBeUndefined()
  })

  it('ignora documento interno de outra unidade', () => {
    const doc = parseArvore(ARVORE_HTML)
    const pendentes = extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')
    expect(pendentes.find((p) => p.id === '300')).toBeUndefined()
  })

  it('ignora documento externo (sem anchorUG)', () => {
    const doc = parseArvore(ARVORE_HTML)
    const pendentes = extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')
    expect(pendentes.find((p) => p.id === '400')).toBeUndefined()
  })

  it('retorna vazio quando não há documentos na árvore', () => {
    const doc = parseArvore('<div id="divArvore"></div>')
    expect(extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')).toEqual([])
  })

  it('usa fallback de nome quando não encontra o anchor do número do documento', () => {
    const html = `<span>
      <a id="anchorImg500" href="#"><img src="svg/documento_interno.svg?11" id="icon500" title="Menu cópia protocolo"></a>
      <a id="anchorUG500" href="#" class="infraArvoreInformacao"><span>HMMG-DIR ADM</span></a>
    </span>`
    const doc = parseArvore(html)
    expect(extrairDocumentosPendentes(doc, 'HMMG-DIR ADM')).toEqual([{ id: '500', nome: 'Documento 500' }])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test -- detectarPendencias`
Expected: FAIL — `Cannot find module './detectarPendencias'` (arquivo ainda não existe).

- [ ] **Step 3: Implementar a função**

Criar `src/features/procedimento-enviar/detectarPendencias.ts`:

```ts
export interface DocumentoPendente {
  id: string
  nome: string
}

const REGEX_ICONE_TIPO = /^icon(\d+)$/

export function extrairDocumentosPendentes(doc: Document, unidadeAtual: string): DocumentoPendente[] {
  const pendentes: DocumentoPendente[] = []

  doc.querySelectorAll<HTMLImageElement>('img[id^="icon"]').forEach((img) => {
    const match = REGEX_ICONE_TIPO.exec(img.id)
    if (!match) return
    const id = match[1]

    const src = img.getAttribute('src') ?? ''
    if (!src.includes('documento_interno')) return

    const unidadeDocumento = doc.getElementById(`anchorUG${id}`)?.querySelector('span')?.textContent?.trim()
    if (!unidadeDocumento || unidadeDocumento !== unidadeAtual) return

    if (doc.getElementById(`anchorA${id}`)) return

    const nome = doc.getElementById(`anchor${id}`)?.textContent?.trim() || `Documento ${id}`
    pendentes.push({ id, nome })
  })

  return pendentes
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test -- detectarPendencias`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-enviar/detectarPendencias.ts src/features/procedimento-enviar/detectarPendencias.test.ts
git commit -m "feat(seirmg): detecta documentos internos não assinados na árvore do processo"
```

---

### Task 3: Construtor do diálogo de confirmação

**Files:**
- Create: `src/features/procedimento-enviar/montarDialogo.ts`
- Test: `src/features/procedimento-enviar/montarDialogo.test.ts`

**Interfaces:**
- Consumes: `DocumentoPendente` (Task 2).
- Produces: `function montarDialogoConfirmacao(pendencias: DocumentoPendente[], unidadeAtual: string): HTMLDialogElement`. Classes CSS usadas (contrato com Task 6 — CSS — e com o content script da Task 4): `seirmg-alerta-nao-assinados` (no `<dialog>`), `seirmg-alerta-nao-assinados-header`, `seirmg-alerta-nao-assinados-icone`, `seirmg-alerta-nao-assinados-subtitulo`, `seirmg-alerta-nao-assinados-lista`, `seirmg-alerta-nao-assinados-item`, `seirmg-alerta-nao-assinados-rodape`, `seirmg-alerta-nao-assinados-cancelar`, `seirmg-alerta-nao-assinados-confirmar`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/features/procedimento-enviar/montarDialogo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarDialogoConfirmacao } from './montarDialogo'

describe('montarDialogoConfirmacao', () => {
  it('monta um <dialog> com título, unidade e lista de documentos', () => {
    const dialog = montarDialogoConfirmacao(
      [
        { id: '200', nome: 'Ofício 2/2026' },
        { id: '300', nome: 'Parecer 3/2026' },
      ],
      'HMMG-DIR ADM'
    )

    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog.className).toContain('seirmg-alerta-nao-assinados')
    expect(dialog.textContent).toContain('Documentos pendentes de assinatura')
    expect(dialog.textContent).toContain('HMMG-DIR ADM')

    const itens = dialog.querySelectorAll('.seirmg-alerta-nao-assinados-item')
    expect(itens).toHaveLength(2)
    expect(itens[0].textContent).toBe('Ofício 2/2026')
    expect(itens[1].textContent).toBe('Parecer 3/2026')
  })

  it('inclui botões de cancelar e confirmar', () => {
    const dialog = montarDialogoConfirmacao([{ id: '200', nome: 'Ofício 2/2026' }], 'HMMG-DIR ADM')

    const cancelar = dialog.querySelector('.seirmg-alerta-nao-assinados-cancelar')
    const confirmar = dialog.querySelector('.seirmg-alerta-nao-assinados-confirmar')
    expect(cancelar?.textContent).toBe('Cancelar')
    expect(confirmar?.textContent).toBe('Enviar mesmo assim')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test -- montarDialogo`
Expected: FAIL — `Cannot find module './montarDialogo'`.

- [ ] **Step 3: Implementar o construtor**

Criar `src/features/procedimento-enviar/montarDialogo.ts`:

```ts
import type { DocumentoPendente } from './detectarPendencias'

export function montarDialogoConfirmacao(
  pendencias: DocumentoPendente[],
  unidadeAtual: string
): HTMLDialogElement {
  const dialog = document.createElement('dialog')
  dialog.className = 'seirmg-alerta-nao-assinados'

  const header = document.createElement('div')
  header.className = 'seirmg-alerta-nao-assinados-header'

  const icone = document.createElement('div')
  icone.className = 'seirmg-alerta-nao-assinados-icone'
  icone.textContent = '!'
  header.appendChild(icone)

  const textos = document.createElement('div')
  const titulo = document.createElement('strong')
  titulo.textContent = 'Documentos pendentes de assinatura'
  const subtitulo = document.createElement('p')
  subtitulo.className = 'seirmg-alerta-nao-assinados-subtitulo'
  subtitulo.textContent = `Unidade atual: ${unidadeAtual}`
  textos.append(titulo, subtitulo)
  header.appendChild(textos)
  dialog.appendChild(header)

  const lista = document.createElement('div')
  lista.className = 'seirmg-alerta-nao-assinados-lista'
  pendencias.forEach((pendencia) => {
    const item = document.createElement('div')
    item.className = 'seirmg-alerta-nao-assinados-item'
    item.textContent = pendencia.nome
    lista.appendChild(item)
  })
  dialog.appendChild(lista)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-alerta-nao-assinados-rodape'
  const btnCancelar = document.createElement('button')
  btnCancelar.type = 'button'
  btnCancelar.className = 'seirmg-alerta-nao-assinados-cancelar'
  btnCancelar.textContent = 'Cancelar'
  const btnConfirmar = document.createElement('button')
  btnConfirmar.type = 'button'
  btnConfirmar.className = 'seirmg-alerta-nao-assinados-confirmar'
  btnConfirmar.textContent = 'Enviar mesmo assim'
  rodape.append(btnCancelar, btnConfirmar)
  dialog.appendChild(rodape)

  return dialog
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test -- montarDialogo`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-enviar/montarDialogo.ts src/features/procedimento-enviar/montarDialogo.test.ts
git commit -m "feat(seirmg): monta diálogo de confirmação de envio com pendências"
```

---

### Task 4: Content script — interceptação do envio

**Files:**
- Create: `src/content-scripts/procedimento_enviar/index.ts`
- Modify: `manifest.config.ts`

**Interfaces:**
- Consumes: `extrairDocumentosPendentes` (Task 2), `montarDialogoConfirmacao` (Task 3), `obterUnidadeAtual` (`src/features/procedimento-visualizar/painelLateral.ts`, já existe: `obterUnidadeAtual(seiVersionAtLeast4: boolean, doc: Document): string | null`), `createLocalConfigStore`/`createSyncConfigStore` (`src/lib/storage.ts`).
- Produces: nada consumido por outras tasks (é a ponta final de wiring).

- [ ] **Step 1: Criar o content script**

Criar `src/content-scripts/procedimento_enviar/index.ts`:

```ts
import { extrairDocumentosPendentes, type DocumentoPendente } from '../../features/procedimento-enviar/detectarPendencias'
import { montarDialogoConfirmacao } from '../../features/procedimento-enviar/montarDialogo'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

function obterArvoreDocumento(): Document | null {
  const ifrArvore = window.parent.document.querySelector<HTMLIFrameElement>('#ifrArvore')
  return ifrArvore?.contentDocument ?? null
}

function obterBotoesEnviar(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '#divInfraBarraComandosSuperior > #btnSalvar, #divInfraBarraComandosInferior > #btnSalvar'
    )
  )
}

function abrirDialogoConfirmacao(
  pendencias: DocumentoPendente[],
  unidadeAtual: string,
  aoConfirmar: () => void
): void {
  const dialog = montarDialogoConfirmacao(pendencias, unidadeAtual)
  document.body.appendChild(dialog)

  const fechar = (): void => {
    dialog.close()
    dialog.remove()
  }

  dialog.querySelector('.seirmg-alerta-nao-assinados-cancelar')?.addEventListener('click', fechar)
  dialog.querySelector('.seirmg-alerta-nao-assinados-confirmar')?.addEventListener('click', () => {
    fechar()
    aoConfirmar()
  })
  dialog.addEventListener('cancel', fechar)

  dialog.showModal()
}

async function bootstrap(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.controleProcessos.alertaNaoAssinados.ativo) return

    const botoes = obterBotoesEnviar()
    if (botoes.length === 0) return

    const arvore = obterArvoreDocumento()
    if (!arvore) return

    const localConfig = await createLocalConfigStore().get()
    const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
    if (!unidadeAtual) return

    const pendencias = extrairDocumentosPendentes(arvore, unidadeAtual)
    if (pendencias.length === 0) return

    let confirmado = false
    botoes.forEach((botao) => {
      // Captura (não bubble) pra garantir que barra a ação nativa mesmo se o SEI usar
      // onclick inline em vez de um submit de formulário puro.
      botao.addEventListener(
        'click',
        (evento) => {
          if (confirmado) return
          evento.preventDefault()
          evento.stopImmediatePropagation()
          abrirDialogoConfirmacao(pendencias, unidadeAtual, () => {
            confirmado = true
            botao.click()
          })
        },
        { capture: true }
      )
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Registrar o content script no manifest**

Em `manifest.config.ts`, dentro do array `content_scripts`, adicionar (pode ser logo depois do bloco de `documento_receber`):

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=procedimento_enviar*',
        '*://*.org/*controlador.php?acao=procedimento_enviar*',
      ],
      js: ['src/content-scripts/procedimento_enviar/index.ts'],
      run_at: 'document_idle',
    },
```

- [ ] **Step 3: Rodar typecheck**

Run: `bun run typecheck`
Expected: sem erros (confirma que os imports de `detectarPendencias`, `montarDialogo`, `painelLateral` e `storage` batem com as assinaturas reais).

- [ ] **Step 4: Rodar a suíte completa de testes**

Run: `bun run test`
Expected: PASS — todos os testes existentes continuam passando, nenhum teste novo quebrado (este content script não tem teste unitário dedicado, seguindo o padrão já usado no projeto pra wiring de content scripts — ver `src/content-scripts/controle_unidade_gerar/index.ts` e `src/content-scripts/documento_receber/index.ts`, cuja lógica de clique/interceptação também não é testada isoladamente, só as funções puras que eles consomem).

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_enviar/index.ts manifest.config.ts
git commit -m "feat(seirmg): intercepta envio de processo com pendência de assinatura"
```

---

### Task 5: Estilos do diálogo (claro + tema escuro)

**Files:**
- Modify: `src/content-scripts/core/theme.css`

- [ ] **Step 1: Adicionar os estilos**

No final de `src/content-scripts/core/theme.css`, adicionar:

```css
/* ===== Alerta de documentos não assinados — procedimento_enviar ===== */

dialog.seirmg-alerta-nao-assinados {
  max-width: 420px;
  width: 90vw;
  padding: 0;
  border: none;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  font-family: Arial, sans-serif;
}

dialog.seirmg-alerta-nao-assinados::backdrop {
  background: rgba(0, 0, 0, 0.4);
}

.seirmg-alerta-nao-assinados-header {
  padding: 20px 22px 12px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.seirmg-alerta-nao-assinados-icone {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #fff1f0;
  color: #c0272d;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
  font-weight: bold;
}

.seirmg-alerta-nao-assinados-header strong {
  font-size: 16px;
}

.seirmg-alerta-nao-assinados-subtitulo {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #777;
}

.seirmg-alerta-nao-assinados-lista {
  margin: 4px 22px;
  border: 1px solid #f0d9d9;
  background: #fff8f8;
  border-radius: 8px;
  overflow-y: auto;
  max-height: 240px;
}

.seirmg-alerta-nao-assinados-item {
  padding: 10px 14px;
  font-size: 13px;
  border-bottom: 1px solid #f0d9d9;
}

.seirmg-alerta-nao-assinados-item:last-child {
  border-bottom: none;
}

.seirmg-alerta-nao-assinados-rodape {
  padding: 16px 22px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.seirmg-alerta-nao-assinados-cancelar {
  background: transparent;
  border: 1px solid #ccc;
  color: #444;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}

.seirmg-alerta-nao-assinados-confirmar {
  background: #c0272d;
  border: none;
  color: #fff;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
}

.seirmg-theme-black dialog.seirmg-alerta-nao-assinados {
  background: #1c1c1c;
}

.seirmg-theme-black .seirmg-alerta-nao-assinados-subtitulo {
  color: #ccc;
}

.seirmg-theme-black .seirmg-alerta-nao-assinados-lista {
  background: #2a1414;
  border-color: #4a2020;
}

.seirmg-theme-black .seirmg-alerta-nao-assinados-item {
  border-color: #4a2020;
  color: #fff;
}

.seirmg-theme-black .seirmg-alerta-nao-assinados-cancelar {
  border-color: #555;
  color: #fff;
}
```

- [ ] **Step 2: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros (confirma que o CSS é válido e o bundler não quebra).

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/core/theme.css
git commit -m "style(seirmg): estiliza o diálogo de documentos não assinados (claro + tema escuro)"
```

---

### Task 6: Toggle na página de Opções

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, dentro de `<section id="painel-processos">`, logo antes do `<br />` que precede `<button id="processos-salvar">` (depois da seção "Favoritos"), adicionar:

```html
      <h3>Alerta de documentos não assinados</h3>
      <label>
        <input type="checkbox" id="processos-alerta-nao-assinados-ativo" />
        Bloquear envio do processo com confirmação quando houver documento interno não assinado na unidade atual
      </label>
```

- [ ] **Step 2: Ler o valor ao carregar a aba**

Em `src/options/main.ts`, junto aos outros `const input... = document.getElementById(...)` da seção de Processos (perto de `inputFavoritosAtivo`), adicionar:

```ts
    const inputAlertaNaoAssinadosAtivo = document.getElementById(
      'processos-alerta-nao-assinados-ativo'
    ) as HTMLInputElement | null
```

E junto aos outros `if (input...) input....checked = ...` (perto do bloco de `inputFavoritosAtivo`), adicionar:

```ts
    if (inputAlertaNaoAssinadosAtivo) {
      inputAlertaNaoAssinadosAtivo.checked = config.controleProcessos.alertaNaoAssinados.ativo
    }
```

- [ ] **Step 3: Gravar o valor ao salvar**

Dentro do objeto `atualizado.controleProcessos` (no handler de `processos-salvar`), logo depois do campo `favoritos: { ... }`, adicionar:

```ts
            alertaNaoAssinados: {
              ativo: inputAlertaNaoAssinadosAtivo?.checked ?? true,
            },
```

- [ ] **Step 4: Rodar typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte completa e o build**

Run: `bun run test && bun run lint && bun run build`
Expected: tudo passa sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(seirmg): adiciona toggle do alerta de documentos não assinados nas Opções"
```

---

### Task 7: Atualizar o roadmap e revisão final

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

- [ ] **Step 1: Rodar a suíte completa mais uma vez, do zero**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: tudo passa.

- [ ] **Step 2: Adicionar a entrada em "Já entregue" no roadmap**

Em `docs/ROADMAP-LOTES.md`, na seção "## Já entregue", adicionar uma nova linha (na ordem que preferir, ex.: no final da lista):

```markdown
- **Lote Q — Alerta de documentos não assinados ao enviar processo** — spec `docs/superpowers/specs/2026-07-12-seirmg-lote-q-alerta-documentos-nao-assinados-design.md`, plano `docs/superpowers/plans/2026-07-12-seirmg-lote-q-alerta-documentos-nao-assinados.md`. Detecção via DOM da árvore (correlação por id numérico entre `icon{id}`/`anchorUG{id}`/`anchorA{id}`/`anchor{id}`, confirmada com HTML real), sem nenhuma chamada de rede — mais seguro que os padrões de fetch/aba oculta já descartados no projeto. ⚠️ **Pendente de validação manual numa instância SEI real** — seletor de `#btnSalvar` na página `acao=procedimento_enviar` e o acesso a `#ifrArvore` via `window.parent` (estrutura de frames), mesmo tratamento de risco dos Lotes F/K.
```

- [ ] **Step 3: Commit final**

```bash
git add docs/ROADMAP-LOTES.md
git commit -m "docs(seirmg): marca Lote Q como entregue no roadmap"
```

---

## Self-Review Notes

- **Cobertura da spec:** escopo (unidade atual + só documentos internos + bloqueio com confirmação) → Tasks 2 e 4; mecanismo de detecção (correlação por id) → Task 2; arquitetura técnica (novo content script, leitura via `window.parent`/`#ifrArvore`, sem rede) → Task 4; interface do alerta (estilo B aprovado em mockup) → Tasks 3 e 5; configuração (toggle em Opções) → Task 6; falha segura (fail-open) → Task 4 (try/catch + retornos antecipados); testes → Tasks 2 e 3; validação manual pendente → Task 7 (registrada no roadmap, mesmo padrão dos Lotes F/K).
- **Placeholders:** nenhum — todo step tem código completo.
- **Consistência de tipos:** `DocumentoPendente { id: string; nome: string }` definido na Task 2 é usado sem alteração nas Tasks 3 e 4; classes CSS definidas na Task 3 (`montarDialogo.ts`) são as mesmas usadas na Task 4 (seletores de clique) e estilizadas na Task 5 — conferido, batem.
