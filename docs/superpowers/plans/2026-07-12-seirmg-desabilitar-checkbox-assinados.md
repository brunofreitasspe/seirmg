# Desabilitar checkbox de documentos já assinados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No Bloco de Assinatura, desabilitar automaticamente o checkbox de documentos já assinados pelo usuário logado ou pela unidade atual, evitando tentativa de assinatura duplicada.

**Architecture:** Estende a função de correspondência já existente (`deveSelecionar`, Lote B) para considerar usuário OU unidade, case-insensitive. Uma nova função no content script já existente (`rel_bloco_protocolo_listar`) aplica `disabled`/`title`/classe CSS a cada checkbox cuja célula "Assinaturas" bate com a nova correspondência, reaproveitando o `MutationObserver` já existente (sem observer novo).

**Tech Stack:** TypeScript + Vite, Vitest (`environment: jsdom`), `chrome.storage.sync` via `src/lib/storage.ts`.

## Global Constraints

- `deveSelecionar` deve considerar usuário OU unidade, comparação case-insensitive e com espaços múltiplos colapsados antes do `includes` — não normaliza acentuação.
- Não força `checked = false` em nenhum checkbox — só `disabled = true`.
- Toggle em `SyncConfig.featureFlags.desabilitarDocumentosAssinados`, ativado por padrão (`true`).
- Qualquer leitura de `chrome.*`/DOM deve ser protegida por try/catch, logar via `console.error('[SEIRMG] ...', error)`, nunca travar a tela (fail-open) — política padrão do projeto.
- Rodar `bun run typecheck`, `bun run lint` e `bun run test` (via `vitest run`) depois de cada task que altera `.ts` — **cada task deve deixar o typecheck limpo**, não só o conjunto final.

---

## File Structure

- **Modify** `src/lib/storage.ts` — novo campo `FeatureFlags.desabilitarDocumentosAssinados: boolean`, default `true`.
- **Modify** `src/features/bloco-assinatura/selecaoDocumentos.ts` — `deveSelecionar` passa a receber `{ usuario, unidade }` em vez de só `usuario`; nova correspondência case-insensitive/espaços tolerantes.
- **Modify** `src/features/bloco-assinatura/selecaoDocumentos.test.ts` — atualiza os testes existentes pra nova assinatura, adiciona testes de unidade/case-insensitive/espaços.
- **Modify** `src/content-scripts/rel_bloco_protocolo_listar/index.ts` — extrai um helper compartilhado de iteração de linhas (`paraCadaLinhaDeDocumento`) e de obtenção de credenciais (`obterCredenciais`), atualiza `aplicarSelecao` pra nova assinatura de `deveSelecionar`, adiciona `aplicarDesabilitacaoAssinados()`, chamada no bootstrap e no `MutationObserver` já existente. **Modificado na mesma task que `selecaoDocumentos.ts`** (Task 2), porque é o único consumidor da assinatura alterada — separar quebraria o typecheck entre tasks.
- **Modify** `src/content-scripts/core/theme.css` — estilo `.seirmg-checkbox-ja-assinado`.
- **Modify** `src/options/index.html` — checkbox na aba "Geral".
- **Modify** `src/options/main.ts` — leitura/gravação do novo checkbox.

---

### Task 1: Config schema (feature flag)

**Files:**
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: `FeatureFlags.desabilitarDocumentosAssinados: boolean` (default `true`).

- [ ] **Step 1: Adicionar o campo na interface `FeatureFlags`**

Em `src/lib/storage.ts`, a interface `FeatureFlags` (topo do arquivo) passa a ser:

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
  desabilitarDocumentosAssinados: boolean
}
```

- [ ] **Step 2: Adicionar o valor padrão**

Em `DEFAULT_SYNC_CONFIG.featureFlags`, adicionar o novo campo:

```ts
  featureFlags: {
    blocoAssinaturaNotificacoes: true,
    selecaoEmMassaBlocoAssinatura: true,
    desabilitarDocumentosAssinados: true,
  },
```

- [ ] **Step 3: Rodar typecheck e os testes existentes**

Run: `bun run typecheck`
Expected: sem erros.

Run: `bun run test -- storage`
Expected: todos os testes de `src/lib/storage.test.ts` continuam passando (o teste de round-trip usa `toEqual(DEFAULT_SYNC_CONFIG)`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat(seirmg): adiciona feature flag desabilitarDocumentosAssinados"
```

---

### Task 2: Correspondência unificada (usuário OU unidade) + desabilitação no content script

**Files:**
- Modify: `src/features/bloco-assinatura/selecaoDocumentos.ts`
- Modify: `src/features/bloco-assinatura/selecaoDocumentos.test.ts`
- Modify: `src/content-scripts/rel_bloco_protocolo_listar/index.ts`

**Interfaces:**
- Consumes: `FeatureFlags.desabilitarDocumentosAssinados` (Task 1); `obterUnidadeAtual(seiVersionAtLeast4: boolean, doc: Document): string | null` (já existe em `src/features/procedimento-visualizar/painelLateral.ts`, não modificar).
- Produces: `interface UsuarioEUnidade { usuario: string; unidade: string }` (exportada de `selecaoDocumentos.ts`), `function deveSelecionar(tipo: TipoSelecaoDocumentos, textoAssinaturas: string, credenciais: UsuarioEUnidade): boolean` (assinatura alterada — antes recebia `usuario: string` como terceiro parâmetro).

Esta task muda a assinatura de uma função e atualiza, na mesma task, seu único consumidor (`rel_bloco_protocolo_listar/index.ts`) — as duas mudanças são inseparáveis sem deixar o build quebrado entre commits.

- [ ] **Step 1: Escrever/atualizar os testes de `deveSelecionar` (falhando)**

Substituir todo o bloco `describe('deveSelecionar', ...)` em `src/features/bloco-assinatura/selecaoDocumentos.test.ts` por:

```ts
describe('deveSelecionar', () => {
  it('"todos" sempre seleciona', () => {
    expect(deveSelecionar('todos', '', { usuario: 'joao', unidade: '' })).toBe(true)
    expect(deveSelecionar('todos', 'Assinado por João', { usuario: 'joao', unidade: '' })).toBe(true)
  })

  it('"nenhum" nunca seleciona', () => {
    expect(deveSelecionar('nenhum', '', { usuario: 'joao', unidade: '' })).toBe(false)
    expect(deveSelecionar('nenhum', 'Assinado por João', { usuario: 'joao', unidade: '' })).toBe(false)
  })

  it('"sem-assinatura" seleciona só documentos sem nenhuma assinatura', () => {
    expect(deveSelecionar('sem-assinatura', '', { usuario: 'João', unidade: '' })).toBe(true)
    expect(deveSelecionar('sem-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })).toBe(false)
  })

  it('"sem-minha-assinatura" seleciona documentos sem assinatura ou só com a de outro usuário', () => {
    expect(deveSelecionar('sem-minha-assinatura', '', { usuario: 'João', unidade: '' })).toBe(true)
    expect(
      deveSelecionar('sem-minha-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(true)
    expect(
      deveSelecionar('sem-minha-assinatura', 'Assinado por João', { usuario: 'João', unidade: '' })
    ).toBe(false)
  })

  it('"com-minha-assinatura" seleciona só documentos que incluem a assinatura do usuário', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por João e Maria', { usuario: 'João', unidade: '' })
    ).toBe(true)
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(false)
    expect(deveSelecionar('com-minha-assinatura', '', { usuario: 'João', unidade: '' })).toBe(false)
  })

  it('"com-minha-assinatura" também seleciona por correspondência de unidade', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria (HMMG-DIR ADM)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria (HMMG-DJUR)', {
        usuario: 'João',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(false)
  })

  it('correspondência é case-insensitive', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'ASSINADO POR JOÃO DA SILVA', {
        usuario: 'joão da silva',
        unidade: '',
      })
    ).toBe(true)
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria (hmmg-dir adm)', {
        usuario: 'joão',
        unidade: 'HMMG-DIR ADM',
      })
    ).toBe(true)
  })

  it('correspondência tolera espaços extras/quebras de linha na célula', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado   por\nJoão    da Silva', {
        usuario: 'João da Silva',
        unidade: '',
      })
    ).toBe(true)
  })

  it('ignora unidade vazia (não seleciona tudo por engano)', () => {
    expect(
      deveSelecionar('com-minha-assinatura', 'Assinado por Maria', { usuario: 'João', unidade: '' })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test -- selecaoDocumentos`
Expected: FAIL — os testes chamam `deveSelecionar` com um objeto `{ usuario, unidade }` no terceiro argumento, mas a implementação atual espera uma `string`.

- [ ] **Step 3: Implementar a nova assinatura e a correspondência unificada**

Substituir todo o conteúdo de `src/features/bloco-assinatura/selecaoDocumentos.ts` por:

```ts
export type TipoSelecaoDocumentos =
  | 'todos'
  | 'nenhum'
  | 'sem-assinatura'
  | 'sem-minha-assinatura'
  | 'com-minha-assinatura'

export interface UsuarioEUnidade {
  usuario: string
  unidade: string
}

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

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ')
}

function contemAssinaturaDoUsuario(textoAssinaturas: string, credenciais: UsuarioEUnidade): boolean {
  const assinaturas = normalizar(textoAssinaturas)
  if (assinaturas.length === 0) return false

  const usuario = normalizar(credenciais.usuario)
  const unidade = normalizar(credenciais.unidade)

  return (usuario !== '' && assinaturas.includes(usuario)) || (unidade !== '' && assinaturas.includes(unidade))
}

export function deveSelecionar(
  tipo: TipoSelecaoDocumentos,
  textoAssinaturas: string,
  credenciais: UsuarioEUnidade
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
      return !contemAssinaturaDoUsuario(textoAssinaturas, credenciais)
    case 'com-minha-assinatura':
      return contemAssinaturaDoUsuario(textoAssinaturas, credenciais)
  }
}
```

- [ ] **Step 4: Rodar os testes de `selecaoDocumentos` e confirmar que passam**

Run: `bun run test -- selecaoDocumentos`
Expected: PASS (9 testes).

- [ ] **Step 5: Atualizar o content script — nova assinatura de `deveSelecionar`, helpers compartilhados e desabilitação**

Substituir todo o conteúdo de `src/content-scripts/rel_bloco_protocolo_listar/index.ts` por:

```ts
import { parseBlocoAssinaturaTable } from '../../features/bloco-assinatura/parser'
import {
  deveSelecionar,
  encontrarIndiceColunaAssinaturas,
  extrairNomeUsuario,
  type TipoSelecaoDocumentos,
  type UsuarioEUnidade,
} from '../../features/bloco-assinatura/selecaoDocumentos'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import { renderBadge } from '../core/badge'

const ID_SELECAO_DOCUMENTOS = 'seirmg-selecao-documentos-assinar'
const CLASSE_CHECKBOX_JA_ASSINADO = 'seirmg-checkbox-ja-assinado'

async function processarPagina(): Promise<void> {
  try {
    const localConfig = await createLocalConfigStore().get()
    const itens = parseBlocoAssinaturaTable(document, {
      seiVersionAtLeast4: localConfig.seiVersionAtLeast4 ?? true,
    })

    chrome.runtime
      .sendMessage({ type: 'seirmg:bloco-assinatura:itens', itens })
      .catch((error) => {
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

function paraCadaLinhaDeDocumento(
  callback: (checkbox: HTMLInputElement, textoAssinaturas: string) => void
): void {
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
    callback(checkbox, textoAssinaturas)
  })
}

function aplicarSelecao(tipo: TipoSelecaoDocumentos, credenciais: UsuarioEUnidade): void {
  paraCadaLinhaDeDocumento((checkbox, textoAssinaturas) => {
    const selecionado = deveSelecionar(tipo, textoAssinaturas, credenciais)
    if (selecionado !== checkbox.checked) checkbox.click()
  })
}

async function obterCredenciais(): Promise<UsuarioEUnidade | null> {
  const tituloUsuario = document.querySelector('#lnkUsuarioSistema')?.getAttribute('title') ?? ''
  const usuario = extrairNomeUsuario(tituloUsuario)
  if (!usuario) return null

  const localConfig = await createLocalConfigStore().get()
  const unidade = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, document) ?? ''

  return { usuario, unidade }
}

async function montarSelecaoDocumentos(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.selecaoEmMassaBlocoAssinatura) return

    if (!estaNaTelaDoBloco()) return
    if (document.getElementById(ID_SELECAO_DOCUMENTOS)) return

    const credenciais = await obterCredenciais()
    if (!credenciais) {
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

      aplicarSelecao(tipo, credenciais)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar seleção em massa de documentos:', error)
  }
}

async function aplicarDesabilitacaoAssinados(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.featureFlags.desabilitarDocumentosAssinados) return

    if (!estaNaTelaDoBloco()) return

    const credenciais = await obterCredenciais()
    if (!credenciais) return

    paraCadaLinhaDeDocumento((checkbox, textoAssinaturas) => {
      if (deveSelecionar('com-minha-assinatura', textoAssinaturas, credenciais)) {
        checkbox.disabled = true
        checkbox.title = 'Documento já assinado por você'
        checkbox.classList.add(CLASSE_CHECKBOX_JA_ASSINADO)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao desabilitar checkboxes de documentos já assinados:', error)
  }
}

processarPagina()
montarSelecaoDocumentos()
aplicarDesabilitacaoAssinados()

const areaTabela = document.querySelector('#divInfraAreaTabela')
if (areaTabela) {
  const observer = new MutationObserver(() => {
    processarPagina()
    aplicarDesabilitacaoAssinados()
  })
  observer.observe(areaTabela, { childList: true, subtree: true })
}
```

Nota: este passo também extrai `obterCredenciais()` (usada tanto por `montarSelecaoDocumentos` quanto por `aplicarDesabilitacaoAssinados`) e o helper `paraCadaLinhaDeDocumento` (usado tanto por `aplicarSelecao` quanto por `aplicarDesabilitacaoAssinados`) — refatoração pequena e escopada, necessária pra não duplicar a lógica de iteração de linhas/obtenção de credenciais entre os dois recursos que agora compartilham a mesma base.

- [ ] **Step 6: Rodar typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 7: Rodar a suíte completa de testes**

Run: `bun run test`
Expected: PASS — todos os testes existentes continuam passando. O content script em si não tem teste unitário dedicado (wiring de DOM/observer, mesmo padrão já estabelecido no projeto — ver `rel_bloco_protocolo_listar` antes desta mudança e o Lote Q).

- [ ] **Step 8: Commit**

```bash
git add src/features/bloco-assinatura/selecaoDocumentos.ts src/features/bloco-assinatura/selecaoDocumentos.test.ts src/content-scripts/rel_bloco_protocolo_listar/index.ts
git commit -m "feat(seirmg): desabilita checkbox de documentos já assinados no bloco de assinatura"
```

---

### Task 3: Estilo do checkbox desabilitado

**Files:**
- Modify: `src/content-scripts/core/theme.css`

- [ ] **Step 1: Adicionar o estilo**

No final de `src/content-scripts/core/theme.css`, adicionar:

```css
/* ===== Checkbox de documento já assinado — rel_bloco_protocolo_listar ===== */

.seirmg-checkbox-ja-assinado {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/core/theme.css
git commit -m "style(seirmg): estiliza checkbox de documento já assinado"
```

---

### Task 4: Toggle na página de Opções

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

- [ ] **Step 1: Adicionar o checkbox no HTML**

Em `src/options/index.html`, dentro de `<section id="painel-geral">`, logo depois do `<label>` de "Ativar seleção em massa de documentos no bloco de assinatura" e antes do `<br />`/`<button id="geral-salvar">`, adicionar:

```html
      <label>
        <input type="checkbox" id="geral-desabilitar-assinados-ativo" />
        Desabilitar checkbox de documentos já assinados por mim no bloco de assinatura
      </label>
```

- [ ] **Step 2: Ler o valor ao carregar a aba**

Em `src/options/main.ts`, na função `carregarAbaGeral`, junto à declaração de `inputSelecaoMassa`, adicionar:

```ts
    const inputDesabilitarAssinados = document.getElementById(
      'geral-desabilitar-assinados-ativo'
    ) as HTMLInputElement | null
```

E junto ao `if (inputSelecaoMassa) { ... }`, adicionar:

```ts
    if (inputDesabilitarAssinados) {
      inputDesabilitarAssinados.checked = config.featureFlags.desabilitarDocumentosAssinados
    }
```

- [ ] **Step 3: Gravar o valor ao salvar**

Dentro do objeto `atualizado.featureFlags` (no handler de `geral-salvar`), logo depois de `selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,`, adicionar:

```ts
            desabilitarDocumentosAssinados: inputDesabilitarAssinados?.checked ?? true,
```

- [ ] **Step 4: Rodar typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte completa, lint e build**

Run: `bun run test && bun run lint && bun run build`
Expected: tudo passa sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(seirmg): adiciona toggle de desabilitar documentos assinados nas Opções"
```

---

### Task 5: Verificação final e nota no roadmap

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

- [ ] **Step 1: Rodar a suíte completa mais uma vez, do zero**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: tudo passa.

- [ ] **Step 2: Adicionar uma nota em "Já entregue" no roadmap**

Em `docs/ROADMAP-LOTES.md`, na seção "## Já entregue", adicionar uma nova linha (no final da lista):

```markdown
- **Melhoria do Lote B — Desabilitar checkbox de documentos já assinados no Bloco de Assinatura** — spec `docs/superpowers/specs/2026-07-12-seirmg-desabilitar-checkbox-assinados-design.md`, plano `docs/superpowers/plans/2026-07-12-seirmg-desabilitar-checkbox-assinados.md`. Estende `deveSelecionar` (Lote B) pra considerar também a unidade atual e ser case-insensitive/tolerante a espaços — usado tanto pela seleção em massa existente quanto pela nova desabilitação automática, evitando duas definições divergentes de "assinado por mim" na mesma tela.
```

- [ ] **Step 3: Commit final**

```bash
git add docs/ROADMAP-LOTES.md
git commit -m "docs(seirmg): registra melhoria de desabilitar documentos assinados no roadmap"
```

---

## Self-Review Notes

- **Cobertura da spec:** correspondência unificada (usuário OU unidade, case-insensitive, espaços tolerantes) → Task 2; config/toggle → Tasks 1 e 4; desabilitação de fato (disabled+title+classe), reaproveitando o `MutationObserver` existente sem observer novo → Task 2; estilo → Task 3; fail-open em toda leitura async/DOM → Task 2 (try/catch em `aplicarDesabilitacaoAssinados`); testes → Task 2; registro no roadmap → Task 5.
- **Placeholders:** nenhum — todo step tem código completo.
- **Consistência de tipos:** `UsuarioEUnidade { usuario, unidade }` definido na Task 2 é usado sem alteração em `aplicarSelecao`, `obterCredenciais` e `aplicarDesabilitacaoAssinados`, todos na mesma task — conferido, bate. `deveSelecionar`'s terceiro parâmetro mudou de `string` pra `UsuarioEUnidade` de forma consistente em todos os call sites (função, teste, content script), todos atualizados juntos na Task 2 pra manter o typecheck limpo em cada task.
- **Correção de escopo em relação à primeira versão deste plano:** a versão inicial separava a mudança de assinatura de `deveSelecionar` (então "Task 1") da atualização do seu único consumidor (então "Task 3"), o que deixaria `tsc --noEmit` quebrado entre as duas — inconsistente com a convenção já estabelecida no projeto de que cada task deixa o build limpo. Corrigido fundindo as duas na atual Task 2 antes de iniciar a implementação.
