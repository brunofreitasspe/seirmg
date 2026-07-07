# SEIRMG — Lote E3b: Rolagem Infinita em Controle de Processos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar a "rolagem infinita" do Sei Pro (remoção de paginação nativa via busca recursiva de páginas) para as tabelas Recebidos/Gerados de Controle de Processos, reaplicando prazos/cor/especificação/filtros/ordenação nas linhas carregadas, com seleção desabilitada nessas linhas por segurança.

**Architecture:** Ver `docs/superpowers/specs/2026-07-07-seirmg-lote-e3b-rolagem-infinita-design.md`. Lógica pura nova em `features/controle-processos/rolagemInfinita.ts` (testada); três funções já existentes em `content-scripts/procedimento_controlar/index.ts` (`aplicarPrazos`, `aplicarCorProcesso`, `aplicarEspecificacao`) e o código de ordenação do Lote E3 são refatorados (comportamento preservado) para separar "aplicar em um conjunto de linhas" de "aplicar na tabela inteira", permitindo reuso nas linhas recém-carregadas; os filtros já existentes (`montarBuscaRapida`/`montarFiltroAtribuicao`/`montarFiltroBloco`) passam a se registrar num array de callbacks reaproveitável.

**Tech Stack:** TypeScript, Vite, Bun, Vitest — mesma infraestrutura já existente. Sem dependência nova (reaproveita `lib/result.ts`'s `fetchText`, já usado em outros lotes).

## Global Constraints

- Nenhuma dependência nova.
- Escopo: só `#tblProcessosRecebidos` e `#tblProcessosGerados` — não `#tblProcessosDetalhado`.
- Config novo opt-in, padrão `ativo: false`.
- `extrairLinhasValidas` coleta as três classes de linha válida (`infraTrClara`, `infraTrEscura`, `trVermelha`) — corrige o bug do original, que só coletava `infraTrClara`.
- Linhas carregadas via rolagem infinita têm o checkbox de seleção desabilitado (mesma cautela do Sei Pro original, ver spec seção "Risco").
- Toda função de topo (chamada por listener/bootstrap) segue o padrão já estabelecido: guard `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança exceção não tratada.
- Refactors de `aplicarPrazos`/`aplicarCorProcesso`/`aplicarEspecificacao`/ordenação devem preservar exatamente o comportamento já existente (não são cobertos por teste automatizado — são wiring de DOM — então a garantia é comportamento idêntico by construction, verificado via typecheck/build).

---

## Mapa de arquivos (visão geral)

```
seirmg/
├── src/
│   ├── features/controle-processos/
│   │   └── rolagemInfinita.ts (+ .test.ts, novo)
│   ├── lib/
│   │   └── storage.ts (modificado)
│   ├── options/
│   │   ├── index.html (modificado)
│   │   └── main.ts (modificado)
│   └── content-scripts/procedimento_controlar/index.ts (modificado)
```

---

### Task 1: `features/controle-processos/rolagemInfinita.ts`

**Files:**
- Create: `C:\sei\seirmg\src\features\controle-processos\rolagemInfinita.ts`
- Test: `C:\sei\seirmg\src\features\controle-processos\rolagemInfinita.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces:
  - `extrairCamposOcultos(form: HTMLFormElement): Record<string, string>`
  - `extrairLinhasValidas(doc: Document, idTabela: string): Element[]`
  - `extrairNroItens(doc: Document, tipo: string): number | null`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/controle-processos/rolagemInfinita.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairCamposOcultos, extrairLinhasValidas, extrairNroItens } from './rolagemInfinita'

function criarFormComHidden(campos: Array<{ id: string; name: string; value: string }>): HTMLFormElement {
  const form = document.createElement('form')
  campos.forEach(({ id, name, value }) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.id = id
    input.name = name
    input.value = value
    form.appendChild(input)
  })
  return form
}

describe('extrairCamposOcultos', () => {
  it('coleta apenas hidden inputs cujo id contém "hdn"', () => {
    const form = criarFormComHidden([
      { id: 'hdnRecebidosPaginaAtual', name: 'hdnRecebidosPaginaAtual', value: '1' },
      { id: 'outroCampo', name: 'outroCampo', value: 'x' },
    ])
    expect(extrairCamposOcultos(form)).toEqual({ hdnRecebidosPaginaAtual: '1' })
  })

  it('ignora hidden inputs sem atributo name mesmo com "hdn" no id', () => {
    const form = document.createElement('form')
    const input = document.createElement('input')
    input.type = 'hidden'
    input.id = 'hdnRecebidosPaginaAtual'
    input.value = '1'
    form.appendChild(input)
    expect(extrairCamposOcultos(form)).toEqual({})
  })

  it('coleta múltiplos campos hdn com nomes e valores diferentes', () => {
    const form = criarFormComHidden([
      { id: 'hdnRecebidosPaginaAtual', name: 'hdnRecebidosPaginaAtual', value: '1' },
      { id: 'hdnRecebidosNroItens', name: 'hdnRecebidosNroItens', value: '20' },
      { id: 'hdnGeradosPaginaAtual', name: 'hdnGeradosPaginaAtual', value: '0' },
    ])
    expect(extrairCamposOcultos(form)).toEqual({
      hdnRecebidosPaginaAtual: '1',
      hdnRecebidosNroItens: '20',
      hdnGeradosPaginaAtual: '0',
    })
  })

  it('retorna objeto vazio quando não há nenhum campo hdn', () => {
    const form = criarFormComHidden([{ id: 'outroCampo', name: 'outroCampo', value: 'x' }])
    expect(extrairCamposOcultos(form)).toEqual({})
  })
})

function criarDocComTabela(idTabela: string, linhasHtml: string): Document {
  const doc = new DOMParser().parseFromString(
    `<table id="${idTabela.replace('#', '')}"><tbody>${linhasHtml}</tbody></table>`,
    'text/html'
  )
  return doc
}

describe('extrairLinhasValidas', () => {
  it('retorna linhas com classe infraTrClara', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="infraTrClara" id="a"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['a'])
  })

  it('retorna linhas com classe infraTrEscura', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="infraTrEscura" id="b"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['b'])
  })

  it('retorna linhas com classe trVermelha', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="trVermelha" id="c"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['c'])
  })

  it('ignora linhas sem nenhuma das três classes válidas', () => {
    const doc = criarDocComTabela(
      '#tbl',
      '<tr class="outraClasse" id="x"><td>1</td></tr><tr class="infraTrClara" id="a"><td>1</td></tr>'
    )
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['a'])
  })

  it('retorna lista vazia quando a tabela não existe no documento', () => {
    const doc = criarDocComTabela('#tbl', '<tr class="infraTrClara" id="a"><td>1</td></tr>')
    expect(extrairLinhasValidas(doc, '#outraTabela')).toEqual([])
  })

  it('preserva a ordem das linhas do documento', () => {
    const doc = criarDocComTabela(
      '#tbl',
      '<tr class="infraTrClara" id="a"><td>1</td></tr><tr class="infraTrEscura" id="b"><td>2</td></tr><tr class="trVermelha" id="c"><td>3</td></tr>'
    )
    expect(extrairLinhasValidas(doc, '#tbl').map((linha) => linha.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('extrairNroItens', () => {
  it('retorna o número quando o campo existe e é numérico', () => {
    const doc = new DOMParser().parseFromString(
      '<input id="hdnRecebidosNroItens" value="42" />',
      'text/html'
    )
    expect(extrairNroItens(doc, 'Recebidos')).toBe(42)
  })

  it('retorna null quando o campo não existe', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(extrairNroItens(doc, 'Recebidos')).toBeNull()
  })

  it('retorna null quando o valor não é numérico', () => {
    const doc = new DOMParser().parseFromString(
      '<input id="hdnRecebidosNroItens" value="abc" />',
      'text/html'
    )
    expect(extrairNroItens(doc, 'Recebidos')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/features/controle-processos/rolagemInfinita.test.ts`
Expected: FAIL — `Cannot find module './rolagemInfinita'`

- [ ] **Step 3: Implementar `src/features/controle-processos/rolagemInfinita.ts`**

```ts
export function extrairCamposOcultos(form: HTMLFormElement): Record<string, string> {
  const campos: Record<string, string> = {}
  Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).forEach((input) => {
    if (input.name && input.id.includes('hdn')) {
      campos[input.name] = input.value
    }
  })
  return campos
}

const CLASSES_LINHA_VALIDA = ['infraTrClara', 'infraTrEscura', 'trVermelha']

export function extrairLinhasValidas(doc: Document, idTabela: string): Element[] {
  const tabela = doc.querySelector(idTabela)
  if (!tabela) return []
  return Array.from(tabela.querySelectorAll('tbody > tr')).filter((linha) =>
    CLASSES_LINHA_VALIDA.some((classe) => linha.classList.contains(classe))
  )
}

export function extrairNroItens(doc: Document, tipo: string): number | null {
  const input = doc.querySelector<HTMLInputElement>(`#hdn${tipo}NroItens`)
  if (!input) return null
  const valor = Number(input.value)
  return Number.isNaN(valor) ? null : valor
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/features/controle-processos/rolagemInfinita.test.ts`
Expected: PASS (13 testes)

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/rolagemInfinita.ts src/features/controle-processos/rolagemInfinita.test.ts
git commit -m "feat(controle-processos): add hidden field and row extraction helpers for pagination removal"
```

---

### Task 2: `lib/storage.ts` — config de rolagem infinita

**Files:**
- Modify: `C:\sei\seirmg\src\lib\storage.ts`
- Modify: `C:\sei\seirmg\src\lib\storage.test.ts`

**Interfaces:**
- Consumes: nenhuma
- Produces: `RolagemInfinitaConfig { ativo: boolean }`; `ControleProcessosConfig.rolagemInfinita: RolagemInfinitaConfig`

- [ ] **Step 1: Atualizar o teste existente e escrever o novo teste (ambos devem falhar)**

Em `src/lib/storage.test.ts`, localizar o teste `'inclui controleProcessos padrão quando vazio'` (por volta da linha 73) e adicionar `rolagemInfinita: { ativo: false }` ao objeto esperado:

```ts
  it('inclui controleProcessos padrão quando vazio', async () => {
    const store = createSyncConfigStore(criarAreaFalsa())
    expect((await store.get()).controleProcessos).toEqual({
      prazos: {
        ativo: true,
        exibirDias: true,
        exibirPrazo: true,
        alertaDias: 30,
        criticoDias: 60,
        alertaPrazo: 10,
        criticoPrazo: 5,
      },
      coresProcesso: { ativo: true, regras: [] },
      especificacao: { ativo: true, modo: 'mostrar' },
      rolagemInfinita: { ativo: false },
    })
  })
```

Logo depois do teste `'persiste alteração de controleProcessos'` (por volta da linha 105), adicionar:

```ts
  it('persiste alteração de controleProcessos.rolagemInfinita', async () => {
    const area = criarAreaFalsa()
    const store = createSyncConfigStore(area)
    const atualizado = {
      ...DEFAULT_SYNC_CONFIG,
      controleProcessos: {
        ...DEFAULT_SYNC_CONFIG.controleProcessos,
        rolagemInfinita: { ativo: true },
      },
    }
    await store.set(atualizado)
    expect(await store.get()).toEqual(atualizado)
  })
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd C:\sei\seirmg && bunx vitest run src/lib/storage.test.ts`
Expected: FAIL — o objeto esperado no primeiro teste não bate (falta `rolagemInfinita`) e/ou erro de tipo no segundo teste (`rolagemInfinita` não existe em `ControleProcessosConfig`)

- [ ] **Step 3: Implementar em `src/lib/storage.ts`**

Adicionar a nova interface e o campo em `ControleProcessosConfig` (logo antes da definição de `ControleProcessosConfig` já existente):

```ts
export interface RolagemInfinitaConfig {
  ativo: boolean
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
}
```

Em `DEFAULT_SYNC_CONFIG.controleProcessos`, adicionar o campo depois de `especificacao`:

```ts
  controleProcessos: {
    prazos: {
      ativo: true,
      exibirDias: true,
      exibirPrazo: true,
      alertaDias: 30,
      criticoDias: 60,
      alertaPrazo: 10,
      criticoPrazo: 5,
    },
    coresProcesso: {
      ativo: true,
      regras: [],
    },
    especificacao: {
      ativo: true,
      modo: 'mostrar',
    },
    rolagemInfinita: {
      ativo: false,
    },
  },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `bunx vitest run src/lib/storage.test.ts`
Expected: PASS (21 testes — 20 já existentes + 1 novo)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat(storage): add rolagemInfinita config to ControleProcessosConfig"
```

---

### Task 3: Opções — checkbox de rolagem infinita

**Files:**
- Modify: `C:\sei\seirmg\src\options\index.html`
- Modify: `C:\sei\seirmg\src\options\main.ts`

**Contexto**: wiring fino de UI, mesma convenção já usada pelos demais toggles da aba "Processos". Não é coberto por TDD — verificado via build.

**Interfaces:**
- Consumes: `ControleProcessosConfig.rolagemInfinita` (Task 2)

- [ ] **Step 1: Adicionar o bloco HTML**

Em `src/options/index.html`, localizar o bloco `<h3>Ponto de Controle</h3>` (por volta da linha 105) e adicionar, logo depois do `</div>` que fecha `#processos-ponto-controle-lista` e antes do `<br />` final da seção:

Trecho atual:

```html
      <h3>Ponto de Controle</h3>
      <label>
        <input type="checkbox" id="processos-ponto-controle-ativo" />
        Ativar cor customizável do ponto de controle
      </label>
      <div id="processos-ponto-controle-lista"></div>

      <br />
      <button id="processos-salvar">Salvar</button>
```

Substituir por:

```html
      <h3>Ponto de Controle</h3>
      <label>
        <input type="checkbox" id="processos-ponto-controle-ativo" />
        Ativar cor customizável do ponto de controle
      </label>
      <div id="processos-ponto-controle-lista"></div>

      <h3>Rolagem infinita</h3>
      <label>
        <input type="checkbox" id="processos-rolagem-infinita-ativo" />
        Ativar rolagem infinita (remover paginação e carregar todos os processos)
      </label>

      <br />
      <button id="processos-salvar">Salvar</button>
```

- [ ] **Step 2: Adicionar a leitura e a gravação em `main.ts`**

Em `src/options/main.ts`, dentro de `carregarAbaProcessos`, localizar a declaração de `inputPontoControleAtivo` (por volta da linha 219-221):

```ts
    const inputPontoControleAtivo = document.getElementById(
      'processos-ponto-controle-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('processos-status')
```

Substituir por:

```ts
    const inputPontoControleAtivo = document.getElementById(
      'processos-ponto-controle-ativo'
    ) as HTMLInputElement | null
    const inputRolagemInfinitaAtivo = document.getElementById(
      'processos-rolagem-infinita-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('processos-status')
```

Logo abaixo, localizar a linha `if (inputPontoControleAtivo) inputPontoControleAtivo.checked = config.pontoControle.ativo` (por volta da linha 236) e adicionar depois dela:

```ts
    if (inputPontoControleAtivo) inputPontoControleAtivo.checked = config.pontoControle.ativo
    if (inputRolagemInfinitaAtivo) {
      inputRolagemInfinitaAtivo.checked = config.controleProcessos.rolagemInfinita.ativo
    }
```

No handler de salvar (`document.getElementById('processos-salvar')?.addEventListener('click', ...)`), localizar o objeto `especificacao` dentro de `controleProcessos` (por volta da linha 291-294):

```ts
            especificacao: {
              ativo: inputEspecificacaoAtivo?.checked ?? true,
              modo: (selectModo?.value ?? 'mostrar') as ModoEspecificacao,
            },
          },
```

Substituir por:

```ts
            especificacao: {
              ativo: inputEspecificacaoAtivo?.checked ?? true,
              modo: (selectModo?.value ?? 'mostrar') as ModoEspecificacao,
            },
            rolagemInfinita: {
              ativo: inputRolagemInfinitaAtivo?.checked ?? false,
            },
          },
```

- [ ] **Step 3: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (251 — ver contagem completa na Task 7), build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/options/index.html src/options/main.ts
git commit -m "feat(options): add rolagem infinita toggle to Processos tab"
```

---

### Task 4: Refatorar `aplicarPrazos`/`aplicarCorProcesso`/`aplicarEspecificacao` para aceitar subconjunto de linhas

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: refactor comportamento-preservando (extração de função). As três funções hoje sempre processam a tabela inteira e não são idempotentes (`aplicarPrazos` duplicaria cabeçalho, `aplicarEspecificacao` no modo "mostrar" duplicaria `<span>`s se rodasse duas vezes sobre a mesma linha). Este task separa "aplicar num conjunto explícito de linhas" (reutilizável pela Task 7 nas linhas novas) de "aplicar na tabela inteira" (comportamento de bootstrap, inalterado). Não é coberto por TDD — nenhuma das três funções é testada hoje (wiring de DOM); verificado via typecheck/build.

**Interfaces:**
- Consumes: nenhuma nova
- Produces: `aplicarPrazosEmLinhas(config: ControleProcessosConfig['prazos'], linhas: Element[]): void`; `aplicarCorProcessoEmLinhas(config: ControleProcessosConfig['coresProcesso'], linhas: Element[]): void`; `aplicarEspecificacaoEmLinhas(config: ControleProcessosConfig['especificacao'], linhas: Element[]): void` — usados pela Task 7.

- [ ] **Step 1: Substituir as três funções**

Trecho atual (linhas 39-144 de `src/content-scripts/procedimento_controlar/index.ts`):

```ts
function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  const tipos: Array<{
    tipo: TipoCalculoPrazo
    exibir: boolean
    rotulo: string
    limites: { alerta: number; critico: number }
  }> = [
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      rotulo: 'Dias',
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
    },
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      rotulo: 'Prazo',
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
    },
  ]

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    tipos.forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      linhasDaTabela(idTabela).forEach((linha) => {
        const marcadores = Array.from(
          linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
        )
        const textos = marcadores
          .map((marcador) => marcador.getAttribute('onmouseover'))
          .filter((texto): texto is string => texto !== null)
          .map(extrairTextoMarcador)

        const valor = calcularDiasDoMarcador(textos, tipo, new Date())

        const td = document.createElement('td')
        td.setAttribute('valign', 'top')
        td.setAttribute('align', 'center')
        td.textContent = valor === null ? '' : String(valor)
        linha.appendChild(td)

        if (valor !== null) {
          const classificacao = classificarPrazo(valor, tipo, limites)
          if (classificacao === 'alerta') linha.classList.add('infraTrseippalerta')
          if (classificacao === 'critico') linha.classList.add('infraTrseippcritico')
        }
      })
    })
  })
}

function aplicarCorProcesso(config: ControleProcessosConfig['coresProcesso']): void {
  if (!config.ativo || config.regras.length === 0) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      const especificacao = extrairEspecificacaoParaCor(onmouseover)
      const cor = escolherCorProcesso(especificacao, config.regras)
      if (cor) {
        processo.setAttribute('style', `background-color: ${cor}; padding: 0 1em 0 1em`)
      }
    })
  })
}

function aplicarEspecificacao(config: ControleProcessosConfig['especificacao']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    linhasDaTabela(idTabela).forEach((linha) => {
      const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
      const onmouseover = processo?.getAttribute('onmouseover')
      if (!processo || !onmouseover) return

      if (config.modo === 'mostrar') {
        const especificacao = extrairEspecificacaoParaExibicao(onmouseover)
        const span = document.createElement('span')
        span.textContent = especificacao
        span.style.cssText = 'font-size:.9em;color:darkblue;display:block;'
        span.title = 'Especificação'
        processo.insertAdjacentElement('afterend', span)
      } else {
        const especificacao = extrairEspecificacaoParaLista(onmouseover)
        processo.textContent = especificacao || `${processo.textContent} (sem especificação)`
      }
    })
  })
}
```

Substituir por:

```ts
function definirTiposPrazo(
  config: ControleProcessosConfig['prazos']
): Array<{ tipo: TipoCalculoPrazo; exibir: boolean; rotulo: string; limites: { alerta: number; critico: number } }> {
  return [
    {
      tipo: 'qtddias',
      exibir: config.exibirDias,
      rotulo: 'Dias',
      limites: { alerta: config.alertaDias, critico: config.criticoDias },
    },
    {
      tipo: 'prazo',
      exibir: config.exibirPrazo,
      rotulo: 'Prazo',
      limites: { alerta: config.alertaPrazo, critico: config.criticoPrazo },
    },
  ]
}

function aplicarUmTipoDePrazo(
  linhas: Element[],
  tipo: TipoCalculoPrazo,
  limites: { alerta: number; critico: number }
): void {
  linhas.forEach((linha) => {
    const marcadores = Array.from(
      linha.querySelectorAll<HTMLAnchorElement>("td > a[href*='acao=andamento_marcador_gerenciar']")
    )
    const textos = marcadores
      .map((marcador) => marcador.getAttribute('onmouseover'))
      .filter((texto): texto is string => texto !== null)
      .map(extrairTextoMarcador)

    const valor = calcularDiasDoMarcador(textos, tipo, new Date())

    const td = document.createElement('td')
    td.setAttribute('valign', 'top')
    td.setAttribute('align', 'center')
    td.textContent = valor === null ? '' : String(valor)
    linha.appendChild(td)

    if (valor !== null) {
      const classificacao = classificarPrazo(valor, tipo, limites)
      if (classificacao === 'alerta') linha.classList.add('infraTrseippalerta')
      if (classificacao === 'critico') linha.classList.add('infraTrseippcritico')
    }
  })
}

function aplicarPrazosEmLinhas(config: ControleProcessosConfig['prazos'], linhas: Element[]): void {
  if (!config.ativo) return
  definirTiposPrazo(config).forEach(({ tipo, exibir, limites }) => {
    if (!exibir) return
    aplicarUmTipoDePrazo(linhas, tipo, limites)
  })
}

function aplicarPrazos(config: ControleProcessosConfig['prazos']): void {
  if (!config.ativo) return

  IDS_TABELAS.forEach((idTabela) => {
    const tabela = document.querySelector(idTabela)
    if (!tabela) return

    definirTiposPrazo(config).forEach(({ tipo, exibir, rotulo, limites }) => {
      if (!exibir) return

      const theadRow = tabela.querySelector('thead > tr')
      if (theadRow) {
        const th = document.createElement('th')
        th.className = 'infraTh'
        th.textContent = rotulo
        theadRow.appendChild(th)
      }

      aplicarUmTipoDePrazo(linhasDaTabela(idTabela), tipo, limites)
    })
  })
}

function aplicarCorProcessoEmLinhas(config: ControleProcessosConfig['coresProcesso'], linhas: Element[]): void {
  if (!config.ativo || config.regras.length === 0) return

  linhas.forEach((linha) => {
    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    const onmouseover = processo?.getAttribute('onmouseover')
    if (!processo || !onmouseover) return

    const especificacao = extrairEspecificacaoParaCor(onmouseover)
    const cor = escolherCorProcesso(especificacao, config.regras)
    if (cor) {
      processo.setAttribute('style', `background-color: ${cor}; padding: 0 1em 0 1em`)
    }
  })
}

function aplicarCorProcesso(config: ControleProcessosConfig['coresProcesso']): void {
  IDS_TABELAS.forEach((idTabela) => {
    aplicarCorProcessoEmLinhas(config, linhasDaTabela(idTabela))
  })
}

function aplicarEspecificacaoEmLinhas(config: ControleProcessosConfig['especificacao'], linhas: Element[]): void {
  if (!config.ativo) return

  linhas.forEach((linha) => {
    const processo = linha.querySelector<HTMLElement>('.processoVisualizado, .processoNaoVisualizado')
    const onmouseover = processo?.getAttribute('onmouseover')
    if (!processo || !onmouseover) return

    if (config.modo === 'mostrar') {
      const especificacao = extrairEspecificacaoParaExibicao(onmouseover)
      const span = document.createElement('span')
      span.textContent = especificacao
      span.style.cssText = 'font-size:.9em;color:darkblue;display:block;'
      span.title = 'Especificação'
      processo.insertAdjacentElement('afterend', span)
    } else {
      const especificacao = extrairEspecificacaoParaLista(onmouseover)
      processo.textContent = especificacao || `${processo.textContent} (sem especificação)`
    }
  })
}

function aplicarEspecificacao(config: ControleProcessosConfig['especificacao']): void {
  IDS_TABELAS.forEach((idTabela) => {
    aplicarEspecificacaoEmLinhas(config, linhasDaTabela(idTabela))
  })
}
```

- [ ] **Step 2: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (251), build sem erros. Nenhum teste novo — este task não muda comportamento observável.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor(controle-processos): split prazo/cor/especificação application into per-row helpers"
```

---

### Task 5: Refatorar ordenação para permitir reaplicação sem alternar direção

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: mesmo tipo de refactor da Task 4, aplicado ao código de ordenação do Lote E3. Comportamento do clique no cabeçalho fica idêntico; ganha-se uma nova função para reaplicar a ordenação já ativa (usada pela Task 7 depois de anexar linhas novas).

**Interfaces:**
- Consumes: nenhuma nova
- Produces: `reaplicarOrdenacaoAtual(idTabela: string): void` — usado pela Task 7.

- [ ] **Step 1: Substituir `ordenarTabelaPelaColuna`**

Trecho atual (linhas 187-219):

```ts
function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  try {
    const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
    const direcao: 'asc' | 'desc' =
      estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
    estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })

    const linhas = linhasDaTabela(idTabela)
    const valores = linhas.map((linha, index) => ({
      id: linha.id || String(index),
      valor: linha.children[indiceColuna]?.textContent?.trim() ?? '',
    }))

    const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
    const ordemIds = ordenarIds(valores, tipo, direcao)

    const tabela = document.querySelector(idTabela)
    const tbody = tabela?.querySelector('tbody')
    if (!tbody) return

    const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
    ordemIds.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })

    limparIndicadoresOrdenacao(headers)
    aplicarIndicadorOrdenacao(headers[indiceColuna], direcao)
    ultimoIndicePorTabela.delete(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}
```

Substituir por:

```ts
function aplicarOrdenacaoNaTabela(
  idTabela: string,
  indiceColuna: number,
  direcao: 'asc' | 'desc',
  headers: HTMLTableCellElement[]
): void {
  try {
    const linhas = linhasDaTabela(idTabela)
    const valores = linhas.map((linha, index) => ({
      id: linha.id || String(index),
      valor: linha.children[indiceColuna]?.textContent?.trim() ?? '',
    }))

    const tipo: TipoColuna = detectarTipoColuna(valores.map((item) => item.valor))
    const ordemIds = ordenarIds(valores, tipo, direcao)

    const tabela = document.querySelector(idTabela)
    const tbody = tabela?.querySelector('tbody')
    if (!tbody) return

    const linhaPorId = new Map(linhas.map((linha, index) => [linha.id || String(index), linha]))
    ordemIds.forEach((id) => {
      const linha = linhaPorId.get(id)
      if (linha) tbody.appendChild(linha)
    })

    limparIndicadoresOrdenacao(headers)
    aplicarIndicadorOrdenacao(headers[indiceColuna], direcao)
    ultimoIndicePorTabela.delete(idTabela)
  } catch (error) {
    console.error('[SEIRMG] Falha ao ordenar tabela:', error)
  }
}

function ordenarTabelaPelaColuna(idTabela: string, indiceColuna: number, headers: HTMLTableCellElement[]): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  const direcao: 'asc' | 'desc' =
    estadoAtual?.indiceColuna === indiceColuna && estadoAtual.direcao === 'asc' ? 'desc' : 'asc'
  estadoOrdenacaoPorTabela.set(idTabela, { indiceColuna, direcao })
  aplicarOrdenacaoNaTabela(idTabela, indiceColuna, direcao, headers)
}

function reaplicarOrdenacaoAtual(idTabela: string): void {
  const estadoAtual = estadoOrdenacaoPorTabela.get(idTabela)
  if (!estadoAtual) return

  const tabela = document.querySelector(idTabela)
  if (!tabela) return

  const headers = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead > tr > th'))
  aplicarOrdenacaoNaTabela(idTabela, estadoAtual.indiceColuna, estadoAtual.direcao, headers)
}
```

- [ ] **Step 2: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (251), build sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor(controle-processos): split sort direction toggle from sort application"
```

---

### Task 6: Registro de reaplicação de filtros

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: `montarBuscaRapida`/`montarFiltroAtribuicao`/`montarFiltroBloco` já releem a tabela inteira do zero a cada chamada de suas funções internas de aplicação — não há diferença de comportamento em chamá-las de novo. Este task só registra essas funções num array module-level para a Task 7 poder reaplicá-las depois de anexar linhas novas.

**Interfaces:**
- Consumes: nenhuma nova
- Produces: `reaplicarFiltrosAposNovasLinhas: Array<() => void>` — usado pela Task 7.

- [ ] **Step 1: Declarar o array module-level**

Trecho atual (linha 165):

```ts
const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()
```

Substituir por:

```ts
const estadoFiltrosPorTabela = new Map<string, EstadoFiltros>()
const reaplicarFiltrosAposNovasLinhas: Array<() => void> = []
```

- [ ] **Step 2: Registrar em `montarBuscaRapida`**

Trecho atual (dentro de `montarBuscaRapida`, por volta da linha 305):

```ts
    inputBusca.addEventListener('input', atualizar)
    inputBusca.addEventListener('change', atualizar)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar busca rápida:', error)
  }
}
```

Substituir por:

```ts
    inputBusca.addEventListener('input', atualizar)
    inputBusca.addEventListener('change', atualizar)
    reaplicarFiltrosAposNovasLinhas.push(atualizar)
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar busca rápida:', error)
  }
}
```

- [ ] **Step 3: Registrar em `montarFiltroAtribuicao`**

Trecho atual (dentro de `montarFiltroAtribuicao`, por volta das linhas 423-425):

```ts
    }

    select.addEventListener('change', () => {
```

Substituir por:

```ts
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicar(select.value))

    select.addEventListener('change', () => {
```

- [ ] **Step 4: Registrar em `montarFiltroBloco`**

Trecho atual (dentro de `montarFiltroBloco`, por volta das linhas 477-500):

```ts
    const aplicarFiltroBloco = (numeros: string[] | null): void => {
      IDS_TABELAS.forEach((idTabela) => {
        const linhas = linhasDaTabela(idTabela)
        let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

        if (!numeros) {
          estado = removerFiltro(estado, 'PorBloco')
        } else {
          const resultado: Record<string, boolean> = {}
          linhas.forEach((linha, index) => {
            const id = linha.id || String(index)
            const numeroProcesso = linha.querySelector('td:nth-child(3) a')?.textContent?.trim() ?? ''
            resultado[id] = linhaCasaBloco(numeroProcesso, numeros)
          })
          estado = registrarFiltro(estado, 'PorBloco', resultado)
        }

        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    selectTipo.addEventListener('change', () => {
```

Substituir por:

```ts
    let ultimoNumerosBloco: string[] | null = null

    const aplicarFiltroBloco = (numeros: string[] | null): void => {
      ultimoNumerosBloco = numeros

      IDS_TABELAS.forEach((idTabela) => {
        const linhas = linhasDaTabela(idTabela)
        let estado = estadoFiltrosPorTabela.get(idTabela) ?? {}

        if (!numeros) {
          estado = removerFiltro(estado, 'PorBloco')
        } else {
          const resultado: Record<string, boolean> = {}
          linhas.forEach((linha, index) => {
            const id = linha.id || String(index)
            const numeroProcesso = linha.querySelector('td:nth-child(3) a')?.textContent?.trim() ?? ''
            resultado[id] = linhaCasaBloco(numeroProcesso, numeros)
          })
          estado = registrarFiltro(estado, 'PorBloco', resultado)
        }

        estadoFiltrosPorTabela.set(idTabela, estado)
        const ids = linhas.map((linha, index) => linha.id || String(index))
        aplicarVisibilidade(idTabela, calcularVisibilidade(estado, ids))
      })
    }

    reaplicarFiltrosAposNovasLinhas.push(() => aplicarFiltroBloco(ultimoNumerosBloco))

    selectTipo.addEventListener('change', () => {
```

- [ ] **Step 5: Rodar toda a suíte e o build**

Run: `cd C:\sei\seirmg && bunx vitest run && bun run build`
Expected: todos os testes continuam passando (251), build sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "refactor(controle-processos): register filter reapply callbacks for future new rows"
```

---

### Task 7: Orquestração da rolagem infinita

**Files:**
- Modify: `C:\sei\seirmg\src\content-scripts\procedimento_controlar\index.ts`

**Contexto**: task final de integração. Junta a lógica pura da Task 1, os helpers por-linha das Tasks 4-6 e o config da Task 2 para implementar o fluxo completo descrito na spec. Não é coberto por TDD — verificado via build.

**Interfaces:**
- Consumes: `extrairCamposOcultos`, `extrairLinhasValidas`, `extrairNroItens` (Task 1); `ControleProcessosConfig.rolagemInfinita` (Task 2); `aplicarPrazosEmLinhas`, `aplicarCorProcessoEmLinhas`, `aplicarEspecificacaoEmLinhas` (Task 4); `reaplicarOrdenacaoAtual` (Task 5); `reaplicarFiltrosAposNovasLinhas` (Task 6); `fetchText` (`../../lib/result`, já importado); `atualizarCaption` (já existente no arquivo)

- [ ] **Step 1: Atualizar os imports**

Trecho atual (linhas 1-29):

```ts
import {
  calcularDiasDoMarcador,
  classificarPrazo,
  extrairTextoMarcador,
  type TipoCalculoPrazo,
} from '../../features/controle-processos/prazos'
import { escolherCorProcesso, extrairEspecificacaoParaCor } from '../../features/controle-processos/corProcesso'
import {
  extrairEspecificacaoParaExibicao,
  extrairEspecificacaoParaLista,
} from '../../features/controle-processos/especificacao'
import {
  calcularVisibilidade,
  registrarFiltro,
  removerFiltro,
  type EstadoFiltros,
} from '../../features/controle-processos/filtroTabela'
import { linhaCasaBusca, parseTermosBusca } from '../../features/controle-processos/buscaRapida'
import { calcularIndicesParaClicar } from '../../features/controle-processos/selecaoMultipla'
import { extrairNomesAtribuidos, linhaCasaAtribuicao } from '../../features/controle-processos/filtroAtribuicao'
import {
  linhaCasaBloco,
  parseListaBlocos,
  parseProcessosDoBloco,
} from '../../features/controle-processos/filtroBloco'
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
import { fetchText } from '../../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig } from '../../lib/storage'
```

Substituir as duas últimas linhas por:

```ts
import { detectarTipoColuna, ordenarIds, type TipoColuna } from '../../features/controle-processos/ordenarTabela'
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
import { fetchText } from '../../lib/result'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'
import type { ControleProcessosConfig, SyncConfig } from '../../lib/storage'
```

- [ ] **Step 2: Adicionar as novas funções**

Adicionar, logo antes de `async function bootstrap(): Promise<void> {` (final do arquivo):

```ts
function desabilitarSelecaoNaLinha(linha: Element): void {
  const checkbox = linha.querySelector<HTMLInputElement>('input.infraCheckbox, input[type="checkbox"]')
  if (!checkbox) return

  checkbox.disabled = true
  const celula = checkbox.closest('td')
  if (!celula) return

  celula.setAttribute(
    'onmouseover',
    "return infraTooltipMostrar('Desative a opção \"Rolagem infinita\" nas Opções do SEIRMG para utilizar esta seleção')"
  )
  celula.setAttribute('onmouseout', 'return infraTooltipOcultar()')
}

function reaplicarTratamentosNasLinhasNovas(idTabela: string, config: SyncConfig, linhas: Element[]): void {
  aplicarPrazosEmLinhas(config.controleProcessos.prazos, linhas)
  aplicarCorProcessoEmLinhas(config.controleProcessos.coresProcesso, linhas)
  aplicarEspecificacaoEmLinhas(config.controleProcessos.especificacao, linhas)
  reaplicarFiltrosAposNovasLinhas.forEach((reaplicar) => reaplicar())
  reaplicarOrdenacaoAtual(idTabela)
}

async function buscarProximasPaginas(
  tipo: 'Recebidos' | 'Gerados',
  idTabela: string,
  form: HTMLFormElement,
  config: SyncConfig,
  indice: number
): Promise<void> {
  const campos = extrairCamposOcultos(form)
  campos[`hdn${tipo}PaginaAtual`] = String(indice)

  const resultado = await fetchText(form.action, {
    method: 'POST',
    body: new URLSearchParams(campos),
  })

  if (!resultado.ok) {
    console.error(`[SEIRMG] Falha ao buscar página ${indice} de ${tipo}:`, resultado.error)
    return
  }

  const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
  const linhasNovas = extrairLinhasValidas(doc, idTabela)

  if (linhasNovas.length === 0) {
    const camposFinais = extrairCamposOcultos(form)
    camposFinais[`hdn${tipo}PaginaAtual`] = '0'
    fetchText(form.action, { method: 'POST', body: new URLSearchParams(camposFinais) }).catch((error) => {
      console.error(`[SEIRMG] Falha ao resetar página de ${tipo}:`, error)
    })
    return
  }

  const tabela = document.querySelector(idTabela)
  const tbody = tabela?.querySelector('tbody')
  if (!tabela || !tbody) return

  const linhasAdotadas = linhasNovas.map((linha) => document.adoptNode(linha))
  linhasAdotadas.forEach((linha) => {
    desabilitarSelecaoNaLinha(linha)
    tbody.appendChild(linha)
  })

  const campoNroItens = document.getElementById(`hdn${tipo}NroItens`) as HTMLInputElement | null
  const nroItensAnterior = Number(campoNroItens?.value ?? '0')
  const nroItensNovo = extrairNroItens(doc, tipo) ?? 0
  const totalItens = nroItensAnterior + nroItensNovo
  if (campoNroItens) campoNroItens.value = String(totalItens)
  atualizarCaption(tabela, totalItens)

  reaplicarTratamentosNasLinhasNovas(idTabela, config, linhasAdotadas)

  await buscarProximasPaginas(tipo, idTabela, form, config, indice + 1)
}

async function iniciarRemocaoPaginacao(
  tipo: 'Recebidos' | 'Gerados',
  idTabela: string,
  config: SyncConfig
): Promise<void> {
  try {
    const linkPaginacao = document.querySelector(`#div${tipo}AreaPaginacaoSuperior a`)
    if (!linkPaginacao) return

    const form = document.getElementById('frmProcedimentoControlar') as HTMLFormElement | null
    if (!form) return

    const campoPagina = document.getElementById(`hdn${tipo}PaginaAtual`) as HTMLInputElement | null
    const paginaAtual = Number(campoPagina?.value ?? '0')

    if (paginaAtual > 0) {
      if (campoPagina) campoPagina.value = '0'
      form.submit()
      return
    }

    document
      .querySelectorAll(`#div${tipo} .infraAreaPaginacao a, #div${tipo} .infraAreaPaginacao select`)
      .forEach((elemento) => {
        (elemento as HTMLElement).style.display = 'none'
      })

    await buscarProximasPaginas(tipo, idTabela, form, config, 1)
  } catch (error) {
    console.error(`[SEIRMG] Falha ao remover paginação (${tipo}):`, error)
  }
}
```

- [ ] **Step 3: Chamar `iniciarRemocaoPaginacao` no `bootstrap()`**

Trecho atual (linhas 555-572):

```ts
async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}
```

Substituir por:

```ts
async function bootstrap(): Promise<void> {
  try {
    corrigirTabelasNativas()
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()

    const config = await createSyncConfigStore().get()
    aplicarPrazos(config.controleProcessos.prazos)
    aplicarCorProcesso(config.controleProcessos.coresProcesso)
    aplicarEspecificacao(config.controleProcessos.especificacao)

    if (config.controleProcessos.rolagemInfinita.ativo) {
      const tabelasRolagem: Array<{ tipo: 'Recebidos' | 'Gerados'; idTabela: string }> = [
        { tipo: 'Recebidos', idTabela: '#tblProcessosRecebidos' },
        { tipo: 'Gerados', idTabela: '#tblProcessosGerados' },
      ]
      tabelasRolagem.forEach(({ tipo, idTabela }) => {
        iniciarRemocaoPaginacao(tipo, idTabela, config).catch((error) => {
          console.error(`[SEIRMG] Falha ao iniciar remoção de paginação (${tipo}):`, error)
        })
      })
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar recursos de Controle de Processos:', error)
  }
}
```

- [ ] **Step 4: Rodar toda a suíte de testes para confirmar que nada quebrou**

Run: `cd C:\sei\seirmg && bunx vitest run`
Expected: todos os testes continuam passando (251 testes no total — 237 antes deste plano + 13 (Task 1) + 1 (Task 2) = 251)

- [ ] **Step 5: Rodar o build**

Run: `bun run build`
Expected: sucesso, sem erros de tipo. Se houver erro, rode `bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat(controle-processos): wire infinite scroll pagination removal for Recebidos/Gerados"
```

---

### Task 8: Checagem final (typecheck/lint/test/build/manifest)

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
Expected: os 4 comandos terminam com código de saída 0. `bun run test` reporta 251 testes, todos passando.

- [ ] **Step 2: Validar o `manifest.json` gerado e confirmar que as permissões não mudaram**

Run: `node -e "const m = JSON.parse(require('fs').readFileSync('dist/manifest.json', 'utf8')); console.log('manifest.json válido'); console.log(JSON.stringify(m.permissions))"`
Expected: `manifest.json válido` seguido de `["storage","notifications","alarms","tabs"]` — exatamente as mesmas permissões de antes.

---

## Self-Review (checklist do autor do plano)

1. **Cobertura da spec**: extração pura (`extrairCamposOcultos`/`extrairLinhasValidas`/`extrairNroItens`, Task 1) com o bug de classe corrigido; config opt-in (Task 2) e UI (Task 3); refactors comportamento-preservando de prazos/cor/especificação (Task 4) e ordenação (Task 5); registro de reaplicação de filtros (Task 6); orquestração completa com reset de página, ocultação de paginação, busca recursiva, atualização de contador/legenda, seleção desabilitada nas linhas novas e reaplicação de todos os tratamentos (Task 7); checagem final (Task 8). Todas as seções da spec têm task correspondente.
2. **Placeholders**: nenhum "TBD"/"TODO"; todo código de teste e implementação está completo e literal.
3. **Consistência de tipos**: `extrairCamposOcultos`/`extrairLinhasValidas`/`extrairNroItens` (Task 1) consumidos identicamente pela Task 7. `aplicarPrazosEmLinhas`/`aplicarCorProcessoEmLinhas`/`aplicarEspecificacaoEmLinhas` (Task 4) e `reaplicarOrdenacaoAtual` (Task 5) e `reaplicarFiltrosAposNovasLinhas` (Task 6) todos consumidos identicamente por `reaplicarTratamentosNasLinhasNovas` (Task 7). `ControleProcessosConfig.rolagemInfinita`/`SyncConfig` (Task 2) usados identicamente pela Task 7.
4. **Contagem de testes**: 237 (baseline antes deste plano) + 13 (Task 1) + 1 (Task 2) = 251 testes esperados a partir da Task 2 em diante.
