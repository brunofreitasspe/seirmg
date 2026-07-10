# SEIRMG — Painel lateral do processo + arrastar-e-soltar: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the SEI process-view screen (`procedimento_visualizar`), add side panels for Tipo do processo (merged with the Planka localização/comentário already shown there), Interessados, and Atribuição; and add a drag-and-drop flow that creates a documento externo from a dropped file via the same 4-step AJAX chain the original Sei++ extension used.

**Architecture:** Two new pure-logic modules (`src/features/procedimento-visualizar/painelLateral.ts` for the side panels, `src/features/procedimento-visualizar/dropzone.ts` for the drag-and-drop flow) hold all HTML-parsing/regex/POST-body-building logic, fully unit tested. `src/content-scripts/procedimento_visualizar/index.ts` wires these into the page: fetches, DOM rendering, drag/drop event listeners — untested directly, guarded by try/catch, matching this project's established content-script convention.

**Tech Stack:** TypeScript, Vite, Bun, Vitest — infrastructure already in place. No new dependency.

## Global Constraints

- Every new/changed function that does `chrome.*` or network I/O must be wrapped in try/catch, log via `console.error('[SEIRMG] ...', error)`, swallow, never rethrow — standing project policy.
- All fetches to `controlador.php` from the content script go through `fetchText` (`src/lib/fetchViaBackground.ts`, session-gated) — **except** the file-upload step of the drag-and-drop flow (Task 7), which uses `fetch()` directly per the approved design (real user-initiated action in the real tab, not a background/concurrent call; needs a body type the relay can't carry).
- POST bodies with free-form text (filenames, etc.) are built as raw `key=value&...` strings using `escapeComponentAnotacao` (`src/features/procedimento-visualizar/anotacao.ts`, already exported) — the ISO-8859-1-style escaping SEI's forms expect — then wrapped in `new URLSearchParams(corpo)` only at the `fetchText` call site, matching the exact pattern `montarCorpoSalvarAnotacao`/`salvar()` in this same file already use. Do not use `URLSearchParams` to build the body from scratch (it re-encodes as UTF-8 and would corrupt accented characters).
- No new manifest permissions.
- Run all commands from `C:\sei\seirmg`.
- **Manual validation flag:** two pieces of this plan port regex/logic from Sei++ source that cannot be independently verified without a live SEI instance with a confidential ("sigiloso") process and without inspecting the real "Incluir Documento Externo" form's `rdoNivelAcesso` radio values — same risk category already accepted for Lote F. Both are called out inline where they occur (Task 2's sigiloso branch, Task 6's nível de acesso value extraction).

---

### Task 1: Tipo do processo + Interessados — pure extraction functions

**Files:**
- Create: `src/features/procedimento-visualizar/painelLateral.ts`
- Test: `src/features/procedimento-visualizar/painelLateral.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `extrairUrlEdicaoProcesso(headHtml: string): string | null` — used by Task 3.
  - `extrairTipoProcesso(doc: Document): string` — used by Task 3.
  - `type InteressadoExtraido = { id: string; nome: string; sigla: string }` — used by Task 3.
  - `extrairInteressados(doc: Document): InteressadoExtraido[]` — used by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/features/procedimento-visualizar/painelLateral.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairUrlEdicaoProcesso, extrairTipoProcesso, extrairInteressados } from './painelLateral'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('extrairUrlEdicaoProcesso', () => {
  it('encontra a url de procedimento_alterar no head', () => {
    const head = `<title>SEI</title><a href="controlador.php?acao=procedimento_alterar&id_procedimento=123&infra_hash=abc" tabindex="0"></a>`
    expect(extrairUrlEdicaoProcesso(head)).toBe(
      'controlador.php?acao=procedimento_alterar&id_procedimento=123&infra_hash=abc'
    )
  })

  it('cai para procedimento_consultar quando alterar não existe', () => {
    const head = `<a href="controlador.php?acao=procedimento_consultar&id_procedimento=123&infra_hash=abc"></a>`
    expect(extrairUrlEdicaoProcesso(head)).toBe(
      'controlador.php?acao=procedimento_consultar&id_procedimento=123&infra_hash=abc'
    )
  })

  it('retorna null quando nenhum dos dois marcadores existe', () => {
    expect(extrairUrlEdicaoProcesso('<title>SEI</title>')).toBeNull()
  })
})

describe('extrairTipoProcesso', () => {
  it('extrai o texto da opção selecionada', () => {
    const doc = montarDocumento(`
      <select id="selTipoProcedimento">
        <option value="1">Outro tipo</option>
        <option value="2" selected="selected">Aquisições e ARPs</option>
      </select>
    `)
    expect(extrairTipoProcesso(doc)).toBe('Aquisições e ARPs')
  })

  it('retorna string vazia quando não há select', () => {
    expect(extrairTipoProcesso(montarDocumento('<div></div>'))).toBe('')
  })
})

describe('extrairInteressados', () => {
  it('extrai nome e sigla no formato "Nome (SIGLA)"', () => {
    const doc = montarDocumento(`
      <select id="selInteressadosProcedimento">
        <option value="10">João da Silva (JS)</option>
        <option value="11">Maria Souza (MS)</option>
      </select>
    `)
    expect(extrairInteressados(doc)).toEqual([
      { id: '10', nome: 'João da Silva', sigla: 'JS' },
      { id: '11', nome: 'Maria Souza', sigla: 'MS' },
    ])
  })

  it('usa o texto inteiro como nome quando não bate o formato "(SIGLA)"', () => {
    const doc = montarDocumento(`
      <select id="selInteressadosProcedimento">
        <option value="10">Secretaria de Obras</option>
      </select>
    `)
    expect(extrairInteressados(doc)).toEqual([{ id: '10', nome: 'Secretaria de Obras', sigla: '' }])
  })

  it('retorna lista vazia quando não há select', () => {
    expect(extrairInteressados(montarDocumento('<div></div>'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `bunx vitest run src/features/procedimento-visualizar/painelLateral.test.ts`
Expected: FAIL — `Cannot find module './painelLateral'`.

- [ ] **Step 3: Implement `src/features/procedimento-visualizar/painelLateral.ts`**

```ts
export function extrairUrlEdicaoProcesso(headHtml: string): string | null {
  const marcadores = [
    'controlador.php?acao=procedimento_alterar&',
    'controlador.php?acao=procedimento_consultar&',
  ]
  for (const marcador of marcadores) {
    const inicio = headHtml.indexOf(marcador)
    if (inicio === -1) continue
    const fim = headHtml.indexOf('"', inicio)
    if (fim === -1) continue
    return headHtml.substring(inicio, fim)
  }
  return null
}

export function extrairTipoProcesso(doc: Document): string {
  return doc.querySelector("#selTipoProcedimento option[selected='selected']")?.textContent?.trim() ?? ''
}

export interface InteressadoExtraido {
  id: string
  nome: string
  sigla: string
}

export function extrairInteressados(doc: Document): InteressadoExtraido[] {
  return Array.from(doc.querySelectorAll('#selInteressadosProcedimento option')).map((option) => {
    const texto = option.textContent ?? ''
    const match = /^(.*) \((.*)\)$/.exec(texto)
    return {
      id: option.getAttribute('value') ?? '',
      nome: (match?.[1] ?? texto).trim(),
      sigla: (match?.[2] ?? '').trim(),
    }
  })
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `bunx vitest run src/features/procedimento-visualizar/painelLateral.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/painelLateral.ts src/features/procedimento-visualizar/painelLateral.test.ts
git commit -m "feat(procedimento-visualizar): add pure extractors for tipo do processo and interessados"
```

---

### Task 2: Atribuição — pure extraction functions

**Files:**
- Modify: `src/features/procedimento-visualizar/painelLateral.ts` (append to the file from Task 1)
- Modify: `src/features/procedimento-visualizar/painelLateral.test.ts` (append tests)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `obterUnidadeAtual(seiVersionAtLeast4: boolean, doc: Document): string | null` — used by Task 3.
  - `type UsuarioAtribuicao = { nome: string; login: string }` — used by Task 3.
  - `type DadosAtribuicao = { sigiloso: boolean; usuarios: UsuarioAtribuicao[]; mais?: number }` — used by Task 3.
  - `extrairAtribuicao(scriptHtml: string, unidadeAtual: string): DadosAtribuicao | null` — used by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/procedimento-visualizar/painelLateral.test.ts` (add the import too — change the top import line to include the new names):

```ts
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
} from './painelLateral'
```

Append these `describe` blocks:

```ts
describe('obterUnidadeAtual', () => {
  it('lê #lnkInfraUnidade quando a versão do SEI é >= 4', () => {
    const doc = montarDocumento('<a id="lnkInfraUnidade">GAB</a>')
    expect(obterUnidadeAtual(true, doc)).toBe('GAB')
  })

  it('lê o select selInfraUnidades quando a versão é < 4', () => {
    const doc = montarDocumento(`
      <select name="selInfraUnidades">
        <option value="1">OUTRA</option>
        <option value="2" selected>GAB</option>
      </select>
    `)
    expect(obterUnidadeAtual(false, doc)).toBe('GAB')
  })

  it('retorna null quando o elemento esperado não existe', () => {
    expect(obterUnidadeAtual(true, montarDocumento('<div></div>'))).toBeNull()
    expect(obterUnidadeAtual(false, montarDocumento('<div></div>'))).toBeNull()
  })
})

describe('extrairAtribuicao', () => {
  it('retorna null quando o processo não está aberto em nenhuma unidade', () => {
    const script = `Nos[0].html = 'Processo não aberto em nenhuma unidade';`
    expect(extrairAtribuicao(script, 'GAB')).toBeNull()
  })

  it('processo não sigiloso, aberto e atribuído na unidade atual', () => {
    const script =
      `Nos[0].html = 'Processo aberto nas unidades: ` +
      `<a alt="a" title="b" class="ancoraSigla">GAB</a> ` +
      `(atribuído para <a alt="a" title="João Silva" class="ancoraSigla">joao.silva</a>).<br />';`
    expect(extrairAtribuicao(script, 'GAB')).toEqual({
      sigiloso: false,
      usuarios: [{ nome: 'João Silva', login: 'joao.silva' }],
    })
  })

  it('processo não sigiloso, aberto na unidade atual mas sem atribuição', () => {
    const script =
      `Nos[0].html = 'Processo aberto nas unidades: <a alt="a" title="b" class="ancoraSigla">GAB</a>.<br />';`
    expect(extrairAtribuicao(script, 'GAB')).toEqual({ sigiloso: false, usuarios: [] })
  })

  it('processo não sigiloso, aberto só em outra unidade (não a atual) retorna null', () => {
    const script =
      `Nos[0].html = 'Processo aberto nas unidades: <a alt="a" title="b" class="ancoraSigla">OUTRA</a>.<br />';`
    expect(extrairAtribuicao(script, 'GAB')).toBeNull()
  })

  it('processo sigiloso, usuário da unidade atual', () => {
    // Estrutura assumida (não confirmada contra instância real -- ver nota de validação
    // manual no plano, Task 2): pares alternados de âncora (nome/login do usuário) e
    // âncora (unidade), separados por "&nbsp;/&nbsp;".
    const script =
      `Nos[0].html = 'Processo aberto com os usuários: ` +
      `<a alt="a" title="João Silva" class="ancoraSigla">joao.silva</a>&nbsp;/&nbsp;` +
      `<a alt="a" title="Gabinete" class="ancoraSigla">GAB</a>&nbsp;/&nbsp;` +
      `<a alt="a" title="Maria Souza" class="ancoraSigla">maria.souza</a>&nbsp;/&nbsp;` +
      `<a alt="a" title="Outra Unidade" class="ancoraSigla">OUTRA</a>.<br />';`
    const resultado = extrairAtribuicao(script, 'GAB')
    expect(resultado?.sigiloso).toBe(true)
    expect(resultado?.usuarios).toEqual([{ nome: 'João Silva', login: 'joao.silva' }])
    expect(resultado?.mais).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests and confirm the new ones fail**

Run: `bunx vitest run src/features/procedimento-visualizar/painelLateral.test.ts`
Expected: FAIL — `obterUnidadeAtual`/`extrairAtribuicao` not exported yet.

- [ ] **Step 3: Append the implementation to `painelLateral.ts`**

```ts
export function obterUnidadeAtual(seiVersionAtLeast4: boolean, doc: Document): string | null {
  if (seiVersionAtLeast4) {
    return doc.querySelector('#lnkInfraUnidade')?.textContent?.trim() || null
  }
  const select = doc.querySelector<HTMLSelectElement>("select[name='selInfraUnidades']")
  return select?.selectedOptions[0]?.textContent?.trim() || null
}

export interface UsuarioAtribuicao {
  nome: string
  login: string
}

export interface DadosAtribuicao {
  sigiloso: boolean
  usuarios: UsuarioAtribuicao[]
  mais?: number
}

export function extrairAtribuicao(scriptHtml: string, unidadeAtual: string): DadosAtribuicao | null {
  if (!/^Nos\[0\]\.html = 'Processo aberto/m.test(scriptHtml)) return null

  const rConteudo = /^Nos\[0\]\.html = '(.*)';/m.exec(scriptHtml)
  if (!rConteudo) return null
  const html = rConteudo[1]

  if (/(Processo aberto nas unidades:|Processo aberto somente na unidade)/m.test(html)) {
    const regexUnidade = new RegExp(
      String.raw`(?<=<a alt=".*" title=".*" class="ancoraSigla">)${unidadeAtual}<\/a>(.*?)[.]?<br \/>`,
      'm'
    )
    const resultadoUnidade = regexUnidade.exec(html)
    if (!resultadoUnidade) return null

    const regexUsuario = /\(atribuído para <a alt=".*" title="(.*?)" class="ancoraSigla">(.*?)<\/a>\)/m
    const resultadoUsuario = regexUsuario.exec(resultadoUnidade[1])
    if (!resultadoUsuario) return { sigiloso: false, usuarios: [] }
    return { sigiloso: false, usuarios: [{ nome: resultadoUsuario[1], login: resultadoUsuario[2] }] }
  }

  if (/(Processo aberto com os usuários:|Processo aberto somente com o usuário)/m.test(html)) {
    const regex =
      /(?<=<a alt=".*?" title="(.*?)" class="ancoraSigla">(.*?))(?=<\/a>&nbsp;\/&nbsp;<a alt=".*?" title=".*?" class="ancoraSigla">(.*?)<\/a>)/g
    const usuarios: UsuarioAtribuicao[] = []
    let mais = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(html)) !== null) {
      if (m.index === regex.lastIndex) regex.lastIndex++
      const [, nome, login, unidade] = m
      if (unidade === unidadeAtual) {
        usuarios.push({ nome, login })
      } else {
        mais++
      }
    }
    return { sigiloso: true, usuarios, mais }
  }

  return null
}
```

**Note for the implementer:** the "sigiloso" branch is a near-verbatim port of `consultarAtribuicao.js`'s `obterAtribuicao` from the original Sei++ extension (same regex, same variable roles). Its exact HTML structure assumption (alternating usuário/unidade anchor pairs) could not be confirmed against a live confidential process in this session — flag this in your report as inherited, unverified logic, same treatment as Lote F's flagged items.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `bunx vitest run src/features/procedimento-visualizar/painelLateral.test.ts`
Expected: PASS — 16 tests total (8 from Task 1 + 8 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/painelLateral.ts src/features/procedimento-visualizar/painelLateral.test.ts
git commit -m "feat(procedimento-visualizar): add pure extractor for atribuição do processo"
```

---

### Task 3: Wire the side panels into `procedimento_visualizar`

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`
- Modify: `src/content-scripts/shared/plankaCard.ts`

**Interfaces:**
- Consumes: everything from Task 1/2 (`extrairUrlEdicaoProcesso`, `extrairTipoProcesso`, `extrairInteressados`, `type InteressadoExtraido`, `obterUnidadeAtual`, `extrairAtribuicao`, `type DadosAtribuicao`) from `../../features/procedimento-visualizar/painelLateral`.
- Produces: nothing consumed by later tasks — this is the end of Part 1 (side panels). Task 4-7 (Part 2, drag-and-drop) are independent of this task's output.

- [ ] **Step 1: Let `plankaCard.ts` omit the tipo pill**

The Planka card gets folded into the "Tipo do processo" panel instead of showing its own tipo pill (the native SEI tipo already covers that). Change `montarConteudoCardPlanka`'s signature to accept an option controlling whether the tipo pill renders.

In `src/content-scripts/shared/plankaCard.ts`, change:

```ts
export function montarConteudoCardPlanka(dados: RespostaConsultaPlanka): HTMLElement | null {
  const divConteudo = document.createElement('div')

  const pills = document.createElement('div')
  pills.className = 'seirmg-planka-pills'

  if (dados.tipoProcesso) {
    const pillTipo = document.createElement('span')
    pillTipo.className = 'seirmg-planka-pill seirmg-planka-pill-tipo'
    pillTipo.textContent = `📋 ${dados.tipoProcesso}`
    pills.appendChild(pillTipo)
  }

  if (dados.localizacao) {
```

to:

```ts
export function montarConteudoCardPlanka(
  dados: RespostaConsultaPlanka,
  opcoes: { mostrarPillTipo?: boolean } = {}
): HTMLElement | null {
  const mostrarPillTipo = opcoes.mostrarPillTipo ?? true
  const divConteudo = document.createElement('div')

  const pills = document.createElement('div')
  pills.className = 'seirmg-planka-pills'

  if (mostrarPillTipo && dados.tipoProcesso) {
    const pillTipo = document.createElement('span')
    pillTipo.className = 'seirmg-planka-pill seirmg-planka-pill-tipo'
    pillTipo.textContent = `📋 ${dados.tipoProcesso}`
    pills.appendChild(pillTipo)
  }

  if (dados.localizacao) {
```

(The rest of the function is unchanged.) This is backward compatible — `procedimento_controlar/index.ts`'s popover (built earlier today) calls `montarConteudoCardPlanka(dados)` with no second argument, so it keeps showing the tipo pill exactly as before. Only Task 3's new call site (Step 4 below) passes `{ mostrarPillTipo: false }`.

- [ ] **Step 2: Run the existing test suite to confirm this change doesn't break anything**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all existing tests still pass (this module has no dedicated test file — DOM code — but confirm nothing else references the old signature incorrectly).

- [ ] **Step 3: Add the imports**

In `src/content-scripts/procedimento_visualizar/index.ts`, change the import block from:

```ts
import {
  classificarDivRelacionados,
  extrairTooltipRelacionado,
} from '../../features/procedimento-visualizar/ajustarElementosNativos'
import { montarTituloJanela } from '../../features/procedimento-visualizar/alterarTitulo'
import {
  montarCorpoSalvarAnotacao,
  parseAnotacaoDados,
  type AnotacaoDados,
} from '../../features/procedimento-visualizar/anotacao'
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore } from '../../lib/storage'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
import { limparTokenPlanka } from '../shared/plankaToken'
```

to:

```ts
import {
  classificarDivRelacionados,
  extrairTooltipRelacionado,
} from '../../features/procedimento-visualizar/ajustarElementosNativos'
import { montarTituloJanela } from '../../features/procedimento-visualizar/alterarTitulo'
import {
  montarCorpoSalvarAnotacao,
  parseAnotacaoDados,
  type AnotacaoDados,
} from '../../features/procedimento-visualizar/anotacao'
import {
  extrairUrlEdicaoProcesso,
  extrairTipoProcesso,
  extrairInteressados,
  obterUnidadeAtual,
  extrairAtribuicao,
  type InteressadoExtraido,
  type DadosAtribuicao,
} from '../../features/procedimento-visualizar/painelLateral'
import { fetchText } from '../../lib/fetchViaBackground'
import { createLocalConfigStore } from '../../lib/storage'
import { tokenValido } from '../../features/planka/token'
import { montarEstiloPlanka, montarConteudoCardPlanka, type RespostaConsultaPlanka } from '../shared/plankaCard'
import { limparTokenPlanka } from '../shared/plankaToken'
import copyIconSvg from 'lucide-static/icons/copy.svg?raw'
```

- [ ] **Step 4: Replace the standalone Planka panel with the merged Tipo do processo panel**

Remove the existing `renderizarCardPlanka`/`consultarEExibirPlanka`/`montarPainelPlanka` block:

```ts
function renderizarCardPlanka(dados: RespostaConsultaPlanka): void {
  montarEstiloPlanka()

  const conteudo = montarConteudoCardPlanka(dados)
  if (!conteudo) return
  conteudo.id = 'seirmg-planka'

  const container = document.getElementById('container') ?? document.body
  container.appendChild(conteudo)
}

async function consultarEExibirPlanka(): Promise<void> {
  const numero = obterNumeroProcesso()
  if (!numero) return

  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const planka = localConfig.planka

  if (!tokenValido(planka?.tokenExp, new Date().toISOString())) return
  if (!planka?.urlConsulta || !planka.token) return

  const resposta = await fetch(planka.urlConsulta, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${planka.token}`,
    },
    body: JSON.stringify({ processo: numero }),
  })

  if (resposta.status === 401) {
    await limparTokenPlanka()
    return
  }
  if (resposta.status === 404) return
  if (!resposta.ok) {
    console.error('[SEIRMG] Consulta ao Planka falhou:', resposta.status)
    return
  }

  const dados = (await resposta.json()) as RespostaConsultaPlanka
  renderizarCardPlanka(dados)
}

function montarPainelPlanka(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      consultarEExibirPlanka().catch((error) => {
        console.error('[SEIRMG] Falha ao consultar dados do Planka:', error)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel do Planka:', error)
  }
}
```

Replace it with the new merged panel builder (renders "Tipo do processo" immediately with the native tipo, then fills in the Planka pill/citation asynchronously if available; renders "Interessado(s)" right after):

```ts
async function consultarDadosPlanka(numero: string): Promise<RespostaConsultaPlanka | null> {
  const localStore = createLocalConfigStore()
  const localConfig = await localStore.get()
  const planka = localConfig.planka

  if (!tokenValido(planka?.tokenExp, new Date().toISOString())) return null
  if (!planka?.urlConsulta || !planka.token) return null

  const resposta = await fetch(planka.urlConsulta, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${planka.token}`,
    },
    body: JSON.stringify({ processo: numero }),
  })

  if (resposta.status === 401) {
    await limparTokenPlanka()
    return null
  }
  if (resposta.status === 404) return null
  if (!resposta.ok) {
    console.error('[SEIRMG] Consulta ao Planka falhou:', resposta.status)
    return null
  }

  return (await resposta.json()) as RespostaConsultaPlanka
}

function criarSeparador(titulo: string): HTMLDivElement {
  const separador = document.createElement('div')
  separador.className = 'seirmg-separador'
  const span = document.createElement('span')
  span.textContent = titulo
  separador.appendChild(span)
  return separador
}

function criarIconeCopiar(sigla: string, ancora: HTMLElement): HTMLSpanElement {
  const icone = document.createElement('span')
  icone.innerHTML = copyIconSvg
  icone.title = 'Copiar sigla do interessado'
  icone.className = 'seirmg-copiar-sigla'
  icone.addEventListener('click', (evento) => {
    evento.stopPropagation()
    navigator.clipboard.writeText(sigla).then(() => {
      const tooltip = document.createElement('div')
      tooltip.className = 'seirmg-tooltip-copiado'
      tooltip.textContent = 'Copiado!'
      ancora.appendChild(tooltip)
      setTimeout(() => tooltip.remove(), 1000)
    })
  })
  return icone
}

function renderizarInteressados(container: HTMLElement, interessados: InteressadoExtraido[]): void {
  container.appendChild(criarSeparador('Interessado(s)'))
  const div = document.createElement('div')
  div.id = 'seirmg-interessados'

  if (interessados.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-interessado'
    p.textContent = 'Nenhum interessado especificado.'
    div.appendChild(p)
  } else {
    interessados.forEach((interessado) => {
      const p = document.createElement('p')
      p.className = 'seirmg-interessado'
      const spanNome = document.createElement('span')
      spanNome.textContent = interessado.nome
      p.appendChild(spanNome)
      if (interessado.sigla) {
        const spanSigla = document.createElement('span')
        spanSigla.textContent = ` (${interessado.sigla})`
        p.appendChild(spanSigla)
        p.appendChild(criarIconeCopiar(interessado.sigla, p))
      }
      div.appendChild(p)
    })
  }

  container.appendChild(div)
}

function renderizarAtribuicao(container: HTMLElement, dados: DadosAtribuicao): void {
  container.appendChild(criarSeparador(dados.sigiloso ? 'Credencial para' : 'Atribuído para'))
  const div = document.createElement('div')
  div.id = 'seirmg-atribuicao'

  if (dados.usuarios.length === 0) {
    const p = document.createElement('p')
    p.className = 'seirmg-atribuido-para seirmg-sem-atribuicao'
    p.textContent = '(processo sem atribuição)'
    div.appendChild(p)
  } else {
    dados.usuarios.forEach((usuario) => {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para'
      p.title = dados.sigiloso
        ? `Credencial para ${usuario.nome} (${usuario.login}).`
        : `Atribuído para ${usuario.nome} (${usuario.login}).`
      p.textContent = usuario.login
      div.appendChild(p)
    })
    if (dados.sigiloso && dados.mais) {
      const p = document.createElement('p')
      p.className = 'seirmg-atribuido-para seirmg-atribuido-para-mais'
      p.textContent = `+${dados.mais}`
      p.title = `Mais ${dados.mais} usuário(s) de outra(s) área(s).`
      div.appendChild(p)
    }
  }

  container.appendChild(div)
}

async function montarPainelTipoEInteressados(): Promise<void> {
  const numero = obterNumeroProcesso()
  const headHtml = document.head.innerHTML
  const url = extrairUrlEdicaoProcesso(headHtml)
  if (!url) return

  const resultado = await fetchText(new URL(url, window.location.href).href)
  if (!resultado.ok) {
    console.error('[SEIRMG] Falha ao buscar dados do processo:', resultado.error)
    return
  }
  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')

  const container = document.getElementById('container') ?? document.body

  container.appendChild(criarSeparador('Tipo do processo'))
  const divTipo = document.createElement('div')
  divTipo.id = 'seirmg-tipo-processo'
  const pTipo = document.createElement('p')
  pTipo.className = 'seirmg-tipo-processo'
  pTipo.textContent = extrairTipoProcesso(doc)
  divTipo.appendChild(pTipo)
  container.appendChild(divTipo)

  renderizarInteressados(container, extrairInteressados(doc))

  if (numero) {
    consultarDadosPlanka(numero)
      .then((dadosPlanka) => {
        if (!dadosPlanka) return
        montarEstiloPlanka()
        const conteudoPlanka = montarConteudoCardPlanka(dadosPlanka, { mostrarPillTipo: false })
        if (conteudoPlanka) divTipo.appendChild(conteudoPlanka)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao consultar dados do Planka:', error)
      })
  }
}

async function montarPainelAtribuicao(): Promise<void> {
  const localConfig = await createLocalConfigStore().get()
  const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
  if (!unidadeAtual) return

  const scriptTag = Array.from(document.querySelectorAll('script')).find((elemento) =>
    elemento.textContent?.includes('var objArvore')
  )
  if (!scriptTag) return

  const dados = extrairAtribuicao(scriptTag.innerHTML, unidadeAtual)
  if (!dados) return

  const container = document.getElementById('container') ?? document.body
  renderizarAtribuicao(container, dados)
}

function montarPainelLateral(): void {
  try {
    esperarElemento('body.infraArvore', "a[target$='Visualizacao']", () => {
      montarPainelTipoEInteressados().catch((error) => {
        console.error('[SEIRMG] Falha ao montar painel de tipo/interessados:', error)
      })
      montarPainelAtribuicao().catch((error) => {
        console.error('[SEIRMG] Falha ao montar painel de atribuição:', error)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar painel lateral:', error)
  }
}
```

- [ ] **Step 5: Update `bootstrap()`**

Change:

```ts
function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelPlanka()
  montarPainelAnotacao()
}
```

to:

```ts
function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelLateral()
  montarPainelAnotacao()
}
```

- [ ] **Step 6: Add CSS for the new elements**

The file doesn't currently inject its own stylesheet beyond what `montarEstiloPlanka()` provides — check `src/content-scripts/core/theme.css` (the shared stylesheet already loaded on every SEI page via the manifest's `tema` content script group) and append these rules there, matching the visual style already used by `.seirmg-separador` (search the file for that class first to match its existing definition before adding siblings):

```css
p.seirmg-tipo-processo {
  margin: 0 0 0 1.2em;
  font-size: 12px;
}

#seirmg-interessados,
#seirmg-atribuicao {
  margin-left: 1.2em;
}

p.seirmg-interessado,
p.seirmg-atribuido-para {
  margin: 3px 0 0 0;
  font-size: 12px;
}

p.seirmg-atribuido-para.seirmg-sem-atribuicao {
  color: red;
}

p.seirmg-atribuido-para.seirmg-atribuido-para-mais {
  font-size: 11px;
  color: #757575;
}

span.seirmg-copiar-sigla {
  display: inline-flex;
  cursor: pointer;
  margin-left: 4px;
  opacity: 0.6;
}

span.seirmg-copiar-sigla svg {
  width: 12px;
  height: 12px;
}

.seirmg-tooltip-copiado {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  color: #017fff;
}
```

- [ ] **Step 7: Typecheck, lint, run the full test suite, build**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: no errors, all tests pass (this task adds no new automated tests of its own — DOM wiring — the pure logic it calls was already tested in Tasks 1-2), build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/content-scripts/shared/plankaCard.ts src/content-scripts/procedimento_visualizar/index.ts src/content-scripts/core/theme.css
git commit -m "feat(procedimento-visualizar): add Tipo/Interessados/Atribuição side panels, fold Planka card into Tipo panel"
```

---

### Task 4: Storage field + Options UI for the drag-and-drop default document type

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DocumentoExternoConfig.tipoDocumentoPadraoArrastar: string` — used by Task 7.

- [ ] **Step 1: Add the field to `DocumentoExternoConfig`**

In `src/lib/storage.ts`, change:

```ts
export interface DocumentoExternoConfig {
  ativo: boolean
  formato: FormatoDocumento
  tipoConferencia: string
  nivelAcesso: NivelAcessoDocumento
  hipoteseLegal: string
}
```

to:

```ts
export interface DocumentoExternoConfig {
  ativo: boolean
  formato: FormatoDocumento
  tipoConferencia: string
  nivelAcesso: NivelAcessoDocumento
  hipoteseLegal: string
  tipoDocumentoPadraoArrastar: string
}
```

And in `DEFAULT_SYNC_CONFIG`, change:

```ts
  documentoExterno: {
    ativo: true,
    formato: 'N',
    tipoConferencia: '',
    nivelAcesso: 'P',
    hipoteseLegal: '',
  },
```

to:

```ts
  documentoExterno: {
    ativo: true,
    formato: 'N',
    tipoConferencia: '',
    nivelAcesso: 'P',
    hipoteseLegal: '',
    tipoDocumentoPadraoArrastar: 'Anexo',
  },
```

- [ ] **Step 2: Run typecheck to find any other place that constructs a full `documentoExterno` object**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit`
Expected: at least one error in `src/options/main.ts`'s `carregarAbaEditor` save handler (it builds the whole object from scratch — same gotcha already documented in project memory from Lote G2b-1: adding a required field breaks that handler until a passthrough/new input is added). Fixed in Step 3-4 below.

- [ ] **Step 3: Add the input field to the Options HTML**

In `src/options/index.html`, inside `<section id="painel-editor">`, right after the existing "Hipótese legal" field's `<br />` and before the `<button id="editor-salvar">`, insert a new subsection. The relevant region currently reads:

```html
      <label>
        Hipótese legal (quando restrito/sigiloso):
        <input type="text" id="editor-doc-externo-hipotese-legal" />
      </label>
      <br />
      <button id="editor-salvar">Salvar</button>
```

Change it to:

```html
      <label>
        Hipótese legal (quando restrito/sigiloso):
        <input type="text" id="editor-doc-externo-hipotese-legal" />
      </label>
      <br />
      <h3>Arrastar e Soltar</h3>
      <label>
        Tipo de documento padrão ao criar por arraste:
        <input type="text" id="editor-doc-externo-tipo-padrao-arrastar" placeholder="Anexo" />
      </label>
      <br />
      <button id="editor-salvar">Salvar</button>
```

- [ ] **Step 4: Read/write the new field in `carregarAbaEditor`**

In `src/options/main.ts`, inside `carregarAbaEditor` (around line 275), add the element lookup right after `inputHipoteseLegal`:

```ts
    const inputHipoteseLegal = document.getElementById(
      'editor-doc-externo-hipotese-legal'
    ) as HTMLInputElement | null
    const status = document.getElementById('editor-status')
```

becomes:

```ts
    const inputHipoteseLegal = document.getElementById(
      'editor-doc-externo-hipotese-legal'
    ) as HTMLInputElement | null
    const inputTipoPadraoArrastar = document.getElementById(
      'editor-doc-externo-tipo-padrao-arrastar'
    ) as HTMLInputElement | null
    const status = document.getElementById('editor-status')
```

Add the value assignment right after `inputHipoteseLegal`'s:

```ts
    if (inputHipoteseLegal) inputHipoteseLegal.value = config.documentoExterno.hipoteseLegal
```

becomes:

```ts
    if (inputHipoteseLegal) inputHipoteseLegal.value = config.documentoExterno.hipoteseLegal
    if (inputTipoPadraoArrastar) {
      inputTipoPadraoArrastar.value = config.documentoExterno.tipoDocumentoPadraoArrastar
    }
```

Change the save handler from:

```ts
        const atualizado = {
          ...config,
          documentoExterno: {
            ativo: inputAtivo?.checked ?? true,
            formato: (selectFormato?.value ?? 'N') as FormatoDocumento,
            tipoConferencia: inputTipoConferencia?.value ?? '',
            nivelAcesso: (selectNivelAcesso?.value ?? 'P') as NivelAcessoDocumento,
            hipoteseLegal: inputHipoteseLegal?.value ?? '',
          },
        }
```

to:

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

- [ ] **Step 5: Typecheck and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/options/index.html src/options/main.ts
git commit -m "feat(options): add default document type field for drag-and-drop upload"
```

---

### Task 5: Dropzone — pure parsing functions (URLs, upload response, success check)

**Files:**
- Create: `src/features/procedimento-visualizar/dropzone.ts`
- Test: `src/features/procedimento-visualizar/dropzone.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `extrairUrlIncluirDocumento(scriptsHtml: string): string | null` — used by Task 7.
  - `extrairUrlDocumentoExterno(respostaHtml: string): string | null` — used by Task 7.
  - `extrairUrlUpload(respostaHtml: string): string | null` — used by Task 7.
  - `type UsuarioEUnidade = { usuario: string; unidade: string }` — used by Task 7.
  - `extrairUsuarioEUnidade(respostaHtml: string): UsuarioEUnidade | null` — used by Task 7.
  - `formatarTamanhoBytes(numBytes: number): string` — used by this task's own `montarHdnAnexos` (Step 3) and Task 7.
  - `montarHdnAnexos(usuarioEUnidade: UsuarioEUnidade, uploadIdentificador: string): string` — used by Task 7.
  - `respostaIndicaSucesso(respostaHtml: string): boolean` — used by Task 7.
  - `obterNomeDocumento(nomeArquivo: string): string` — used by Task 6/7.

- [ ] **Step 1: Write the failing tests**

Create `src/features/procedimento-visualizar/dropzone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  extrairUrlIncluirDocumento,
  extrairUrlDocumentoExterno,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  formatarTamanhoBytes,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
} from './dropzone'

describe('extrairUrlIncluirDocumento', () => {
  it('extrai a url do link de incluir documento', () => {
    const html = `Nos[0].acoes = '<a href="controlador.php?acao=documento_escolher_tipo&id_procedimento=1" tabindex="451" class="ancoraOpcao"> Incluir Documento</a>';`
    expect(extrairUrlIncluirDocumento(html)).toBe(
      'controlador.php?acao=documento_escolher_tipo&id_procedimento=1'
    )
  })

  it('retorna null quando o padrão não é encontrado', () => {
    expect(extrairUrlIncluirDocumento('sem nada aqui')).toBeNull()
  })
})

describe('extrairUrlDocumentoExterno', () => {
  it('extrai a url do link "Externo"', () => {
    const html = `<a href="controlador.php?acao=documento_gerar&id_tipo=2" tabindex="1003" class="ancoraOpcao"> Externo</a>`
    expect(extrairUrlDocumentoExterno(html)).toBe('controlador.php?acao=documento_gerar&id_tipo=2')
  })

  it('retorna null quando não há link Externo', () => {
    expect(extrairUrlDocumentoExterno('<a href="x" tabindex="1003" class="ancoraOpcao"> Interno</a>')).toBeNull()
  })
})

describe('extrairUrlUpload', () => {
  it('extrai a url do objUpload', () => {
    const html = `  objUpload = new infraUpload('frmAnexos','controlador.php?acao=upload&id=1');`
    expect(extrairUrlUpload(html)).toBe('controlador.php?acao=upload&id=1')
  })

  it('retorna null quando não há objUpload', () => {
    expect(extrairUrlUpload('nada aqui')).toBeNull()
  })
})

describe('extrairUsuarioEUnidade', () => {
  it('extrai usuário e unidade da chamada objTabelaAnexos.adicionar', () => {
    const html = `objTabelaAnexos.adicionar([arr['nome_upload'],arr['nome'],arr['data_hora'],arr['tamanho'],infraFormatarTamanhoBytes(arr['tamanho']),'joao.silva' ,'GAB']);`
    expect(extrairUsuarioEUnidade(html)).toEqual({ usuario: 'joao.silva', unidade: 'GAB' })
  })

  it('retorna null quando o padrão não bate', () => {
    expect(extrairUsuarioEUnidade('nada aqui')).toBeNull()
  })
})

describe('formatarTamanhoBytes', () => {
  it('formata em Kb para valores pequenos', () => {
    expect(formatarTamanhoBytes(2048)).toBe('2 Kb')
  })

  it('formata em Mb acima de 1048576 bytes', () => {
    expect(formatarTamanhoBytes(2097152)).toBe('2 Mb')
  })

  it('formata em Gb acima de 1073741824 bytes', () => {
    expect(formatarTamanhoBytes(2147483648)).toBe('2 Gb')
  })
})

describe('montarHdnAnexos', () => {
  it('monta a string composta a partir do identificador de upload', () => {
    const resultado = montarHdnAnexos(
      { usuario: 'joao.silva', unidade: 'GAB' },
      '123#arquivo.pdf#ignorado#2048#2026-07-10 10:00:00'
    )
    expect(resultado).toBe('123±arquivo.pdf±2026-07-10 10:00:00±2048±2 Kb±joao.silva±GAB')
  })
})

describe('respostaIndicaSucesso', () => {
  it('true quando a resposta contém a div da árvore', () => {
    expect(respostaIndicaSucesso('<div id="divArvoreHtml"></div>')).toBe(true)
  })

  it('false quando a resposta não contém a div da árvore', () => {
    expect(respostaIndicaSucesso('<div id="erro"></div>')).toBe(false)
  })
})

describe('obterNomeDocumento', () => {
  it('remove a extensão do nome do arquivo', () => {
    expect(obterNomeDocumento('relatorio.pdf')).toBe('relatorio')
  })

  it('trunca em 49 caracteres', () => {
    const nomeLongo = 'a'.repeat(60) + '.pdf'
    expect(obterNomeDocumento(nomeLongo)).toBe('a'.repeat(49))
  })

  it('mantém o nome quando não há extensão', () => {
    expect(obterNomeDocumento('semextensao')).toBe('semextensao')
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `bunx vitest run src/features/procedimento-visualizar/dropzone.test.ts`
Expected: FAIL — `Cannot find module './dropzone'`.

- [ ] **Step 3: Implement `src/features/procedimento-visualizar/dropzone.ts`**

```ts
export function extrairUrlIncluirDocumento(scriptsHtml: string): string | null {
  const regex = /^Nos\[0\]\.acoes = '<a href="(.*?)" tabindex="451"/m
  const resultado = regex.exec(scriptsHtml)
  return resultado ? resultado[1] : null
}

export function extrairUrlDocumentoExterno(respostaHtml: string): string | null {
  const regex = /<a\s+(?:[^>]*?\s+)?href="(.*?)" tabindex="1003" class="ancoraOpcao"> Externo<\/a>/m
  const resultado = regex.exec(respostaHtml)
  return resultado ? resultado[1] : null
}

export function extrairUrlUpload(respostaHtml: string): string | null {
  const regex = /^\s*objUpload = new infraUpload\('frmAnexos','(.+?)'\);/m
  const resultado = regex.exec(respostaHtml)
  return resultado ? resultado[1] : null
}

export interface UsuarioEUnidade {
  usuario: string
  unidade: string
}

export function extrairUsuarioEUnidade(respostaHtml: string): UsuarioEUnidade | null {
  const regex =
    /objTabelaAnexos\.adicionar\(\[arr\['nome_upload'\],arr\['nome'\],arr\['data_hora'\],arr\['tamanho'\],infraFormatarTamanhoBytes\(arr\['tamanho'\]\),'(.+?)' ,'(.+?)'\]\);/m
  const resultado = regex.exec(respostaHtml)
  if (!resultado) return null
  return { usuario: resultado[1], unidade: resultado[2] }
}

export function formatarTamanhoBytes(numBytes: number): string {
  if (numBytes > 1099511627776) return `${Math.round((numBytes / 1099511627776) * 100) / 100} Tb`
  if (numBytes > 1073741824) return `${Math.round((numBytes / 1073741824) * 100) / 100} Gb`
  if (numBytes > 1048576) return `${Math.round((numBytes / 1048576) * 100) / 100} Mb`
  return `${Math.round((numBytes / 1024) * 100) / 100} Kb`
}

export function montarHdnAnexos(usuarioEUnidade: UsuarioEUnidade, uploadIdentificador: string): string {
  const partes = uploadIdentificador.split('#')
  const id = partes[0] ?? ''
  const nome = partes[1] ?? ''
  const dthora = partes[4] ?? ''
  const tamanho = partes[3] ?? '0'
  const tamanhoFormatado = formatarTamanhoBytes(Number.parseInt(tamanho, 10))
  return `${id}±${nome}±${dthora}±${tamanho}±${tamanhoFormatado}±${usuarioEUnidade.usuario}±${usuarioEUnidade.unidade}`
}

export function respostaIndicaSucesso(respostaHtml: string): boolean {
  return /<div id="divArvoreHtml"><\/div>/m.test(respostaHtml)
}

export function obterNomeDocumento(nomeArquivo: string): string {
  return nomeArquivo.replace(/\.[^/.]+$/, '').slice(0, 49)
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `bunx vitest run src/features/procedimento-visualizar/dropzone.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/dropzone.ts src/features/procedimento-visualizar/dropzone.test.ts
git commit -m "feat(procedimento-visualizar): add pure dropzone parsing helpers (urls, upload response, sucesso)"
```

---

### Task 6: Dropzone — form-body pure functions

**Files:**
- Modify: `src/features/procedimento-visualizar/dropzone.ts` (append)
- Modify: `src/features/procedimento-visualizar/dropzone.test.ts` (append)

**Interfaces:**
- Consumes: `type DocumentoExternoConfig` from `../../lib/storage` (already exists).
- Produces:
  - `type CamposOcultosDocumento` — used by Task 7.
  - `extrairCamposFormularioDocumento(doc: Document): CamposOcultosDocumento | null` — used by Task 7.
  - `escolherOpcaoTipoDocumento(opcoes: Array<{ texto: string; valor: string }>, tipoPadrao: string): string` — used by Task 7.
  - `montarCorpoDocumentoExterno(campos: CamposOcultosDocumento, selSerie: string, config: DocumentoExternoConfig, nomeDocumento: string, hdnAnexos: string, dataHojeStr: string): string` — used by Task 7.

- [ ] **Step 1: Write the failing tests**

Add the import (change the top of `dropzone.test.ts` to include the new names) and append these `describe` blocks to `src/features/procedimento-visualizar/dropzone.test.ts`:

```ts
import type { DocumentoExternoConfig } from '../../lib/storage'
import {
  extrairUrlIncluirDocumento,
  extrairUrlDocumentoExterno,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  formatarTamanhoBytes,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
  extrairCamposFormularioDocumento,
  escolherOpcaoTipoDocumento,
  montarCorpoDocumentoExterno,
} from './dropzone'

function montarDocumento(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const CONFIG_BASE: DocumentoExternoConfig = {
  ativo: true,
  formato: 'N',
  tipoConferencia: '',
  nivelAcesso: 'P',
  hipoteseLegal: '',
  tipoDocumentoPadraoArrastar: 'Anexo',
}

describe('extrairCamposFormularioDocumento', () => {
  it('extrai todos os campos ocultos e a lista de opções de série', () => {
    const doc = montarDocumento(`
      <form id="frmDocumentoCadastro" action="controlador.php?acao=documento_gravar"></form>
      <input id="hdnInfraTipoPagina" value="D" />
      <input id="hdnStaDocumento" value="E" />
      <input id="hdnIdUnidadeGeradoraProtocolo" value="10" />
      <input id="hdnIdProcedimento" value="20" />
      <input id="hdnIdTipoProcedimento" value="30" />
      <input id="hdnSinBloqueado" value="N" />
      <select id="selSerie">
        <option value="">Selecione</option>
        <option value="5">Anexo</option>
        <option value="6">Ofício</option>
      </select>
      <input id="optPublico" type="radio" name="rdoNivelAcesso" value="0" />
      <input id="optRestrito" type="radio" name="rdoNivelAcesso" value="1" />
      <input id="optSigiloso" type="radio" name="rdoNivelAcesso" value="2" />
    `)
    expect(extrairCamposFormularioDocumento(doc)).toEqual({
      hdnInfraTipoPagina: 'D',
      selSerieOpcoes: [
        { texto: 'Selecione', valor: '' },
        { texto: 'Anexo', valor: '5' },
        { texto: 'Ofício', valor: '6' },
      ],
      hdnStaDocumento: 'E',
      hdnIdUnidadeGeradoraProtocolo: '10',
      hdnIdProcedimento: '20',
      hdnIdTipoProcedimento: '30',
      hdnSinBloqueado: 'N',
      urlEnvio: 'controlador.php?acao=documento_gravar',
      valorNivelAcessoPublico: '0',
      valorNivelAcessoRestrito: '1',
      valorNivelAcessoSigiloso: '2',
    })
  })

  it('retorna null quando o formulário de cadastro não existe', () => {
    expect(extrairCamposFormularioDocumento(montarDocumento('<div></div>'))).toBeNull()
  })

  it('usa 0/1/2 como fallback quando os radios de nível de acesso não existem', () => {
    const doc = montarDocumento(`<form id="frmDocumentoCadastro" action="x"></form>`)
    const campos = extrairCamposFormularioDocumento(doc)
    expect(campos?.valorNivelAcessoPublico).toBe('0')
    expect(campos?.valorNivelAcessoRestrito).toBe('1')
    expect(campos?.valorNivelAcessoSigiloso).toBe('2')
  })
})

describe('escolherOpcaoTipoDocumento', () => {
  const opcoes = [
    { texto: 'Selecione', valor: '' },
    { texto: 'Anexo', valor: '5' },
    { texto: 'Ofício', valor: '6' },
  ]

  it('escolhe a opção cujo texto bate com o tipo padrão configurado', () => {
    expect(escolherOpcaoTipoDocumento(opcoes, 'Ofício')).toBe('6')
  })

  it('cai para a segunda opção (índice 1) quando o tipo padrão não é encontrado', () => {
    expect(escolherOpcaoTipoDocumento(opcoes, 'Inexistente')).toBe('5')
  })

  it('retorna string vazia quando não há opções suficientes', () => {
    expect(escolherOpcaoTipoDocumento([{ texto: 'Selecione', valor: '' }], 'Anexo')).toBe('')
  })
})

describe('montarCorpoDocumentoExterno', () => {
  const campos = {
    hdnInfraTipoPagina: 'D',
    selSerieOpcoes: [],
    hdnStaDocumento: 'E',
    hdnIdUnidadeGeradoraProtocolo: '10',
    hdnIdProcedimento: '20',
    hdnIdTipoProcedimento: '30',
    hdnSinBloqueado: 'N',
    urlEnvio: 'controlador.php?acao=documento_gravar',
    valorNivelAcessoPublico: '0',
    valorNivelAcessoRestrito: '1',
    valorNivelAcessoSigiloso: '2',
  }

  it('monta o corpo com nível de acesso público (padrão)', () => {
    const corpo = montarCorpoDocumentoExterno(campos, '5', CONFIG_BASE, 'relatorio', 'hdn-anexos-valor', '10/07/2026')
    expect(corpo).toContain('rdoNivelAcesso=0')
    expect(corpo).toContain('txtNumero=relatorio')
    expect(corpo).toContain('selSerie=5')
    expect(corpo).toContain('hdnIdProcedimento=20')
    expect(corpo).toContain('hdnAnexos=hdn-anexos-valor')
    expect(corpo).not.toContain('selHipoteseLegal')
  })

  it('inclui selHipoteseLegal quando o nível de acesso é restrito ou sigiloso', () => {
    const configRestrito: DocumentoExternoConfig = { ...CONFIG_BASE, nivelAcesso: 'R', hipoteseLegal: 'Art. 5' }
    const corpo = montarCorpoDocumentoExterno(campos, '5', configRestrito, 'relatorio', 'hdn', '10/07/2026')
    expect(corpo).toContain('rdoNivelAcesso=1')
    expect(corpo).toContain('selHipoteseLegal=Art.%205')
  })

  it('escapa acentos no nome do documento (padrão ISO-8859-1)', () => {
    const corpo = montarCorpoDocumentoExterno(campos, '5', CONFIG_BASE, 'relatório', 'hdn', '10/07/2026')
    expect(corpo).toContain('txtNumero=relat%F3rio')
  })
})
```

- [ ] **Step 2: Run tests and confirm the new ones fail**

Run: `bunx vitest run src/features/procedimento-visualizar/dropzone.test.ts`
Expected: FAIL — `extrairCamposFormularioDocumento`/`escolherOpcaoTipoDocumento`/`montarCorpoDocumentoExterno` not exported yet.

- [ ] **Step 3: Append the implementation**

Add this import at the top of `src/features/procedimento-visualizar/dropzone.ts`:

```ts
import { escapeComponentAnotacao } from './anotacao'
import type { DocumentoExternoConfig } from '../../lib/storage'
```

Append:

```ts
export interface CamposOcultosDocumento {
  hdnInfraTipoPagina: string
  selSerieOpcoes: Array<{ texto: string; valor: string }>
  hdnStaDocumento: string
  hdnIdUnidadeGeradoraProtocolo: string
  hdnIdProcedimento: string
  hdnIdTipoProcedimento: string
  hdnSinBloqueado: string
  urlEnvio: string
  valorNivelAcessoPublico: string
  valorNivelAcessoRestrito: string
  valorNivelAcessoSigiloso: string
}

export function extrairCamposFormularioDocumento(doc: Document): CamposOcultosDocumento | null {
  const urlEnvio = doc.querySelector('form#frmDocumentoCadastro')?.getAttribute('action')
  if (!urlEnvio) return null

  const selSerie = doc.querySelector<HTMLSelectElement>('#selSerie')
  const selSerieOpcoes = selSerie
    ? Array.from(selSerie.options).map((opcao) => ({ texto: opcao.textContent?.trim() ?? '', valor: opcao.value }))
    : []

  const valor = (id: string): string => doc.getElementById(id)?.getAttribute('value') ?? ''

  return {
    hdnInfraTipoPagina: valor('hdnInfraTipoPagina'),
    selSerieOpcoes,
    hdnStaDocumento: valor('hdnStaDocumento'),
    hdnIdUnidadeGeradoraProtocolo: valor('hdnIdUnidadeGeradoraProtocolo'),
    hdnIdProcedimento: valor('hdnIdProcedimento'),
    hdnIdTipoProcedimento: valor('hdnIdTipoProcedimento'),
    hdnSinBloqueado: valor('hdnSinBloqueado'),
    urlEnvio,
    valorNivelAcessoPublico: doc.getElementById('optPublico')?.getAttribute('value') ?? '0',
    valorNivelAcessoRestrito: doc.getElementById('optRestrito')?.getAttribute('value') ?? '1',
    valorNivelAcessoSigiloso: doc.getElementById('optSigiloso')?.getAttribute('value') ?? '2',
  }
}

export function escolherOpcaoTipoDocumento(
  opcoes: Array<{ texto: string; valor: string }>,
  tipoPadrao: string
): string {
  const encontrada = opcoes.find((opcao) => opcao.texto === tipoPadrao)
  if (encontrada) return encontrada.valor
  return opcoes[1]?.valor ?? ''
}

export function montarCorpoDocumentoExterno(
  campos: CamposOcultosDocumento,
  selSerie: string,
  config: DocumentoExternoConfig,
  nomeDocumento: string,
  hdnAnexos: string,
  dataHojeStr: string
): string {
  const valorNivelAcesso =
    config.nivelAcesso === 'R'
      ? campos.valorNivelAcessoRestrito
      : config.nivelAcesso === 'S'
        ? campos.valorNivelAcessoSigiloso
        : campos.valorNivelAcessoPublico

  const postFields: Record<string, string> = {
    hdnInfraTipoPagina: campos.hdnInfraTipoPagina,
    selSerie,
    txtDataElaboracao: dataHojeStr,
    txtProtocoloDocumentoTextoBase: '',
    rdoTextoInicial: 'N',
    hdnIdDocumentoTextoBase: '',
    txtNumero: nomeDocumento,
    rdoFormato: config.formato,
    selTipoConferencia: config.formato === 'D' ? config.tipoConferencia : 'null',
    txtDescricao: '',
    txtRemetente: '',
    hdnIdRemetente: '',
    txtInteressado: '',
    hdnIdInteressado: '',
    txtDestinatario: '',
    hdnIdDestinatario: '',
    txtAssunto: '',
    hdnIdAssunto: '',
    txaObservacoes: '',
    selGrauSigilo: 'null',
    rdoNivelAcesso: valorNivelAcesso,
    hdnFlagDocumentoCadastro: '2',
    hdnAssuntos: '',
    hdnInteressados: '',
    hdnDestinatarios: '',
    hdnIdSerie: selSerie,
    hdnIdUnidadeGeradoraProtocolo: campos.hdnIdUnidadeGeradoraProtocolo,
    hdnStaDocumento: campos.hdnStaDocumento,
    hdnIdTipoConferencia: '',
    hdnIdDocumento: '',
    hdnIdProcedimento: campos.hdnIdProcedimento,
    hdnAnexos,
    hdnIdHipoteseLegalSugestao: '',
    hdnIdTipoProcedimento: campos.hdnIdTipoProcedimento,
    hdnUnidadesReabertura: '',
    hdnSinBloqueado: campos.hdnSinBloqueado,
    hdnContatoObject: '',
    hdnContatoIdentificador: '',
    hdnAssuntoIdentificador: '',
  }

  if (config.nivelAcesso === 'R' || config.nivelAcesso === 'S') {
    postFields.selHipoteseLegal = config.hipoteseLegal
  }

  return Object.entries(postFields)
    .map(([chave, valor]) => `${chave}=${escapeComponentAnotacao(valor)}`)
    .join('&')
}
```

**Note for the implementer:** `valorNivelAcessoPublico`/`Restrito`/`Sigiloso`'s fallback values (`'0'`/`'1'`/`'2'`) are a best-effort guess for what the native "Incluir Documento Externo" form's `rdoNivelAcesso` radio `value` attributes are — this project has never previously needed to read these raw values (the existing `documento-receber/autopreencher.ts` clicks the radios by id instead of submitting raw values). The primary path reads the REAL values from the live page HTML (`doc.getElementById('optPublico')?.getAttribute('value')`), so the fallback only matters if that page's structure changes — flag this as needing manual validation against a real SEI instance, same treatment as Lote F.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `bunx vitest run src/features/procedimento-visualizar/dropzone.test.ts`
Expected: PASS — 27 tests total (17 from Task 5 + 10 new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/features/procedimento-visualizar/dropzone.ts src/features/procedimento-visualizar/dropzone.test.ts
git commit -m "feat(procedimento-visualizar): add pure form-body builder for drag-and-drop documento externo"
```

---

### Task 7: Wire the drag-and-drop flow into `procedimento_visualizar`

**Files:**
- Modify: `src/content-scripts/procedimento_visualizar/index.ts`
- Modify: `src/content-scripts/core/theme.css`

**Interfaces:**
- Consumes: every function/type from Task 5 and Task 6 (`../../features/procedimento-visualizar/dropzone`), `obterNumeroProcesso` (already exists in this file).
- Produces: nothing consumed by later tasks — this is the end of Part 2.

- [ ] **Step 1: Add the imports**

Add to the import block at the top of `src/content-scripts/procedimento_visualizar/index.ts` (after the `painelLateral` import added in Task 3):

```ts
import {
  extrairUrlIncluirDocumento,
  extrairUrlDocumentoExterno,
  extrairUrlUpload,
  extrairUsuarioEUnidade,
  montarHdnAnexos,
  respostaIndicaSucesso,
  obterNomeDocumento,
  extrairCamposFormularioDocumento,
  escolherOpcaoTipoDocumento,
  montarCorpoDocumentoExterno,
} from '../../features/procedimento-visualizar/dropzone'
```

Also change the existing storage import (already present from before this plan, and extended again in Task 3) from:

```ts
import { createLocalConfigStore } from '../../lib/storage'
```

to:

```ts
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
```

(one combined import — this project's ESLint config flags duplicate imports from the same module, so don't add a second, separate `from '../../lib/storage'` line.)

- [ ] **Step 2: Add the overlay UI and drag event listeners**

Append this block before `function bootstrap()`:

```ts
function criarOverlayArraste(): HTMLDivElement {
  const overlay = document.createElement('div')
  overlay.id = 'seirmg-dropzone-overlay'
  overlay.textContent = 'Arraste aqui para criar documento externo...'
  document.body.appendChild(overlay)
  return overlay
}

function contemArquivos(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && !!dataTransfer.types && dataTransfer.types.includes('Files')
}

function montarDropzone(): void {
  try {
    const overlay = criarOverlayArraste()

    window.addEventListener('dragover', (evento) => {
      evento.preventDefault()
    })

    window.addEventListener('dragenter', (evento) => {
      evento.preventDefault()
      if (!contemArquivos(evento.dataTransfer)) return
      overlay.style.display = 'flex'
    })

    window.addEventListener('dragleave', (evento) => {
      evento.preventDefault()
      if (evento.relatedTarget === null) overlay.style.display = 'none'
    })

    window.addEventListener('drop', (evento) => {
      evento.preventDefault()
      overlay.style.display = 'none'
      if (!contemArquivos(evento.dataTransfer)) return
      const arquivos = Array.from(evento.dataTransfer?.files ?? [])
      if (arquivos.length === 0) return

      overlay.textContent = 'Criando documento(s)...'
      overlay.style.display = 'flex'

      Promise.allSettled(arquivos.map((arquivo) => criarDocumentoExternoPorArraste(arquivo))).then((resultados) => {
        overlay.style.display = 'none'
        const falhas = arquivos.filter((_, indice) => resultados[indice]?.status === 'rejected')
        if (falhas.length > 0) {
          alert(
            `Ocorreu um erro ao incluir documento externo com o(s) seguinte(s) anexo(s): ${falhas
              .map((arquivo) => arquivo.name)
              .join(', ')}. Verifique se o processo encontra-se aberto na unidade.`
          )
        }
        location.reload()
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar dropzone:', error)
  }
}
```

- [ ] **Step 3: Add the 4-step orchestration function**

Append, right before `montarDropzone`:

```ts
async function criarDocumentoExternoPorArraste(arquivo: File): Promise<void> {
  const scriptsHtml = Array.from(document.querySelectorAll('script'))
    .map((script) => script.innerHTML)
    .join('\n')
  const urlIncluir = extrairUrlIncluirDocumento(scriptsHtml)
  if (!urlIncluir) throw new Error('Não foi possível encontrar o botão de inserir documento.')

  const resposta1 = await fetchText(new URL(urlIncluir, window.location.href).href)
  if (!resposta1.ok) throw new Error(resposta1.error)

  const urlExterno = extrairUrlDocumentoExterno(resposta1.data)
  if (!urlExterno) throw new Error('Não foi localizado link para o documento tipo externo.')

  const resposta2 = await fetchText(new URL(urlExterno, window.location.href).href)
  if (!resposta2.ok) throw new Error(resposta2.error)

  const urlUpload = extrairUrlUpload(resposta2.data)
  if (!urlUpload) throw new Error('Não foi localizada a URL para enviar o arquivo.')

  const formData = new FormData()
  formData.append('filArquivo', arquivo, arquivo.name)
  const respostaUpload = await fetch(new URL(urlUpload, window.location.href).href, {
    method: 'POST',
    body: formData,
  })
  if (!respostaUpload.ok) throw new Error(`Falha no upload: HTTP ${respostaUpload.status}`)
  const uploadIdentificador = await respostaUpload.text()

  const usuarioEUnidade = extrairUsuarioEUnidade(resposta2.data)
  if (!usuarioEUnidade) throw new Error('Não foram localizados dados de usuário/unidade dentro da página.')
  const hdnAnexos = montarHdnAnexos(usuarioEUnidade, uploadIdentificador)

  const doc2 = new DOMParser().parseFromString(resposta2.data, 'text/html')
  const campos = extrairCamposFormularioDocumento(doc2)
  if (!campos) throw new Error('Não foi possível ler os campos do formulário de documento.')

  const config = await createSyncConfigStore().get()
  const selSerie = escolherOpcaoTipoDocumento(campos.selSerieOpcoes, config.documentoExterno.tipoDocumentoPadraoArrastar)
  const nomeDocumento = obterNomeDocumento(arquivo.name)
  const dataHojeStr = formatarDataHojeDropzone()

  const corpo = montarCorpoDocumentoExterno(campos, selSerie, config.documentoExterno, nomeDocumento, hdnAnexos, dataHojeStr)

  const respostaFinal = await fetchText(new URL(campos.urlEnvio, window.location.href).href, {
    method: 'POST',
    body: new URLSearchParams(corpo),
  })
  if (!respostaFinal.ok) throw new Error(respostaFinal.error)
  if (!respostaIndicaSucesso(respostaFinal.data)) {
    throw new Error('A submissão do documento não retornou a página esperada.')
  }
}

function formatarDataHojeDropzone(): string {
  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${hoje.getFullYear()}`
}
```

- [ ] **Step 4: Wire into `bootstrap()`**

Change:

```ts
function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelLateral()
  montarPainelAnotacao()
}
```

to:

```ts
function bootstrap(): void {
  ajustarElementosNativos()
  alterarTitulo()
  montarPainelLateral()
  montarPainelAnotacao()
  montarDropzone()
}
```

- [ ] **Step 5: Add overlay CSS**

Append to `src/content-scripts/core/theme.css`:

```css
#seirmg-dropzone-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(242, 242, 242, 0.9);
  border: 3px dashed #424242;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #424242;
  pointer-events: none;
}
```

- [ ] **Step 6: Typecheck, lint, run the full test suite, build**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: no errors, all tests pass (this task adds no new automated tests — DOM/`fetch`/drag-event wiring — covered instead by Tasks 5-6's pure-function tests), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_visualizar/index.ts src/content-scripts/core/theme.css
git commit -m "feat(procedimento-visualizar): wire drag-and-drop documento externo creation"
```

---

### Task 8: Final verification

**Files:** none new — validation only.

- [ ] **Step 1: Full automated verification**

Run: `cd C:\sei\seirmg && bunx tsc --noEmit && bun run lint && bunx vitest run && bun run build`
Expected: all green — typecheck clean, lint clean, full test suite passes (including all new tests from Tasks 1, 2, 5, 6), production build succeeds.

- [ ] **Step 2: Manual test (outside the agent — document the steps here for the user)**

Not automatable in this environment — this feature relies on regex over SEI-generated HTML/inline scripts that could not be verified against a live instance in this session (same treatment as Lote F). Document for the user:

1. Load the extension (dev build) in Chrome via `chrome://extensions`.
2. Open any process in `procedimento_visualizar`. Confirm:
   - "Tipo do processo" panel shows the native tipo, and (if Planka is configured and the process has a card) the localização pill + comentário citation underneath it — no more separate "Planka" panel.
   - "Interessado(s)" panel shows the list with name/sigla, and the copy icon copies the sigla to the clipboard.
   - "Atribuído para" (or "Credencial para" if the process is confidential) panel shows the assigned user(s), or "(processo sem atribuição)" in red.
3. Drag a small test file (e.g. a `.txt`) over the page — confirm the "Arraste aqui..." overlay appears, then drop it. Confirm a new "documento externo" is created (using the configured tipo de documento default, formato, nível de acesso) and the page reloads showing it in the tree.
4. Test with a process that's confidential (sigiloso) if one is available — this is the part of Task 2 flagged as unverified; report back if the "Atribuído para"/"Credencial para" panel doesn't appear correctly or shows wrong data.
5. Test with a process closed in the user's unit (should not show an "Atribuído para" panel) and one open in multiple units.

- [ ] **Step 3: Commit (only if Step 2 surfaces a fix)**

Only necessary if manual testing reveals an adjustment. Otherwise this task produces no commit.

---

## Self-Review

**Spec coverage:** every section of `2026-07-10-seirmg-lote-g2-painel-lateral-dropzone-design.md` maps to a task — Tipo/Interessados (Task 1, 3), Atribuição (Task 2, 3), Planka merge into Tipo panel (Task 3), storage/Options for tipo de documento padrão (Task 4), dropzone parsing (Task 5, 6), dropzone wiring (Task 7), verification + manual test notes (Task 8). "Fora de escopo" items (endereço/CEP de interessados, caixa `ExibirDadosProcesso`, barra de progresso, mudanças no workflow Planka) have no task — correctly, since they're explicitly excluded.

**Placeholders:** none — every step has complete, pasteable code. The two "manual validation needed" notes (Task 2's sigiloso regex, Task 6's nível de acesso fallback values) are explicit, flagged uncertainties inherited from source material that cannot be resolved without a live SEI instance — not vague placeholders, and consistent with how this project already handled the same category of risk in Lote F.

**Type consistency:** `InteressadoExtraido`, `DadosAtribuicao`, `UsuarioAtribuicao` (Task 1-2) match their usage in Task 3's `renderizarInteressados`/`renderizarAtribuicao`. `UsuarioEUnidade`, `CamposOcultosDocumento` (Task 5-6) match their usage in Task 7's `criarDocumentoExternoPorArraste`. `montarConteudoCardPlanka`'s new second parameter (Task 3, Step 1) is optional and defaults to preserving today's behavior, confirmed not to break `procedimento_controlar`'s existing call site (built earlier today, outside this plan's scope).
