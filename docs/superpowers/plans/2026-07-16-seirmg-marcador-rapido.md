# SEIRMG — Adicionar/Remover Marcador sem trocar de tela — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando exatamente um processo estiver selecionado em Controle de Processos, os links "Adicionar Marcador"/"Remover Marcador" abrem um popup central (dropdown de marcador) em vez de navegar pra uma tela cheia — sem sair da lista. Com 0 ou 2+ selecionados, o comportamento nativo continua exatamente igual.

**Architecture:** Lógica pura e testada em `features/controle-processos/marcadorRapido.ts` (extrai URL de `onclick`, parseia as opções do dropdown customizado `#selMarcador`, parseia o formulário da tela intermediária, monta o corpo da confirmação). Wiring de DOM em `content-scripts/procedimento_controlar/index.ts`: reescreve o atributo `onclick` dos dois links (mesmo padrão já usado por `montarConfirmarAntesDeConcluir`) pra decidir em tempo de clique entre nosso fluxo (popup) ou o fallback nativo original.

**Tech Stack:** TypeScript, Vitest (jsdom), Vite/CRXJS (extensão Chrome MV3). Sem dependências novas.

## Global Constraints

- `tsconfig.json` tem `noUnusedParameters: true` e `noUnusedLocals: true` — nenhum parâmetro ou variável pode ficar sem uso (prefixo `_` se for descartável).
- Todo wiring de DOM em `content-scripts/` segue o padrão já estabelecido no arquivo: `try/catch` com `console.error('[SEIRMG] ...', error)`, nunca lança.
- Lógica pura testada em `features/`; wiring de DOM sem teste automatizado (mesmo padrão já estabelecido no projeto — verificado via `tsc`/`eslint`/build e depois manualmente no SEI real).
- Escopo: só um processo por vez (0 ou 2+ selecionados caem no fluxo nativo original, inalterado).
- Popup é central (`position: fixed` + overlay), cobre adicionar e remover.

---

## Task 1: `extrairUrlDeOnclick` em `marcadorRapido.ts`

**Files:**
- Create: `src/features/controle-processos/marcadorRapido.ts`
- Test: `src/features/controle-processos/marcadorRapido.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `extrairUrlDeOnclick(onclick: string): string | null` — usada pela Task 5 (wiring) pra extrair a URL do link nativo.

- [ ] **Step 1: Criar o arquivo de teste**

Criar `src/features/controle-processos/marcadorRapido.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairUrlDeOnclick } from './marcadorRapido'

describe('extrairUrlDeOnclick', () => {
  it('extrai a primeira string entre aspas simples de um onclick válido', () => {
    const onclick =
      "return acaoControleProcessos('controlador.php?acao=andamento_marcador_cadastrar&infra_hash=abc', true, true);"
    expect(extrairUrlDeOnclick(onclick)).toBe(
      'controlador.php?acao=andamento_marcador_cadastrar&infra_hash=abc'
    )
  })

  it('retorna null quando não há aspas simples', () => {
    expect(extrairUrlDeOnclick('return algumaFuncao(true, true);')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(extrairUrlDeOnclick('')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: FAIL — módulo `./marcadorRapido` não existe.

- [ ] **Step 3: Criar `marcadorRapido.ts` com `extrairUrlDeOnclick`**

Criar `src/features/controle-processos/marcadorRapido.ts`:

```ts
export function extrairUrlDeOnclick(onclick: string): string | null {
  const match = onclick.match(/'([^']*)'/)
  return match ? match[1] : null
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona extrairUrlDeOnclick para marcador rápido

Primeira função pura do recurso de adicionar/remover marcador sem
trocar de tela (docs/superpowers/specs/2026-07-15-seirmg-marcador-rapido-design.md).
EOF
)"
```

---

## Task 2: `parseOpcoesMarcador`

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts`
- Test: `src/features/controle-processos/marcadorRapido.test.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `interface OpcaoMarcador { id: string; nome: string; icone: string }` e `parseOpcoesMarcador(doc: Document): OpcaoMarcador[]` — usada pela Task 5 (popula o `<select>` do popup).

- [ ] **Step 1: Adicionar os testes**

Adicionar ao final de `marcadorRapido.test.ts`:

```ts
import { parseOpcoesMarcador } from './marcadorRapido'

function criarDocComDropdownMarcador(opcoesHtml: string): Document {
  return new DOMParser().parseFromString(
    `<div id="selMarcador" class="dd-container"><ul class="dd-options">${opcoesHtml}</ul></div>`,
    'text/html'
  )
}

describe('parseOpcoesMarcador', () => {
  it('lê as opções do widget customizado, ignorando o placeholder "null"', () => {
    const doc = criarDocComDropdownMarcador(`
      <li><a class="dd-option">
        <input class="dd-option-value" type="hidden" value="null" />
        <label class="dd-option-text">Selecione</label>
      </a></li>
      <li><a class="dd-option">
        <input class="dd-option-value" type="hidden" value="3" />
        <img class="dd-option-image" src="marcador3.png" />
        <label class="dd-option-text">Urgente</label>
      </a></li>
      <li><a class="dd-option">
        <input class="dd-option-value" type="hidden" value="7" />
        <img class="dd-option-image" src="marcador7.png" />
        <label class="dd-option-text">Aguardando</label>
      </a></li>
    `)

    expect(parseOpcoesMarcador(doc)).toEqual([
      { id: '3', nome: 'Urgente', icone: 'marcador3.png' },
      { id: '7', nome: 'Aguardando', icone: 'marcador7.png' },
    ])
  })

  it('retorna lista vazia quando não há nenhuma opção', () => {
    const doc = criarDocComDropdownMarcador('')
    expect(parseOpcoesMarcador(doc)).toEqual([])
  })

  it('retorna lista vazia quando o widget #selMarcador não existe no documento', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(parseOpcoesMarcador(doc)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: FAIL — `parseOpcoesMarcador` não exportada.

- [ ] **Step 3: Implementar em `marcadorRapido.ts`**

Adicionar, logo abaixo de `extrairUrlDeOnclick`:

```ts
export interface OpcaoMarcador {
  id: string
  nome: string
  icone: string
}

export function parseOpcoesMarcador(doc: Document): OpcaoMarcador[] {
  const opcoes = Array.from(doc.querySelectorAll('#selMarcador .dd-options .dd-option'))
  return opcoes
    .map((opcao) => ({
      id: opcao.querySelector<HTMLInputElement>('.dd-option-value')?.value ?? '',
      nome: opcao.querySelector('.dd-option-text')?.textContent?.trim() ?? '',
      icone: opcao.querySelector<HTMLImageElement>('.dd-option-image')?.getAttribute('src') ?? '',
    }))
    .filter((opcao) => opcao.id !== '' && opcao.id !== 'null')
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona parseOpcoesMarcador (widget customizado #selMarcador)

Lê o dropdown de marcador (não é <select> nativo — widget dd-container
confirmado em HTML real de produção), ignorando o placeholder "null".
EOF
)"
```

---

## Task 3: `parseFormularioMarcador`

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts`
- Test: `src/features/controle-processos/marcadorRapido.test.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `parseFormularioMarcador(doc: Document, idFormulario: string): { actionUrl: string; campos: Record<string, string> } | null` — usada pela Task 5 pra ler a tela intermediária (`frmAndamentoMarcadorCadastro`/`frmAndamentoMarcadorRemocao`).

- [ ] **Step 1: Adicionar os testes**

Adicionar ao final de `marcadorRapido.test.ts`:

```ts
import { parseFormularioMarcador } from './marcadorRapido'

describe('parseFormularioMarcador', () => {
  it('lê action e campos ocultos do formulário de Adicionar Marcador', () => {
    const doc = new DOMParser().parseFromString(
      `<form id="frmAndamentoMarcadorCadastro" action="controlador.php?acao=andamento_marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&id_procedimento=123&infra_hash=abc">
        <input type="hidden" id="hdnIdMarcador" name="hdnIdMarcador" value="" />
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="456" />
        <textarea id="txaTexto" name="txaTexto"></textarea>
      </form>`,
      'text/html'
    )

    expect(parseFormularioMarcador(doc, 'frmAndamentoMarcadorCadastro')).toEqual({
      actionUrl:
        'controlador.php?acao=andamento_marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&id_procedimento=123&infra_hash=abc',
      campos: { hdnIdMarcador: '', hdnIdProtocolo: '456' },
    })
  })

  it('lê o formulário de Remoção com hdnIdMarcador já pré-preenchido', () => {
    const doc = new DOMParser().parseFromString(
      `<form id="frmAndamentoMarcadorRemocao" action="controlador.php?acao=andamento_marcador_remover&id_procedimento=123&infra_hash=xyz">
        <input type="hidden" id="hdnIdMarcador" name="hdnIdMarcador" value="3" />
        <input type="hidden" id="hdnIdProtocolo" name="hdnIdProtocolo" value="456" />
      </form>`,
      'text/html'
    )

    expect(parseFormularioMarcador(doc, 'frmAndamentoMarcadorRemocao')).toEqual({
      actionUrl: 'controlador.php?acao=andamento_marcador_remover&id_procedimento=123&infra_hash=xyz',
      campos: { hdnIdMarcador: '3', hdnIdProtocolo: '456' },
    })
  })

  it('retorna null quando o formulário não é encontrado', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(parseFormularioMarcador(doc, 'frmAndamentoMarcadorCadastro')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: FAIL — `parseFormularioMarcador` não exportada.

- [ ] **Step 3: Implementar em `marcadorRapido.ts`**

Adicionar, logo abaixo de `parseOpcoesMarcador`:

```ts
export function parseFormularioMarcador(
  doc: Document,
  idFormulario: string
): { actionUrl: string; campos: Record<string, string> } | null {
  const form = doc.getElementById(idFormulario)
  if (!form) return null

  const campos: Record<string, string> = {}
  Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).forEach((input) => {
    if (input.name) campos[input.name] = input.value
  })

  return { actionUrl: form.getAttribute('action') ?? '', campos }
}
```

Nota: diferente de `extrairCamposOcultos` (`rolagemInfinita.ts`), aqui **todos** os hidden inputs com `name`
contam — não só os que têm `hdn` no `id` — porque a tela de marcador tem campos como `hdnIdProtocolo` que
também precisam seguir pra confirmação.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona parseFormularioMarcador

Lê action + todos os hidden inputs com name da tela intermediária
(Adicionar ou Remoção de Marcador) — o action tem hash diferente do
link original da barra de ícones, por isso precisa ser lido de novo.
EOF
)"
```

---

## Task 4: `montarCorpoConfirmacao`

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts`
- Test: `src/features/controle-processos/marcadorRapido.test.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `montarCorpoConfirmacao(campos: Record<string, string>, marcadorEscolhido: string, texto: string, botao: { nome: string; valor: string }): URLSearchParams` — usada pela Task 5 no POST de confirmação.

- [ ] **Step 1: Adicionar os testes**

Adicionar ao final de `marcadorRapido.test.ts`:

```ts
import { montarCorpoConfirmacao } from './marcadorRapido'

describe('montarCorpoConfirmacao', () => {
  it('sobrescreve hdnIdMarcador com o valor escolhido e inclui o botão de confirmação', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '', hdnIdProtocolo: '456' },
      '3',
      '',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(Object.fromEntries(corpo)).toEqual({
      hdnIdMarcador: '3',
      hdnIdProtocolo: '456',
      sbmSalvar: 'Salvar',
    })
  })

  it('inclui txaTexto quando há texto', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '', hdnIdProtocolo: '456' },
      '3',
      'Observação qualquer',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(Object.fromEntries(corpo)).toEqual({
      hdnIdMarcador: '3',
      hdnIdProtocolo: '456',
      txaTexto: 'Observação qualquer',
      sbmSalvar: 'Salvar',
    })
  })

  it('não inclui txaTexto quando o texto é vazio', () => {
    const corpo = montarCorpoConfirmacao({ hdnIdMarcador: '' }, '3', '', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })
    expect(corpo.has('txaTexto')).toBe(false)
  })

  it('sobrescreve um hdnIdMarcador já preenchido (fluxo de remoção)', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '3', hdnIdProtocolo: '456' },
      '7',
      '',
      { nome: 'sbmRemover', valor: 'Remover' }
    )

    expect(Object.fromEntries(corpo)).toEqual({
      hdnIdMarcador: '7',
      hdnIdProtocolo: '456',
      sbmRemover: 'Remover',
    })
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: FAIL — `montarCorpoConfirmacao` não exportada.

- [ ] **Step 3: Implementar em `marcadorRapido.ts`**

Adicionar, logo abaixo de `parseFormularioMarcador`:

```ts
export function montarCorpoConfirmacao(
  campos: Record<string, string>,
  marcadorEscolhido: string,
  texto: string,
  botao: { nome: string; valor: string }
): URLSearchParams {
  const corpo: Record<string, string> = { ...campos, hdnIdMarcador: marcadorEscolhido }
  if (texto) corpo.txaTexto = texto
  corpo[botao.nome] = botao.valor
  return new URLSearchParams(corpo)
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd C:\sei\seirmg && npx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS (todos os `describe` do arquivo).

- [ ] **Step 5: Commit**

```bash
cd C:\sei\seirmg
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "$(cat <<'EOF'
feat: adiciona montarCorpoConfirmacao

Fecha a lógica pura do marcador rápido: monta o corpo do POST de
confirmação a partir dos campos da tela intermediária, sobrescrevendo
hdnIdMarcador com a escolha do usuário no popup.
EOF
)"
```

---

## Task 5: Wiring em `content-scripts/procedimento_controlar/index.ts`

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes:
  - `extrairUrlDeOnclick(onclick: string): string | null` (Task 1)
  - `OpcaoMarcador`, `parseOpcoesMarcador(doc: Document): OpcaoMarcador[]` (Task 2)
  - `parseFormularioMarcador(doc: Document, idFormulario: string): { actionUrl: string; campos: Record<string, string> } | null` (Task 3)
  - `montarCorpoConfirmacao(...): URLSearchParams` (Task 4)
  - `extrairCamposOcultos(form: HTMLFormElement): Record<string, string>` (já existe, `rolagemInfinita.ts`)
  - `fetchText`, `reaplicarTratamentosNasLinhasNovas`, `IDS_TABELAS`, `SyncConfig` (já existem no próprio arquivo)
- Produces: nada consumido por outra task (content script final, sem exports).

Sem teste automatizado (wiring de DOM, mesmo padrão já estabelecido no resto deste arquivo) — verificado via
`tsc`/`eslint`/build nesta task, e manualmente numa instância SEI real na Task 6.

⚠️ **Por que reescrever o atributo `onclick` em vez de `addEventListener`:** o link nativo já tem
`onclick="return acaoControleProcessos(...)"` desde o parse do HTML da página — isso vira um listener
registrado *antes* de qualquer `addEventListener` que o content script adicionar depois. Um
`addEventListener('click', ...)` sempre dispararia **depois** do `onclick` original e não impediria a
navegação nativa de já ter acontecido. Por isso a interceptação usa a mesma técnica que
`montarConfirmarAntesDeConcluir` já usa neste arquivo: reescreve a string do atributo `onclick` com um
`if/else`, preservando o `onclick` original inteiro como fallback exato pro caso de 0 ou 2+ selecionados.

- [ ] **Step 1: Atualizar o import do topo do arquivo**

Trocar:

```ts
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
```

por:

```ts
import {
  extrairCamposOcultos,
  extrairLinhasValidas,
  extrairNroItens,
} from '../../features/controle-processos/rolagemInfinita'
import {
  extrairUrlDeOnclick,
  montarCorpoConfirmacao,
  parseFormularioMarcador,
  parseOpcoesMarcador,
  type OpcaoMarcador,
} from '../../features/controle-processos/marcadorRapido'
```

- [ ] **Step 2: Adicionar o CSS do popup**

No template literal `ESTILO_FILTROS_E_ESPECIFICACAO`, trocar a linha final (fechamento do backtick):

```ts
  .seirmg-favoritos-vazio {
    color: #aaa;
    font-style: italic;
  }
`
```

por:

```ts
  .seirmg-favoritos-vazio {
    color: #aaa;
    font-style: italic;
  }
  .seirmg-marcador-rapido-fundo {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .35);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .seirmg-marcador-rapido-popup {
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
    padding: 16px;
    width: 360px;
    max-width: 90vw;
  }
  .seirmg-marcador-rapido-titulo {
    font-weight: bold;
    margin-bottom: 10px;
  }
  .seirmg-marcador-rapido-erro {
    color: #c0392b;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .seirmg-marcador-rapido-select {
    width: 100%;
    margin-bottom: 10px;
    box-sizing: border-box;
  }
  .seirmg-marcador-rapido-textarea {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 10px;
    min-height: 60px;
  }
  .seirmg-marcador-rapido-acoes {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .seirmg-marcador-rapido-mensagem {
    position: fixed;
    z-index: 2002;
    background: #2ecc71;
    color: #fff;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 13px;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
  }
`
```

- [ ] **Step 3: Adicionar toda a lógica nova, logo antes de `async function bootstrap()`**

Localizar a linha `async function bootstrap(): Promise<void> {` e inserir imediatamente **antes** dela (depois
do fechamento de `montarAgrupamento`):

```ts
interface AcaoMarcadorRapido {
  tipo: 'adicionar' | 'remover'
  idFormulario: string
  botao: { nome: string; valor: string }
  tituloPopup: string
  mensagemSucesso: string
}

const ACAO_ADICIONAR_MARCADOR: AcaoMarcadorRapido = {
  tipo: 'adicionar',
  idFormulario: 'frmAndamentoMarcadorCadastro',
  botao: { nome: 'sbmSalvar', valor: 'Salvar' },
  tituloPopup: 'Adicionar Marcador',
  mensagemSucesso: 'Marcador adicionado.',
}

const ACAO_REMOVER_MARCADOR: AcaoMarcadorRapido = {
  tipo: 'remover',
  idFormulario: 'frmAndamentoMarcadorRemocao',
  botao: { nome: 'sbmRemover', valor: 'Remover' },
  tituloPopup: 'Remoção de Marcador',
  mensagemSucesso: 'Marcador removido.',
}

interface PonteMarcadorRapido {
  deveInterceptar: () => boolean
  processar: (chave: 'adicionar' | 'remover') => void
}

declare global {
  interface Window {
    __seirmgMarcadorRapido?: PonteMarcadorRapido
  }
}

function contarCheckboxesMarcados(): number {
  return IDS_TABELAS.reduce((total, idTabela) => {
    const tabela = document.querySelector(idTabela)
    return total + (tabela ? tabela.querySelectorAll('tbody input[type="checkbox"]:checked').length : 0)
  }, 0)
}

function localizarUnicoCheckboxMarcado(): { checkbox: HTMLInputElement; idTabela: string } | null {
  for (const idTabela of IDS_TABELAS) {
    const tabela = document.querySelector(idTabela)
    const checkbox = tabela?.querySelector<HTMLInputElement>('tbody input[type="checkbox"]:checked')
    if (checkbox) return { checkbox, idTabela }
  }
  return null
}

let popupMarcadorRapidoAtual: HTMLElement | null = null

function fecharPopupMarcadorRapido(): void {
  popupMarcadorRapidoAtual?.remove()
  popupMarcadorRapidoAtual = null
}

function mostrarMensagemTransitoriaMarcador(texto: string): void {
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-marcador-rapido-mensagem'
  mensagem.textContent = texto
  document.body.appendChild(mensagem)
  setTimeout(() => mensagem.remove(), 2500)
}

function substituirLinhaAtualizada(
  idProcedimento: string,
  idTabela: string,
  html: string,
  config: SyncConfig
): void {
  try {
    const idLinha = `P${idProcedimento}`
    const linhaAntiga = document.getElementById(idLinha)
    if (!linhaAntiga) return

    const docResposta = new DOMParser().parseFromString(html, 'text/html')
    const linhaNova = docResposta.getElementById(idLinha)
    if (!linhaNova) return

    const linhaAdotada = document.adoptNode(linhaNova)
    linhaAntiga.replaceWith(linhaAdotada)
    reaplicarTratamentosNasLinhasNovas(idTabela, config, [linhaAdotada])
  } catch (error) {
    console.error('[SEIRMG] Falha ao atualizar a linha do processo após marcador:', error)
  }
}

async function confirmarMarcador(
  acao: AcaoMarcadorRapido,
  formularioMarcador: { actionUrl: string; campos: Record<string, string> },
  idProcedimento: string,
  idTabela: string,
  config: SyncConfig,
  marcadorEscolhido: string,
  texto: string,
  erro: HTMLElement
): Promise<void> {
  try {
    if (!marcadorEscolhido) {
      erro.textContent = 'Selecione um marcador.'
      erro.style.display = ''
      return
    }

    const corpo = montarCorpoConfirmacao(formularioMarcador.campos, marcadorEscolhido, texto, acao.botao)
    const resultado = await fetchText(formularioMarcador.actionUrl, { method: 'POST', body: corpo })
    if (!resultado.ok) {
      erro.textContent = 'Falha ao salvar o marcador. Tente novamente.'
      erro.style.display = ''
      return
    }

    substituirLinhaAtualizada(idProcedimento, idTabela, resultado.data, config)
    fecharPopupMarcadorRapido()
    mostrarMensagemTransitoriaMarcador(acao.mensagemSucesso)
  } catch (error) {
    console.error('[SEIRMG] Falha ao confirmar marcador:', error)
    erro.textContent = 'Falha ao salvar o marcador. Tente novamente.'
    erro.style.display = ''
  }
}

function abrirPopupMarcador(
  acao: AcaoMarcadorRapido,
  opcoes: OpcaoMarcador[],
  formularioMarcador: { actionUrl: string; campos: Record<string, string> },
  idProcedimento: string,
  idTabela: string,
  config: SyncConfig
): void {
  fecharPopupMarcadorRapido()

  const fundo = document.createElement('div')
  fundo.className = 'seirmg-marcador-rapido-fundo'
  fundo.addEventListener('click', fecharPopupMarcadorRapido)

  const popup = document.createElement('div')
  popup.className = 'seirmg-marcador-rapido-popup'
  popup.addEventListener('click', (evento) => evento.stopPropagation())

  const titulo = document.createElement('div')
  titulo.className = 'seirmg-marcador-rapido-titulo'
  titulo.textContent = acao.tituloPopup
  popup.appendChild(titulo)

  const erro = document.createElement('div')
  erro.className = 'seirmg-marcador-rapido-erro'
  erro.style.display = 'none'
  popup.appendChild(erro)

  const select = document.createElement('select')
  select.className = 'seirmg-marcador-rapido-select'
  if (acao.tipo === 'adicionar') {
    select.appendChild(new Option('Selecione um marcador', ''))
  }
  opcoes.forEach((opcao) => select.appendChild(new Option(opcao.nome, opcao.id)))
  const marcadorAtual = formularioMarcador.campos.hdnIdMarcador
  if (marcadorAtual) select.value = marcadorAtual
  popup.appendChild(select)

  let textarea: HTMLTextAreaElement | null = null
  if (acao.tipo === 'adicionar') {
    textarea = document.createElement('textarea')
    textarea.className = 'seirmg-marcador-rapido-textarea'
    textarea.placeholder = 'Texto (opcional)'
    popup.appendChild(textarea)
  }

  const acoes = document.createElement('div')
  acoes.className = 'seirmg-marcador-rapido-acoes'

  const botaoCancelar = document.createElement('button')
  botaoCancelar.type = 'button'
  botaoCancelar.textContent = 'Cancelar'
  botaoCancelar.addEventListener('click', fecharPopupMarcadorRapido)
  acoes.appendChild(botaoCancelar)

  const botaoConfirmar = document.createElement('button')
  botaoConfirmar.type = 'button'
  botaoConfirmar.textContent = acao.botao.valor
  botaoConfirmar.addEventListener('click', () => {
    botaoConfirmar.disabled = true
    confirmarMarcador(
      acao,
      formularioMarcador,
      idProcedimento,
      idTabela,
      config,
      select.value,
      textarea?.value ?? '',
      erro
    ).finally(() => {
      botaoConfirmar.disabled = false
    })
  })
  acoes.appendChild(botaoConfirmar)

  popup.appendChild(acoes)
  fundo.appendChild(popup)
  document.body.appendChild(fundo)

  popupMarcadorRapidoAtual = fundo
}

async function processarClickMarcador(
  acao: AcaoMarcadorRapido,
  link: HTMLAnchorElement,
  idProcedimento: string,
  idTabela: string,
  config: SyncConfig
): Promise<void> {
  const url = extrairUrlDeOnclick(link.getAttribute('onclick') ?? '')
  if (!url) {
    console.error('[SEIRMG] Não foi possível extrair a URL do link de marcador.')
    return
  }

  const formPagina = document.getElementById('frmProcedimentoControlar') as HTMLFormElement | null
  if (!formPagina) return

  const resultadoTela = await fetchText(url, {
    method: 'POST',
    body: new URLSearchParams(extrairCamposOcultos(formPagina)),
  })
  if (!resultadoTela.ok) {
    console.error('[SEIRMG] Falha ao buscar tela de marcador:', resultadoTela.error)
    return
  }

  const docTela = new DOMParser().parseFromString(resultadoTela.data, 'text/html')
  const opcoes = parseOpcoesMarcador(docTela)
  const formularioMarcador = parseFormularioMarcador(docTela, acao.idFormulario)
  if (!formularioMarcador) {
    console.error('[SEIRMG] Formulário de marcador não encontrado na tela retornada.')
    return
  }

  abrirPopupMarcador(acao, opcoes, formularioMarcador, idProcedimento, idTabela, config)
}

function interceptarClickNativoMarcador(link: HTMLAnchorElement | null, chave: 'adicionar' | 'remover'): void {
  if (!link) return
  const acaoOriginal = link.getAttribute('onclick')
  if (!acaoOriginal) return

  link.setAttribute(
    'onclick',
    `if (window.__seirmgMarcadorRapido && window.__seirmgMarcadorRapido.deveInterceptar()) { window.__seirmgMarcadorRapido.processar('${chave}'); return false; } else { ${acaoOriginal} }`
  )
}

function montarMarcadorRapido(config: SyncConfig): void {
  try {
    const linkAdicionar = document.querySelector<HTMLAnchorElement>(
      '#divComandos a[onclick*="andamento_marcador_cadastrar"]'
    )
    const linkRemover = document.querySelector<HTMLAnchorElement>(
      '#divComandos a[onclick*="andamento_marcador_remover"]'
    )
    if (!linkAdicionar && !linkRemover) return

    window.__seirmgMarcadorRapido = {
      deveInterceptar: () => contarCheckboxesMarcados() === 1,
      processar: (chave: 'adicionar' | 'remover') => {
        const link = chave === 'adicionar' ? linkAdicionar : linkRemover
        const acao = chave === 'adicionar' ? ACAO_ADICIONAR_MARCADOR : ACAO_REMOVER_MARCADOR
        const selecionado = localizarUnicoCheckboxMarcado()
        if (!link || !selecionado) return

        processarClickMarcador(acao, link, selecionado.checkbox.value, selecionado.idTabela, config).catch(
          (error) => {
            console.error('[SEIRMG] Falha ao processar clique de marcador rápido:', error)
          }
        )
      },
    }

    interceptarClickNativoMarcador(linkAdicionar, 'adicionar')
    interceptarClickNativoMarcador(linkRemover, 'remover')
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar marcador rápido:', error)
  }
}

```

- [ ] **Step 4: Chamar `montarMarcadorRapido(config)` no `bootstrap()`**

Dentro de `bootstrap()`, trocar:

```ts
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()
```

por:

```ts
    montarBuscaRapida()
    montarSelecaoMultipla()
    montarConfirmarAntesDeConcluir()
    montarMarcadorRapido(config)
    montarFiltroBloco()
    montarOrdenacaoTabelas()
    await montarFiltroAtribuicao()
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 7: Build**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 8: Commit**

```bash
cd C:\sei\seirmg
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "$(cat <<'EOF'
feat: adicionar/remover marcador via popup, sem trocar de tela

Com exatamente 1 processo selecionado, os links "Adicionar Marcador"/
"Remover Marcador" da barra de ícones abrem um popup central (dropdown
das opções reais do processo + texto opcional) em vez de navegar pra
uma tela cheia. Com 0 ou 2+ selecionados, comportamento nativo
inalterado (fallback exato via reescrita condicional do onclick,
mesmo padrão de montarConfirmarAntesDeConcluir).

Após confirmar, a linha do processo é substituída ao vivo pela versão
atualizada (resposta da confirmação já é a lista, o SEI redireciona
sozinho) e os enriquecimentos da SEIRMG são reaplicados só nela via
reaplicarTratamentosNasLinhasNovas (já usada pela rolagem infinita).

Spec: docs/superpowers/specs/2026-07-15-seirmg-marcador-rapido-design.md
EOF
)"
```

---

## Task 6: Verificação final

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `cd C:\sei\seirmg && npx vitest run`
Expected: todos os testes passam, incluindo os novos `marcadorRapido.test.ts`.

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `cd C:\sei\seirmg && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Lint**

Run: `cd C:\sei\seirmg && npx eslint .`
Expected: sem erros.

- [ ] **Step 4: Build final**

Run: `cd C:\sei\seirmg && npm run build`
Expected: build sem erros, `dist/` gerado.

- [ ] **Step 5: Atualizar `docs/ROADMAP-LOTES.md`**

Adicionar uma entrada em "Já entregue" descrevendo o recurso (adicionar/remover marcador via popup sem
trocar de tela), com link pra spec (`docs/superpowers/specs/2026-07-15-seirmg-marcador-rapido-design.md`) e
pra este plano.

- [ ] **Step 6: Verificação manual (⚠️ requer instância SEI real — risco mais alto que o normal)**

Carregar `dist/` como extensão descompactada no Chrome, abrir Controle de Processos numa instância SEI real
(ex. Campinas) e confirmar:
- Com **0 processos selecionados**: clicar em "Adicionar Marcador"/"Remover Marcador" continua navegando
  pra tela cheia normalmente (comportamento nativo inalterado).
- Com **2+ processos selecionados**: idem, continua navegando pra tela cheia (SEI decide/pede erro como já
  fazia antes).
- Com **exatamente 1 processo selecionado**: clicar em "Adicionar Marcador" abre o popup central com o
  dropdown das opções reais desse processo (não uma lista genérica) + campo de texto opcional; escolher um
  marcador e confirmar atualiza a linha na tabela ao vivo (marcador aparece na coluna, prazos/cor/etc.
  continuam corretos) sem recarregar a página nem perder filtros/ordenação/agrupamento ativos.
- Mesmo teste pra "Remover Marcador": popup mostra o(s) marcador(es) que aquele processo já tem
  pré-selecionado; confirmar remove e atualiza a linha ao vivo.
- Testar **cancelar** o popup (botão Cancelar e clicar fora, no fundo escurecido): fecha sem enviar nada,
  processo continua com o marcador original.
- Testar **erro de rede** (ex. desconectar a internet só na hora de confirmar): popup mostra mensagem de
  erro visível, não fecha sozinho, e dá pra tentar de novo ou cancelar.
- Confirmar que **nenhuma outra funcionalidade da SEIRMG quebrou** nessa tela (rolagem infinita, favoritos,
  filtros, agrupamento, Planka, cores/especificação, seleção múltipla com Shift).

---
