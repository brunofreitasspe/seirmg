# Editor — Grupos na barra e Inserir conteúdo (sub-lote 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizar os botões da extensão na barra do editor do SEI em grupos temáticos e acrescentar cinco funções de inserção: checklist, QR Code, link curto (TinyURL), referência interna e importar Word/HTML.

**Architecture:** Lógica pura e testável em `src/features/editor/` (registro de grupos, montagem do HTML de cada inserção, limpeza de HTML importado, numeração de parágrafos). A montagem na barra e os diálogos ficam em `src/content-scripts/documento_editar/`, reaproveitando `criarBotaoToolbar`, `EditorSEI` (ponte com o CKEditor 4 no main world) e `criarPainelFlutuante`. A ponte ganha um comando `registrarAlteracao` pra avisar o CKEditor de mudanças feitas direto no DOM do corpo. Chamadas externas (TinyURL) passam pelo background com lista de hosts permitidos.

**Tech Stack:** TypeScript, Vite + @crxjs, Vitest (jsdom), CKEditor 4 do SEI 4.1.5, `qrcode-generator` (MIT), `mammoth` (BSD-2-Clause), lucide-static (ícones).

**Spec:** `docs/superpowers/specs/2026-10-06-seirmg-editor-inserir-locais-design.md`

## Global Constraints

- Botões soltos (um ícone por função), agrupados por tema em blocos `span.cke_toolbar > span.cke_toolgroup`; ordem dos grupos: Inserir, Referências e links, Formatação, Tabelas.
- IDs DOM dos botões existentes (`seirmg-cke-*`) não mudam.
- Nenhum conteúdo do documento sai do navegador, exceto a URL enviada ao TinyURL, com aviso no diálogo.
- Erros aparecem no próprio diálogo (nunca `alert`) e vão pro console com prefixo `[SEIRMG]`.
- Classes do SEI usadas na importação: `Texto_Justificado`, `Texto_Fundo_Cinza_Maiusculas_Negrito` (h1), `Texto_Fundo_Cinza_Negrito` (h2–h6), `Tabela` com `style="border-collapse:collapse;width:100%;"`, `Tabela_Texto_Alinhado_Esquerda` (texto das células).
- QR Code: tamanhos pequeno 100 px, médio 150 px, grande 200 px; correção de erro nível M; imagem GIF em data URI.
- TinyURL: `GET https://tinyurl.com/api-create.php?url=<url>[&alias=<nome>]`; nome personalizado só com letras, números e hífen.
- Dependências novas carregadas por import dinâmico (só no clique).
- Commits terminam com as linhas de atribuição da sessão (`Co-Authored-By` e `Claude-Session`).
- `bun run test`, `bun run typecheck` e `bun run lint` passam antes de cada commit.

## Review Focus

1. Seleção que não é um link (texto comum, link com espaços em volta, `javascript:`) usada pra pré-preencher QR Code e TinyURL: só pré-preenche com URL `http(s)` válida, sem os espaços — teste em `validarUrlHttp` (Task 5) usado também pelo QR (Task 4).
2. Referência interna num documento sem parágrafo numerado: o diálogo explica e não insere nada — teste em `referenciaInternaDialogo.test.ts` (Task 6).
3. Arquivo de formato errado (`.doc` antigo, `.pdf`) ou vazio na importação: mensagem clara, nada inserido — teste em `tipoArquivoImportavel` (Task 7).
4. Clicar duas vezes na mesma caixa de checklist volta a ☐; clicar fora de uma caixa não faz nada — teste no listener (Task 3).
5. Nome personalizado do TinyURL já usado (HTTP 422), resposta "Error" ou falha de rede: mensagem no diálogo, nada inserido — teste em `interpretarRespostaTinyUrl` (Task 5).

## Pré-requisito (antes da Task 1): imagem embutida sobrevive ao salvar?

QR Code e imagens do Word dependem de o SEI manter `<img src="data:image/...">` depois de salvar. Pedir ao usuário (desenvolvedor do projeto, testa no SEI de produção HMMG/Campinas) que, **num documento de teste**, abra o editor e rode no console da janela do editor (frame `top` da janela do editor):

```js
(() => { const ed = Object.values(CKEDITOR.instances).find((e) => { try { return e.document.getBody().$.contentEditable === 'true' } catch { return false } }); if (!ed) return 'editor não encontrado'; ed.insertHtml('<img class="seirmg-teste" alt="teste" width="24" height="24" src="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=">'); return 'Inserido. Salve, feche e reabra o documento; depois rode o segundo script.' })()
```

Depois de salvar e reabrir:

```js
Object.values(CKEDITOR.instances).map((e) => ({ nome: e.name, temImagemEmbutida: e.getData().includes('data:image/gif') }))
```

- Se alguma instância responder `temImagemEmbutida: true`: seguir o plano como está.
- Se `false`: parar antes da Task 4 e levar ao usuário a decisão do formato alternativo (ex.: anexar a imagem como documento externo e referenciar). As Tasks 1, 2, 3, 5 e 6 não dependem disso e podem seguir.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/features/editor/grupos.ts` (+ test) | Registro dos grupos da barra e `organizarEmGrupos`. |
| `src/features/editor/checklist.ts` (+ test) | HTML da caixa e alternância ☐/☑. |
| `src/features/editor/qrCode.ts` (+ test) | Geração do QR (data URI) e HTML da imagem. |
| `src/features/editor/linkCurto.ts` (+ test) | `validarUrlHttp`, `validarAlias`, URL da API, interpretação da resposta, HTML do link. |
| `src/features/editor/referenciaInterna.ts` (+ test) | Numeração hierárquica de parágrafos e HTML da referência. |
| `src/features/editor/importarHtml.ts` (+ test) | Tipo de arquivo, limpeza do HTML e estilos do SEI. |
| `src/background/fetchExterno.ts` (+ test) | Hosts externos permitidos e checagem. |
| `src/lib/fetchViaBackground.ts` | `fetchExterno(url)` (cliente da mensagem nova). |
| `src/background/index.ts` | Handler de `seirmg:fetch-externo`. |
| `src/content-scripts/documento_editar/protocolo.ts`, `pontePrincipal.ts`, `ponteEditor.ts` (+ tests) | Comando `registrarAlteracao`. |
| `src/content-scripts/documento_editar/formatacaoBasica.ts` (+ test) | Montagem em grupos; botões existentes indexados por id. |
| `src/content-scripts/documento_editar/botoesInserir.ts` | Botões novos (checklist, QR, link curto, referência interna, importar) e o listener do checklist. |
| `src/content-scripts/documento_editar/qrCodeDialogo.ts` | Diálogo do QR Code. |
| `src/content-scripts/documento_editar/linkCurtoDialogo.ts` | Diálogo do TinyURL. |
| `src/content-scripts/documento_editar/referenciaInternaDialogo.ts` (+ test) | Diálogo e operações no DOM do corpo (âncoras, atualizar números). |
| `src/content-scripts/documento_editar/importarArquivo.ts` | Seletor de arquivo, leitura e conversão. |
| `manifest.config.ts` | `https://tinyurl.com/*` em `host_permissions`. |

---

### Task 1: Grupos na barra

**Files:**
- Create: `src/features/editor/grupos.ts`, `src/features/editor/grupos.test.ts`, `src/content-scripts/documento_editar/botoesInserir.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts` (`montarConjuntoBotoes`, `injetarBotoesSeAusente`, `ESTILO_BOTOES`)
- Test: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Produces: `type IdBotaoEditor`, `interface GrupoBarra { id: string; titulo: string; botoes: IdBotaoEditor[] }`, `GRUPOS_BARRA: GrupoBarra[]`, `organizarEmGrupos<T>(disponiveis: Map<IdBotaoEditor, T>): Array<{ grupo: GrupoBarra; itens: T[] }>`; `montarBotoesInserir(editor: EditorSEI): Map<IdBotaoEditor, HTMLElement>` (vazio nesta task; Tasks 3–7 acrescentam); `criarBotaoToolbar` passa a ser exportado.

- [ ] **Step 1: Teste do registro de grupos**

`src/features/editor/grupos.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { GRUPOS_BARRA, organizarEmGrupos, type IdBotaoEditor } from './grupos'

describe('GRUPOS_BARRA', () => {
  it('tem os grupos na ordem combinada', () => {
    expect(GRUPOS_BARRA.map((g) => g.titulo)).toEqual(['Inserir', 'Referências e links', 'Formatação', 'Tabelas'])
  })

  it('nenhum botão aparece em dois grupos', () => {
    const todos = GRUPOS_BARRA.flatMap((g) => g.botoes)
    expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('organizarEmGrupos', () => {
  it('segue a ordem do registro e omite grupos sem botão montado', () => {
    const disponiveis = new Map<IdBotaoEditor, string>([
      ['tabela', 'T'],
      ['maiuscula', 'M'],
      ['fonte-aumentar', 'F+'],
    ])
    const resultado = organizarEmGrupos(disponiveis)
    expect(resultado.map((r) => [r.grupo.id, r.itens])).toEqual([
      ['formatacao', ['F+', 'M']],
      ['tabelas', ['T']],
    ])
  })

  it('ignora botão montado que não está no registro', () => {
    const disponiveis = new Map([['inexistente' as IdBotaoEditor, 'X']])
    expect(organizarEmGrupos(disponiveis)).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/editor/grupos.test.ts`
Expected: FAIL (módulo `./grupos` não existe)

- [ ] **Step 3: Implementar `grupos.ts`**

```typescript
// Ordem e agrupamento dos botões da extensão na barra do editor do SEI. Cada grupo vira um bloco
// próprio na barra (mesma estrutura dos grupos nativos do CKEditor 4). O id do botão é o sufixo
// do id DOM (`seirmg-cke-<id>`).
export type IdBotaoEditor =
  | 'checklist'
  | 'qrcode'
  | 'importar'
  | 'latex'
  | 'sumario'
  | 'referencia-interna'
  | 'link-curto'
  | 'nota-rodape'
  | 'alinhar-esquerda'
  | 'alinhar-centro'
  | 'alinhar-direita'
  | 'alinhar-justificado'
  | 'fonte-aumentar'
  | 'fonte-reduzir'
  | 'maiuscula'
  | 'copiar-formatacao'
  | 'quebra-pagina'
  | 'tabela'

export interface GrupoBarra {
  id: string
  titulo: string
  botoes: IdBotaoEditor[]
}

export const GRUPOS_BARRA: GrupoBarra[] = [
  { id: 'inserir', titulo: 'Inserir', botoes: ['checklist', 'qrcode', 'importar', 'latex', 'sumario'] },
  { id: 'referencias', titulo: 'Referências e links', botoes: ['referencia-interna', 'link-curto', 'nota-rodape'] },
  {
    id: 'formatacao',
    titulo: 'Formatação',
    botoes: [
      'alinhar-esquerda',
      'alinhar-centro',
      'alinhar-direita',
      'alinhar-justificado',
      'fonte-aumentar',
      'fonte-reduzir',
      'maiuscula',
      'copiar-formatacao',
      'quebra-pagina',
    ],
  },
  { id: 'tabelas', titulo: 'Tabelas', botoes: ['tabela'] },
]

export function organizarEmGrupos<T>(disponiveis: Map<IdBotaoEditor, T>): Array<{ grupo: GrupoBarra; itens: T[] }> {
  return GRUPOS_BARRA.map((grupo) => ({
    grupo,
    itens: grupo.botoes.flatMap((id) => {
      const item = disponiveis.get(id)
      return item === undefined ? [] : [item]
    }),
  })).filter((bloco) => bloco.itens.length > 0)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/editor/grupos.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Teste da barra em grupos**

Acrescentar em `src/content-scripts/documento_editar/formatacaoBasica.test.ts`, dentro do `describe('iniciarFormatacaoBasica')`:

```typescript
  it('monta um bloco por grupo, na ordem, com os botões de cada grupo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const blocos = Array.from(toolbox.querySelectorAll<HTMLElement>('.seirmg-cke-grupo'))
    expect(blocos.map((b) => b.dataset.seirmgGrupo)).toEqual(['inserir', 'referencias', 'formatacao', 'tabelas'])
    expect(blocos.every((b) => b.classList.contains('cke_toolbar') && b.querySelector('.cke_toolgroup'))).toBe(true)
    const formatacao = blocos[2].querySelectorAll('.seirmg-cke-button')
    expect(Array.from(formatacao).map((b) => b.id)).toEqual([
      'seirmg-cke-alinhar-esquerda',
      'seirmg-cke-alinhar-centro',
      'seirmg-cke-alinhar-direita',
      'seirmg-cke-alinhar-justificado',
      'seirmg-cke-fonte-aumentar',
      'seirmg-cke-fonte-reduzir',
      'seirmg-cke-maiuscula',
      'seirmg-cke-copiar-formatacao',
      'seirmg-cke-quebra-pagina',
    ])
    expect(blocos[3].querySelector('#seirmg-cke-tabela')).not.toBeNull()
    expect(blocos[0].title).toBe('Inserir')
  })
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `bun run test src/content-scripts/documento_editar/formatacaoBasica.test.ts`
Expected: FAIL (nenhum `.seirmg-cke-grupo`)

- [ ] **Step 7: Criar `botoesInserir.ts` (ainda vazio)**

```typescript
// Botões novos do editor (grupo Inserir e Referências e links). Cada task do plano acrescenta
// o seu ao mapa; a ordem na barra vem de features/editor/grupos.ts, não da ordem de inserção aqui.
import type { IdBotaoEditor } from '../../features/editor/grupos'
import type { EditorSEI } from './ponteEditor'

export function montarBotoesInserir(_editor: EditorSEI): Map<IdBotaoEditor, HTMLElement> {
  return new Map()
}
```

- [ ] **Step 8: Reorganizar a montagem em `formatacaoBasica.ts`**

1. Exportar `criarBotaoToolbar` (trocar `function criarBotaoToolbar` por `export function criarBotaoToolbar`).
2. Imports novos no topo:

```typescript
import { organizarEmGrupos, type IdBotaoEditor } from '../../features/editor/grupos'
import { montarBotoesInserir } from './botoesInserir'
```

3. Substituir `montarConjuntoBotoes` e `injetarBotoesSeAusente` por:

```typescript
// Botões indexados pelo id (o mesmo sufixo do id DOM `seirmg-cke-<id>`), pra organizarEmGrupos
// distribuí-los nos blocos da barra.
function montarConjuntoBotoes(editor: EditorSEI): Map<IdBotaoEditor, HTMLElement> {
  const botoes = new Map<IdBotaoEditor, HTMLElement>()
  const registrar = (botao: HTMLElement): void => {
    botoes.set(botao.id.replace(/^seirmg-cke-/, '') as IdBotaoEditor, botao)
  }
  montarBotoesAlinhamento(editor).forEach(registrar)
  montarBotoesFonte(editor).forEach(registrar)
  ;[
    montarBotaoCopiarFormatacao(editor),
    montarBotaoMaiuscula(editor),
    montarBotaoTabelaRapida(editor),
    montarBotaoQuebraPagina(editor),
    montarBotaoSumario(editor),
    montarBotaoNotaRodape(editor),
    montarBotaoLatex(editor),
  ].forEach(registrar)
  montarBotoesInserir(editor).forEach((botao, id) => botoes.set(id, botao))
  return botoes
}

// Um bloco por grupo, com a estrutura dos grupos nativos do CKEditor 4
// (span.cke_toolbar > span.cke_toolgroup), pra herdar o espaçamento e o separador da barra.
function montarBlocoGrupo(grupo: { id: string; titulo: string }, botoes: HTMLElement[]): HTMLElement {
  const barra = document.createElement('span')
  barra.className = 'cke_toolbar seirmg-cke-grupo'
  barra.dataset.seirmgGrupo = grupo.id
  barra.title = grupo.titulo
  const inicio = document.createElement('span')
  inicio.className = 'cke_toolbar_start'
  const grupoEl = document.createElement('span')
  grupoEl.className = 'cke_toolgroup'
  grupoEl.append(...botoes)
  const fim = document.createElement('span')
  fim.className = 'cke_toolbar_end'
  barra.append(inicio, grupoEl, fim)
  return barra
}

// Injeta um conjunto NOVO de botões (não reaproveita nós de outra toolbox — um elemento
// só pode ter um pai) nessa toolbox específica, a menos que ela já tenha os nossos.
function injetarBotoesSeAusente(toolbox: HTMLElement, editor: EditorSEI): void {
  if (toolbox.querySelector('.seirmg-cke-button')) return
  organizarEmGrupos(montarConjuntoBotoes(editor)).forEach(({ grupo, itens }) => {
    toolbox.appendChild(montarBlocoGrupo(grupo, itens))
  })
}
```

4. Em `ESTILO_BOTOES`, acrescentar o separador entre grupos da extensão:

```css
  .seirmg-cke-grupo + .seirmg-cke-grupo {
    margin-left: 6px;
    padding-left: 6px;
    border-left: 1px solid #d1d5db;
  }
```

- [ ] **Step 9: Rodar e ver passar (inclusive os testes antigos da barra)**

Run: `bun run test src/content-scripts/documento_editar/formatacaoBasica.test.ts src/features/editor`
Expected: PASS

- [ ] **Step 10: Verificação geral e commit**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: tudo passa.

```bash
git add src/features/editor/grupos.ts src/features/editor/grupos.test.ts src/content-scripts/documento_editar/botoesInserir.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(editor): botões da extensão agrupados por tema na barra do editor"
```

---

### Task 2: Comando `registrarAlteracao` na ponte com o CKEditor

**Files:**
- Modify: `src/content-scripts/documento_editar/protocolo.ts` (`TipoComando`), `pontePrincipal.ts` (`executarComando`), `ponteEditor.ts` (`EditorSEI` e cliente)
- Test: `src/content-scripts/documento_editar/pontePrincipal.test.ts`, e todo fake de `EditorSEI` em testes

**Interfaces:**
- Produces: `EditorSEI.registrarAlteracao(): Promise<void>` — avisa o CKEditor de mudança feita direto no DOM do corpo (dispara `saveSnapshot` e `change` na instância editável).

- [ ] **Step 1: Teste no main world**

Em `pontePrincipal.test.ts`, seguindo o padrão do teste `'executa insertHtml repassando o argumento pra instância'` (mesmo jeito de montar a instância falsa e de esperar a resposta), acrescentar:

```typescript
  it('registrarAlteracao dispara saveSnapshot e change na instância editável', async () => {
    const { instancia, enviar } = prepararInstanciaFalsaParaComandos()
    await enviar('registrarAlteracao', [])
    expect(instancia.fire).toHaveBeenCalledWith('saveSnapshot')
    expect(instancia.fire).toHaveBeenCalledWith('change')
  })
```

Se o arquivo não tiver um helper como `prepararInstanciaFalsaParaComandos`, copiar o preparo usado no teste de `insertHtml` (criação de `CKEDITOR.instances` com uma instância cujo `fire` é `vi.fn()`, `criarPonteMainWorld`, disparo de `EVENTO_COMANDO` com `{ id, tipo: 'registrarAlteracao', args: [] }` e espera do `EVENTO_RESPOSTA`) para dentro deste teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/content-scripts/documento_editar/pontePrincipal.test.ts`
Expected: FAIL (o `fire` não é chamado: `registrarAlteracao` cai no `default`)

- [ ] **Step 3: Implementar**

`protocolo.ts` — acrescentar ao union `TipoComando`:

```typescript
  | 'registrarAlteracao'
```

`pontePrincipal.ts`, em `executarComando`, antes do `default`:

```typescript
    case 'registrarAlteracao':
      // Mudança feita direto no DOM do corpo pelo isolated world (ex.: marcar checklist,
      // âncora de referência interna): registra no histórico de desfazer e marca o
      // documento como alterado, pra entrar no salvar.
      instancia.fire('saveSnapshot')
      instancia.fire('change')
      return null
```

`ponteEditor.ts` — na interface `EditorSEI`:

```typescript
  registrarAlteracao: () => Promise<void>
```

e no objeto montado pelo cliente (junto de `ativarInterceptacaoLinkSei`):

```typescript
      registrarAlteracao: () => enviarComando('registrarAlteracao', []).then(() => undefined),
```

- [ ] **Step 4: Atualizar os fakes de `EditorSEI` nos testes**

Run: `grep -rln "ativarInterceptacaoLinkSei: vi.fn" src`
Em cada arquivo listado, ao lado de `ativarInterceptacaoLinkSei: vi.fn().mockResolvedValue(undefined),` acrescentar:

```typescript
    registrarAlteracao: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 5: Rodar e ver passar; verificação geral**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: tudo passa.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/documento_editar/protocolo.ts src/content-scripts/documento_editar/pontePrincipal.ts src/content-scripts/documento_editar/ponteEditor.ts src/content-scripts/documento_editar/*.test.ts
git commit -m "feat(editor): comando registrarAlteracao na ponte com o CKEditor"
```

---

### Task 3: Checklist

**Files:**
- Create: `src/features/editor/checklist.ts`, `src/features/editor/checklist.test.ts`, `src/content-scripts/documento_editar/botoesInserir.test.ts`
- Modify: `src/content-scripts/documento_editar/botoesInserir.ts`

**Interfaces:**
- Consumes: `criarBotaoToolbar(id, titulo, iconeSvg, aoClicar)` (Task 1), `EditorSEI.inserirHtml`, `EditorSEI.registrarAlteracao` (Task 2).
- Produces: `CLASSE_CHECKLIST = 'seirmg-checklist'`, `montarChecklistHtml(): string`, `alternarChecklist(marcado: boolean): { simbolo: string; marcado: boolean }`, `ligarAlternanciaChecklist(editor: EditorSEI): void` (exportado de `botoesInserir.ts`).

- [ ] **Step 1: Testes puros**

`src/features/editor/checklist.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { alternarChecklist, CLASSE_CHECKLIST, montarChecklistHtml } from './checklist'

describe('montarChecklistHtml', () => {
  it('caixa vazia seguida de espaço, pra o cursor ficar fora dela', () => {
    expect(montarChecklistHtml()).toBe(`<span class="${CLASSE_CHECKLIST}" data-marcado="nao">&#9744;</span>&nbsp;`)
  })
})

describe('alternarChecklist', () => {
  it('desmarcada vira marcada (☑) e marcada volta a desmarcada (☐)', () => {
    expect(alternarChecklist(false)).toEqual({ simbolo: '☑', marcado: true })
    expect(alternarChecklist(true)).toEqual({ simbolo: '☐', marcado: false })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/editor/checklist.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar `checklist.ts`**

```typescript
// Caixa de seleção no texto do documento. Um caractere (☐ U+2610 / ☑ U+2611) dentro de um span
// com classe própria: sobrevive ao salvar e à impressão do SEI. O &nbsp; depois deixa o cursor
// fora da caixa (o texto digitado não entra nela e o Enter não leva a caixa pro parágrafo seguinte).
export const CLASSE_CHECKLIST = 'seirmg-checklist'

export function montarChecklistHtml(): string {
  return `<span class="${CLASSE_CHECKLIST}" data-marcado="nao">&#9744;</span>&nbsp;`
}

export function alternarChecklist(marcado: boolean): { simbolo: string; marcado: boolean } {
  return marcado ? { simbolo: '☐', marcado: false } : { simbolo: '☑', marcado: true }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/editor/checklist.test.ts`
Expected: PASS

- [ ] **Step 5: Testes do botão e da alternância no editor**

`src/content-scripts/documento_editar/botoesInserir.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { ligarAlternanciaChecklist, montarBotoesInserir } from './botoesInserir'
import type { EditorSEI } from './ponteEditor'

function criarEditorFalso(corpo: HTMLElement = document.createElement('body')): EditorSEI {
  return {
    obterTextoSelecionado: vi.fn().mockResolvedValue(''),
    obterTextoCompleto: vi.fn().mockResolvedValue(''),
    inserirHtml: vi.fn().mockResolvedValue(undefined),
    inserirTexto: vi.fn().mockResolvedValue(undefined),
    aplicarClasseParagrafo: vi.fn().mockResolvedValue(undefined),
    aplicarEstiloTexto: vi.fn().mockResolvedValue(undefined),
    ativarInterceptacaoLinkSei: vi.fn().mockResolvedValue(undefined),
    registrarAlteracao: vi.fn().mockResolvedValue(undefined),
    corpo,
    documento: document,
    janela: window,
    iframe: document.createElement('iframe'),
  }
}

describe('checklist', () => {
  it('o botão insere a caixa no cursor', () => {
    const editor = criarEditorFalso()
    montarBotoesInserir(editor).get('checklist')?.dispatchEvent(new MouseEvent('click', { cancelable: true }))
    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('seirmg-checklist'))
  })

  it('clicar na caixa alterna ☐/☑ e avisa o CKEditor; dois cliques voltam ao início', () => {
    const corpo = document.createElement('div')
    corpo.innerHTML = '<p><span class="seirmg-checklist" data-marcado="nao">☐</span>&nbsp;item</p>'
    document.body.append(corpo)
    const editor = criarEditorFalso(corpo)
    ligarAlternanciaChecklist(editor)
    const caixa = corpo.querySelector('.seirmg-checklist') as HTMLElement

    caixa.click()
    expect([caixa.textContent, caixa.dataset.marcado]).toEqual(['☑', 'sim'])
    expect(editor.registrarAlteracao).toHaveBeenCalledTimes(1)
    caixa.click()
    expect([caixa.textContent, caixa.dataset.marcado]).toEqual(['☐', 'nao'])
    corpo.remove()
  })

  it('clicar fora de uma caixa não faz nada', () => {
    const corpo = document.createElement('div')
    corpo.innerHTML = '<p>texto</p>'
    document.body.append(corpo)
    const editor = criarEditorFalso(corpo)
    ligarAlternanciaChecklist(editor)
    ;(corpo.querySelector('p') as HTMLElement).click()
    expect(editor.registrarAlteracao).not.toHaveBeenCalled()
    corpo.remove()
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `bun run test src/content-scripts/documento_editar/botoesInserir.test.ts`
Expected: FAIL (`ligarAlternanciaChecklist` não existe; mapa vazio)

- [ ] **Step 7: Implementar em `botoesInserir.ts`**

Substituir o conteúdo do arquivo por:

```typescript
// Botões novos do editor (grupo Inserir e Referências e links). Cada task do plano acrescenta
// o seu ao mapa; a ordem na barra vem de features/editor/grupos.ts, não da ordem de inserção aqui.
import squareCheckIconSvg from 'lucide-static/icons/square-check.svg?raw'
import { alternarChecklist, CLASSE_CHECKLIST, montarChecklistHtml } from '../../features/editor/checklist'
import type { IdBotaoEditor } from '../../features/editor/grupos'
import { criarBotaoToolbar } from './formatacaoBasica'
import type { EditorSEI } from './ponteEditor'

function tratarErro(contexto: string): (erro: unknown) => void {
  return (erro) => console.error(`[SEIRMG] ${contexto}:`, erro)
}

// Clique numa caixa dentro do corpo do documento alterna marcada/desmarcada.
export function ligarAlternanciaChecklist(editor: EditorSEI): void {
  editor.corpo.addEventListener('click', (evento) => {
    const alvo = evento.target instanceof Element ? evento.target.closest<HTMLElement>(`.${CLASSE_CHECKLIST}`) : null
    if (!alvo) return
    const proximo = alternarChecklist(alvo.dataset.marcado === 'sim')
    alvo.textContent = proximo.simbolo
    alvo.dataset.marcado = proximo.marcado ? 'sim' : 'nao'
    editor.registrarAlteracao().catch(tratarErro('Falha ao registrar alteração do checklist'))
  })
}

export function montarBotoesInserir(editor: EditorSEI): Map<IdBotaoEditor, HTMLElement> {
  const botoes = new Map<IdBotaoEditor, HTMLElement>()
  botoes.set(
    'checklist',
    criarBotaoToolbar('seirmg-cke-checklist', 'Inserir caixa de seleção (checklist)', squareCheckIconSvg, () => {
      editor.inserirHtml(montarChecklistHtml()).catch(tratarErro('Falha ao inserir checklist'))
    })
  )
  return botoes
}
```

- [ ] **Step 8: Ligar a alternância no início do editor**

Em `formatacaoBasica.ts`, em `iniciarFormatacaoBasica`, logo depois de `registrarAtalhos(editor, config.atalhos)`:

```typescript
  ligarAlternanciaChecklist(editor)
```

e no import de `./botoesInserir`: `import { ligarAlternanciaChecklist, montarBotoesInserir } from './botoesInserir'`.

- [ ] **Step 9: Rodar e ver passar; verificação geral**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: tudo passa. (Se o ícone `square-check.svg` não existir no `lucide-static` instalado, usar `check-square.svg`: `ls node_modules/lucide-static/icons | grep -i check`.)

- [ ] **Step 10: Commit**

```bash
git add src/features/editor/checklist.ts src/features/editor/checklist.test.ts src/content-scripts/documento_editar/botoesInserir.ts src/content-scripts/documento_editar/botoesInserir.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts
git commit -m "feat(editor): inserir caixa de seleção (checklist) que marca com um clique"
```

---

### Task 4: QR Code

**Files:**
- Create: `src/features/editor/qrCode.ts`, `src/features/editor/qrCode.test.ts`, `src/content-scripts/documento_editar/qrCodeDialogo.ts`
- Modify: `package.json` (dependência), `src/content-scripts/documento_editar/botoesInserir.ts`

**Interfaces:**
- Consumes: `validarUrlHttp` (Task 5 produz; se a Task 4 vier antes, criar `linkCurto.ts` só com `validarUrlHttp` e o teste dela — o restante da Task 5 completa o arquivo), `criarPainelFlutuante`, `criarBotaoDialogo`, `fecharPainel`, `escaparHtml`.
- Produces: `escaparAtributo(texto: string): string` em `dom.ts` (escapa também `"`), `TAMANHOS_QR = { pequeno: 100, medio: 150, grande: 200 }`, `type TamanhoQr`, `gerarQrCodeDataUrl(texto: string, tamanhoPx: number): Promise<{ ok: true; dataUrl: string } | { ok: false; erro: string }>`, `montarQrCodeHtml(texto: string, dataUrl: string, tamanhoPx: number): string`, `abrirDialogoQrCode(textoInicial: string, aoInserir: (html: string) => void): void`.

- [ ] **Step 1: Instalar a dependência**

Run: `bun add qrcode-generator`
Expected: `qrcode-generator` em `dependencies`.

- [ ] **Step 2: Testes puros**

`src/features/editor/qrCode.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { gerarQrCodeDataUrl, montarQrCodeHtml, TAMANHOS_QR } from './qrCode'

describe('gerarQrCodeDataUrl', () => {
  it('gera GIF em data URI pro texto informado', async () => {
    const resultado = await gerarQrCodeDataUrl('https://sei.campinas.sp.gov.br', TAMANHOS_QR.medio)
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.dataUrl).toMatch(/^data:image\/gif;base64,/)
  })

  it('texto vazio não gera', async () => {
    expect(await gerarQrCodeDataUrl('   ', 150)).toEqual({ ok: false, erro: 'Informe o texto ou link do QR Code.' })
  })

  it('texto longo demais pra um QR Code não gera e explica', async () => {
    const resultado = await gerarQrCodeDataUrl('x'.repeat(5000), 150)
    expect(resultado).toEqual({ ok: false, erro: 'Texto longo demais para um QR Code. Use um link mais curto.' })
  })
})

describe('montarQrCodeHtml', () => {
  it('imagem com classe, tamanho e texto alternativo escapado (inclusive aspas, por estar num atributo)', () => {
    expect(montarQrCodeHtml('a<b "c"', 'data:image/gif;base64,AAA', 100)).toBe(
      '<img class="seirmg-qrcode" src="data:image/gif;base64,AAA" width="100" height="100" alt="QR Code: a&lt;b &quot;c&quot;">'
    )
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun run test src/features/editor/qrCode.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 4: Implementar `qrCode.ts`**

```typescript
// QR Code gerado no próprio navegador (qrcode-generator, sem rede): GIF em data URI, sem depender
// de <canvas>. Carregado só no clique (import dinâmico).
import { escaparHtml } from '../../content-scripts/documento_editar/dom'

export const TAMANHOS_QR = { pequeno: 100, medio: 150, grande: 200 } as const
export type TamanhoQr = keyof typeof TAMANHOS_QR

const MARGEM_MODULOS = 2

export async function gerarQrCodeDataUrl(
  texto: string,
  tamanhoPx: number
): Promise<{ ok: true; dataUrl: string } | { ok: false; erro: string }> {
  const conteudo = texto.trim()
  if (!conteudo) return { ok: false, erro: 'Informe o texto ou link do QR Code.' }
  const { default: qrcode } = await import('qrcode-generator')
  try {
    const qr = qrcode(0, 'M')
    qr.addData(conteudo)
    qr.make()
    const modulos = qr.getModuleCount() + MARGEM_MODULOS * 2
    const tamanhoCelula = Math.max(1, Math.floor(tamanhoPx / modulos))
    return { ok: true, dataUrl: qr.createDataURL(tamanhoCelula, tamanhoCelula * MARGEM_MODULOS) }
  } catch {
    // A biblioteca lança "code length overflow" quando o texto não cabe em nenhuma versão de QR.
    return { ok: false, erro: 'Texto longo demais para um QR Code. Use um link mais curto.' }
  }
}

export function montarQrCodeHtml(texto: string, dataUrl: string, tamanhoPx: number): string {
  return `<img class="seirmg-qrcode" src="${dataUrl}" width="${tamanhoPx}" height="${tamanhoPx}" alt="QR Code: ${escaparAtributo(texto.trim())}">`
}
```

`escaparHtml` (`dom.ts`) usa `textContent`/`innerHTML`: escapa `&`, `<` e `>`, mas **não** aspas. Valores dentro de atributo precisam de `escaparAtributo`, que esta task acrescenta em `src/content-scripts/documento_editar/dom.ts` (e troca o import de `qrCode.ts` para ela):

```typescript
// Pra valores dentro de atributo HTML entre aspas duplas: além do que escaparHtml faz, escapa ".
export function escaparAtributo(texto: string): string {
  return escaparHtml(texto).replace(/"/g, '&quot;')
}
```

Import em `qrCode.ts`: `import { escaparAtributo } from '../../content-scripts/documento_editar/dom'`.

Se o import padrão não funcionar (`qrcode is not a function`), conferir a forma de export do pacote instalado (`cat node_modules/qrcode-generator/package.json | grep -E '"(main|module|exports|types)"'`) e usar a que ele declara.

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test src/features/editor/qrCode.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Diálogo `qrCodeDialogo.ts`**

```typescript
import qrCodeIconSvg from 'lucide-static/icons/qr-code.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { gerarQrCodeDataUrl, montarQrCodeHtml, TAMANHOS_QR, type TamanhoQr } from '../../features/editor/qrCode'
import { criarBotaoDialogo, criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'

const ROTULOS_TAMANHO: Record<TamanhoQr, string> = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' }

export function abrirDialogoQrCode(textoInicial: string, aoInserir: (html: string) => void): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Gerar QR Code', qrCodeIconSvg)

  const campo = document.createElement('textarea')
  campo.placeholder = 'Texto ou link'
  campo.value = textoInicial
  const tamanho = document.createElement('select')
  ;(Object.keys(TAMANHOS_QR) as TamanhoQr[]).forEach((chave) => tamanho.add(new Option(ROTULOS_TAMANHO[chave], chave)))
  tamanho.value = 'medio'
  const previa = document.createElement('img')
  previa.className = 'seirmg-qrcode-previa'
  previa.alt = ''
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-painel-flutuante-mensagem'

  let ultimo: { dataUrl: string; px: number } | null = null
  async function atualizar(): Promise<void> {
    const px = TAMANHOS_QR[tamanho.value as TamanhoQr]
    const resultado = await gerarQrCodeDataUrl(campo.value, px)
    if (resultado.ok) {
      ultimo = { dataUrl: resultado.dataUrl, px }
      previa.src = resultado.dataUrl
      previa.hidden = false
      mensagem.textContent = ''
    } else {
      ultimo = null
      previa.hidden = true
      mensagem.textContent = campo.value.trim() ? resultado.erro : ''
    }
  }
  campo.addEventListener('input', () => void atualizar())
  tamanho.addEventListener('change', () => void atualizar())

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const cancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const inserir = criarBotaoDialogo('Inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  cancelar.addEventListener('click', () => fecharPainel(painel))
  inserir.addEventListener('click', () => {
    if (!ultimo) {
      mensagem.textContent = 'Informe o texto ou link do QR Code.'
      return
    }
    fecharPainel(painel)
    aoInserir(montarQrCodeHtml(campo.value, ultimo.dataUrl, ultimo.px))
  })
  rodape.append(cancelar, inserir)
  corpo.append(campo, tamanho, previa, mensagem, rodape)
  document.body.appendChild(painel)
  campo.focus()
  void atualizar()
}
```

- [ ] **Step 7: Botão em `botoesInserir.ts`**

Imports:

```typescript
import qrCodeIconSvg from 'lucide-static/icons/qr-code.svg?raw'
import { abrirDialogoQrCode } from './qrCodeDialogo'
import { validarUrlHttp } from '../../features/editor/linkCurto'
```

Dentro de `montarBotoesInserir`, antes do `return botoes`:

```typescript
  botoes.set(
    'qrcode',
    criarBotaoToolbar('seirmg-cke-qrcode', 'Gerar QR Code', qrCodeIconSvg, () => {
      editor
        .obterTextoSelecionado()
        .then((selecao) => {
          // Pré-preenche só com um link válido; texto comum selecionado não vira conteúdo do QR.
          const link = validarUrlHttp(selecao)
          abrirDialogoQrCode(link.ok ? link.url : '', (html) => {
            editor.inserirHtml(html).catch(tratarErro('Falha ao inserir QR Code'))
          })
        })
        .catch(tratarErro('Falha ao abrir o QR Code'))
    })
  )
```

Teste em `botoesInserir.test.ts`:

```typescript
describe('QR Code', () => {
  it('abre o diálogo pré-preenchido com o link selecionado', async () => {
    const editor = criarEditorFalso()
    vi.mocked(editor.obterTextoSelecionado).mockResolvedValue('  https://exemplo.gov.br/a  ')
    montarBotoesInserir(editor).get('qrcode')?.dispatchEvent(new MouseEvent('click', { cancelable: true }))
    await vi.waitFor(() => expect(document.querySelector('.seirmg-painel-flutuante textarea')).not.toBeNull())
    expect((document.querySelector('.seirmg-painel-flutuante textarea') as HTMLTextAreaElement).value).toBe('https://exemplo.gov.br/a')
    document.querySelector('.seirmg-painel-flutuante')?.remove()
  })

  it('seleção que não é link abre o diálogo vazio', async () => {
    const editor = criarEditorFalso()
    vi.mocked(editor.obterTextoSelecionado).mockResolvedValue('texto qualquer')
    montarBotoesInserir(editor).get('qrcode')?.dispatchEvent(new MouseEvent('click', { cancelable: true }))
    await vi.waitFor(() => expect(document.querySelector('.seirmg-painel-flutuante textarea')).not.toBeNull())
    expect((document.querySelector('.seirmg-painel-flutuante textarea') as HTMLTextAreaElement).value).toBe('')
    document.querySelector('.seirmg-painel-flutuante')?.remove()
  })
})
```

- [ ] **Step 8: Estilo da prévia**

Em `src/content-scripts/core/theme.css`, junto de `.seirmg-painel-flutuante`:

```css
.seirmg-qrcode-previa {
  display: block;
  margin: 10px auto;
  max-width: 200px;
  image-rendering: pixelated;
}

.seirmg-painel-flutuante-mensagem:empty {
  display: none;
}

.seirmg-painel-flutuante-mensagem {
  font-size: 12px;
  color: #b3261e;
  margin-top: 6px;
}
```

- [ ] **Step 9: Verificação geral e commit**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: tudo passa; o build gera um chunk separado pro `qrcode-generator`.

```bash
git add package.json bun.lock src/content-scripts/documento_editar/dom.ts src/features/editor/qrCode.ts src/features/editor/qrCode.test.ts src/content-scripts/documento_editar/qrCodeDialogo.ts src/content-scripts/documento_editar/botoesInserir.ts src/content-scripts/documento_editar/botoesInserir.test.ts src/content-scripts/core/theme.css
git commit -m "feat(editor): gerar QR Code localmente e inserir no documento"
```

---

### Task 5: Link curto (TinyURL)

**Files:**
- Create: `src/features/editor/linkCurto.ts`, `src/features/editor/linkCurto.test.ts`, `src/background/fetchExterno.ts`, `src/background/fetchExterno.test.ts`, `src/content-scripts/documento_editar/linkCurtoDialogo.ts`
- Modify: `src/lib/fetchViaBackground.ts`, `src/background/index.ts`, `manifest.config.ts`, `src/content-scripts/documento_editar/botoesInserir.ts`

**Interfaces:**
- Consumes: `fetchText(url, { timeoutMs })` de `src/lib/result.ts` (usado no background), `Result<string>` de `src/lib/result.ts`.
- Produces: `validarUrlHttp(texto: string): { ok: true; url: string } | { ok: false }`; `validarAlias(alias: string): boolean`; `montarUrlTinyUrl(url: string, alias?: string): string`; `interpretarRespostaTinyUrl(resultado: Result<string>): { ok: true; link: string } | { ok: false; erro: string }`; `montarLinkHtml(href: string, texto: string): string`; `HOSTS_EXTERNOS_PERMITIDOS: string[]`, `hostExternoPermitido(url: string): boolean`; `fetchExterno(url: string): Promise<Result<string>>` (mensagem `seirmg:fetch-externo`); `abrirDialogoLinkCurto(urlInicial: string, aoInserir: (link: string) => void): void`.

- [ ] **Step 1: Testes puros do link curto**

`src/features/editor/linkCurto.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { interpretarRespostaTinyUrl, montarLinkHtml, montarUrlTinyUrl, validarAlias, validarUrlHttp } from './linkCurto'

describe('validarUrlHttp', () => {
  it('aceita http(s) e tira espaços em volta', () => {
    expect(validarUrlHttp('  https://sei.gov.br/x?a=1  ')).toEqual({ ok: true, url: 'https://sei.gov.br/x?a=1' })
  })
  it('recusa texto comum, javascript: e vazio', () => {
    expect(validarUrlHttp('Ofício 123')).toEqual({ ok: false })
    expect(validarUrlHttp('javascript:alert(1)')).toEqual({ ok: false })
    expect(validarUrlHttp('')).toEqual({ ok: false })
  })
})

describe('validarAlias', () => {
  it('só letras, números e hífen', () => {
    expect(validarAlias('processo-123')).toBe(true)
    expect(validarAlias('com espaco')).toBe(false)
    expect(validarAlias('ç')).toBe(false)
  })
})

describe('montarUrlTinyUrl', () => {
  it('codifica a URL e inclui o nome personalizado quando houver', () => {
    expect(montarUrlTinyUrl('https://a.gov.br/?x=1&y=2')).toBe(
      'https://tinyurl.com/api-create.php?url=https%3A%2F%2Fa.gov.br%2F%3Fx%3D1%26y%3D2'
    )
    expect(montarUrlTinyUrl('https://a.gov.br', 'meu-link')).toBe(
      'https://tinyurl.com/api-create.php?url=https%3A%2F%2Fa.gov.br&alias=meu-link'
    )
  })
})

describe('interpretarRespostaTinyUrl', () => {
  it('resposta com o link curto', () => {
    expect(interpretarRespostaTinyUrl({ ok: true, data: 'https://tinyurl.com/abc123\n' })).toEqual({
      ok: true,
      link: 'https://tinyurl.com/abc123',
    })
  })
  it('nome personalizado em uso (HTTP 422)', () => {
    expect(interpretarRespostaTinyUrl({ ok: false, error: 'HTTP 422' })).toEqual({
      ok: false,
      erro: 'Esse nome personalizado já está em uso ou não é aceito. Tente outro.',
    })
  })
  it('corpo "Error" e falha de rede', () => {
    expect(interpretarRespostaTinyUrl({ ok: true, data: 'Error' }).ok).toBe(false)
    expect(interpretarRespostaTinyUrl({ ok: false, error: 'Timeout' })).toEqual({
      ok: false,
      erro: 'Não foi possível falar com o TinyURL (Timeout). Tente de novo.',
    })
  })
})

describe('montarLinkHtml', () => {
  it('escapa o texto e o endereço (aspas no atributo)', () => {
    expect(montarLinkHtml('https://tinyurl.com/a"b', 'Ofício <1>')).toBe(
      '<a href="https://tinyurl.com/a&quot;b">Ofício &lt;1&gt;</a>'
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/editor/linkCurto.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `linkCurto.ts`**

```typescript
import type { Result } from '../../lib/result'
import { escaparAtributo, escaparHtml } from '../../content-scripts/documento_editar/dom'

export function validarUrlHttp(texto: string): { ok: true; url: string } | { ok: false } {
  const candidato = texto.trim()
  if (!candidato) return { ok: false }
  try {
    const url = new URL(candidato)
    return url.protocol === 'http:' || url.protocol === 'https:' ? { ok: true, url: candidato } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export function validarAlias(alias: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(alias)
}

export function montarUrlTinyUrl(url: string, alias?: string): string {
  const base = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`
  return alias ? `${base}&alias=${encodeURIComponent(alias)}` : base
}

export function interpretarRespostaTinyUrl(resultado: Result<string>): { ok: true; link: string } | { ok: false; erro: string } {
  if (!resultado.ok) {
    if (resultado.error === 'HTTP 422') {
      return { ok: false, erro: 'Esse nome personalizado já está em uso ou não é aceito. Tente outro.' }
    }
    return { ok: false, erro: `Não foi possível falar com o TinyURL (${resultado.error}). Tente de novo.` }
  }
  const link = resultado.data.trim()
  if (!/^https:\/\/tinyurl\.com\/\S+$/.test(link)) {
    return { ok: false, erro: 'O TinyURL não aceitou esse endereço. Confira o link e tente de novo.' }
  }
  return { ok: true, link }
}

export function montarLinkHtml(href: string, texto: string): string {
  return `<a href="${escaparAtributo(href)}">${escaparHtml(texto)}</a>`
}
```

(`escaparAtributo` é criada na Task 4. Se a Task 5 for executada antes, criá-la aqui, no mesmo formato.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/editor/linkCurto.test.ts`
Expected: PASS

- [ ] **Step 5: Hosts externos permitidos (background) — teste**

`src/background/fetchExterno.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { hostExternoPermitido } from './fetchExterno'

describe('hostExternoPermitido', () => {
  it('aceita só https nos hosts da lista', () => {
    expect(hostExternoPermitido('https://tinyurl.com/api-create.php?url=x')).toBe(true)
    expect(hostExternoPermitido('http://tinyurl.com/x')).toBe(false)
    expect(hostExternoPermitido('https://tinyurl.com.malicioso.net/x')).toBe(false)
    expect(hostExternoPermitido('https://exemplo.com/')).toBe(false)
    expect(hostExternoPermitido('não é url')).toBe(false)
  })
})
```

Run: `bun run test src/background/fetchExterno.test.ts` → FAIL (módulo não existe)

- [ ] **Step 6: Implementar `fetchExterno.ts`**

```typescript
// Buscas a sites fora do SEI pedidas por content scripts (que não têm permissão de rede pra esses
// hosts). Só hosts desta lista, e só https -- a mensagem vem de páginas do SEI e não pode virar um
// proxy aberto. Os sub-lotes seguintes acrescentam os seus hosts aqui e em host_permissions.
export const HOSTS_EXTERNOS_PERMITIDOS = ['tinyurl.com']

export function hostExternoPermitido(url: string): boolean {
  try {
    const alvo = new URL(url)
    return alvo.protocol === 'https:' && HOSTS_EXTERNOS_PERMITIDOS.includes(alvo.hostname)
  } catch {
    return false
  }
}
```

Run: `bun run test src/background/fetchExterno.test.ts` → PASS

- [ ] **Step 7: Mensagem no background e cliente**

`src/background/index.ts`: import `import { hostExternoPermitido } from './fetchExterno'`; junto das outras interfaces de mensagem:

```typescript
interface MensagemFetchExterno {
  type: 'seirmg:fetch-externo'
  url: string
}

function ehMensagemFetchExterno(mensagem: unknown): mensagem is MensagemFetchExterno {
  return (
    typeof mensagem === 'object' &&
    mensagem !== null &&
    (mensagem as { type?: unknown }).type === 'seirmg:fetch-externo' &&
    typeof (mensagem as { url?: unknown }).url === 'string'
  )
}
```

e um listener ao lado do de `seirmg:fetch-ia`:

```typescript
chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (!ehMensagemFetchExterno(mensagem)) return false
  if (!hostExternoPermitido(mensagem.url)) {
    responder({ ok: false, error: 'Host não permitido' })
    return false
  }
  fetchText(mensagem.url, { timeoutMs: 15000 })
    .then(responder)
    .catch((error) => responder({ ok: false, error: String(error) }))
  return true
})
```

`src/lib/fetchViaBackground.ts`, ao fim:

```typescript
// Conteúdo de sites fora do SEI (ex.: TinyURL), pela lista de hosts permitidos do background.
export async function fetchExterno(url: string): Promise<Result<string>> {
  try {
    const resposta = await chrome.runtime.sendMessage({ type: 'seirmg:fetch-externo', url })
    return (resposta as Result<string> | undefined) ?? { ok: false, error: 'Sem resposta do background' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
```

`manifest.config.ts`, em `host_permissions`, depois de `'https://api.anthropic.com/*',`:

```typescript
    'https://tinyurl.com/*',
```

- [ ] **Step 8: Diálogo `linkCurtoDialogo.ts`**

```typescript
import linkIconSvg from 'lucide-static/icons/link.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { interpretarRespostaTinyUrl, montarUrlTinyUrl, validarAlias, validarUrlHttp } from '../../features/editor/linkCurto'
import { fetchExterno } from '../../lib/fetchViaBackground'
import { criarBotaoDialogo, criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'

export function abrirDialogoLinkCurto(urlInicial: string, aoInserir: (link: string) => void): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Link curto (TinyURL)', linkIconSvg)

  const url = document.createElement('input')
  url.type = 'url'
  url.placeholder = 'https://...'
  url.value = urlInicial
  const alias = document.createElement('input')
  alias.type = 'text'
  alias.placeholder = 'Nome personalizado (opcional)'
  const aviso = document.createElement('p')
  aviso.className = 'seirmg-painel-flutuante-aviso'
  aviso.textContent = 'O link será enviado ao serviço TinyURL para ser encurtado.'
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-painel-flutuante-mensagem'

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const cancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const gerar = criarBotaoDialogo('Gerar e inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  cancelar.addEventListener('click', () => fecharPainel(painel))
  gerar.addEventListener('click', async () => {
    const endereco = validarUrlHttp(url.value)
    if (!endereco.ok) {
      mensagem.textContent = 'Informe um link que comece com http:// ou https://.'
      return
    }
    const nome = alias.value.trim()
    if (nome && !validarAlias(nome)) {
      mensagem.textContent = 'O nome personalizado deve ter só letras, números e hífen.'
      return
    }
    gerar.disabled = true
    mensagem.textContent = ''
    const resposta = interpretarRespostaTinyUrl(await fetchExterno(montarUrlTinyUrl(endereco.url, nome || undefined)))
    gerar.disabled = false
    if (!resposta.ok) {
      mensagem.textContent = resposta.erro
      return
    }
    fecharPainel(painel)
    aoInserir(resposta.link)
  })
  rodape.append(cancelar, gerar)
  corpo.append(url, alias, aviso, mensagem, rodape)
  document.body.appendChild(painel)
  url.focus()
}
```

Em `theme.css`, junto dos estilos do painel:

```css
.seirmg-painel-flutuante-aviso {
  font-size: 11.5px;
  color: #667085;
  margin: 6px 0 0;
}
```

- [ ] **Step 9: Botão em `botoesInserir.ts`**

Imports: `import link2IconSvg from 'lucide-static/icons/link-2.svg?raw'`, `import { abrirDialogoLinkCurto } from './linkCurtoDialogo'`, e acrescentar `montarLinkHtml` ao import de `../../features/editor/linkCurto`.

```typescript
  botoes.set(
    'link-curto',
    criarBotaoToolbar('seirmg-cke-link-curto', 'Gerar link curto (TinyURL)', link2IconSvg, () => {
      editor
        .obterTextoSelecionado()
        .then((selecao) => {
          const link = validarUrlHttp(selecao)
          // Seleção que não é link vira o texto do link curto; sem seleção, o próprio link curto.
          const textoDoLink = link.ok ? '' : selecao.trim()
          abrirDialogoLinkCurto(link.ok ? link.url : '', (linkCurto) => {
            editor.inserirHtml(montarLinkHtml(linkCurto, textoDoLink || linkCurto)).catch(tratarErro('Falha ao inserir link curto'))
          })
        })
        .catch(tratarErro('Falha ao abrir o link curto'))
    })
  )
```

- [ ] **Step 10: Verificação geral e commit**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: tudo passa.

```bash
git add src/features/editor/linkCurto.ts src/features/editor/linkCurto.test.ts src/background/fetchExterno.ts src/background/fetchExterno.test.ts src/background/index.ts src/lib/fetchViaBackground.ts manifest.config.ts src/content-scripts/documento_editar/linkCurtoDialogo.ts src/content-scripts/documento_editar/botoesInserir.ts src/content-scripts/core/theme.css
git commit -m "feat(editor): gerar link curto pelo TinyURL e inserir no documento"
```

---

### Task 6: Referência interna

**Files:**
- Create: `src/features/editor/referenciaInterna.ts`, `src/features/editor/referenciaInterna.test.ts`, `src/content-scripts/documento_editar/referenciaInternaDialogo.ts`, `src/content-scripts/documento_editar/referenciaInternaDialogo.test.ts`
- Modify: `src/content-scripts/documento_editar/botoesInserir.ts`

**Interfaces:**
- Consumes: `CLASSES_PARAGRAFO_NUMERADO`, `nivelDaClasse` de `features/formatacao-basica/numeracaoParagrafos.ts`; `EditorSEI.corpo`, `inserirHtml`, `registrarAlteracao`.
- Produces: `numerarParagrafos(niveis: number[]): string[]`; `montarReferenciaHtml(alvos: Array<{ id: string; numero: string }>, prefixo: string): string`; `PREFIXO_ANCORA = 'seirmg-ref-'`; `listarParagrafosNumerados(corpo: HTMLElement): Array<{ elemento: HTMLElement; numero: string; resumo: string }>`; `garantirAncora(paragrafo: HTMLElement): string`; `atualizarNumerosReferencias(corpo: HTMLElement): void`; `abrirDialogoReferenciaInterna(editor: EditorSEI): void`.

- [ ] **Step 1: Testes puros**

`src/features/editor/referenciaInterna.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { montarReferenciaHtml, numerarParagrafos } from './referenciaInterna'

describe('numerarParagrafos', () => {
  it('numera de forma hierárquica e reinicia os níveis abaixo', () => {
    expect(numerarParagrafos([1, 2, 2, 3, 1, 2])).toEqual(['1', '1.1', '1.2', '1.2.1', '2', '2.1'])
  })
})

describe('montarReferenciaHtml', () => {
  const a = { id: 'seirmg-ref-a', numero: '3' }
  const b = { id: 'seirmg-ref-b', numero: '5' }
  const c = { id: 'seirmg-ref-c', numero: '7' }
  const link = (alvo: { id: string; numero: string }): string =>
    `<a href="#${alvo.id}" class="seirmg-ref-interna">${alvo.numero}</a>`

  it('uma referência com prefixo', () => {
    expect(montarReferenciaHtml([a], 'item')).toBe(`item ${link(a)}`)
  })
  it('duas e três referências, com prefixo no plural quando conhecido', () => {
    expect(montarReferenciaHtml([a, b], 'item')).toBe(`itens ${link(a)} e ${link(b)}`)
    expect(montarReferenciaHtml([a, b, c], 'art.')).toBe(`arts. ${link(a)}, ${link(b)} e ${link(c)}`)
  })
  it('prefixo desconhecido fica como digitado; sem prefixo, só os números', () => {
    expect(montarReferenciaHtml([a, b], 'cláusula')).toBe(`cláusula ${link(a)} e ${link(b)}`)
    expect(montarReferenciaHtml([a], '')).toBe(link(a))
  })
  it('escapa o prefixo', () => {
    expect(montarReferenciaHtml([a], '<b>')).toBe(`&lt;b&gt; ${link(a)}`)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/editor/referenciaInterna.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `referenciaInterna.ts`**

```typescript
// Referência interna: link pra um parágrafo numerado do próprio documento. O SEI numera esses
// parágrafos pela CSS (contadores), então o número exibido é recalculado aqui pela ordem e nível.
import { escaparHtml } from '../../content-scripts/documento_editar/dom'

export const PREFIXO_ANCORA = 'seirmg-ref-'

const PLURAIS: Record<string, string> = {
  item: 'itens',
  'art.': 'arts.',
  artigo: 'artigos',
  inciso: 'incisos',
  'alínea': 'alíneas',
  'parágrafo': 'parágrafos',
}

export function numerarParagrafos(niveis: number[]): string[] {
  const contadores: number[] = []
  return niveis.map((nivel) => {
    contadores[nivel - 1] = (contadores[nivel - 1] ?? 0) + 1
    contadores.length = nivel
    return Array.from({ length: nivel }, (_, i) => contadores[i] ?? 1).join('.')
  })
}

export function montarReferenciaHtml(alvos: Array<{ id: string; numero: string }>, prefixo: string): string {
  const links = alvos.map((alvo) => `<a href="#${alvo.id}" class="seirmg-ref-interna">${escaparHtml(alvo.numero)}</a>`)
  const lista = links.length <= 1 ? links.join('') : `${links.slice(0, -1).join(', ')} e ${links[links.length - 1]}`
  const base = prefixo.trim()
  if (!base) return lista
  const prefixoFinal = alvos.length > 1 ? (PLURAIS[base.toLowerCase()] ?? base) : base
  return `${escaparHtml(prefixoFinal)} ${lista}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/editor/referenciaInterna.test.ts`
Expected: PASS

- [ ] **Step 5: Testes das operações no corpo do documento**

`src/content-scripts/documento_editar/referenciaInternaDialogo.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirDialogoReferenciaInterna, atualizarNumerosReferencias, garantirAncora, listarParagrafosNumerados } from './referenciaInternaDialogo'
import type { EditorSEI } from './ponteEditor'

function corpoCom(html: string): HTMLElement {
  const corpo = document.createElement('div')
  corpo.innerHTML = html
  return corpo
}

describe('listarParagrafosNumerados', () => {
  it('lista os numerados com número hierárquico e começo do texto', () => {
    const corpo = corpoCom(
      '<p class="Texto_Justificado">intro</p><p class="Paragrafo_Numerado_Nivel1">Primeiro</p><p class="Paragrafo_Numerado_Nivel2">Sub</p>'
    )
    expect(listarParagrafosNumerados(corpo).map((p) => [p.numero, p.resumo])).toEqual([
      ['1', 'Primeiro'],
      ['1.1', 'Sub'],
    ])
  })
})

describe('garantirAncora', () => {
  it('cria a âncora uma vez e reaproveita depois', () => {
    const corpo = corpoCom('<p class="Paragrafo_Numerado_Nivel1">A</p>')
    const paragrafo = corpo.querySelector('p') as HTMLElement
    const id = garantirAncora(paragrafo)
    expect(id).toMatch(/^seirmg-ref-[a-z0-9]{8}$/)
    expect(garantirAncora(paragrafo)).toBe(id)
    expect(paragrafo.querySelectorAll('a[name]').length).toBe(1)
  })
})

describe('atualizarNumerosReferencias', () => {
  it('recalcula o número das referências pela posição atual do parágrafo', () => {
    const corpo = corpoCom(
      '<p class="Paragrafo_Numerado_Nivel1">novo primeiro</p>' +
        '<p class="Paragrafo_Numerado_Nivel1"><a name="seirmg-ref-abc12345" id="seirmg-ref-abc12345"></a>alvo</p>' +
        '<p>ver item <a href="#seirmg-ref-abc12345" class="seirmg-ref-interna">1</a></p>'
    )
    atualizarNumerosReferencias(corpo)
    expect(corpo.querySelector('.seirmg-ref-interna')?.textContent).toBe('2')
  })
})

describe('abrirDialogoReferenciaInterna', () => {
  afterEach(() => document.querySelectorAll('.seirmg-painel-flutuante').forEach((e) => e.remove()))

  it('documento sem parágrafo numerado: explica e não insere', () => {
    const editor = { corpo: corpoCom('<p>sem numeração</p>'), inserirHtml: vi.fn(), registrarAlteracao: vi.fn() } as unknown as EditorSEI
    abrirDialogoReferenciaInterna(editor)
    expect(document.querySelector('.seirmg-painel-flutuante')?.textContent).toContain('Nenhum parágrafo numerado')
    expect(editor.inserirHtml).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `bun run test src/content-scripts/documento_editar/referenciaInternaDialogo.test.ts`
Expected: FAIL

- [ ] **Step 7: Implementar `referenciaInternaDialogo.ts`**

```typescript
import hashIconSvg from 'lucide-static/icons/hash.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { CLASSES_PARAGRAFO_NUMERADO, nivelDaClasse } from '../../features/formatacao-basica/numeracaoParagrafos'
import { montarReferenciaHtml, numerarParagrafos, PREFIXO_ANCORA } from '../../features/editor/referenciaInterna'
import { criarBotaoDialogo, criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'
import type { EditorSEI } from './ponteEditor'

const SELETOR_NUMERADOS = CLASSES_PARAGRAFO_NUMERADO.map((classe) => `p.${classe}`).join(',')
const TAMANHO_RESUMO = 60

export function listarParagrafosNumerados(corpo: HTMLElement): Array<{ elemento: HTMLElement; numero: string; resumo: string }> {
  const paragrafos = Array.from(corpo.querySelectorAll<HTMLElement>(SELETOR_NUMERADOS))
  const niveis = paragrafos.map((p) => CLASSES_PARAGRAFO_NUMERADO.map((c) => (p.classList.contains(c) ? nivelDaClasse(c) : null)).find((n) => n !== null) ?? 1)
  const numeros = numerarParagrafos(niveis)
  return paragrafos.map((elemento, i) => {
    const texto = (elemento.textContent ?? '').replace(/\s+/g, ' ').trim()
    return { elemento, numero: numeros[i], resumo: texto.length > TAMANHO_RESUMO ? `${texto.slice(0, TAMANHO_RESUMO)}…` : texto }
  })
}

export function garantirAncora(paragrafo: HTMLElement): string {
  const existente = paragrafo.querySelector<HTMLAnchorElement>(`a[name^="${PREFIXO_ANCORA}"]`)
  if (existente) return existente.name
  const id = `${PREFIXO_ANCORA}${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`
  const ancora = paragrafo.ownerDocument.createElement('a')
  ancora.name = id
  ancora.id = id
  paragrafo.prepend(ancora)
  return id
}

export function atualizarNumerosReferencias(corpo: HTMLElement): void {
  const numeroPorAncora = new Map<string, string>()
  listarParagrafosNumerados(corpo).forEach(({ elemento, numero }) => {
    const ancora = elemento.querySelector<HTMLAnchorElement>(`a[name^="${PREFIXO_ANCORA}"]`)
    if (ancora) numeroPorAncora.set(ancora.name, numero)
  })
  corpo.querySelectorAll<HTMLAnchorElement>('a.seirmg-ref-interna').forEach((link) => {
    const numero = numeroPorAncora.get((link.getAttribute('href') ?? '').replace(/^#/, ''))
    if (numero && link.textContent !== numero) link.textContent = numero
  })
}

export function abrirDialogoReferenciaInterna(editor: EditorSEI): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Referência interna', hashIconSvg)
  const paragrafos = listarParagrafosNumerados(editor.corpo)

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const cancelar = criarBotaoDialogo('Fechar', xIconSvg)
  cancelar.addEventListener('click', () => fecharPainel(painel))

  if (paragrafos.length === 0) {
    const aviso = document.createElement('p')
    aviso.textContent = 'Nenhum parágrafo numerado no documento. Use os estilos "Parágrafo Numerado" do SEI para poder referenciá-los.'
    rodape.append(cancelar)
    corpo.append(aviso, rodape)
    document.body.appendChild(painel)
    return
  }

  const prefixo = document.createElement('input')
  prefixo.type = 'text'
  prefixo.placeholder = 'Prefixo (ex.: item, art.) — opcional'
  prefixo.value = 'item'
  const lista = document.createElement('select')
  lista.multiple = true
  lista.size = Math.min(10, paragrafos.length)
  paragrafos.forEach((p, i) => lista.add(new Option(`${p.numero}. ${p.resumo}`, String(i))))
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-painel-flutuante-mensagem'

  const inserir = criarBotaoDialogo('Inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  inserir.addEventListener('click', () => {
    const escolhidos = Array.from(lista.selectedOptions).map((opcao) => paragrafos[Number(opcao.value)])
    if (escolhidos.length === 0) {
      mensagem.textContent = 'Escolha pelo menos um parágrafo.'
      return
    }
    const alvos = escolhidos.map((p) => ({ id: garantirAncora(p.elemento), numero: p.numero }))
    atualizarNumerosReferencias(editor.corpo)
    fecharPainel(painel)
    editor
      .registrarAlteracao()
      .then(() => editor.inserirHtml(montarReferenciaHtml(alvos, prefixo.value)))
      .catch((erro) => console.error('[SEIRMG] Falha ao inserir referência interna:', erro))
  })
  rodape.append(cancelar, inserir)
  corpo.append(prefixo, lista, mensagem, rodape)
  document.body.appendChild(painel)
  lista.focus()
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `bun run test src/content-scripts/documento_editar/referenciaInternaDialogo.test.ts src/features/editor`
Expected: PASS

- [ ] **Step 9: Botão em `botoesInserir.ts`**

Imports: `import hashIconSvg from 'lucide-static/icons/hash.svg?raw'`, `import { abrirDialogoReferenciaInterna } from './referenciaInternaDialogo'`.

```typescript
  botoes.set(
    'referencia-interna',
    criarBotaoToolbar('seirmg-cke-referencia-interna', 'Inserir referência interna (parágrafo numerado)', hashIconSvg, () => {
      abrirDialogoReferenciaInterna(editor)
    })
  )
```

- [ ] **Step 10: Verificação geral e commit**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: tudo passa.

```bash
git add src/features/editor/referenciaInterna.ts src/features/editor/referenciaInterna.test.ts src/content-scripts/documento_editar/referenciaInternaDialogo.ts src/content-scripts/documento_editar/referenciaInternaDialogo.test.ts src/content-scripts/documento_editar/botoesInserir.ts
git commit -m "feat(editor): referência interna a parágrafos numerados, com números atualizados"
```

---

### Task 7: Importar Word e HTML

**Files:**
- Create: `src/features/editor/importarHtml.ts`, `src/features/editor/importarHtml.test.ts`, `src/content-scripts/documento_editar/importarArquivo.ts`
- Modify: `package.json` (dependência), `src/content-scripts/documento_editar/botoesInserir.ts`

**Interfaces:**
- Consumes: `EditorSEI.inserirHtml`, `criarBotaoToolbar`.
- Produces: `tipoArquivoImportavel(nome: string): 'docx' | 'html' | null`; `limparHtmlImportado(html: string): string`; `aplicarEstilosSei(html: string): string`; `prepararHtmlParaSei(html: string): string` (= limpar + estilos); `escolherEImportarArquivo(aoInserir: (html: string) => void, aoErro: (mensagem: string) => void): void`.

- [ ] **Step 1: Instalar a dependência**

Run: `bun add mammoth`
Expected: `mammoth` em `dependencies`.

- [ ] **Step 2: Testes puros**

`src/features/editor/importarHtml.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { aplicarEstilosSei, limparHtmlImportado, prepararHtmlParaSei, tipoArquivoImportavel } from './importarHtml'

describe('tipoArquivoImportavel', () => {
  it('aceita .docx, .html e .htm (sem diferenciar maiúsculas); recusa o resto', () => {
    expect(tipoArquivoImportavel('Ofício.DOCX')).toBe('docx')
    expect(tipoArquivoImportavel('pagina.htm')).toBe('html')
    expect(tipoArquivoImportavel('antigo.doc')).toBeNull()
    expect(tipoArquivoImportavel('arquivo.pdf')).toBeNull()
  })
})

describe('limparHtmlImportado', () => {
  it('remove scripts, estilos, eventos e atributos; mantém a estrutura permitida', () => {
    const sujo =
      '<style>p{color:red}</style><p style="color:red" class="x" onclick="roubar()">Olá <b>mundo</b><script>alert(1)</script></p>' +
      '<div><span>solto</span></div>'
    expect(limparHtmlImportado(sujo)).toBe('<p>Olá <b>mundo</b></p>solto')
  })

  it('links só http(s)/mailto; javascript: vira texto', () => {
    expect(limparHtmlImportado('<a href="https://a.gov.br">ok</a><a href="javascript:x()">ruim</a>')).toBe(
      '<a href="https://a.gov.br">ok</a>ruim'
    )
  })

  it('imagens só em data URI png/jpeg/gif; svg e externas saem', () => {
    const html =
      '<img src="data:image/png;base64,AAA" alt="a"><img src="https://x.com/a.png"><img src="data:image/svg+xml;base64,BBB">'
    expect(limparHtmlImportado(html)).toBe('<img src="data:image/png;base64,AAA" alt="a">')
  })

  it('tabela mantém colspan numérico', () => {
    expect(limparHtmlImportado('<table><tr><td colspan="2" width="9">a</td></tr></table>')).toBe(
      '<table><tbody><tr><td colspan="2">a</td></tr></tbody></table>'
    )
  })
})

describe('aplicarEstilosSei', () => {
  it('parágrafos, títulos e tabelas com as classes do SEI', () => {
    const html = '<h1>Título</h1><h2>Seção</h2><p>Texto</p><table><tbody><tr><td>célula</td></tr></tbody></table>'
    expect(aplicarEstilosSei(html)).toBe(
      '<p class="Texto_Fundo_Cinza_Maiusculas_Negrito">Título</p>' +
        '<p class="Texto_Fundo_Cinza_Negrito">Seção</p>' +
        '<p class="Texto_Justificado">Texto</p>' +
        '<table class="Tabela" style="border-collapse:collapse;width:100%;"><tbody><tr><td><p class="Tabela_Texto_Alinhado_Esquerda">célula</p></td></tr></tbody></table>'
    )
  })

  it('texto solto no nível de cima vira parágrafo justificado', () => {
    expect(aplicarEstilosSei('solto')).toBe('<p class="Texto_Justificado">solto</p>')
  })
})

describe('prepararHtmlParaSei', () => {
  it('limpa e aplica os estilos', () => {
    expect(prepararHtmlParaSei('<p onclick="x()">Oi</p><script>y()</script>')).toBe('<p class="Texto_Justificado">Oi</p>')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun run test src/features/editor/importarHtml.test.ts`
Expected: FAIL

- [ ] **Step 4: Implementar `importarHtml.ts`**

```typescript
// Conteúdo de Word (.docx, convertido pelo mammoth) ou HTML colocado no padrão do SEI: primeiro
// limpa (só estrutura permitida, nada executável), depois aplica as classes de estilo do SEI 4.1.

export function tipoArquivoImportavel(nome: string): 'docx' | 'html' | null {
  const extensao = nome.toLowerCase().split('.').pop()
  if (extensao === 'docx') return 'docx'
  if (extensao === 'html' || extensao === 'htm') return 'html'
  return null
}

const PERMITIDOS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG',
])
const DESCARTADOS_COM_CONTEUDO = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE'])

function limparNo(no: Node, doc: Document): Node[] {
  if (no.nodeType === Node.TEXT_NODE) return [doc.createTextNode(no.textContent ?? '')]
  if (no.nodeType !== Node.ELEMENT_NODE) return []
  const elemento = no as Element
  const tag = elemento.tagName
  if (DESCARTADOS_COM_CONTEUDO.has(tag)) return []
  const filhos = Array.from(elemento.childNodes).flatMap((filho) => limparNo(filho, doc))
  if (!PERMITIDOS.has(tag)) return filhos

  if (tag === 'IMG') {
    const src = elemento.getAttribute('src') ?? ''
    if (!/^data:image\/(png|jpe?g|gif);base64,/i.test(src)) return []
    const imagem = doc.createElement('img')
    imagem.setAttribute('src', src)
    const alt = elemento.getAttribute('alt')
    if (alt) imagem.setAttribute('alt', alt)
    return [imagem]
  }

  const novo = doc.createElement(tag.toLowerCase())
  if (tag === 'A') {
    const href = elemento.getAttribute('href') ?? ''
    if (!/^(https?:|mailto:)/i.test(href)) return filhos
    novo.setAttribute('href', href)
  }
  if (tag === 'TD' || tag === 'TH') {
    for (const atributo of ['colspan', 'rowspan']) {
      const valor = elemento.getAttribute(atributo)
      if (valor && /^\d+$/.test(valor)) novo.setAttribute(atributo, valor)
    }
  }
  novo.append(...filhos)
  return [novo]
}

export function limparHtmlImportado(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const saida = doc.createElement('div')
  saida.append(...Array.from(doc.body.childNodes).flatMap((no) => limparNo(no, doc)))
  return saida.innerHTML
}

function trocarPorParagrafo(elemento: Element, classe: string): void {
  const p = elemento.ownerDocument.createElement('p')
  p.className = classe
  p.append(...Array.from(elemento.childNodes))
  elemento.replaceWith(p)
}

export function aplicarEstilosSei(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const raiz = doc.body.firstElementChild as HTMLElement

  // Texto/inline solto no nível de cima entra num parágrafo justificado.
  Array.from(raiz.childNodes).forEach((no) => {
    const bloco = no.nodeType === Node.ELEMENT_NODE && /^(P|H[1-6]|UL|OL|TABLE|IMG)$/.test((no as Element).tagName)
    if (bloco || (no.nodeType === Node.TEXT_NODE && !(no.textContent ?? '').trim())) return
    const p = doc.createElement('p')
    no.replaceWith(p)
    p.append(no)
  })

  raiz.querySelectorAll('h1').forEach((h) => trocarPorParagrafo(h, 'Texto_Fundo_Cinza_Maiusculas_Negrito'))
  raiz.querySelectorAll('h2, h3, h4, h5, h6').forEach((h) => trocarPorParagrafo(h, 'Texto_Fundo_Cinza_Negrito'))
  raiz.querySelectorAll('table').forEach((tabela) => {
    tabela.className = 'Tabela'
    tabela.setAttribute('style', 'border-collapse:collapse;width:100%;')
  })
  raiz.querySelectorAll('td, th').forEach((celula) => {
    const paragrafos = celula.querySelectorAll('p')
    if (paragrafos.length > 0) {
      paragrafos.forEach((p) => (p.className = 'Tabela_Texto_Alinhado_Esquerda'))
      return
    }
    const p = doc.createElement('p')
    p.className = 'Tabela_Texto_Alinhado_Esquerda'
    p.append(...Array.from(celula.childNodes))
    celula.append(p)
  })
  raiz.querySelectorAll('p').forEach((p) => {
    if (!p.className) p.className = 'Texto_Justificado'
  })
  return raiz.innerHTML
}

export function prepararHtmlParaSei(html: string): string {
  return aplicarEstilosSei(limparHtmlImportado(html))
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test src/features/editor/importarHtml.test.ts`
Expected: PASS (todos). Se o jsdom serializar algum caso de forma equivalente mas diferente (ex.: `<tbody>` inserido automaticamente), ajustar só a expectativa do teste ao HTML equivalente, nunca afrouxar a limpeza.

- [ ] **Step 6: Leitura do arquivo `importarArquivo.ts`**

```typescript
// Seletor de arquivo do "Importar Word/HTML": tudo é lido e convertido no navegador.
import { prepararHtmlParaSei, tipoArquivoImportavel } from '../../features/editor/importarHtml'

async function converterParaHtml(arquivo: File, tipo: 'docx' | 'html'): Promise<string> {
  if (tipo === 'html') return arquivo.text()
  const mammoth = await import('mammoth')
  const resultado = await mammoth.convertToHtml({ arrayBuffer: await arquivo.arrayBuffer() })
  return resultado.value
}

export function escolherEImportarArquivo(aoInserir: (html: string) => void, aoErro: (mensagem: string) => void): void {
  const seletor = document.createElement('input')
  seletor.type = 'file'
  seletor.accept = '.docx,.html,.htm'
  seletor.addEventListener('change', async () => {
    const arquivo = seletor.files?.[0]
    if (!arquivo) return
    const tipo = tipoArquivoImportavel(arquivo.name)
    if (!tipo) {
      aoErro('Formato não suportado. Use um arquivo .docx (Word 2007 ou mais novo) ou .html. Arquivos .doc antigos: abra no Word e salve como .docx.')
      return
    }
    try {
      const html = prepararHtmlParaSei(await converterParaHtml(arquivo, tipo))
      if (!html.replace(/<[^>]+>/g, '').trim() && !html.includes('<img')) {
        aoErro('O arquivo está vazio ou não tem conteúdo que possa ser inserido.')
        return
      }
      aoInserir(html)
    } catch (erro) {
      console.error('[SEIRMG] Falha ao importar arquivo:', erro)
      aoErro('Não foi possível ler o arquivo. Confira se ele abre normalmente no Word ou no navegador.')
    }
  })
  seletor.click()
}
```

Se o TypeScript não encontrar os tipos do `mammoth` (`Could not find a declaration file`), acrescentar em `src/vite-env.d.ts`:

```typescript
declare module 'mammoth' {
  export function convertToHtml(entrada: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
}
```

- [ ] **Step 7: Botão em `botoesInserir.ts`**

Imports: `import fileInputIconSvg from 'lucide-static/icons/file-input.svg?raw'`, `import { escolherEImportarArquivo } from './importarArquivo'`, e os já existentes `criarPainelFlutuante`/`fecharPainel` de `./dialogoFlutuante` pra mostrar o erro:

```typescript
import fileWarningIconSvg from 'lucide-static/icons/file-warning.svg?raw'
import { criarPainelFlutuante } from './dialogoFlutuante'

function mostrarErroImportacao(mensagem: string): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Importar Word/HTML', fileWarningIconSvg)
  const texto = document.createElement('p')
  texto.textContent = mensagem
  const fechar = document.createElement('button')
  fechar.type = 'button'
  fechar.className = 'seirmg-btn-acao'
  fechar.textContent = 'Fechar'
  fechar.addEventListener('click', () => painel.remove())
  corpo.append(texto, fechar)
  document.body.appendChild(painel)
}
```

```typescript
  botoes.set(
    'importar',
    criarBotaoToolbar('seirmg-cke-importar', 'Importar conteúdo de Word (.docx) ou HTML', fileInputIconSvg, () => {
      escolherEImportarArquivo((html) => {
        editor.inserirHtml(html).catch(tratarErro('Falha ao inserir conteúdo importado'))
      }, mostrarErroImportacao)
    })
  )
```

- [ ] **Step 8: Verificação geral, build e commit**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: tudo passa; `mammoth` num chunk separado (carregado só no clique). Se o Vite reclamar de módulo de Node no `mammoth`, trocar o import dinâmico por `import('mammoth/mammoth.browser.js')` e ajustar a declaração de tipos para esse caminho.

```bash
git add package.json bun.lock src/features/editor/importarHtml.ts src/features/editor/importarHtml.test.ts src/content-scripts/documento_editar/importarArquivo.ts src/content-scripts/documento_editar/botoesInserir.ts src/vite-env.d.ts
git commit -m "feat(editor): importar conteúdo de Word (.docx) e HTML no padrão do SEI"
```

---

## Verificação final (depois da Task 7)

1. `bun run test && bun run typecheck && bun run lint && bun run build` — tudo passa.
2. Chromium (Playwright) com uma página de teste que carregue o CKEditor 4 e o content script do editor (mesma técnica usada no teste da fila de envio: página temporária no `dist`, apagada depois): os quatro grupos na barra, na ordem; checklist insere e alterna; QR mostra prévia e insere a imagem; referência interna lista os numerados e insere o link; importar `.html` insere com as classes do SEI. TinyURL com resposta simulada (rota interceptada).
3. SEI real (HMMG/Campinas, 4.1.5), com o usuário, num documento de teste: inserir cada uma das cinco coisas, salvar, fechar e reabrir — tudo continua lá; checklist marcado continua marcado; link curto abre; referência interna leva ao parágrafo.
