# Histórico de processos visitados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar os últimos 10 processos cuja árvore o usuário abriu (número + tipo), mostrar essa lista no popup da extensão com um link pra reabrir cada um, atrás de um toggle desligado por padrão nas Opções.

**Architecture:** Reaproveita o fetch que `montarPainelTipoEInteressados` (`content-scripts/procedimento_visualizar/index.ts`) já faz pra montar o painel lateral — nenhuma chamada de rede nova. Uma função pura (`registrarProcessoVisitado`) mantém a lista deduplicada/limitada em `LocalConfig.historicoProcessosVisitados`; o popup só lê esse array e `LocalConfig.baseUrlSei` pra montar os links. O toggle liga/desliga fica em `SyncConfig.historicoProcessos.ativo` (nome distinto do array em `LocalConfig`, de propósito, pra não confundir "configuração" com "dado").

**Tech Stack:** TypeScript, Vite, Vitest, Bun.

## Global Constraints

- Nenhuma chamada de rede nova — o registro usa só dados já extraídos pelo fetch existente de `montarPainelTipoEInteressados`.
- `createSyncConfigStore().get()`/`createLocalConfigStore().get()` **não fazem merge de defaults** pra instalações já existentes (gotcha já documentado no projeto) — todo acesso a `syncConfig.historicoProcessos` e `localConfig.historicoProcessosVisitados` precisa de fallback (`?.`/`?? []`), nunca acesso direto.
- Qualquer falha de leitura/escrita de storage segue a política já estabelecida: `try/catch` com `console.error('[SEIRMG] ...', error)`, sem travar o resto do painel/popup.
- Visual do popup segue o mockup aprovado pelo usuário: https://claude.ai/code/artifact/6d22fd4b-5485-417e-bd69-bba38f8e34ac (card de status com ícone circular colorido, lista de recentes com marcador + seta ao passar o mouse, botão "Abrir opções" com borda).

---

### Task 1: Novos tipos e defaults em `lib/storage.ts`

**Files:**
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: `export interface HistoricoProcessoEntry { idProcedimento: string; numero: string; tipo: string; acessadoEm: string }`, `export interface HistoricoProcessosConfig { ativo: boolean }`. Consumidas pelas Tasks 2, 3, 4, 5.

- [ ] **Step 1: Adicionar as duas interfaces novas**

Inserir logo depois da interface `AlertaNaoAssinadosConfig` (antes de `export interface ControleProcessosConfig`):

```ts
export interface AlertaNaoAssinadosConfig {
  ativo: boolean
}

export interface HistoricoProcessoEntry {
  idProcedimento: string
  numero: string
  tipo: string
  acessadoEm: string
}

export interface HistoricoProcessosConfig {
  ativo: boolean
}

export interface ControleProcessosConfig {
```

- [ ] **Step 2: Adicionar o campo em `SyncConfig`**

Substituir:

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
  tarefas: TarefasConfig
}
```

por:

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
  tarefas: TarefasConfig
  historicoProcessos: HistoricoProcessosConfig
}
```

- [ ] **Step 3: Adicionar o campo em `LocalConfig`**

Substituir:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
```

por:

```ts
export interface LocalConfig {
  schemaVersion: 1
  blocoAssinaturaNotificado: NotificadoState
  blocoAssinaturaPendenteAtual: string[]
  historicoProcessosVisitados: HistoricoProcessoEntry[]
```

- [ ] **Step 4: Adicionar os defaults**

Substituir:

```ts
  tarefas: {
    ativo: false,
    itens: [],
  },
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
  blocoAssinaturaEstadosConhecidos: {},
  blocoAssinaturaUltimaChecagemOportunista: '',
  tarefasNotificadas: {},
}
```

por:

```ts
  tarefas: {
    ativo: false,
    itens: [],
  },
  historicoProcessos: {
    ativo: false,
  },
}

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  schemaVersion: 1,
  blocoAssinaturaNotificado: {},
  blocoAssinaturaPendenteAtual: [],
  blocoAssinaturaEstadosConhecidos: {},
  blocoAssinaturaUltimaChecagemOportunista: '',
  tarefasNotificadas: {},
  historicoProcessosVisitados: [],
}
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit` (a partir de `C:\sei\seirmg`)
Expected: erros em qualquer lugar que constrói um `SyncConfig`/`LocalConfig` completo sem o campo novo (esperado — nenhum lugar deveria fazer isso fora dos defaults; se aparecer erro em `options/main.ts`, é o gotcha já conhecido do projeto, resolvido na Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: adiciona tipos e defaults do histórico de processos visitados"
```

---

### Task 2: Função pura de registro + testes

**Files:**
- Create: `src/features/procedimento-visualizar/historico.ts`
- Test: `src/features/procedimento-visualizar/historico.test.ts`

**Interfaces:**
- Consumes: `HistoricoProcessoEntry` (Task 1, `../../lib/storage`).
- Produces: `export function registrarProcessoVisitado(historicoAtual: HistoricoProcessoEntry[], novo: HistoricoProcessoEntry, limite?: number): HistoricoProcessoEntry[]`. Consumida pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/procedimento-visualizar/historico.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { registrarProcessoVisitado } from './historico'
import type { HistoricoProcessoEntry } from '../../lib/storage'

function entrada(idProcedimento: string, acessadoEm = '2026-07-20T10:00:00.000Z'): HistoricoProcessoEntry {
  return { idProcedimento, numero: `NUM-${idProcedimento}`, tipo: 'Tipo Teste', acessadoEm }
}

describe('registrarProcessoVisitado', () => {
  it('adiciona no início de uma lista vazia', () => {
    const resultado = registrarProcessoVisitado([], entrada('1'))
    expect(resultado).toEqual([entrada('1')])
  })

  it('adiciona no início, na frente de entradas existentes', () => {
    const resultado = registrarProcessoVisitado([entrada('1')], entrada('2'))
    expect(resultado).toEqual([entrada('2'), entrada('1')])
  })

  it('revisitar um processo já na lista move ele pro topo, sem duplicar', () => {
    const historico = [entrada('3'), entrada('2'), entrada('1')]
    const novaVisita = entrada('2', '2026-07-20T12:00:00.000Z')
    const resultado = registrarProcessoVisitado(historico, novaVisita)
    expect(resultado).toEqual([novaVisita, entrada('3'), entrada('1')])
  })

  it('corta a lista no limite informado, descartando os mais antigos', () => {
    const historico = [entrada('3'), entrada('2'), entrada('1')]
    const resultado = registrarProcessoVisitado(historico, entrada('4'), 3)
    expect(resultado).toEqual([entrada('4'), entrada('3'), entrada('2')])
  })

  it('usa 10 como limite padrão', () => {
    const historico = Array.from({ length: 10 }, (_, i) => entrada(String(i + 1)))
    const resultado = registrarProcessoVisitado(historico, entrada('11'))
    expect(resultado).toHaveLength(10)
    expect(resultado[0]).toEqual(entrada('11'))
    expect(resultado.find((item) => item.idProcedimento === '10')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test -- historico`
Expected: FAIL — `./historico` não existe ainda.

- [ ] **Step 3: Implementar a função**

Criar `src/features/procedimento-visualizar/historico.ts`:

```ts
import type { HistoricoProcessoEntry } from '../../lib/storage'

export function registrarProcessoVisitado(
  historicoAtual: HistoricoProcessoEntry[],
  novo: HistoricoProcessoEntry,
  limite = 10
): HistoricoProcessoEntry[] {
  const semDuplicata = historicoAtual.filter((item) => item.idProcedimento !== novo.idProcedimento)
  return [novo, ...semDuplicata].slice(0, limite)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test -- historico`
Expected: PASS, todos os 5 casos.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/features/procedimento-visualizar/historico.ts src/features/procedimento-visualizar/historico.test.ts
git commit -m "feat: função pura de registro do histórico de processos visitados"
```

---

### Task 3: Gravar o histórico ao carregar a árvore

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`

**Interfaces:**
- Consumes: `registrarProcessoVisitado` (Task 2, `../../features/procedimento-visualizar/historico`), `createSyncConfigStore`, `type HistoricoProcessoEntry` (Task 1, `../../lib/storage`).
- Produces: nenhuma interface nova exposta a outros arquivos.

- [ ] **Step 1: Atualizar os imports**

Substituir:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore } from '../../lib/storage'
```

por:

```ts
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore, createSyncConfigStore, type HistoricoProcessoEntry } from '../../lib/storage'
import { registrarProcessoVisitado } from '../../features/procedimento-visualizar/historico'
```

- [ ] **Step 2: Adicionar `obterIdProcedimento` e `registrarHistoricoVisita`**

Inserir logo depois da função `obterNumeroProcesso` existente (antes de `function alterarTitulo`):

```ts
function obterIdProcedimento(): string | null {
  return new URL(window.location.href).searchParams.get('id_procedimento')
}

async function registrarHistoricoVisita(numero: string | null, tipo: string): Promise<void> {
  const idProcedimento = obterIdProcedimento()
  if (!idProcedimento || !numero) return

  const syncConfig = await createSyncConfigStore().get()
  if (!syncConfig.historicoProcessos?.ativo) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const novo: HistoricoProcessoEntry = {
    idProcedimento,
    numero,
    tipo,
    acessadoEm: new Date().toISOString(),
  }
  const historico = registrarProcessoVisitado(localConfig.historicoProcessosVisitados ?? [], novo)
  await localStore.set({ ...localConfig, historicoProcessosVisitados: historico })
}
```

- [ ] **Step 3: Chamar `registrarHistoricoVisita` em `montarPainelTipoEInteressados`, reaproveitando o tipo já extraído**

Substituir:

```ts
  container.appendChild(criarSeparador('Tipo do processo'))
  const divTipo = document.createElement('div')
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo'
  pTipo.textContent = extrairTipoProcesso(doc)
  divTipo.appendChild(pTipo)
  container.appendChild(divTipo)

  renderizarNivelAcesso(container, extrairNivelAcesso(doc))
```

por:

```ts
  const tipo = extrairTipoProcesso(doc)

  container.appendChild(criarSeparador('Tipo do processo'))
  const divTipo = document.createElement('div')
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo'
  pTipo.textContent = tipo
  divTipo.appendChild(pTipo)
  container.appendChild(divTipo)

  registrarHistoricoVisita(numero, tipo).catch((error) => {
    console.error('[SEIRMG] Falha ao registrar processo no histórico:', error)
  })

  renderizarNivelAcesso(container, extrairNivelAcesso(doc))
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS, sem regressão (este arquivo não tem teste próprio).

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat: grava histórico de processos visitados ao carregar a árvore"
```

---

### Task 4: Toggle nas Opções

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `config.historicoProcessos` (Task 1, lido via `createSyncConfigStore` já importado em `main.ts`).
- Produces: nenhuma interface nova.

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, dentro de `<section id="painel-processos">`, substituir:

```html
      <h3>Alerta de documentos não assinados</h3>
      <label>
        <input type="checkbox" id="processos-alerta-nao-assinados-ativo" />
        Avisar ao enviar o processo quando houver documento interno não assinado na unidade atual
      </label>

      <br />
      <button id="processos-salvar">Salvar</button>
```

por:

```html
      <h3>Alerta de documentos não assinados</h3>
      <label>
        <input type="checkbox" id="processos-alerta-nao-assinados-ativo" />
        Avisar ao enviar o processo quando houver documento interno não assinado na unidade atual
      </label>

      <h3>Histórico de processos visitados</h3>
      <label>
        <input type="checkbox" id="processos-historico-ativo" />
        Guardar histórico de processos visitados (mostrado no popup da extensão)
      </label>

      <br />
      <button id="processos-salvar">Salvar</button>
```

- [ ] **Step 2: Ler o valor atual ao carregar a aba**

Em `src/options/main.ts`, dentro de `carregarAbaProcessos`, substituir:

```ts
    const inputAlertaNaoAssinadosAtivo = document.getElementById(
      'processos-alerta-nao-assinados-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('processos-status')
```

por:

```ts
    const inputAlertaNaoAssinadosAtivo = document.getElementById(
      'processos-alerta-nao-assinados-ativo'
    ) as HTMLInputElement | null
    const inputHistoricoAtivo = document.getElementById('processos-historico-ativo') as HTMLInputElement | null
    const status = document.getElementById('processos-status')
```

E substituir:

```ts
    if (inputAlertaNaoAssinadosAtivo) {
      inputAlertaNaoAssinadosAtivo.checked = config.controleProcessos.alertaNaoAssinados.ativo
    }
```

por:

```ts
    if (inputAlertaNaoAssinadosAtivo) {
      inputAlertaNaoAssinadosAtivo.checked = config.controleProcessos.alertaNaoAssinados.ativo
    }
    if (inputHistoricoAtivo) inputHistoricoAtivo.checked = config.historicoProcessos?.ativo ?? false
```

- [ ] **Step 3: Salvar o valor**

Substituir:

```ts
          pontoControle: {
            ativo: inputPontoControleAtivo?.checked ?? true,
            regras: regrasPontoControle,
          },
        }
        await store.set(atualizado)
```

por:

```ts
          pontoControle: {
            ativo: inputPontoControleAtivo?.checked ?? true,
            regras: regrasPontoControle,
          },
          historicoProcessos: {
            ativo: inputHistoricoAtivo?.checked ?? false,
          },
        }
        await store.set(atualizado)
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros (o erro da Task 1/Step 5, se existia por causa desse arquivo, some aqui).

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat: toggle de histórico de processos visitados nas Opções"
```

---

### Task 5: Redesenhar o popup e mostrar o histórico

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/main.ts`

**Interfaces:**
- Consumes: `HistoricoProcessoEntry` (Task 1, `../lib/storage`), `LocalConfig.historicoProcessosVisitados`/`LocalConfig.baseUrlSei` (Task 1/já existente).
- Produces: nenhuma interface nova.

- [ ] **Step 1: Substituir `src/popup/index.html` inteiro**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>SEIRMG</title>
    <style>
      :root {
        --bg: #ffffff;
        --bg-subtle: #f4f7fb;
        --border: #e2e7f0;
        --text: #1a2233;
        --text-muted: #667085;
        --accent: #017fff;
        --ok: #17875a;
        --ok-soft: #e7f6ef;
        --warn: #b5530a;
        --warn-soft: #fdf1e6;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #15181e;
          --bg-subtle: #1c2029;
          --border: #2b303c;
          --text: #e8ebf2;
          --text-muted: #98a1b3;
          --accent: #4da3ff;
          --ok: #34c48c;
          --ok-soft: rgba(52, 196, 140, 0.14);
          --warn: #f0a13c;
          --warn-soft: rgba(240, 161, 60, 0.14);
        }
      }
      * { box-sizing: border-box; }
      body {
        width: 320px;
        margin: 0;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: var(--bg);
        color: var(--text);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .cabecalho { display: flex; align-items: center; gap: 8px; }
      .cabecalho img { width: 20px; height: 20px; border-radius: 5px; }
      .cabecalho span { font-size: 13px; font-weight: 700; letter-spacing: 0.01em; }

      .status { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--ok-soft); }
      .status.pendente { background: var(--warn-soft); }
      .status-icone { flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; display: flex; align-items: center; justify-content: center; background: var(--ok); color: white; }
      .status.pendente .status-icone { background: var(--warn); }
      .status-icone svg { width: 13px; height: 13px; }
      .status-texto { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .status-titulo { font-size: 12.5px; font-weight: 600; color: var(--text); }
      .status-titulo.pendente-cor { color: var(--warn); }
      .status-sub { font-size: 11.5px; color: var(--text-muted); }

      #historico { display: none; flex-direction: column; gap: 6px; }
      #historico.visivel { display: flex; }
      .secao-rotulo { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); padding: 0 2px; }
      .lista-recentes { display: flex; flex-direction: column; gap: 2px; }
      .item-recente { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; text-decoration: none; color: inherit; }
      .item-recente:hover { background: var(--bg-subtle); }
      .item-recente:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .item-marcador { flex-shrink: 0; width: 6px; height: 6px; border-radius: 999px; background: var(--accent); }
      .item-texto { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
      .item-numero { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .item-tipo { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .item-seta { flex-shrink: 0; color: var(--text-muted); opacity: 0; transition: opacity 120ms ease; }
      .item-recente:hover .item-seta { opacity: 1; }
      .item-seta svg { width: 13px; height: 13px; display: block; }

      .divisor { height: 1px; background: var(--border); margin: 0 2px; }

      #abrir-opcoes { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 9px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer; }
      #abrir-opcoes:hover { background: var(--bg-subtle); border-color: var(--accent); color: var(--accent); }
      #abrir-opcoes svg { width: 14px; height: 14px; flex-shrink: 0; }
    </style>
  </head>
  <body>
    <div class="cabecalho">
      <img src="../assets/icons/icon-32.png" alt="" />
      <span>SEIRMG</span>
    </div>

    <div id="status" class="status">
      <div class="status-icone" id="status-icone"></div>
      <div class="status-texto">
        <span id="status-titulo" class="status-titulo">Carregando...</span>
        <span id="status-sub" class="status-sub"></span>
      </div>
    </div>

    <div id="historico">
      <div class="secao-rotulo">Processos recentes</div>
      <div id="lista-recentes" class="lista-recentes"></div>
    </div>

    <div class="divisor"></div>

    <button id="abrir-opcoes" type="button">
      <span id="icone-opcoes"></span>
      <span>Abrir opções</span>
    </button>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Substituir `src/popup/main.ts` inteiro**

```ts
import { createLocalConfigStore, type HistoricoProcessoEntry } from '../lib/storage'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import alertIconSvg from 'lucide-static/icons/triangle-alert.svg?raw'
import externalLinkIconSvg from 'lucide-static/icons/external-link.svg?raw'
import settingsIconSvg from 'lucide-static/icons/settings.svg?raw'

function montarItemHistorico(entrada: HistoricoProcessoEntry, baseUrlSei: string): HTMLAnchorElement {
  const item = document.createElement('a')
  item.className = 'item-recente'
  item.target = '_blank'
  item.rel = 'noopener'
  item.href = `${baseUrlSei}/controlador.php?acao=procedimento_trabalhar&id_procedimento=${entrada.idProcedimento}`

  const marcador = document.createElement('span')
  marcador.className = 'item-marcador'

  const texto = document.createElement('span')
  texto.className = 'item-texto'
  const numero = document.createElement('span')
  numero.className = 'item-numero'
  numero.textContent = entrada.numero
  const tipo = document.createElement('span')
  tipo.className = 'item-tipo'
  tipo.textContent = entrada.tipo
  texto.append(numero, tipo)

  const seta = document.createElement('span')
  seta.className = 'item-seta'
  seta.innerHTML = externalLinkIconSvg

  item.append(marcador, texto, seta)
  return item
}

async function render(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const total = localConfig.blocoAssinaturaPendenteAtual.length
    const pendente = total > 0

    const status = document.getElementById('status')
    const statusIcone = document.getElementById('status-icone')
    const statusTitulo = document.getElementById('status-titulo')
    const statusSub = document.getElementById('status-sub')

    status?.classList.toggle('pendente', pendente)
    if (statusIcone) statusIcone.innerHTML = pendente ? alertIconSvg : checkIconSvg
    if (statusTitulo) {
      statusTitulo.textContent = pendente ? 'Pendências encontradas' : 'Tudo em dia'
      statusTitulo.classList.toggle('pendente-cor', pendente)
    }
    if (statusSub) {
      statusSub.textContent = pendente
        ? `${total} bloco(s) com pendência de assinatura`
        : 'Nenhuma pendência no bloco de assinatura'
    }

    const historico = localConfig.historicoProcessosVisitados ?? []
    const baseUrlSei = localConfig.baseUrlSei
    const secaoHistorico = document.getElementById('historico')
    const listaRecentes = document.getElementById('lista-recentes')
    if (secaoHistorico && listaRecentes && historico.length > 0 && baseUrlSei) {
      historico.forEach((entradaHistorico) => {
        listaRecentes.appendChild(montarItemHistorico(entradaHistorico, baseUrlSei))
      })
      secaoHistorico.classList.add('visivel')
    }

    const iconeOpcoes = document.getElementById('icone-opcoes')
    if (iconeOpcoes) iconeOpcoes.innerHTML = settingsIconSvg
  } catch (error) {
    console.error('[SEIRMG] Falha ao renderizar popup:', error)
  }
}

document.getElementById('abrir-opcoes')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

render()
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/popup/index.html src/popup/main.ts
git commit -m "feat: redesenha o popup e mostra o histórico de processos visitados"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real: ativar a opção nas Opções → Processos, visitar 2-3 processos diferentes (abrir a árvore de cada um), abrir o popup da extensão e confirmar que os processos aparecem na lista "Processos recentes" (mais recente primeiro, número + tipo corretos), que clicar num item abre o processo certo numa aba nova, e que revisitar um processo já listado não duplica a entrada (só move pro topo). Confirmar também que, com a opção desligada (padrão), a seção não aparece no popup. Testar o popup nos dois temas (claro/escuro do SO) pra conferir as cores.
