# SEIRMG — Lote C: Motor de Tema (dark mode) + Aba Aparência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar cobertura visual real aos temas escuros (`black`/`super-black`) portando `black.css`/`super-black.css` do Sei++ para o motor de tema já existente, estender a aplicação do tema para os iframes internos do SEI via um content script dedicado `all_frames`, e implementar a aba Aparência das opções (hoje placeholder).

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-c-tema-design.md`. Reaproveita `lib/theme.ts` (`applyTheme`/`computeThemeClassName`) sem alterações — só expande o CSS que a classe já aplicada ativa, e move a responsabilidade de aplicar a classe do `core` (top-frame-only) para um content script novo e dedicado (`all_frames: true`).

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest — mesma infraestrutura já existente. Nenhuma dependência nova.

## Global Constraints

- Nenhuma permissão nova, nenhum host novo — só um bloco a mais de `content_scripts` no manifest, usando os mesmos `matches` já existentes.
- Regras CSS portadas de `black.css`/`super-black.css` (Sei++) escopadas por descendência da classe (`.seirmg-theme-black <seletor>` / `.seirmg-theme-super-black <seletor>`) — nunca aplicadas fora dessas classes.
- Todo content script novo/modificado segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.
- Sem lógica pura nova — `applyTheme`/`computeThemeClassName` (já testados em `lib/theme.test.ts`) são reaproveitados sem alteração de assinatura.

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── manifest.config.ts (modificado)
├── src/
│   ├── content-scripts/
│   │   ├── core/
│   │   │   ├── index.ts (modificado — remove applyTheme)
│   │   │   └── theme.css (modificado — CSS completo dos presets)
│   │   └── tema/index.ts (novo — aplica tema em todos os frames)
│   └── options/index.html, main.ts (modificados)
```

---

### Task 1: `content-scripts/core/theme.css` — CSS completo dos presets

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\core\theme.css`

**Contexto**: porte de `C:\sei\seiplus\cs_modules\themes\black.css` e `C:\sei\seiplus\cs_modules\themes\super-black.css`. Cada seletor do original recebe o prefixo de escopo (`.seirmg-theme-black `/`.seirmg-theme-super-black `). Duas adaptações em relação ao original: `html { background-color: black; }` vira `body.seirmg-theme-black { background-color: black; }` (a classe é aplicada ao `<body>`, não ao `<html>`); `:root { --dark-gray: ... }` vira escopado à classe. Não é coberto por TDD (CSS puro) — verificado via build.

- [ ] **Step 1: Substituir `src/content-scripts/core/theme.css`**

```css
:root {
  --seirmg-accent-color: #017fff;
}

/* ===== Black — portado de C:\sei\seiplus\cs_modules\themes\black.css ===== */

.seirmg-theme-black {
  --dark-gray: #363636;
}

.seirmg-theme-black * {
  color: white;
  background-color: transparent;
}
body.seirmg-theme-black {
  background-color: black;
}
.seirmg-theme-black input, .seirmg-theme-black button, .seirmg-theme-black textarea, .seirmg-theme-black select {
  background-color: black !important;
  color: inherit !important;
}
.seirmg-theme-black option {
  background-color: var(--dark-gray);
}
.seirmg-theme-black option:hover {
  background-color: darkblue !important;
}
.seirmg-theme-black button *, .seirmg-theme-black span.infraTeclaAtalho {
  color: inherit !important;
}
.seirmg-theme-black fieldset {
  border-color: white !important;
}
.seirmg-theme-black legend {
  color: inherit !important;
  background-color: var(--dark-gray) !important;
  border-color: white !important;
}
.seirmg-theme-black a:link { color: #0066ff; }
.seirmg-theme-black a:visited { color: rgb(132, 0, 255); }
.seirmg-theme-black a:hover { color: lightskyblue; }
.seirmg-theme-black a:active { color: red; }
.seirmg-theme-black li a:hover {
  background-color: darkblue !important;
  color: white !important;
}
.seirmg-theme-black #tblTipoProcedimento, .seirmg-theme-black #tblSeries {
  background-color: black !important;
}
.seirmg-theme-black .dd-options {
  background-color: black !important;
}
.seirmg-theme-black .dd-option-selected, .seirmg-theme-black .dd-selected {
  background: darkgreen !important;
}
.seirmg-theme-black table.resultado td.resSnippet, .seirmg-theme-black table.resultado td.metatag, .seirmg-theme-black table.resultado td.metatag * {
  background-color: inherit !important;
}
.seirmg-theme-black .totalEstatisticas {
  background-color: darkblue !important;
}
.seirmg-theme-black #btnVisualizarAssinaturas { color: black !important; }
.seirmg-theme-black th.tituloControle { background-color: transparent; }
.seirmg-theme-black #divInfraAreaGlobal, .seirmg-theme-black #divAutenticacao, .seirmg-theme-black #divSistema {
  background-color: transparent !important;
}
.seirmg-theme-black th.tituloControleExterno {
  background-color: unset;
}

.seirmg-theme-black .andamentoConcluido { background-color: black; }
.seirmg-theme-black .andamentoAberto { background-color: darkgoldenrod; }
.seirmg-theme-black .andamentoAberto td { color: black; }
.seirmg-theme-black .andamentoAberto td a { color: blue; }

.seirmg-theme-black div.infraBarraSistema {
  background-image: none;
  border-bottom-color: var(--dark-gray);
}
.seirmg-theme-black #divInfraBarraSistemaE img:first-child, .seirmg-theme-black #divComandos img {
  filter: brightness(50%);
}

.seirmg-theme-black #main-menu, .seirmg-theme-black #main-menu ul {
  background-color: var(--dark-gray) !important;
  border: none;
}
.seirmg-theme-black #main-menu li, .seirmg-theme-black div.infraAreaTelaE {
  background-color: black !important;
}
.seirmg-theme-black #main-menu a {
  color: inherit !important;
  background-color: inherit;
  border-bottom-color: var(--dark-gray);
}
.seirmg-theme-black #main-menu li a:hover, .seirmg-theme-black #main-menu li a.highlighted {
  background-color: darkblue !important;
}

.seirmg-theme-black #s2id_hdnDestinatario ul.select2-choices, .seirmg-theme-black li.select2-search-choice {
  background-image: none !important;
}
.seirmg-theme-black #s2id_hdnDestinatario *, .seirmg-theme-black #select2-drop, .seirmg-theme-black li.select2-search-choice,
.seirmg-theme-black li.select2-search-choice *, .seirmg-theme-black li.select2-no-results, .seirmg-theme-black li.select2-searching {
  background-color: black !important;
}

.seirmg-theme-black div.infraTooltipTitulo { color: black !important; }
.seirmg-theme-black div.infraTooltipTexto { color: black !important; }

.seirmg-theme-black div.infraAreaGlobal {
  border-color: var(--dark-gray);
}
.seirmg-theme-black a.ancoraPadraoPreta, .seirmg-theme-black caption.infraCaption, .seirmg-theme-black a.processoVisualizado {
  color: inherit;
}
.seirmg-theme-black a.processoVisitado {
  color: #3E8BFF;
}
.seirmg-theme-black label.infraLabelOpcional, .seirmg-theme-black label.infraLabelObrigatorio,
.seirmg-theme-black label.infraLabelCheckbox, .seirmg-theme-black label.infraLabelRadio {
  color: inherit;
}
.seirmg-theme-black a.ancoraSigla, .seirmg-theme-black a.ancoraHistoricoProcesso {
  color: #0066ff;
}
.seirmg-theme-black a.ancoraOpcao {
  color: inherit;
}
.seirmg-theme-black .infraSpanRealce {
  background-color: darkgreen;
}
.seirmg-theme-black div.tituloProcessoDocumento, .seirmg-theme-black div.tituloProcessoDocumento label {
  background-color: var(--dark-gray);
  color: white;
  border-bottom-color: black;
}
.seirmg-theme-black tr.trVermelha {
  background-color: #550000;
}

.seirmg-theme-black caption.infraCaption {
  border-bottom-color: lightgray;
}
.seirmg-theme-black table.infraTable {
  background-color: #555 !important;
}
.seirmg-theme-black th.infraTh, .seirmg-theme-black th.infraTh div {
  background-color: #555;
  background-image: none;
}
.seirmg-theme-black tr.infraTrClara {
  background-color: black;
}
.seirmg-theme-black tr.infraTrEscura {
  background-color: #333;
}
.seirmg-theme-black tr.infraTrAcessada td {
  background-color: transparent !important;
}
.seirmg-theme-black tr.infraTrAcessada a {
  color: unset !important;
}
.seirmg-theme-black div.infraBarraComandos {
  border-top-color: transparent;
  border-bottom-color: transparent;
}
.seirmg-theme-black div.infraAreaDados {
  border-bottom-color: transparent;
}
.seirmg-theme-black div.infraAreaTelaD {
  border-color: transparent;
}
.seirmg-theme-black .infraProcessando {
  color: black !important;
  background-color: transparent !important;
  filter: invert(100%);
}
.seirmg-theme-black tr.infraTrMarcada td {
  background-color: transparent !important;
}
.seirmg-theme-black tr.infraTrMarcada {
  background-color: #003800 !important;
}
.seirmg-theme-black tr.infraTrSelecionada,
.seirmg-theme-black tr.infraTrSelecionada td,
.seirmg-theme-black td.infraTdSelecionada {
  background-color: darkblue !important;
}

.seirmg-theme-black div.infraAjaxAutoCompletar {
  background-color: black;
}
.seirmg-theme-black div.infraAjaxAutoCompletar a {
  color: lightgray;
}
.seirmg-theme-black div.infraAjaxAutoCompletar li.selected {
  background-color: darkblue;
}
.seirmg-theme-black .infraAjaxMarcarSelecao {
  border-color: gray !important;
}

.seirmg-theme-black #infraCalendario, .seirmg-theme-black #divCalendario .diaUtil {
  background-color: black;
  border: none;
}
.seirmg-theme-black .calendar_week_column, .seirmg-theme-black #infraCalendario .todaysDate,
.seirmg-theme-black #divCalendario .diaFimDeSemana {
  background-color: #333333 !important;
  border: none;
}
.seirmg-theme-black #divCalendario .diaAtrasado {
  background-color: darkred !important;
}
.seirmg-theme-black #divCalendario .diaConteudo a {
  color: black;
}

.seirmg-theme-black div.infraBarraSuperior {
  filter: brightness(70%);
}

.seirmg-theme-black .ms-drop {
  background-color: var(--dark-gray);
}
.seirmg-theme-black .ms-drop:hover {
  background-color: darkblue;
}

.seirmg-theme-black #divArvore {
  border-bottom-color: white;
}
.seirmg-theme-black #divRelacionados {
  border-top-color: white;
}
.seirmg-theme-black a.ancoraRelacionadosParcial {
  color: inherit;
}

.seirmg-theme-black img[src*="aguarde.gif"],
.seirmg-theme-black img[src*="aguarde_pequeno.gif"],
.seirmg-theme-black img[src*="ajuda.gif"],
.seirmg-theme-black img[src*="sei_assinar_pequeno.gif"],
.seirmg-theme-black img[src*="sei_autenticar_pequeno.gif"],
.seirmg-theme-black img[src*="sei_autenticar_pequeno_nao_bloqueado.gif"] {
  filter: invert(100%);
}

.seirmg-theme-black .scayt-misspell-word {
  color: inherit;
}

.seirmg-theme-black tr.trEspaco {
  background-color: black;
}

.seirmg-theme-black tr.resTituloRegistro td {
  background-color: var(--dark-gray) !important;
}

.seirmg-theme-black div.tituloNovidade {
  border-bottom-color: transparent;
}

.seirmg-theme-black #ifrArvoreHtml {
  background-color: white;
  filter: brightness(90%);
}

.seirmg-theme-black .texto {
  color: inherit;
  background: inherit;
}
.seirmg-theme-black .exemplo {
  background: inherit;
}
.seirmg-theme-black .exemplo strong {
  color: inherit;
}

.seirmg-theme-black #divAreaRestrita {
  background-color: inherit !important;
}
.seirmg-theme-black #divSistema {
  filter: brightness(50%);
}

.seirmg-theme-black .infraTrseippalerta {
  background-color: #330 !important;
}
.seirmg-theme-black .infraTrseippcritico {
  background-color: #300 !important;
}
.seirmg-theme-black .infraTrEscura:hover, .seirmg-theme-black .infraTrClara:hover, .seirmg-theme-black .infraTrseippalerta:hover, .seirmg-theme-black .infraTrseippcritico:hover { background-color: darkblue !important; }
.seirmg-theme-black .infraTrClara:hover * { color: white !important; }

.seirmg-theme-black .seipp-options label:hover {
  background-color: darkblue !important;
}
.seirmg-theme-black .toggle-options, .seirmg-theme-black .toggle-options:visited {
  color: #0066ff !important;
}
.seirmg-theme-black .toggle-options > span {
  filter: invert(100%);
}
.seirmg-theme-black a.seipp-assinatura {
  background-color: #660 !important;
}

.seirmg-theme-black .cke_dialog_contents_body input, .seirmg-theme-black .cke_dialog_contents_body select {
  background-color: white !important;
}

/* ===== Super Black — portado de C:\sei\seiplus\cs_modules\themes\super-black.css ===== */

body.seirmg-theme-super-black,
.seirmg-theme-super-black .divLink,
.seirmg-theme-super-black .infraAreaTelaDEscondePequeno {
  background-color: black;
  color: white;
}

.seirmg-theme-super-black input, .seirmg-theme-super-black button, .seirmg-theme-super-black textarea, .seirmg-theme-super-black select {
  background-color: black;
  color: white;
}
.seirmg-theme-super-black .infraCheckboxDiv label:focus::before, .seirmg-theme-super-black .infraCheckboxDiv label:hover::before,
.seirmg-theme-super-black select:focus, .seirmg-theme-super-black textarea:focus, .seirmg-theme-super-black input:focus {
  background-color: #202020;
}

.seirmg-theme-super-black .infraCheckboxDiv label::before {
  background-color: black;
}

.seirmg-theme-super-black label.infraLabelOpcional, .seirmg-theme-super-black label.infraLabelObrigatorio {
  color: gray;
}

.seirmg-theme-super-black .infraCorBarraSistema, .seirmg-theme-super-black .infraCorBarraSuperior {
  background-color: black !important;
}

.seirmg-theme-super-black .infraBarraLocalizacao {
  color: gray;
}

.seirmg-theme-super-black legend.infraLegend, .seirmg-theme-super-black table.infraTable thead tr, .seirmg-theme-super-black table.infraTable tr > th.infraTh {
  background: #555;
}

.seirmg-theme-super-black tr.infraTrClara, .seirmg-theme-super-black td.infraTdClara {
  background-color: black;
}

.seirmg-theme-super-black a.processoVisualizado, .seirmg-theme-super-black table.infraTable, .seirmg-theme-super-black a {
  color: white;
}

.seirmg-theme-super-black tr.infraTrSelecionada, .seirmg-theme-super-black tr.infraTrSelecionada td, .seirmg-theme-super-black td.infraTdSelecionada {
  background-color: #555 !important;
}

.seirmg-theme-super-black tr.infraTrAcessada, .seirmg-theme-super-black tr.infraTrAcessada td, .seirmg-theme-super-black td.infraTdAcessada {
  background-color: #242400 !important;
}

.seirmg-theme-super-black #divFiltro {
  border-bottom: 2px solid;
}

.seirmg-theme-super-black #btnInfraTopo,
.seirmg-theme-super-black #divTabelaProcesso img[src*=marcador_preto] {
  filter: drop-shadow(0px 0px 2px white);
}

.seirmg-theme-super-black #txtPesquisaRapida {
  background-color: black;
  color: white;
}

.seirmg-theme-super-black span.infraAcaoBarraConjugada, .seirmg-theme-super-black span.infraAcaoBarraConjugada:hover {
  background-color: black;
}

.seirmg-theme-super-black #lnkInfraUnidade {
  background-color: black;
}

.seirmg-theme-super-black .divInfraAreaTelaE, .seirmg-theme-super-black #divInfraPesquisarMenu {
  background-color: black;
}

.seirmg-theme-super-black .infraPesquisarMenu, .seirmg-theme-super-black .infraPesquisarMenu:focus {
  background-color: black;
  color: white !important;
}

.seirmg-theme-super-black div.infraArvore a {
  color: white;
}

.seirmg-theme-super-black div.infraArvore .noVisitado {
  background-color: black;
  color: #3E8BFF;
}

.seirmg-theme-super-black div.infraArvore img[src*=assinatura2],
.seirmg-theme-super-black div.infraArvore img[src*=autenticacao2] {
  filter: invert(100%);
}

.seirmg-theme-super-black #divInfraAreaTelaD {
  background-color: black;
}

.seirmg-theme-super-black .barraBotoesSEI {
  border: black !important;
}

.seirmg-theme-super-black #divArvoreConteudo {
  background-color: black;
}

.seirmg-theme-super-black #divArvoreConteudo #divArvoreInformacao {
  color: white;
}

.seirmg-theme-super-black #seipp-div-options-ui .card {
  background-color: black;
}

/* ===== Custom ===== */

.seirmg-theme-custom a,
.seirmg-theme-custom .infraBotao {
  color: var(--seirmg-accent-color) !important;
}
```

- [ ] **Step 2: Rodar a suíte e o build para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: 95 testes passando (nenhum teste novo — CSS não é coberto por TDD), build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/core/theme.css
git commit -m "feat(tema): port black.css and super-black.css scoped to theme classes"
```

---

### Task 2: `content-scripts/tema/index.ts` — aplicador de tema cross-iframe

**Files:**
- Create: `C:\sei\seirmg\src\content-scripts\tema\index.ts`

**Contexto**: content script mínimo, sem `MutationObserver` nem mensageria — só lê o sync config e aplica a classe via `applyTheme` (já existente, sem alterações). Vai rodar em `all_frames: true` (wiring no manifest, Task 4), então cada frame do SEI (principal + iframes de menu/árvore/conteúdo) aplica o tema no seu próprio `document.body` de forma independente. Não é coberto por TDD (mesmo padrão de todo `content-scripts/`) — verificado via build.

**Interfaces:**
- Consumes: `createSyncConfigStore` (`../../lib/storage`); `applyTheme` (`../../lib/theme`)

- [ ] **Step 1: Criar `src/content-scripts/tema/index.ts`**

```ts
import { createSyncConfigStore } from '../../lib/storage'
import { applyTheme } from '../../lib/theme'

async function aplicarTemaDaPagina(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar tema:', error)
  }
}

aplicarTemaDaPagina()
```

- [ ] **Step 2: Commit**

```bash
git add src/content-scripts/tema/index.ts
git commit -m "feat(tema): add dedicated all-frames content script to apply theme class"
```

---

### Task 3: `content-scripts/core/index.ts` — remover aplicação de tema do bootstrap

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\core\index.ts`

**Contexto**: a aplicação de tema migra inteiramente para o content script da Task 2. `core` perde a chamada `applyTheme(...)` e o import correspondente; o resto do bootstrap (detecção de URL/versão do SEI, mensagem `seirmg:sei-detectado`, `renderBadge`) fica inalterado.

- [ ] **Step 1: Substituir `src/content-scripts/core/index.ts`**

Arquivo atual:

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

    chrome.runtime.sendMessage({ type: 'seirmg:sei-detectado' }).catch((error) => {
      console.error('[SEIRMG] Falha ao notificar sessão do SEI detectada:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

Substituir por:

```ts
import { createLocalConfigStore } from '../../lib/storage'
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

    chrome.runtime.sendMessage({ type: 'seirmg:sei-detectado' }).catch((error) => {
      console.error('[SEIRMG] Falha ao notificar sessão do SEI detectada:', error)
    })

    await renderBadge()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Commit**

```bash
git add src/content-scripts/core/index.ts
git commit -m "refactor(core): remove theme application, now handled by dedicated content script"
```

---

### Task 4: `manifest.config.ts` — bloco `content_scripts` dedicado ao tema

**Files:**
- Modify: `C:\sei\seirmg\manifest.config.ts`

**Contexto**: `theme.css` sai do bloco `core` (que perde a responsabilidade de tema) e passa para um bloco novo, com `js: ['src/content-scripts/tema/index.ts']` e `all_frames: true`. O arquivo CSS continua fisicamente em `content-scripts/core/theme.css` — só a referência no manifest muda de bloco. Mesmos `matches` já usados pelo `core`, nenhuma permissão/host novo.

**Interfaces:**
- Consumes: `src/content-scripts/tema/index.ts` (Task 2)

- [ ] **Step 1: Substituir o array `content_scripts` em `manifest.config.ts`**

Trecho atual:

```ts
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
```

Substituir por:

```ts
  content_scripts: [
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/core/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/tema/index.ts'],
      css: ['src/content-scripts/core/theme.css'],
      all_frames: true,
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
```

- [ ] **Step 2: Rodar a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: 95 testes passando, build sem erros.

- [ ] **Step 3: Validar o manifest gerado**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log(JSON.stringify(m.content_scripts.map(c => ({js: c.js, all_frames: c.all_frames}))))"`
Expected: 3 entradas — a segunda com `js: ["assets/index.ts-....js"]` (bundle de `tema/index.ts`) e `all_frames: true`; permissões (`m.permissions`) continuam `["storage","notifications","alarms","tabs"]`.

- [ ] **Step 4: Commit**

```bash
git add manifest.config.ts
git commit -m "feat(manifest): add all-frames content script block for theme application"
```

---

### Task 5: `options/index.html` + `options/main.ts` — aba Aparência

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: DOM-heavy, não coberto por TDD, verificado via build. Primeira implementação real da aba Aparência (hoje só texto placeholder).

**Interfaces:**
- Consumes: `createSyncConfigStore` (`../lib/storage`); `type ThemePreset` (`../lib/storage`)

- [ ] **Step 1: Substituir a seção `#painel-aparencia` em `src/options/index.html`**

Trecho atual:

```html
    <section id="painel-aparencia" class="painel">
      <p>Em breve: seleção de tema (claro, black, super-black, custom).</p>
    </section>
```

Substituir por:

```html
    <section id="painel-aparencia" class="painel">
      <h2>Aparência</h2>
      <label>
        Tema:
        <select id="aparencia-preset">
          <option value="claro">Claro</option>
          <option value="black">Black</option>
          <option value="super-black">Super Black</option>
          <option value="custom">Cor customizada</option>
        </select>
      </label>
      <br />
      <label>
        Cor customizada:
        <input type="color" id="aparencia-cor-customizada" />
      </label>
      <br />
      <button id="aparencia-salvar">Salvar</button>
      <span id="aparencia-status"></span>
    </section>
```

- [ ] **Step 2: Adicionar `carregarAbaAparencia` em `src/options/main.ts`**

Modificar o import do topo do arquivo:

Atual:

```ts
import { createSyncConfigStore } from '../lib/storage'
```

Substituir por:

```ts
import { createSyncConfigStore, type ThemePreset } from '../lib/storage'
```

Trecho final do arquivo, atual:

```ts
carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
```

Substituir por (adiciona `carregarAbaAparencia` antes das três funções já existentes, sem tocar nelas):

```ts
async function carregarAbaAparencia(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const selectPreset = document.getElementById('aparencia-preset') as HTMLSelectElement | null
    const inputCor = document.getElementById('aparencia-cor-customizada') as HTMLInputElement | null
    const status = document.getElementById('aparencia-status')

    if (selectPreset) selectPreset.value = config.tema.preset
    if (inputCor) inputCor.value = config.tema.customColor ?? '#017fff'

    document.getElementById('aparencia-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          tema: {
            preset: (selectPreset?.value ?? 'claro') as ThemePreset,
            customColor: inputCor?.value ?? '#017fff',
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
        console.error('[SEIRMG] Falha ao salvar configuração de aparência:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Aparência:', error)
  }
}

carregarAbaAparencia()
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
git commit -m "feat(options): implement Aparência tab with theme preset and custom color"
```

---

### Task 6: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 95 testes, todos passando (nenhum teste novo neste lote — CSS, content scripts e options não são cobertos por TDD).

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: CSS completo dos presets black/super-black (Task 1), content script dedicado `all_frames` (Task 2), remoção da responsabilidade de tema do `core` (Task 3), wiring no manifest (Task 4), aba Aparência (Task 5). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de implementação está completo e literal.
3. **Consistência de tipos**: `applyTheme(document.body, tema)` (Task 2) usa a mesma assinatura já existente em `lib/theme.ts` (não alterada). `ThemePreset` (Task 5) importado de `lib/storage`, mesmo tipo já usado por `ThemeConfig`. Classes CSS (`seirmg-theme-black`/`seirmg-theme-super-black`/`seirmg-theme-custom`) idênticas às já produzidas por `computeThemeClassName` em `lib/theme.ts` — nenhuma classe nova inventada.
4. **Contagem de testes**: 95 (baseline antes deste plano) + 0 (nenhuma lógica pura nova) = 95 testes esperados do início ao fim deste plano.
