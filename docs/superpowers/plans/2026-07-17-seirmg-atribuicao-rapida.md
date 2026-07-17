# SEIRMG — Atribuição Rápida de Processo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atribuir um ou mais processos a uma pessoa (ou "Ninguém", desatribuindo) direto de um
popup em Controle de Processos, sem navegar pra tela cheia nativa "Atribuir Processo" — mesma
experiência já entregue pro marcador rápido, mas mais simples (select nativo, sem widget
customizado, sem par adicionar/remover).

**Architecture:** Bridge de main-world reaproveitado (mesmo entry point `world: "MAIN"` já usado
pelo marcador) intercepta o link nativo de `#divComandos` e despacha um `CustomEvent`. O content
script isolado escuta, refaz o fetch da tela intermediária nativa (POST com os campos ocultos do
formulário da lista), extrai as opções de pessoa + o formulário de confirmação, e abre um popup
central (reaproveitando a mesma casca visual/CSS do marcador rápido) com um `<select>` nativo
(sem widget customizado, já que não há ícone por opção). Ao confirmar, POST real e
`window.location.reload()` — mesmo comportamento já validado do marcador.

**Tech Stack:** TypeScript, Vitest (jsdom), Vite/CRXJS (extensão Chrome MV3). Sem dependências
novas.

## Global Constraints

- `tsconfig.json` tem `noUnusedParameters: true` e `noUnusedLocals: true` — nenhum
  parâmetro/variável sem uso.
- Qualquer código que chama `chrome.*` ou faz I/O assíncrono a partir de um listener/callback
  precisa de `try/catch` (log via `console.error('[SEIRMG] ...', error)`, sem rethrow) — política já
  estabelecida no projeto.
- Lógica pura testada em `features/`; wiring de DOM em `content-scripts/procedimento_controlar/index.ts`
  sem teste automatizado (mesmo padrão já estabelecido no arquivo) — **exceto** o bridge de
  main-world (`pontePrincipal.ts`), que É testável via jsdom simulando cliques reais (mesmo padrão já
  usado pro marcador em `pontePrincipal.test.ts`).
- Reaproveitar sem duplicar: `extrairUrlDeOnclick` (`features/controle-processos/marcadorRapido.ts`),
  `extrairCamposOcultos` (`features/controle-processos/rolagemInfinita.ts`), `fetchText`
  (`lib/fetchViaBackground.ts`), `contarCheckboxesMarcados` (privada em `pontePrincipal.ts`),
  `textoQuantidadeProcessos` (já em `index.ts`), `userIconSvg` (já importado em `index.ts`,
  `lucide-static/icons/user.svg?raw`), e as classes CSS do popup do marcador
  (`.seirmg-marcador-rapido-fundo/popup/header/icone/titulo/subtitulo/corpo/erro/rodape/btn*`) — são
  puramente visuais/estruturais, sem acoplamento com a lógica do marcador, seguras de reaproveitar
  sem risco de regressão no marcador (já validado ao vivo).
- Sem manifest/vite novo — reaproveita o entry point de main-world já existente
  (`content-scripts/procedimento_controlar/pontePrincipalMain.ts`, `world: "MAIN"` já declarado em
  `manifest.config.ts`).
- A opção `value="null"` do `#selAtribuicao` é uma escolha real e válida ("Ninguém", desatribuir),
  não um placeholder a filtrar — **sem validação de "nada selecionado"** no popup.

---

## Task 1: Contrato do evento (`protocoloAtribuicaoRapida.ts`)

**Files:**
- Create: `src/content-scripts/procedimento_controlar/protocoloAtribuicaoRapida.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `EVENTO_CLIQUE_ATRIBUICAO_RAPIDA: string`, `DetalheCliqueAtribuicaoRapida { quantidade:
  number }` — usados pela Task 3 (bridge) e Task 5 (wiring isolado).

Sem teste (mesmo padrão de `protocoloMarcadorRapido.ts` — só constantes/tipos, nada executável).

- [ ] **Step 1: Criar o arquivo**

```ts
export const EVENTO_CLIQUE_ATRIBUICAO_RAPIDA = 'seirmg:clique-atribuicao-rapida'

export interface DetalheCliqueAtribuicaoRapida {
  quantidade: number
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/procedimento_controlar/protocoloAtribuicaoRapida.ts
git commit -m "feat: adiciona protocolo do evento de atribuição rápida"
```

---

## Task 2: Lógica pura (`features/controle-processos/atribuicaoRapida.ts`)

**Files:**
- Create: `src/features/controle-processos/atribuicaoRapida.ts`
- Test: `src/features/controle-processos/atribuicaoRapida.test.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `OpcaoAtribuicao { id: string; nome: string }`,
  `parseOpcoesAtribuicao(doc: Document): OpcaoAtribuicao[]`,
  `parseFormularioAtribuicao(doc: Document): { actionUrl: string; campos: Record<string, string> } | null`,
  `montarCorpoConfirmacaoAtribuicao(campos: Record<string, string>, pessoaEscolhida: string, botao: {
  nome: string; valor: string }): URLSearchParams` — usadas pela Task 5 (wiring).

- [ ] **Step 1: Escrever os testes**

Criar `src/features/controle-processos/atribuicaoRapida.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  montarCorpoConfirmacaoAtribuicao,
  parseFormularioAtribuicao,
  parseOpcoesAtribuicao,
} from './atribuicaoRapida'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseOpcoesAtribuicao', () => {
  it('lê as opções do #selAtribuicao, rotulando value="null" como "Ninguém"', () => {
    document.body.innerHTML = `
      <select id="selAtribuicao">
        <option value="null" selected="selected">&nbsp;</option>
        <option value="100006975">bruno.freitas - BRUNO FREITAS DA SILVA PEREIRA</option>
        <option value="100006934">danielle.marchi - DANIELLE REGINA MARCHI</option>
      </select>
    `

    expect(parseOpcoesAtribuicao(document)).toEqual([
      { id: 'null', nome: 'Ninguém (remover atribuição)' },
      { id: '100006975', nome: 'bruno.freitas - BRUNO FREITAS DA SILVA PEREIRA' },
      { id: '100006934', nome: 'danielle.marchi - DANIELLE REGINA MARCHI' },
    ])
  })

  it('ignora opções com value vazio (mas mantém "null")', () => {
    document.body.innerHTML = `
      <select id="selAtribuicao">
        <option value="">deveria ser ignorada</option>
        <option value="null">&nbsp;</option>
      </select>
    `

    expect(parseOpcoesAtribuicao(document)).toEqual([{ id: 'null', nome: 'Ninguém (remover atribuição)' }])
  })

  it('retorna lista vazia quando #selAtribuicao não existe', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseOpcoesAtribuicao(document)).toEqual([])
  })
})

describe('parseFormularioAtribuicao', () => {
  it('lê action e campos ocultos, incluindo hdnIdProtocolo em lote (separado por vírgula)', () => {
    document.body.innerHTML = `
      <form id="frmAtividadeAtribuir" action="controlador.php?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_atribuicao_cadastrar&infra_hash=abc">
        <input type="hidden" id="hdnInfraTipoPagina" name="hdnInfraTipoPagina" value="1" />
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="21095007,5793758" />
      </form>
    `

    expect(parseFormularioAtribuicao(document)).toEqual({
      actionUrl:
        'controlador.php?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_atribuicao_cadastrar&infra_hash=abc',
      campos: { hdnInfraTipoPagina: '1', hdnIdProtocolo: '21095007,5793758' },
    })
  })

  it('lê hdnIdProtocolo com um só processo', () => {
    document.body.innerHTML = `
      <form id="frmAtividadeAtribuir" action="controlador.php?acao=x">
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="21095007" />
      </form>
    `

    expect(parseFormularioAtribuicao(document)?.campos.hdnIdProtocolo).toBe('21095007')
  })

  it('retorna null quando o formulário não existe', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseFormularioAtribuicao(document)).toBeNull()
  })
})

describe('montarCorpoConfirmacaoAtribuicao', () => {
  it('sobrescreve selAtribuicao com a pessoa escolhida e inclui o botão de confirmação', () => {
    const campos = { hdnInfraTipoPagina: '1', hdnIdProtocolo: '21095007' }
    const corpo = montarCorpoConfirmacaoAtribuicao(campos, '100006975', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })

    expect(corpo.get('hdnInfraTipoPagina')).toBe('1')
    expect(corpo.get('hdnIdProtocolo')).toBe('21095007')
    expect(corpo.get('selAtribuicao')).toBe('100006975')
    expect(corpo.get('sbmSalvar')).toBe('Salvar')
  })

  it('funciona com "Ninguém" (value "null")', () => {
    const corpo = montarCorpoConfirmacaoAtribuicao({ hdnIdProtocolo: '21095007' }, 'null', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })

    expect(corpo.get('selAtribuicao')).toBe('null')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/atribuicaoRapida.test.ts`
Expected: FAIL — `./atribuicaoRapida` não existe ainda.

- [ ] **Step 3: Implementar `atribuicaoRapida.ts`**

```ts
export interface OpcaoAtribuicao {
  id: string
  nome: string
}

const ROTULO_NINGUEM = 'Ninguém (remover atribuição)'

// #selAtribuicao é um <select> nativo no HTML bruto do servidor (mesma confirmação já feita pro
// #selMarcador em marcadorRapido.ts). A opção value="null" NÃO é um placeholder de "nada
// escolhido" -- é uma opção real e válida ("atribuir a ninguém" / desatribuir, confirmado pelo
// usuário: um processo só pode estar atribuído a uma pessoa por vez), por isso é incluída aqui,
// só com um rótulo mais claro que o "&nbsp;" original.
export function parseOpcoesAtribuicao(doc: Document): OpcaoAtribuicao[] {
  const opcoes = Array.from(doc.querySelectorAll<HTMLOptionElement>('#selAtribuicao option'))
  return opcoes
    .filter((opcao) => opcao.value !== '')
    .map((opcao) => ({
      id: opcao.value,
      nome: opcao.value === 'null' ? ROTULO_NINGUEM : opcao.textContent?.trim() ?? '',
    }))
}

export function parseFormularioAtribuicao(
  doc: Document
): { actionUrl: string; campos: Record<string, string> } | null {
  const form = doc.getElementById('frmAtividadeAtribuir')
  if (!form) return null

  const campos: Record<string, string> = {}
  Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).forEach((input) => {
    if (input.name) campos[input.name] = input.value
  })

  return { actionUrl: form.getAttribute('action') ?? '', campos }
}

export function montarCorpoConfirmacaoAtribuicao(
  campos: Record<string, string>,
  pessoaEscolhida: string,
  botao: { nome: string; valor: string }
): URLSearchParams {
  const corpo: Record<string, string> = { ...campos, selAtribuicao: pessoaEscolhida }
  corpo[botao.nome] = botao.valor
  return new URLSearchParams(corpo)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/atribuicaoRapida.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/controle-processos/atribuicaoRapida.ts src/features/controle-processos/atribuicaoRapida.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona lógica pura de atribuição rápida

parseOpcoesAtribuicao lê #selAtribuicao (select nativo, sem widget
customizado -- confirmado com HTML real), incluindo "Ninguém" como
opção válida (desatribuir), não um placeholder. parseFormularioAtribuicao
+ montarCorpoConfirmacaoAtribuicao seguem o mesmo padrão genérico já
usado pelo marcador rápido.
EOF
)"
```

---

## Task 3: Bridge de main-world (`pontePrincipal.ts` + `pontePrincipalMain.ts`)

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/pontePrincipal.ts`
- Modify: `src/content-scripts/procedimento_controlar/pontePrincipalMain.ts`
- Test: `src/content-scripts/procedimento_controlar/pontePrincipal.test.ts`

**Interfaces:**
- Consumes: `EVENTO_CLIQUE_ATRIBUICAO_RAPIDA`, `DetalheCliqueAtribuicaoRapida` (Task 1).
- Produces: `criarPonteAtribuicaoRapidaMainWorld(documentoGlobal: Document, janelaGlobal: Window):
  { destruir: () => void }` — usada só por `pontePrincipalMain.ts` (não por outra task).

- [ ] **Step 1: Adicionar os testes**

No final de `pontePrincipal.test.ts` (depois do `describe('criarPonteMarcadorRapidoMainWorld', ...)`
já existente), adicionar:

```ts
import { criarPonteAtribuicaoRapidaMainWorld } from './pontePrincipal'
import { EVENTO_CLIQUE_ATRIBUICAO_RAPIDA } from './protocoloAtribuicaoRapida'
import type { DetalheCliqueAtribuicaoRapida } from './protocoloAtribuicaoRapida'

function montarPaginaAtribuicao(qtdMarcadosRecebidos: number): void {
  const checkboxesRecebidos = Array.from({ length: 3 }, (_, i) => {
    const marcado = i < qtdMarcadosRecebidos
    return `<td><input type="checkbox" value="${100 + i}" ${marcado ? 'checked' : ''} /></td>`
  }).join('')

  document.body.innerHTML = `
    <div id="divComandos">
      <a onclick="/* procedimento_atribuicao_cadastrar */">Atribuição de Processos</a>
    </div>
    <table id="tblProcessosDetalhado"><tbody></tbody></table>
    <table id="tblProcessosGerados"><tbody></tbody></table>
    <table id="tblProcessosRecebidos"><tbody><tr>${checkboxesRecebidos}</tr></tbody></table>
  `
}

function clicarLinkAtribuicao(): { defaultPrevented: boolean } {
  const link = document.querySelector<HTMLAnchorElement>('#divComandos a')
  if (!link) throw new Error('link não encontrado')
  const evento = new MouseEvent('click', { bubbles: true, cancelable: true })
  link.dispatchEvent(evento)
  return { defaultPrevented: evento.defaultPrevented }
}

describe('criarPonteAtribuicaoRapidaMainWorld', () => {
  let pontesCriadas: Array<{ destruir: () => void }> = []

  function criarPonte(): { destruir: () => void } {
    const ponte = criarPonteAtribuicaoRapidaMainWorld(document, window)
    pontesCriadas.push(ponte)
    return ponte
  }

  afterEach(() => {
    pontesCriadas.forEach((ponte) => ponte.destruir())
    pontesCriadas = []
    document.body.innerHTML = ''
  })

  it('intercepta (preventDefault + evento customizado) quando 1 checkbox está marcado', () => {
    montarPaginaAtribuicao(1)
    let detalheRecebido: DetalheCliqueAtribuicaoRapida | null = null
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueAtribuicaoRapida>).detail
    })

    criarPonte()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ quantidade: 1 })
  })

  it('não intercepta (deixa o comportamento nativo) quando 0 checkboxes estão marcados', () => {
    montarPaginaAtribuicao(0)
    let disparou = false
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, () => {
      disparou = true
    })

    criarPonte()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(false)
    expect(disparou).toBe(false)
  })

  it('intercepta também quando 2+ checkboxes estão marcados, com a quantidade certa (bulk)', () => {
    montarPaginaAtribuicao(2)
    let detalheRecebido: DetalheCliqueAtribuicaoRapida | null = null
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, (evento) => {
      detalheRecebido = (evento as CustomEvent<DetalheCliqueAtribuicaoRapida>).detail
    })

    criarPonte()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(true)
    expect(detalheRecebido).toEqual({ quantidade: 2 })
  })

  it('destruir() remove o listener, voltando ao comportamento nativo', () => {
    montarPaginaAtribuicao(1)
    let disparou = false
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, () => {
      disparou = true
    })

    const ponte = criarPonte()
    ponte.destruir()
    const resultado = clicarLinkAtribuicao()

    expect(resultado.defaultPrevented).toBe(false)
    expect(disparou).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/content-scripts/procedimento_controlar/pontePrincipal.test.ts`
Expected: FAIL — `criarPonteAtribuicaoRapidaMainWorld` não exportada.

- [ ] **Step 3: Implementar em `pontePrincipal.ts`**

Adicionar ao import do topo do arquivo (que hoje importa só de `./protocoloMarcadorRapido`):

```ts
import { EVENTO_CLIQUE_ATRIBUICAO_RAPIDA } from './protocoloAtribuicaoRapida'
import type { DetalheCliqueAtribuicaoRapida } from './protocoloAtribuicaoRapida'
```

E, no final do arquivo (depois de `criarPonteMarcadorRapidoMainWorld`), adicionar:

```ts
export interface PonteAtribuicaoRapidaMainWorld {
  destruir: () => void
}

// Mesmo motivo do bridge de marcador (ver comentário acima): a interceptação (contagem de
// selecionados) e o preventDefault/stopImmediatePropagation do onclick nativo precisam acontecer
// aqui, no main world -- um listener do isolated world não impede o onclick inline de rodar.
export function criarPonteAtribuicaoRapidaMainWorld(
  documentoGlobal: Document,
  janelaGlobal: Window
): PonteAtribuicaoRapidaMainWorld {
  function tratarClique(evento: Event): void {
    const alvo = (evento as MouseEvent).target
    if (!(alvo instanceof Element)) return

    const link = alvo.closest<HTMLAnchorElement>(
      '#divComandos a[onclick*="procedimento_atribuicao_cadastrar"]'
    )
    if (!link) return

    const quantidade = contarCheckboxesMarcados(documentoGlobal)
    if (quantidade < 1) return

    evento.preventDefault()
    evento.stopImmediatePropagation()

    const detalhe: DetalheCliqueAtribuicaoRapida = { quantidade }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, { detail: detalhe }))
  }

  documentoGlobal.addEventListener('click', tratarClique, true)

  return {
    destruir(): void {
      documentoGlobal.removeEventListener('click', tratarClique, true)
    },
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/content-scripts/procedimento_controlar/pontePrincipal.test.ts`
Expected: PASS (todos os `describe`, incluindo `criarPonteAtribuicaoRapidaMainWorld`).

- [ ] **Step 5: Atualizar `pontePrincipalMain.ts`**

Trocar:

```ts
import { criarPonteMarcadorRapidoMainWorld } from './pontePrincipal'

criarPonteMarcadorRapidoMainWorld(document, window)
```

por:

```ts
import { criarPonteAtribuicaoRapidaMainWorld, criarPonteMarcadorRapidoMainWorld } from './pontePrincipal'

criarPonteMarcadorRapidoMainWorld(document, window)
criarPonteAtribuicaoRapidaMainWorld(document, window)
```

- [ ] **Step 6: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/procedimento_controlar/pontePrincipal.ts src/content-scripts/procedimento_controlar/pontePrincipal.test.ts src/content-scripts/procedimento_controlar/pontePrincipalMain.ts
git commit -m "$(cat <<'EOF'
feat: bridge de main-world pra atribuição rápida

Reaproveita o mesmo entry point world:MAIN já usado pelo marcador
rápido (pontePrincipalMain.ts) -- sem manifest/vite novo. Intercepta
#divComandos a[onclick*="procedimento_atribuicao_cadastrar"], conta
checkboxes marcados (reaproveita contarCheckboxesMarcados já
existente), só age com 1+ selecionados.
EOF
)"
```

---

## Task 4: Popup, confirmação e clique real (`content-scripts/procedimento_controlar/index.ts`)

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `OpcaoAtribuicao`, `parseOpcoesAtribuicao`, `parseFormularioAtribuicao`,
  `montarCorpoConfirmacaoAtribuicao` (Task 2); `EVENTO_CLIQUE_ATRIBUICAO_RAPIDA`,
  `DetalheCliqueAtribuicaoRapida` (Task 1); `extrairUrlDeOnclick` (já importado de
  `marcadorRapido.ts`).
- Produces: nada consumido por outra task (última peça do wiring).

Sem teste automatizado (mesmo padrão já estabelecido no arquivo pra essa classe de wiring/popup —
ver `abrirPopupMarcador`/`montarMarcadorRapido` do marcador, também sem teste). Feito como uma task
só (popup + clique real), não dividida, porque as duas partes só fazem sentido conectadas — não há
teste automatizado que valide o popup sozinho antes do clique estar ligado.

- [ ] **Step 1: Adicionar os imports no topo do arquivo**

Logo abaixo do import existente de `marcadorRapido`:

```ts
import {
  montarCorpoConfirmacaoAtribuicao,
  parseFormularioAtribuicao,
  parseOpcoesAtribuicao,
  type OpcaoAtribuicao,
} from '../../features/controle-processos/atribuicaoRapida'
```

Logo abaixo do import de `protocoloMarcadorRapido`:

```ts
import { EVENTO_CLIQUE_ATRIBUICAO_RAPIDA } from './protocoloAtribuicaoRapida'
import type { DetalheCliqueAtribuicaoRapida } from './protocoloAtribuicaoRapida'
```

(`userIconSvg` já está importado no topo do arquivo — reaproveitado, sem import novo.)

- [ ] **Step 2: Adicionar o CSS do select nativo**

Em `ESTILO_FILTROS_E_ESPECIFICACAO`, logo antes do fechamento da template string (depois da regra
`.seirmg-marcador-rapido-btn-primario:hover`), adicionar:

```css
  .seirmg-atribuicao-rapida-select {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid #dbe9fb;
    background: #f5faff;
    border-radius: 8px;
    font: inherit;
    font-size: 13.5px;
  }
```

(As demais classes do popup -- fundo/popup/header/icone/titulo/subtitulo/corpo/erro/rodape/btn --
são reaproveitadas diretamente do marcador, sem duplicar CSS.)

- [ ] **Step 3: Adicionar a constante de ação e o estado do popup**

Logo depois de `ACAO_REMOVER_MARCADOR` (antes de `let popupMarcadorRapidoAtual`), adicionar:

```ts
const ACAO_ATRIBUICAO = {
  botao: { nome: 'sbmSalvar', valor: 'Salvar' },
  tituloPopup: 'Atribuir Processo',
  iconeSvg: userIconSvg,
}

let popupAtribuicaoRapidaAtual: HTMLElement | null = null

function fecharPopupAtribuicaoRapida(): void {
  popupAtribuicaoRapidaAtual?.remove()
  popupAtribuicaoRapidaAtual = null
}
```

- [ ] **Step 4: Adicionar `confirmarAtribuicao` e `abrirPopupAtribuicao`**

Logo depois do bloco do Step 3:

```ts
async function confirmarAtribuicao(
  formularioAtribuicao: { actionUrl: string; campos: Record<string, string> },
  pessoaEscolhida: string,
  erro: HTMLElement
): Promise<void> {
  try {
    const corpo = montarCorpoConfirmacaoAtribuicao(
      formularioAtribuicao.campos,
      pessoaEscolhida,
      ACAO_ATRIBUICAO.botao
    )
    const urlConfirmacao = new URL(formularioAtribuicao.actionUrl, window.location.href).href
    const resultado = await fetchText(urlConfirmacao, { method: 'POST', body: corpo })
    if (!resultado.ok) {
      erro.textContent = 'Falha ao salvar a atribuição. Tente novamente.'
      erro.style.display = ''
      return
    }

    // Mesma decisão já validada pelo marcador rápido: recarregar a página inteira em vez de
    // tentar atualizar só a linha ao vivo (adoptNode/innerHTML deixavam o checkbox invisível).
    window.location.reload()
  } catch (error) {
    console.error('[SEIRMG] Falha ao confirmar atribuição:', error)
    erro.textContent = 'Falha ao salvar a atribuição. Tente novamente.'
    erro.style.display = ''
  }
}

function abrirPopupAtribuicao(
  opcoes: OpcaoAtribuicao[],
  formularioAtribuicao: { actionUrl: string; campos: Record<string, string> },
  quantidade: number
): void {
  fecharPopupAtribuicaoRapida()

  const fundo = document.createElement('div')
  fundo.className = 'seirmg-marcador-rapido-fundo'
  fundo.addEventListener('click', fecharPopupAtribuicaoRapida)

  const popup = document.createElement('div')
  popup.className = 'seirmg-marcador-rapido-popup'
  popup.addEventListener('click', (evento) => evento.stopPropagation())

  const header = document.createElement('div')
  header.className = 'seirmg-marcador-rapido-header'

  const icone = document.createElement('div')
  icone.className = 'seirmg-marcador-rapido-icone'
  icone.innerHTML = ACAO_ATRIBUICAO.iconeSvg
  header.appendChild(icone)

  const titulos = document.createElement('div')
  const titulo = document.createElement('strong')
  titulo.className = 'seirmg-marcador-rapido-titulo'
  titulo.textContent = ACAO_ATRIBUICAO.tituloPopup
  const subtitulo = document.createElement('p')
  subtitulo.className = 'seirmg-marcador-rapido-subtitulo'
  subtitulo.textContent = textoQuantidadeProcessos(quantidade)
  titulos.append(titulo, subtitulo)
  header.appendChild(titulos)
  popup.appendChild(header)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-marcador-rapido-corpo'

  const erro = document.createElement('div')
  erro.className = 'seirmg-marcador-rapido-erro'
  erro.style.display = 'none'
  corpo.appendChild(erro)

  const select = document.createElement('select')
  select.className = 'seirmg-atribuicao-rapida-select'
  opcoes.forEach((opcao) => {
    select.appendChild(new Option(opcao.nome, opcao.id))
  })
  corpo.appendChild(select)

  popup.appendChild(corpo)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-marcador-rapido-rodape'

  const botaoCancelar = document.createElement('button')
  botaoCancelar.type = 'button'
  botaoCancelar.className = 'seirmg-marcador-rapido-btn seirmg-marcador-rapido-btn-secundario'
  botaoCancelar.textContent = 'Cancelar'
  botaoCancelar.addEventListener('click', fecharPopupAtribuicaoRapida)
  rodape.appendChild(botaoCancelar)

  const botaoConfirmar = document.createElement('button')
  botaoConfirmar.type = 'button'
  botaoConfirmar.className = 'seirmg-marcador-rapido-btn seirmg-marcador-rapido-btn-primario'
  botaoConfirmar.textContent = 'Atribuir'
  botaoConfirmar.addEventListener('click', () => {
    botaoConfirmar.disabled = true
    confirmarAtribuicao(formularioAtribuicao, select.value, erro).finally(() => {
      botaoConfirmar.disabled = false
    })
  })
  rodape.appendChild(botaoConfirmar)

  popup.appendChild(rodape)
  fundo.appendChild(popup)
  document.body.appendChild(fundo)

  popupAtribuicaoRapidaAtual = fundo
}
```

- [ ] **Step 5: Adicionar `processarClickAtribuicao` e `montarAtribuicaoRapida`**

Logo depois de `montarMarcadorRapido()` (antes de `async function bootstrap()`):

```ts
async function processarClickAtribuicao(link: HTMLAnchorElement, quantidade: number): Promise<void> {
  const urlRelativa = extrairUrlDeOnclick(link.getAttribute('onclick') ?? '')
  if (!urlRelativa) {
    console.error('[SEIRMG] Não foi possível extrair a URL do link de atribuição.')
    return
  }
  const url = new URL(urlRelativa, window.location.href).href

  const formPagina = document.getElementById('frmProcedimentoControlar') as HTMLFormElement | null
  if (!formPagina) return

  const resultadoTela = await fetchText(url, {
    method: 'POST',
    body: new URLSearchParams(extrairCamposOcultos(formPagina)),
  })
  if (!resultadoTela.ok) {
    console.error('[SEIRMG] Falha ao buscar tela de atribuição:', resultadoTela.error)
    return
  }

  const docTela = new DOMParser().parseFromString(resultadoTela.data, 'text/html')
  const opcoes = parseOpcoesAtribuicao(docTela)
  const formularioAtribuicao = parseFormularioAtribuicao(docTela)
  if (!formularioAtribuicao) {
    console.error('[SEIRMG] Formulário de atribuição não encontrado na tela retornada.')
    return
  }

  abrirPopupAtribuicao(opcoes, formularioAtribuicao, quantidade)
}

function montarAtribuicaoRapida(): void {
  try {
    window.addEventListener(EVENTO_CLIQUE_ATRIBUICAO_RAPIDA, (evento) => {
      const { quantidade } = (evento as CustomEvent<DetalheCliqueAtribuicaoRapida>).detail

      const link = document.querySelector<HTMLAnchorElement>(
        '#divComandos a[onclick*="procedimento_atribuicao_cadastrar"]'
      )
      if (!link) return

      processarClickAtribuicao(link, quantidade).catch((error) => {
        console.error('[SEIRMG] Falha ao processar clique de atribuição rápida:', error)
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar atribuição rápida:', error)
  }
}
```

- [ ] **Step 6: Chamar a partir do `bootstrap()`**

Trocar:

```ts
    montarMarcadorRapido()
```

por:

```ts
    montarMarcadorRapido()
    montarAtribuicaoRapida()
```

- [ ] **Step 7: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 9: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros.

- [ ] **Step 10: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "$(cat <<'EOF'
feat: popup de atribuição rápida de processo, sem trocar de tela

Reaproveita o bridge de main-world e a casca visual/CSS do popup do
marcador rápido. #selAtribuicao é um <select> nativo (sem widget
customizado), bulk já funciona nativamente (hdnIdProtocolo em lote,
separado por vírgula), e "Ninguém" é uma opção real (desatribuir),
não um placeholder -- sem validação de "selecione alguém".
EOF
)"
```

---

## Task 5: Verificação final + documentação

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `cd C:\sei\seirmg && npx vitest run`
Expected: todos os testes passam (incluindo os novos de `atribuicaoRapida.test.ts` e
`pontePrincipal.test.ts`).

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 4: Build final**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 5: Adicionar entrada no ROADMAP-LOTES.md**

Em `docs/ROADMAP-LOTES.md`, na seção "Já entregue", logo depois da entrada "Checagem oportunista de
Bloco de Assinatura" (última entrada da lista), adicionar:

```
- **Atribuição rápida — atribuir processo(s) a uma pessoa via popup, sem trocar de tela** — spec
  `docs/superpowers/specs/2026-07-17-seirmg-atribuicao-rapida-design.md`, plano
  `docs/superpowers/plans/2026-07-17-seirmg-atribuicao-rapida.md`. Mesmo padrão do marcador rápido
  (popup central em vez de navegar pra tela cheia "Atribuir Processo"), mas mais simples:
  `#selAtribuicao` é um `<select>` nativo de verdade (sem widget customizado), e o bulk (vários
  processos pra mesma pessoa) já funciona nativamente -- `hdnIdProtocolo` vem como string separada
  por vírgula quando 2+ processos estão marcados, sem lógica extra do nosso lado. Reaproveita o
  mesmo bridge de main-world (`pontePrincipalMain.ts`) e a mesma casca visual/CSS do popup do
  marcador, sem duplicar. **Decisão importante confirmada pelo usuário:** a opção em branco do
  select nativo (`value="null"`) não é um placeholder de "nada escolhido" -- é uma opção real,
  "Ninguém" (desatribuir), já que um processo só pode estar atribuído a uma pessoa por vez
  (atribuir pra outra tira a anterior automaticamente); o select sempre abre nessa opção por
  padrão, mesmo em processos já atribuídos (não pré-seleciona a pessoa atual). Por isso o popup não
  tem validação de "selecione alguém" -- confirmar direto em "Ninguém" é um caso de uso válido. ⚠️
  **Pendente de validação manual numa instância SEI real** — mesmo tratamento de risco do marcador
  rápido (duas chamadas de rede em sequência via `fetchText`, interceptação main-world).
```

- [ ] **Step 6: Commit**

```bash
cd C:\sei\seirmg
git add docs/ROADMAP-LOTES.md
git commit -m "$(cat <<'EOF'
docs: registra atribuição rápida de processo como entregue

Atribuir processo(s) a uma pessoa via popup, sem trocar de tela --
mesmo padrão do marcador rápido, reaproveitando o bridge de
main-world e a casca visual do popup.
EOF
)"
```

- [ ] **Step 7: Verificação manual (⚠️ requer instância SEI real)**

Carregar `dist/` como extensão descompactada no Chrome, abrir uma instância SEI real, ir em
Controle de Processos e confirmar:

- Marcar 1 processo e clicar em "Atribuição de Processos" abre o popup (não navega pra tela cheia).
- O select do popup lista as pessoas reais da unidade + "Ninguém (remover atribuição)".
- Escolher uma pessoa e confirmar atribui de verdade (checar na coluna "Atribuição" da tabela após
  o reload).
- Marcar 2+ processos e confirmar atribui todos de uma vez pra mesma pessoa.
- Escolher "Ninguém (remover atribuição)" e confirmar desatribui de verdade.
- Marcar 0 processos: o link volta a se comportar nativamente (navega pra tela cheia).
- Cancelar fecha o popup sem fazer nenhuma requisição.
