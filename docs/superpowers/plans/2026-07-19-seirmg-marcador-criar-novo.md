# Criar novo marcador do popup + correção de acentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um link "+ Novo marcador" no popup "Adicionar Marcador" (Marcador rápido) que abre um sub-popup pra cadastrar um novo padrão de marcador sem sair da tela, e corrigir o bug de acentuação corrompida no texto opcional do marcador (e nos novos campos Nome/Descrição), que hoje usa uma codificação incompatível com o que o SEI espera.

**Architecture:** Lógica pura testada em `src/features/controle-processos/marcadorRapido.ts` (extração de URL, montagem do corpo do POST). Wiring de DOM (fetch, parse, renderização do sub-popup) em `src/content-scripts/procedimento_controlar/index.ts`, seguindo o mesmo padrão já estabelecido pro popup de Adicionar/Remover Marcador — sem teste automatizado pra essa parte, verificado via build/typecheck e validação manual. A correção de acentos reaproveita `escapeComponentAnotacao`, já exportada por `src/features/procedimento-visualizar/anotacao.ts` e já consumida por `dropzone.ts` (`documento_externo_arraste`) — o marcador passa a ser o terceiro consumidor da mesma função, não uma nova implementação.

**Tech Stack:** TypeScript, Vite, Vitest, Chrome Extension (Manifest V3), DOM API puro (sem framework de UI).

## Global Constraints

- Todo corpo de POST enviado ao SEI deve ser escapado com `escapeComponentAnotacao` (ISO-8859-1 via `escape()`, não `URLSearchParams`/`encodeURIComponent`) — o SEI declara `charset=iso-8859-1` no HTML e corrompe qualquer acento enviado em UTF-8.
- Toda chamada de rede passa por `fetchText` (`src/lib/fetchViaBackground.ts`), nunca `fetch()` direto — mesmo mecanismo de mutex/circuit-breaker/detecção de sessão inválida (`fetchTextComGate`) já usado no resto do projeto.
- Falhas de rede ou de parsing nunca devem quebrar o popup existente — sempre `try/catch` com `console.error('[SEIRMG] ...', error)` e mensagem de erro visível dentro do próprio popup, nunca só no console.
- Nenhum teste automatizado para wiring de DOM em `content-scripts/` — mesmo padrão já estabelecido no arquivo (só a lógica pura em `features/` é testada).

---

### Task 1: Generalizar `parseOpcoesMarcador` para aceitar um seletor customizado

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts:17-26`
- Test: `src/features/controle-processos/marcadorRapido.test.ts:22-52`

**Interfaces:**
- Produces: `parseOpcoesMarcador(doc: Document, seletor?: string): OpcaoMarcador[]` — `seletor` default `'#selMarcador option'` (comportamento atual preservado quando omitido). Usado por Task 7 com `'#selStaIcone option'`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do bloco `describe('parseOpcoesMarcador', ...)` em `src/features/controle-processos/marcadorRapido.test.ts` (depois do teste `'retorna lista vazia quando o #selMarcador não existe no documento'`, ainda dentro do mesmo `describe`):

```ts
  it('lê as opções de um seletor customizado (ex.: #selStaIcone, mesmo formato de <select>)', () => {
    const doc = new DOMParser().parseFromString(
      `<select id="selStaIcone" name="selStaIcone">
        <option value="null" selected="selected">&nbsp;</option>
        <option value="4" data-imagesrc="svg/marcador_amarelo.svg?11">Amarelo</option>
        <option value="6" data-imagesrc="svg/marcador_azul.svg?11">Azul</option>
      </select>`,
      'text/html'
    )

    expect(parseOpcoesMarcador(doc, '#selStaIcone option')).toEqual([
      { id: '4', nome: 'Amarelo', icone: 'svg/marcador_amarelo.svg?11' },
      { id: '6', nome: 'Azul', icone: 'svg/marcador_azul.svg?11' },
    ])
  })
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts -t "seletor customizado"`
Expected: FAIL — `parseOpcoesMarcador` ainda só aceita 1 argumento, o segundo argumento é ignorado e a busca continua em `#selMarcador` (que não existe no doc do teste), retornando `[]` em vez do esperado.

- [ ] **Step 3: Implementar a generalização**

Em `src/features/controle-processos/marcadorRapido.ts`, substituir:

```ts
export function parseOpcoesMarcador(doc: Document): OpcaoMarcador[] {
  const opcoes = Array.from(doc.querySelectorAll<HTMLOptionElement>('#selMarcador option'))
```

por:

```ts
export function parseOpcoesMarcador(doc: Document, seletor = '#selMarcador option'): OpcaoMarcador[] {
  const opcoes = Array.from(doc.querySelectorAll<HTMLOptionElement>(seletor))
```

(o resto do corpo da função não muda).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os já existentes de `parseOpcoesMarcador`, que continuam usando o seletor default).

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "feat: generaliza parseOpcoesMarcador pra aceitar seletor customizado"
```

---

### Task 2: `extrairUrlNovoMarcador` — extrair a URL do botão nativo "+" de dentro do `<script>`

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts`
- Test: `src/features/controle-processos/marcadorRapido.test.ts`

**Interfaces:**
- Produces: `extrairUrlNovoMarcador(doc: Document): string | null`. Usado por Task 5 (wiring em `index.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/controle-processos/marcadorRapido.test.ts`:

```ts
import { extrairUrlNovoMarcador } from './marcadorRapido'

describe('extrairUrlNovoMarcador', () => {
  it('extrai a URL de dentro da função cadastrarMarcador() num <script> (formato real confirmado)', () => {
    const doc = new DOMParser().parseFromString(
      `<html><head><script>
        function inicializar(){}
        function cadastrarMarcador(){
          parent.infraAbrirJanelaModal('controlador.php?acao=marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&acao_retorno=andamento_marcador_cadastrar&pagina_simples=1&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abb1398175f14729ef520469874ce8549e4ff88bdb86f5e2309a216dab21604e',700,450);
        }
        function recarregarMarcadores(idMarcador){}
      </script></head><body></body></html>`,
      'text/html'
    )

    expect(extrairUrlNovoMarcador(doc)).toBe(
      'controlador.php?acao=marcador_cadastrar&acao_origem=andamento_marcador_cadastrar&acao_retorno=andamento_marcador_cadastrar&pagina_simples=1&infra_sistema=100000100&infra_unidade_atual=110002133&infra_hash=abb1398175f14729ef520469874ce8549e4ff88bdb86f5e2309a216dab21604e'
    )
  })

  it('retorna null quando existe <script> mas sem a função cadastrarMarcador', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><script>function outraFuncao(){}</script></head><body></body></html>',
      'text/html'
    )
    expect(extrairUrlNovoMarcador(doc)).toBeNull()
  })

  it('retorna null quando não há nenhum <script> no documento', () => {
    const doc = new DOMParser().parseFromString('<div></div>', 'text/html')
    expect(extrairUrlNovoMarcador(doc)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts -t "extrairUrlNovoMarcador"`
Expected: FAIL com `extrairUrlNovoMarcador is not a function` (ou erro de import — a função ainda não existe).

- [ ] **Step 3: Implementar `extrairUrlNovoMarcador`**

Adicionar em `src/features/controle-processos/marcadorRapido.ts`, depois de `parseFormularioMarcador` e antes de `montarCorpoConfirmacao`:

```ts
// cadastrarMarcador() não é um onclick inline com URL direta (como os outros links já tratados
// neste arquivo) -- é uma função JS definida num <script> no <head> da tela "Adicionar Marcador",
// que abre um iframe modal via parent.infraAbrirJanelaModal(url, largura, altura). Confirmado com
// o código-fonte bruto (Ctrl+U) de uma instância SEI real: a URL completa, com infra_hash válido
// pra esta sessão/ação, já vem embutida como string literal dentro dessa função -- não precisa de
// nenhuma chamada de rede extra só pra descobri-la.
export function extrairUrlNovoMarcador(doc: Document): string | null {
  const regex = /function\s+cadastrarMarcador\s*\(\s*\)\s*\{[^}]*infraAbrirJanelaModal\(\s*'([^']+)'/
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const match = script.textContent?.match(regex)
    if (match) return match[1]
  }
  return null
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "feat: extrai a URL do botão nativo de novo marcador do script da tela"
```

---

### Task 3: Corrigir acentuação em `montarCorpoConfirmacao` (bug existente no texto do marcador vinculado)

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts:43-53`
- Modify: `src/content-scripts/procedimento_controlar/index.ts:2140-2145`
- Test: `src/features/controle-processos/marcadorRapido.test.ts:95-151`

**Interfaces:**
- Consumes: `escapeComponentAnotacao(texto: string): string` de `src/features/procedimento-visualizar/anotacao.ts` (já existe, já usada por `dropzone.ts`).
- Produces: `montarCorpoConfirmacao(...): string` (troca de tipo de retorno — antes `URLSearchParams`, agora `string` já escapada). Consumido por `confirmarMarcador` em `index.ts` (Task 3 também atualiza esse call site).

- [ ] **Step 1: Atualizar os testes existentes pro novo tipo de retorno (string, não URLSearchParams) e adicionar teste de acentuação**

Em `src/features/controle-processos/marcadorRapido.test.ts`, substituir o bloco `describe('montarCorpoConfirmacao', ...)` inteiro (linhas 95-151, do `import { montarCorpoConfirmacao }` até o fechamento do `describe`) por:

```ts
import { escapeComponentAnotacao } from '../procedimento-visualizar/anotacao'
import { montarCorpoConfirmacao } from './marcadorRapido'

describe('montarCorpoConfirmacao', () => {
  it('sobrescreve hdnIdMarcador com o valor escolhido e inclui o botão de confirmação', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '', hdnIdProtocolo: '456' },
      '3',
      '',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(Object.fromEntries(new URLSearchParams(corpo))).toEqual({
      hdnIdMarcador: '3',
      hdnIdProtocolo: '456',
      sbmSalvar: 'Salvar',
    })
  })

  it('inclui txaTexto quando há texto', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '', hdnIdProtocolo: '456' },
      '3',
      'Observacao qualquer',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(Object.fromEntries(new URLSearchParams(corpo))).toEqual({
      hdnIdMarcador: '3',
      hdnIdProtocolo: '456',
      txaTexto: 'Observacao qualquer',
      sbmSalvar: 'Salvar',
    })
  })

  it('não inclui txaTexto quando o texto é vazio', () => {
    const corpo = montarCorpoConfirmacao({ hdnIdMarcador: '' }, '3', '', {
      nome: 'sbmSalvar',
      valor: 'Salvar',
    })
    expect(new URLSearchParams(corpo).has('txaTexto')).toBe(false)
  })

  it('sobrescreve um hdnIdMarcador já preenchido (fluxo de remoção)', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '3', hdnIdProtocolo: '456' },
      '7',
      '',
      { nome: 'sbmRemover', valor: 'Remover' }
    )

    expect(Object.fromEntries(new URLSearchParams(corpo))).toEqual({
      hdnIdMarcador: '7',
      hdnIdProtocolo: '456',
      sbmRemover: 'Remover',
    })
  })

  it('escapa acentos no texto no padrão ISO-8859-1 (mesmo de escapeComponentAnotacao, não UTF-8)', () => {
    const corpo = montarCorpoConfirmacao(
      { hdnIdMarcador: '' },
      '3',
      'Atenção à ordem de expedição',
      { nome: 'sbmSalvar', valor: 'Salvar' }
    )

    expect(corpo).toContain(`txaTexto=${escapeComponentAnotacao('Atenção à ordem de expedição')}`)
    // confirma que NÃO é a codificação UTF-8 que o URLSearchParams/encodeURIComponent produziriam
    expect(corpo).not.toContain(encodeURIComponent('Atenção à ordem de expedição'))
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts -t "montarCorpoConfirmacao"`
Expected: FAIL — `montarCorpoConfirmacao` ainda retorna `URLSearchParams`, `new URLSearchParams(corpo)` (onde `corpo` já é uma instância de `URLSearchParams`, não uma string) lança erro de tipo/comportamento inesperado nos testes atualizados, e o teste de acentuação falha porque a codificação atual é UTF-8, não ISO-8859-1.

- [ ] **Step 3: Implementar a correção**

Em `src/features/controle-processos/marcadorRapido.ts`, adicionar o import no topo do arquivo:

```ts
import { escapeComponentAnotacao } from '../procedimento-visualizar/anotacao'
```

Substituir a função `montarCorpoConfirmacao` inteira:

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

por:

```ts
// O corpo do POST precisa ir em ISO-8859-1 (o SEI declara charset=iso-8859-1 no HTML e corrompe
// qualquer acento enviado em UTF-8) -- URLSearchParams sempre codifica em UTF-8, por isso não pode
// ser usado aqui. Reaproveita escapeComponentAnotacao (já usada por dropzone.ts pro mesmo motivo)
// em vez de reimplementar a mesma lógica de escape.
export function montarCorpoConfirmacao(
  campos: Record<string, string>,
  marcadorEscolhido: string,
  texto: string,
  botao: { nome: string; valor: string }
): string {
  const postFields: Record<string, string> = { ...campos, hdnIdMarcador: marcadorEscolhido }
  if (texto) postFields.txaTexto = texto
  postFields[botao.nome] = botao.valor

  return Object.entries(postFields)
    .map(([chave, valor]) => `${chave}=${escapeComponentAnotacao(valor)}`)
    .join('&')
}
```

Em `src/content-scripts/procedimento_controlar/index.ts`, dentro de `confirmarMarcador` (por volta da linha 2140-2145), trocar:

```ts
    const corpo = montarCorpoConfirmacao(formularioMarcador.campos, marcadorEscolhido, texto, acao.botao)
    // Mesmo motivo do fetch da tela intermediária: actionUrl vem de getAttribute('action') do
    // formulário na tela retornada (string crua, relativa), não da propriedade .action do DOM
    // (que resolveria sozinha) -- precisa ser resolvida contra a página atual antes do fetch.
    const urlConfirmacao = new URL(formularioMarcador.actionUrl, window.location.href).href
    const resultado = await fetchText(urlConfirmacao, { method: 'POST', body: corpo })
```

por:

```ts
    const corpo = montarCorpoConfirmacao(formularioMarcador.campos, marcadorEscolhido, texto, acao.botao)
    // Mesmo motivo do fetch da tela intermediária: actionUrl vem de getAttribute('action') do
    // formulário na tela retornada (string crua, relativa), não da propriedade .action do DOM
    // (que resolveria sozinha) -- precisa ser resolvida contra a página atual antes do fetch.
    const urlConfirmacao = new URL(formularioMarcador.actionUrl, window.location.href).href
    // bodyRaw (não body/URLSearchParams) -- corpo já vem escapado em ISO-8859-1 por
    // montarCorpoConfirmacao, e o background seta Content-Type: application/x-www-form-urlencoded
    // sem charset quando bodyRaw é usado, deixando os bytes crus controlarem a codificação.
    const resultado = await fetchText(urlConfirmacao, { method: 'POST', bodyRaw: corpo })
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar o typecheck do projeto inteiro**

Run: `bunx tsc --noEmit`
Expected: sem erros (confirma que o `index.ts` compila com o novo tipo de retorno `string` de `montarCorpoConfirmacao` e o uso de `bodyRaw`).

- [ ] **Step 6: Commit**

```bash
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts src/content-scripts/procedimento_controlar/index.ts
git commit -m "fix: corrige acentuação corrompida no texto do marcador (ISO-8859-1, não UTF-8)"
```

---

### Task 4: `montarCorpoNovoMarcador` — montar o corpo do POST de criação de marcador

**Files:**
- Modify: `src/features/controle-processos/marcadorRapido.ts`
- Test: `src/features/controle-processos/marcadorRapido.test.ts`

**Interfaces:**
- Consumes: `escapeComponentAnotacao` (já importado na Task 3).
- Produces: `montarCorpoNovoMarcador(campos: Record<string, string>, iconeEscolhido: string, nome: string, descricao: string, botao: { nome: string; valor: string }): string`. Usado por Task 7 (`confirmarNovoMarcador` em `index.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/controle-processos/marcadorRapido.test.ts`:

```ts
import { montarCorpoNovoMarcador } from './marcadorRapido'

describe('montarCorpoNovoMarcador', () => {
  it('monta o corpo com ícone, nome e descrição, e o botão de confirmação', () => {
    const corpo = montarCorpoNovoMarcador(
      { hdnStaIcone: '', hdnIdMarcador: '' },
      '4',
      'Urgente',
      'Marcador de urgencia',
      { nome: 'sbmCadastrarMarcador', valor: 'Salvar' }
    )

    expect(Object.fromEntries(new URLSearchParams(corpo))).toEqual({
      hdnStaIcone: '4',
      hdnIdMarcador: '',
      txtNome: 'Urgente',
      txaDescricao: 'Marcador de urgencia',
      sbmCadastrarMarcador: 'Salvar',
    })
  })

  it('escapa acentos no nome e na descrição no padrão ISO-8859-1', () => {
    const corpo = montarCorpoNovoMarcador(
      { hdnStaIcone: '', hdnIdMarcador: '' },
      '4',
      'Atenção',
      'Descrição com acentuação',
      { nome: 'sbmCadastrarMarcador', valor: 'Salvar' }
    )

    expect(corpo).toContain(`txtNome=${escapeComponentAnotacao('Atenção')}`)
    expect(corpo).toContain(`txaDescricao=${escapeComponentAnotacao('Descrição com acentuação')}`)
  })

  it('aceita descrição vazia', () => {
    const corpo = montarCorpoNovoMarcador(
      { hdnStaIcone: '', hdnIdMarcador: '' },
      '4',
      'Urgente',
      '',
      { nome: 'sbmCadastrarMarcador', valor: 'Salvar' }
    )

    expect(Object.fromEntries(new URLSearchParams(corpo)).txaDescricao).toBe('')
  })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts -t "montarCorpoNovoMarcador"`
Expected: FAIL com `montarCorpoNovoMarcador is not a function`.

- [ ] **Step 3: Implementar `montarCorpoNovoMarcador`**

Adicionar em `src/features/controle-processos/marcadorRapido.ts`, logo depois de `montarCorpoConfirmacao`:

```ts
// Mesma técnica de montarCorpoConfirmacao (escapeComponentAnotacao, ISO-8859-1) -- campos vindos
// de `campos` (hdnStaIcone/hdnIdMarcador, extraídos como <input type="hidden"> por
// parseFormularioMarcador) são tokens numéricos do próprio SEI, sem acento, mas passam pelo mesmo
// escape por uniformidade (mesmo padrão já usado em dropzone.ts, que escapa todos os campos do
// corpo sem distinguir quais são "de risco").
export function montarCorpoNovoMarcador(
  campos: Record<string, string>,
  iconeEscolhido: string,
  nome: string,
  descricao: string,
  botao: { nome: string; valor: string }
): string {
  const postFields: Record<string, string> = {
    ...campos,
    hdnStaIcone: iconeEscolhido,
    txtNome: nome,
    txaDescricao: descricao,
  }
  postFields[botao.nome] = botao.valor

  return Object.entries(postFields)
    .map(([chave, valor]) => `${chave}=${escapeComponentAnotacao(valor)}`)
    .join('&')
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bunx vitest run src/features/controle-processos/marcadorRapido.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/controle-processos/marcadorRapido.ts src/features/controle-processos/marcadorRapido.test.ts
git commit -m "feat: adiciona montarCorpoNovoMarcador pro cadastro de novo marcador"
```

---

### Task 5: Refatorar `processarClickMarcador` em `buscarTelaEAbrirPopupMarcador` reutilizável

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:2364-2402`

**Interfaces:**
- Consumes: `extrairUrlNovoMarcador` (Task 2), `parseOpcoesMarcador`, `parseFormularioMarcador`, `extrairUrlDeOnclick` (já importados), `fetchText`, `extrairCamposOcultos`.
- Produces: `buscarTelaEAbrirPopupMarcador(acao: AcaoMarcadorRapido, url: string, quantidade: number, nomeParaSelecionar?: string): Promise<void>` — chamado por `processarClickMarcador` (abertura inicial) e, depois da Task 7, pelo callback de recarregar após criar um marcador novo.
- Depende de `abrirPopupMarcador` ganhar dois parâmetros novos na Task 6 — **este task já escreve a chamada com a assinatura nova**, então deve ser aplicado em conjunto com a Task 6 antes de rodar o typecheck (os dois tasks alteram o mesmo arquivo em sequência; não há como testar `buscarTelaEAbrirPopupMarcador` isoladamente antes de `abrirPopupMarcador` aceitar os novos parâmetros).

- [ ] **Step 1: Atualizar o import de `marcadorRapido` no topo do arquivo**

Em `src/content-scripts/procedimento_controlar/index.ts`, localizar o bloco de import existente (por volta da linha 43-49):

```ts
import {
  extrairUrlDeOnclick,
  montarCorpoConfirmacao,
  parseFormularioMarcador,
  parseOpcoesMarcador,
  type OpcaoMarcador,
} from '../../features/controle-processos/marcadorRapido'
```

Substituir por:

```ts
import {
  extrairUrlDeOnclick,
  extrairUrlNovoMarcador,
  montarCorpoConfirmacao,
  montarCorpoNovoMarcador,
  parseFormularioMarcador,
  parseOpcoesMarcador,
  type OpcaoMarcador,
} from '../../features/controle-processos/marcadorRapido'
```

- [ ] **Step 2: Substituir `processarClickMarcador` por `buscarTelaEAbrirPopupMarcador` + `processarClickMarcador` (mais fino)**

Localizar o bloco atual (por volta da linha 2364-2402):

```ts
async function processarClickMarcador(
  acao: AcaoMarcadorRapido,
  link: HTMLAnchorElement,
  quantidade: number
): Promise<void> {
  const urlRelativa = extrairUrlDeOnclick(link.getAttribute('onclick') ?? '')
  if (!urlRelativa) {
    console.error('[SEIRMG] Não foi possível extrair a URL do link de marcador.')
    return
  }
  // A URL vem de dentro de um onclick (string crua, não um atributo href/action refletido
  // pelo DOM) -- por isso precisa ser resolvida contra a página atual antes do fetch, mesmo
  // padrão já usado em documento_externo_arraste/procedimento_visualizar (o fetch de verdade
  // roda no service worker de fundo, que não tem "página atual" nenhuma pra resolver uma URL
  // relativa como controlador.php?acao=... sozinho -- resolveria contra chrome-extension://).
  const url = new URL(urlRelativa, window.location.href).href

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

  abrirPopupMarcador(acao, opcoes, formularioMarcador, quantidade)
}
```

Substituir por:

```ts
// Extraída de processarClickMarcador pra ser reutilizável: também é chamada depois de criar um
// marcador novo (Task 7), passando nomeParaSelecionar pra pré-selecionar o marcador recém-criado
// na lista recém-buscada, em vez de reabrir o popup com a seleção em branco.
async function buscarTelaEAbrirPopupMarcador(
  acao: AcaoMarcadorRapido,
  url: string,
  quantidade: number,
  nomeParaSelecionar?: string
): Promise<void> {
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

  if (nomeParaSelecionar) {
    const opcaoCriada = opcoes.find((opcao) => opcao.nome === nomeParaSelecionar)
    if (opcaoCriada) formularioMarcador.campos.hdnIdMarcador = opcaoCriada.id
  }

  // Só o popup de Adicionar Marcador ganha o link de criar um marcador novo -- o de Remoção só
  // lista marcadores que o processo já tem, criar um novo não faz sentido nesse fluxo.
  const urlNovoMarcador = acao.tipo === 'adicionar' ? extrairUrlNovoMarcador(docTela) : null

  abrirPopupMarcador(acao, opcoes, formularioMarcador, quantidade, urlNovoMarcador, (nomeCriado) =>
    buscarTelaEAbrirPopupMarcador(acao, url, quantidade, nomeCriado)
  )
}

async function processarClickMarcador(
  acao: AcaoMarcadorRapido,
  link: HTMLAnchorElement,
  quantidade: number
): Promise<void> {
  const urlRelativa = extrairUrlDeOnclick(link.getAttribute('onclick') ?? '')
  if (!urlRelativa) {
    console.error('[SEIRMG] Não foi possível extrair a URL do link de marcador.')
    return
  }
  // A URL vem de dentro de um onclick (string crua, não um atributo href/action refletido
  // pelo DOM) -- por isso precisa ser resolvida contra a página atual antes do fetch, mesmo
  // padrão já usado em documento_externo_arraste/procedimento_visualizar (o fetch de verdade
  // roda no service worker de fundo, que não tem "página atual" nenhuma pra resolver uma URL
  // relativa como controlador.php?acao=... sozinho -- resolveria contra chrome-extension://).
  const url = new URL(urlRelativa, window.location.href).href

  await buscarTelaEAbrirPopupMarcador(acao, url, quantidade)
}
```

- [ ] **Step 3: Não rodar o typecheck ainda**

Este task deixa `abrirPopupMarcador` sendo chamada com 6 argumentos, mas a função (Task 6) ainda só aceita 4 — o typecheck só deve rodar depois da Task 6 estar completa. Prosseguir direto pra Task 6 sem commit intermediário (as duas tasks formam uma única mudança compilável).

---

### Task 6: `abrirPopupMarcador` ganha o link "+ Novo marcador"

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts:2275-2362`

**Interfaces:**
- Consumes: chamada pela Task 5 com a assinatura nova.
- Produces: assinatura nova de `abrirPopupMarcador`, e a chamada a `abrirPopupNovoMarcador` (implementada na Task 7 — este task só faz a chamada, a função em si vem na próxima).

- [ ] **Step 1: Atualizar a assinatura de `abrirPopupMarcador`**

Localizar (por volta da linha 2275):

```ts
function abrirPopupMarcador(
  acao: AcaoMarcadorRapido,
  opcoes: OpcaoMarcador[],
  formularioMarcador: { actionUrl: string; campos: Record<string, string> },
  quantidade: number
): void {
```

Substituir por:

```ts
function abrirPopupMarcador(
  acao: AcaoMarcadorRapido,
  opcoes: OpcaoMarcador[],
  formularioMarcador: { actionUrl: string; campos: Record<string, string> },
  quantidade: number,
  urlNovoMarcador: string | null,
  recarregarComNovoMarcador: (nomeCriado: string) => Promise<void>
): void {
```

- [ ] **Step 2: Inserir o link "+ Novo marcador" depois do seletor de marcador**

Localizar (por volta da linha 2321-2323):

```ts
  const rotuloPlaceholder = acao.tipo === 'adicionar' ? 'Selecione um marcador' : null
  const seletor = criarSeletorMarcador(opcoes, formularioMarcador.campos.hdnIdMarcador, rotuloPlaceholder)
  corpo.appendChild(seletor.elemento)

  let textarea: HTMLTextAreaElement | null = null
```

Substituir por:

```ts
  const rotuloPlaceholder = acao.tipo === 'adicionar' ? 'Selecione um marcador' : null
  const seletor = criarSeletorMarcador(opcoes, formularioMarcador.campos.hdnIdMarcador, rotuloPlaceholder)
  corpo.appendChild(seletor.elemento)

  if (acao.tipo === 'adicionar' && urlNovoMarcador) {
    const linkNovoMarcador = document.createElement('a')
    linkNovoMarcador.href = '#'
    linkNovoMarcador.className = 'seirmg-marcador-rapido-novo-link'
    linkNovoMarcador.textContent = '+ Novo marcador'
    linkNovoMarcador.addEventListener('click', (evento) => {
      evento.preventDefault()
      abrirPopupNovoMarcador(urlNovoMarcador, recarregarComNovoMarcador)
    })
    corpo.appendChild(linkNovoMarcador)
  }

  let textarea: HTMLTextAreaElement | null = null
```

- [ ] **Step 3: Adicionar o CSS do link novo**

Em `ESTILO_FILTROS_E_ESPECIFICACAO`, dentro de `src/content-scripts/procedimento_controlar/index.ts`, localizar:

```css
  .seirmg-marcador-rapido-opcao-icone {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .seirmg-marcador-rapido-textarea {
```

Substituir por:

```css
  .seirmg-marcador-rapido-opcao-icone {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .seirmg-marcador-rapido-novo-link {
    align-self: flex-start;
    font-size: 12.5px;
    color: #017fff;
    text-decoration: none;
  }
  .seirmg-marcador-rapido-novo-link:hover {
    text-decoration: underline;
  }
  .seirmg-marcador-rapido-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #dbe9fb;
    background: #f5faff;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    font-size: 13.5px;
  }
  .seirmg-marcador-rapido-textarea {
```

(`.seirmg-marcador-rapido-input` é usado pelo campo Nome do sub-popup, implementado na Task 7 — adicionado aqui porque fica junto do resto do bloco de estilos do marcador rápido.)

- [ ] **Step 4: Não rodar o typecheck ainda**

`abrirPopupNovoMarcador` ainda não existe (Task 7) — o typecheck vai falhar até lá. Prosseguir direto.

---

### Task 7: `abrirPopupNovoMarcador` — sub-popup de criação de marcador

**Files:**
- Modify: `src/content-scripts/procedimento_controlar/index.ts`

**Interfaces:**
- Consumes: `parseOpcoesMarcador` (com seletor customizado, Task 1), `parseFormularioMarcador`, `montarCorpoNovoMarcador` (Task 4), `criarSeletorMarcador` (já existe, reaproveitado sem alteração), `fetchText`.
- Produces: `abrirPopupNovoMarcador(url: string, recarregarComNovoMarcador: (nomeCriado: string) => Promise<void>): void` — chamada pela Task 6.

- [ ] **Step 1: Adicionar o estado e a função de fechar do sub-popup**

Em `src/content-scripts/procedimento_controlar/index.ts`, logo depois de `abrirPopupMarcador` (depois do `}` que fecha a função, antes de `async function processarClickMarcador`... que agora é `buscarTelaEAbrirPopupMarcador`), inserir:

```ts
let popupNovoMarcadorAtual: HTMLElement | null = null

function fecharPopupNovoMarcador(): void {
  popupNovoMarcadorAtual?.remove()
  popupNovoMarcadorAtual = null
}

async function confirmarNovoMarcador(
  formularioNovoMarcador: { actionUrl: string; campos: Record<string, string> },
  iconeEscolhido: string,
  nome: string,
  descricao: string,
  erro: HTMLElement,
  aoCriar: (nomeCriado: string) => void
): Promise<void> {
  try {
    const nomeTratado = nome.trim()
    if (!iconeEscolhido) {
      erro.textContent = 'Selecione um ícone.'
      erro.style.display = ''
      return
    }
    if (!nomeTratado) {
      erro.textContent = 'Informe um nome.'
      erro.style.display = ''
      return
    }

    const corpo = montarCorpoNovoMarcador(
      formularioNovoMarcador.campos,
      iconeEscolhido,
      nomeTratado,
      descricao.trim(),
      { nome: 'sbmCadastrarMarcador', valor: 'Salvar' }
    )
    const urlConfirmacao = new URL(formularioNovoMarcador.actionUrl, window.location.href).href
    const resultado = await fetchText(urlConfirmacao, { method: 'POST', bodyRaw: corpo })
    if (!resultado.ok) {
      erro.textContent = 'Falha ao criar o marcador. Tente novamente.'
      erro.style.display = ''
      return
    }

    fecharPopupNovoMarcador()
    aoCriar(nomeTratado)
  } catch (error) {
    console.error('[SEIRMG] Falha ao confirmar novo marcador:', error)
    erro.textContent = 'Falha ao criar o marcador. Tente novamente.'
    erro.style.display = ''
  }
}

// Chamada a partir do link "+ Novo marcador" (só no popup de Adicionar Marcador). GET simples,
// sem corpo -- mesma navegação que o iframe modal nativo (parent.infraAbrirJanelaModal) faria;
// não precisa de nenhum dado de contexto de processo, o formulário de criação de marcador não tem
// hdnIdProtocolo (confirmado no HTML real colado pelo usuário nesta sessão).
function abrirPopupNovoMarcador(
  url: string,
  recarregarComNovoMarcador: (nomeCriado: string) => Promise<void>
): void {
  fecharPopupNovoMarcador()

  const fundo = document.createElement('div')
  fundo.className = 'seirmg-marcador-rapido-fundo'
  fundo.addEventListener('click', fecharPopupNovoMarcador)

  const popup = document.createElement('div')
  popup.className = 'seirmg-marcador-rapido-popup'
  popup.addEventListener('click', (evento) => evento.stopPropagation())

  const header = document.createElement('div')
  header.className = 'seirmg-marcador-rapido-header'
  const titulos = document.createElement('div')
  const titulo = document.createElement('strong')
  titulo.className = 'seirmg-marcador-rapido-titulo'
  titulo.textContent = 'Novo Marcador'
  titulos.appendChild(titulo)
  header.appendChild(titulos)
  popup.appendChild(header)

  const corpo = document.createElement('div')
  corpo.className = 'seirmg-marcador-rapido-corpo'

  const erro = document.createElement('div')
  erro.className = 'seirmg-marcador-rapido-erro'
  erro.textContent = 'Carregando...'
  corpo.appendChild(erro)

  popup.appendChild(corpo)
  fundo.appendChild(popup)
  document.body.appendChild(fundo)
  popupNovoMarcadorAtual = fundo

  fetchText(url)
    .then((resultado) => {
      if (!resultado.ok) {
        erro.textContent = 'Falha ao carregar o formulário de novo marcador.'
        return
      }

      const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
      const opcoesIcone = parseOpcoesMarcador(doc, '#selStaIcone option')
      const formularioNovoMarcador = parseFormularioMarcador(doc, 'frmMarcadorCadastro')
      if (!formularioNovoMarcador) {
        erro.textContent = 'Falha ao carregar o formulário de novo marcador.'
        return
      }

      erro.textContent = ''
      erro.style.display = 'none'

      const seletorIcone = criarSeletorMarcador(opcoesIcone, '', 'Selecione um ícone')
      corpo.appendChild(seletorIcone.elemento)
      popup.addEventListener('click', () => seletorIcone.fecharLista())

      const inputNome = document.createElement('input')
      inputNome.type = 'text'
      inputNome.className = 'seirmg-marcador-rapido-input'
      inputNome.placeholder = 'Nome'
      inputNome.maxLength = 50
      corpo.appendChild(inputNome)

      const textareaDescricao = document.createElement('textarea')
      textareaDescricao.className = 'seirmg-marcador-rapido-textarea'
      textareaDescricao.placeholder = 'Descrição (opcional)'
      textareaDescricao.maxLength = 250
      corpo.appendChild(textareaDescricao)

      const rodape = document.createElement('div')
      rodape.className = 'seirmg-marcador-rapido-rodape'

      const botaoCancelar = document.createElement('button')
      botaoCancelar.type = 'button'
      botaoCancelar.className = 'seirmg-marcador-rapido-btn seirmg-marcador-rapido-btn-secundario'
      botaoCancelar.textContent = 'Cancelar'
      botaoCancelar.addEventListener('click', fecharPopupNovoMarcador)
      rodape.appendChild(botaoCancelar)

      const botaoConfirmar = document.createElement('button')
      botaoConfirmar.type = 'button'
      botaoConfirmar.className = 'seirmg-marcador-rapido-btn seirmg-marcador-rapido-btn-primario'
      botaoConfirmar.textContent = 'Salvar'
      botaoConfirmar.addEventListener('click', () => {
        botaoConfirmar.disabled = true
        confirmarNovoMarcador(
          formularioNovoMarcador,
          seletorIcone.obterValor(),
          inputNome.value,
          textareaDescricao.value,
          erro,
          (nomeCriado) => {
            recarregarComNovoMarcador(nomeCriado).catch((error) => {
              console.error('[SEIRMG] Falha ao recarregar marcadores após criar um novo:', error)
            })
          }
        ).finally(() => {
          botaoConfirmar.disabled = false
        })
      })
      rodape.appendChild(botaoConfirmar)

      popup.appendChild(rodape)
    })
    .catch((error) => {
      console.error('[SEIRMG] Falha ao abrir formulário de novo marcador:', error)
      erro.textContent = 'Falha ao carregar o formulário de novo marcador.'
    })
}
```

- [ ] **Step 2: Rodar o typecheck do projeto inteiro**

Run: `bunx tsc --noEmit`
Expected: sem erros. Isso confirma, de uma vez, que as Tasks 5, 6 e 7 (que dependem umas das outras dentro do mesmo arquivo) se encaixam corretamente: `buscarTelaEAbrirPopupMarcador` chama `abrirPopupMarcador` com a assinatura nova, que por sua vez chama `abrirPopupNovoMarcador`, que chama `confirmarNovoMarcador`, que chama `montarCorpoNovoMarcador`.

- [ ] **Step 3: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS (todos os testes existentes continuam passando, nenhuma regressão nas outras features do arquivo).

- [ ] **Step 4: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/procedimento_controlar/index.ts
git commit -m "feat: adiciona sub-popup de criar novo marcador ao popup Adicionar Marcador"
```

---

### Task 8: Atualizar o roteiro de lotes com o resultado desta melhoria

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Adicionar uma entrada no roteiro**

Em `docs/ROADMAP-LOTES.md`, logo depois da entrada de "Atribuição rápida" (a última entrada de "Já entregue"), adicionar uma nova entrada:

```markdown
- **Marcador rápido — criar novo marcador do popup + correção de acentos** — spec
  `docs/superpowers/specs/2026-07-19-seirmg-marcador-criar-novo-design.md`, plano
  `docs/superpowers/plans/2026-07-19-seirmg-marcador-criar-novo.md`. O popup "Adicionar Marcador"
  deixava de propósito fora do escopo criar um marcador novo (só linkar um já cadastrado) — agora
  tem um link "+ Novo marcador" que abre um sub-popup (Ícone/Nome/Descrição), reaproveitando a URL
  do botão nativo "+" (`cadastrarMarcador()`), extraída via regex de dentro do `<script>` da tela
  "Adicionar Marcador" (a URL, com `infra_hash` válido, já vem embutida no HTML que a extensão já
  buscava). Ao criar com sucesso, refaz o fetch da lista de marcadores e pré-seleciona o
  recém-criado pelo nome. Também corrigido: o texto opcional do marcador vinculado perdia acentos
  depois de salvo — `montarCorpoConfirmacao` usava `URLSearchParams` (sempre UTF-8), mas o SEI
  espera o corpo do POST em ISO-8859-1 (mesma classe de bug já corrigida antes em `anotacao.ts` e
  `dropzone.ts`, nunca replicada aqui); corrigido reaproveitando `escapeComponentAnotacao` (agora
  usada em três lugares) tanto no texto do marcador vinculado quanto nos campos Nome/Descrição do
  marcador novo. ⚠️ **Pendente de validação manual numa instância SEI real** — `#selStaIcone` como
  `<select>` nativo no HTML bruto é assumido por analogia direta com `#selMarcador` (mesma versão do
  SEI, mesmo padrão de widget), não confirmado com código-fonte bruto desta tela específica nesta
  sessão; e o casamento por nome pra pré-selecionar o marcador recém-criado depende do SEI não
  alterar o nome digitado (espaços, maiúsculas) na resposta.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ROADMAP-LOTES.md
git commit -m "docs: registra criação de novo marcador + correção de acentos no roteiro"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Depois da Task 8, numa instância SEI real:

1. Abrir Controle de Processos, marcar 1+ processo(s), clicar em "Adicionar Marcador" — confirmar que o popup abre normalmente e o link "+ Novo marcador" aparece ao lado do seletor.
2. Clicar em "+ Novo marcador" — confirmar que o sub-popup abre com a lista de ícones/cores populada (valida a suposição sobre `#selStaIcone`).
3. Preencher um nome com acento (ex. "Atenção") e uma descrição com acento, escolher um ícone, Salvar — confirmar que fecha o sub-popup, a lista de marcadores é atualizada, e o marcador recém-criado aparece **selecionado** no popup original.
4. Abrir a tela nativa "Marcadores" (Menu > Marcadores) e confirmar que o nome/descrição aparecem com os acentos corretos (valida a correção de `escapeComponentAnotacao` pro cadastro novo).
5. No mesmo popup "Adicionar Marcador" (marcador já existente, sem precisar criar um novo), preencher o campo de texto opcional com acentos, Salvar, e depois conferir a exibição desse texto na tela de andamentos do processo — confirmar que os acentos aparecem corretos (valida a correção do bug já existente).
6. Tentar Salvar o sub-popup sem escolher ícone e sem preencher nome — confirmar as mensagens de erro inline ("Selecione um ícone."/"Informe um nome.").
7. Confirmar que o popup de "Remover Marcador" **não** ganhou o link "+ Novo marcador" (fora de escopo, por decisão).
