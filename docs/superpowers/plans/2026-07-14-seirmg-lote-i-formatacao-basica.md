# Lote I — Formatação Básica no Editor de Documentos (+ LaTeX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 9 botões de formatação básica (alinhar texto, tamanho de fonte, copiar formatação, tabela rápida, quebra de página, sumário, nota de rodapé, maiúscula automática, LaTeX) diretamente na barra de ferramentas nativa do CKEditor no editor de documentos do SEI, mais teclas de atalho configuráveis, tudo por trás de um toggle único nas Opções.

**Architecture:** O mundo isolado (`documento_editar/formatacaoBasica.ts`) injeta botões no DOM da toolbar nativa do CKEditor (mesma técnica do Sei Pro: espera `.cke_toolbox` aparecer, injeta `<a class="cke_button">` imitando a marcação nativa — sem usar o sistema de plugins do CKEditor). Leitura de estado (que classe/estilo já está aplicado, quais parágrafos existem) é sempre direta no DOM do editor (`editor.corpo`/`editor.janela`, já expostos pela ponte do Lote R). Escrita de conteúdo novo sempre passa pela ponte (`ponteEditor.ts`/`pontePrincipal.ts`) usando comandos novos e nomeados executados no mundo principal contra a instância real do CKEditor, preservando o histórico de desfazer do CKEditor. Duas exceções documentadas (renumeração de nota de rodapé e o `id` de âncora do sumário) fazem mutação direta do DOM por serem metadado estrutural, não conteúdo novo do usuário.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin`, Vitest + jsdom, `lucide-static` (ícones), `katex` (renderização LaTeX local, nova dependência).

## Global Constraints

- Nomes de função/variável em português, seguindo a convenção já usada no resto do projeto (spec, todo o documento).
- `tsconfig.json` tem `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` — todo código novo precisa passar em `npm run typecheck` sem warnings.
- Fora de escopo desta rodada (spec, seção "Escopo final"): hiperlinks (barrinha hover), salvamento automático, hashcode/verificação de integridade, título da página/URL amigável.
- LaTeX usa KaTeX local — nenhuma chamada de rede para `latex.codecogs.com` ou qualquer outro serviço externo (spec, seção "LaTeX").
- Escrita no documento do editor sempre passa pela ponte (`enviarComando`), nunca mutação direta, exceto as duas exceções documentadas (renumeração de nota de rodapé, `id` de âncora do sumário) (spec, seção "Ler vs. escrever no documento").
- Botões usam ícones `lucide-static` no tamanho nativo do CKEditor (16×16), nunca solução visual própria (spec, seção "Ícones").
- `formatacaoBasica.ativo` (novo toggle em `SyncConfig`) começa `false` por padrão, mesmo padrão de "pendente de validação manual" já usado em `ferramentasIA.ativo`/`corretorOrtografico.ativo`.

---

### Task 1: Protocolo + ponte — comandos `aplicarClasseParagrafo` e `aplicarEstiloTexto`

**Files:**
- Modify: `src/content-scripts/documento_editar/protocolo.ts`
- Modify: `src/content-scripts/documento_editar/pontePrincipal.ts`
- Modify: `src/content-scripts/documento_editar/pontePrincipal.test.ts`
- Modify: `src/content-scripts/documento_editar/ponteEditor.ts`
- Modify: `src/content-scripts/documento_editar/ponteEditor.test.ts`
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Consumes: nada novo (estende infraestrutura já existente do Lote R).
- Produces: `DescritorEstiloTexto { fontSizePx?: number; bold?: boolean; italic?: boolean; underline?: boolean; color?: string }` de `protocolo.ts`; `EditorSEI.aplicarClasseParagrafo(classe: string): Promise<void>` e `EditorSEI.aplicarEstiloTexto(estilo: DescritorEstiloTexto): Promise<void>` de `ponteEditor.ts`; `FormatacaoBasicaConfig { ativo: boolean; atalhos: AtalhoParagrafo[] }` e `AtalhoParagrafo { tecla: string; classe: string; rotulo: string }` de `storage.ts` — usados por todas as tasks seguintes que tocam o editor. Definir a config aqui (não só na Task 10, que cuida da UI de Opções) evita que `npm run typecheck` fique quebrado entre as Tasks 3 e 10.

- [ ] **Step 1: Adicionar os novos tipos em `protocolo.ts`**

Adicionar ao final de `src/content-scripts/documento_editar/protocolo.ts`:

```ts
export interface DescritorEstiloTexto {
  fontSizePx?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
}
```

E alterar a linha `export type TipoComando = 'getSelectedText' | 'insertHtml' | 'insertText' | 'getTextoCompleto'` para:

```ts
export type TipoComando =
  | 'getSelectedText'
  | 'insertHtml'
  | 'insertText'
  | 'getTextoCompleto'
  | 'aplicarClasseParagrafo'
  | 'aplicarEstiloTexto'
```

- [ ] **Step 2: Escrever os testes que vão falhar em `pontePrincipal.test.ts`**

Primeiro, substituir a função `criarInstanciaFalsa` e `definirCkeditor` existentes por versões que suportam os novos comandos (mantém compatibilidade com os testes já existentes, que não usam os campos novos):

```ts
function criarInstanciaFalsa(nome: string, editavel: boolean) {
  return {
    name: nome,
    getSelection: () => ({
      getSelectedText: () => `selecionado-${nome}`,
      getStartElement: (): unknown => null,
    }),
    insertHtml: vi.fn(),
    insertText: vi.fn(),
    editable: () => ({ getText: () => `texto-completo-${nome}` }),
    document: {
      getBody: () => ({ $: { contentEditable: editavel ? 'true' : 'false' } as unknown as HTMLElement }),
    },
    fire: vi.fn(),
    applyStyle: vi.fn(),
    execCommand: vi.fn(),
  }
}

class EstiloFalso {
  definicao: unknown
  constructor(definicao: unknown) {
    this.definicao = definicao
  }
}

function definirCkeditor(janela: Window, instances: Record<string, unknown>): void {
  ;(janela as unknown as { CKEDITOR: unknown }).CKEDITOR = { instances, style: EstiloFalso }
}

function criarElementoFalso(nomeTag: string): { setAttribute: ReturnType<typeof vi.fn>; getAscendant: (nomes: string[], incluirAtual: boolean) => unknown } {
  const setAttribute = vi.fn()
  const elemento = {
    setAttribute,
    getAscendant: (nomes: string[], incluirAtual: boolean): unknown =>
      incluirAtual && nomes.includes(nomeTag) ? elemento : null,
  }
  return elemento
}
```

Nota: essa alteração de `criarInstanciaFalsa` removeu o parâmetro `frameElement` usado no teste "marca o iframe real da instância editável..." (Lote R) — reintroduzir esse parâmetro também, mesclando as duas versões:

```ts
function criarInstanciaFalsa(nome: string, editavel: boolean, frameElement: HTMLIFrameElement | null = null) {
  return {
    name: nome,
    getSelection: () => ({
      getSelectedText: () => `selecionado-${nome}`,
      getStartElement: (): unknown => null,
    }),
    insertHtml: vi.fn(),
    insertText: vi.fn(),
    editable: () => ({ getText: () => `texto-completo-${nome}` }),
    document: {
      getBody: () => ({ $: { contentEditable: editavel ? 'true' : 'false' } as unknown as HTMLElement }),
      getWindow: () => ({ $: { frameElement } as unknown as Window }),
    },
    fire: vi.fn(),
    applyStyle: vi.fn(),
    execCommand: vi.fn(),
  }
}
```

Adicionar ao final do `describe('criarPonteMainWorld', ...)` em `pontePrincipal.test.ts`:

```ts
  it('aplica a classe no parágrafo da seleção atual, envolvida em saveSnapshot', async () => {
    const janela = criarJanelaFalsa()
    const paragrafo = criarElementoFalso('p')
    const instancia = criarInstanciaFalsa('corpo', true)
    instancia.getSelection = () => ({
      getSelectedText: () => '',
      getStartElement: () => paragrafo,
    })
    definirCkeditor(janela, { corpo: instancia })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '1', tipo: 'aplicarClasseParagrafo', args: ['Texto_Alinhado_Centro'] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '1', resultado: null, erro: null })
    expect(paragrafo.setAttribute).toHaveBeenCalledWith('class', 'Texto_Alinhado_Centro')
    expect(instancia.fire).toHaveBeenCalledWith('saveSnapshot')
    ponte.destruir()
  })

  it('responde com erro quando não há parágrafo na seleção pra aplicarClasseParagrafo', async () => {
    const janela = criarJanelaFalsa()
    const instancia = criarInstanciaFalsa('corpo', true)
    definirCkeditor(janela, { corpo: instancia })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '2', tipo: 'aplicarClasseParagrafo', args: ['Texto_Alinhado_Centro'] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({
      id: '2',
      resultado: null,
      erro: 'Nenhum parágrafo encontrado na seleção atual',
    })
    ponte.destruir()
  })

  it('aplica estilo de texto (tamanho de fonte + cor) via CKEDITOR.style, envolvido em saveSnapshot', async () => {
    const janela = criarJanelaFalsa()
    const instancia = criarInstanciaFalsa('corpo', true)
    definirCkeditor(janela, { corpo: instancia })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const estilo = { fontSizePx: 18, color: '#ff0000' }
    const comando: DetalheComando = { id: '3', tipo: 'aplicarEstiloTexto', args: [estilo] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '3', resultado: null, erro: null })
    expect(instancia.applyStyle).toHaveBeenCalledWith(
      expect.objectContaining({ definicao: { element: 'span', styles: { 'font-size': '18px', color: '#ff0000' } } })
    )
    expect(instancia.fire).toHaveBeenCalledWith('saveSnapshot')
    ponte.destruir()
  })

  it('aplica negrito/itálico/sublinhado via execCommand quando aplicarEstiloTexto pede', async () => {
    const janela = criarJanelaFalsa()
    const instancia = criarInstanciaFalsa('corpo', true)
    definirCkeditor(janela, { corpo: instancia })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const estilo = { bold: true, italic: true, underline: true }
    const comando: DetalheComando = { id: '4', tipo: 'aplicarEstiloTexto', args: [estilo] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '4', resultado: null, erro: null })
    expect(instancia.execCommand).toHaveBeenCalledWith('bold')
    expect(instancia.execCommand).toHaveBeenCalledWith('italic')
    expect(instancia.execCommand).toHaveBeenCalledWith('underline')
    expect(instancia.applyStyle).not.toHaveBeenCalled()
    ponte.destruir()
  })
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `npm test -- pontePrincipal`
Expected: FAIL — `aplicarClasseParagrafo`/`aplicarEstiloTexto` não tratados (comando cai no `default: return null` e a resposta não bate com o esperado).

- [ ] **Step 4: Implementar em `pontePrincipal.ts`**

Substituir o conteúdo de `src/content-scripts/documento_editar/pontePrincipal.ts` por:

```ts
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DescritorEstiloTexto, DetalheComando, DetalheResposta, DetalhePronto, TipoComando } from './protocolo'

interface ElementoCKEditor {
  setAttribute: (nome: string, valor: string) => void
  getAscendant: (nomes: string[], incluirAtual: boolean) => ElementoCKEditor | null
}

interface SelecaoCKEditor {
  getSelectedText: () => string
  getStartElement: () => ElementoCKEditor | null
}

interface DefinicaoEstiloCKEditor {
  element: string
  styles: Record<string, string>
}

interface InstanciaCKEditor {
  name: string
  getSelection: () => SelecaoCKEditor | null
  insertHtml: (html: string) => void
  insertText: (texto: string) => void
  editable?: () => { getText: () => string } | undefined
  document: { getBody: () => { $: HTMLElement }; getWindow: () => { $: Window } }
  fire: (evento: string) => void
  applyStyle: (estilo: unknown) => void
  execCommand: (nome: string) => void
}

interface JanelaComCKEditor {
  CKEDITOR?: {
    instances: Record<string, InstanciaCKEditor>
    style: new (definicao: DefinicaoEstiloCKEditor) => unknown
  }
}

const NOMES_BLOCO = ['p', 'li', 'td', 'th', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']

// A tela de edição de documento do SEI tem várias instâncias de CKEditor na mesma
// página (cabeçalho/despacho/data/corpo/rodapé), e só uma é de fato editável
// (contentEditable) — pegar "a primeira" pegaria uma arbitrária.
function obterInstanciaEditavel(janelaGlobal: Window): InstanciaCKEditor | null {
  const instances = (janelaGlobal as unknown as JanelaComCKEditor).CKEDITOR?.instances
  if (!instances) return null
  const editores = Object.values(instances)
  const editavel = editores.find((editor) => {
    try {
      return editor.document.getBody().$.contentEditable === 'true'
    } catch {
      return false
    }
  })
  return editavel ?? editores[0] ?? null
}

// Isolated e main world enxergam o mesmo DOM (só a execução JS é isolada), então
// marcar aqui o iframe que o CKEditor realmente usa é confiável — ao contrário de
// tentar re-descobrir esse iframe no isolated world a partir de texto visível
// (title/label), que não tem nenhuma relação garantida com o nome da instância.
function marcarIframeDaInstancia(instancia: InstanciaCKEditor): void {
  try {
    const frame = instancia.document.getWindow().$.frameElement
    if (frame instanceof HTMLIFrameElement) {
      frame.setAttribute(ATRIBUTO_EDITOR_ALVO, instancia.name)
    }
  } catch {
    // Instância sem iframe acessível (ex.: editor inline, fora do escopo do Lote R)
    // — ponteEditor.ts reporta isso na mensagem de erro em vez de travar aqui.
  }
}

function aplicarClasseParagrafo(instancia: InstanciaCKEditor, classe: string): void {
  const elemento = instancia.getSelection?.()?.getStartElement()
  const paragrafo = elemento?.getAscendant(NOMES_BLOCO, true)
  if (!paragrafo) throw new Error('Nenhum parágrafo encontrado na seleção atual')
  instancia.fire('saveSnapshot')
  paragrafo.setAttribute('class', classe)
  instancia.fire('saveSnapshot')
}

function montarDefinicaoEstilo(estilo: DescritorEstiloTexto): DefinicaoEstiloCKEditor {
  const styles: Record<string, string> = {}
  if (estilo.fontSizePx !== undefined) styles['font-size'] = `${estilo.fontSizePx}px`
  if (estilo.color !== undefined) styles.color = estilo.color
  return { element: 'span', styles }
}

function aplicarEstiloTexto(
  janelaGlobal: Window,
  instancia: InstanciaCKEditor,
  estilo: DescritorEstiloTexto
): void {
  const ClasseEstilo = (janelaGlobal as unknown as JanelaComCKEditor).CKEDITOR?.style
  instancia.fire('saveSnapshot')
  if (estilo.bold) instancia.execCommand('bold')
  if (estilo.italic) instancia.execCommand('italic')
  if (estilo.underline) instancia.execCommand('underline')
  if (ClasseEstilo && (estilo.fontSizePx !== undefined || estilo.color !== undefined)) {
    instancia.applyStyle(new ClasseEstilo(montarDefinicaoEstilo(estilo)))
  }
  instancia.fire('saveSnapshot')
}

function executarComando(
  janelaGlobal: Window,
  instancia: InstanciaCKEditor,
  tipo: TipoComando,
  args: unknown[]
): unknown {
  switch (tipo) {
    case 'getSelectedText':
      return instancia.getSelection?.()?.getSelectedText() ?? ''
    case 'insertHtml':
      instancia.insertHtml(String(args[0] ?? ''))
      return null
    case 'insertText':
      instancia.insertText(String(args[0] ?? ''))
      return null
    case 'getTextoCompleto':
      return instancia.editable?.()?.getText() ?? ''
    case 'aplicarClasseParagrafo':
      aplicarClasseParagrafo(instancia, String(args[0] ?? ''))
      return null
    case 'aplicarEstiloTexto':
      aplicarEstiloTexto(janelaGlobal, instancia, args[0] as DescritorEstiloTexto)
      return null
    default:
      return null
  }
}

export interface PonteMainWorld {
  destruir: () => void
}

export function criarPonteMainWorld(
  janelaGlobal: Window,
  intervaloMs = 200,
  tentativasMax = 50,
  intervaloReanuncioMs = 1000,
  reanunciosMax = 30
): PonteMainWorld {
  let instanciaAtual: InstanciaCKEditor | null = null
  let temporizador: ReturnType<typeof setTimeout> | undefined
  let temporizadorReanuncio: ReturnType<typeof setTimeout> | undefined

  function anunciar(): void {
    if (!instanciaAtual) return
    const detalhe: DetalhePronto = { nome: instanciaAtual.name }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: detalhe }))
  }

  // Confirmado ao vivo numa instância SEI real: um evento disparado repetidamente
  // (tipo "batimento cardíaco") sempre atravessa isolated↔main world, mas um disparo
  // único do EVENTO_PRONTO real às vezes se perde (o listener do isolated world já
  // está registrado antes, mas mesmo assim não recebe). Causa exata não confirmada —
  // pode ser um período de "aquecimento" da ponte de eventos cross-world do Chrome
  // logo após a injeção dos content scripts. Reanunciar por um tempo em vez de
  // disparar uma vez só é a mitigação robusta: ponteEditor.ts já trata receber o
  // mesmo EVENTO_PRONTO várias vezes como algo inofensivo (idempotente).
  function reanunciarPeriodicamente(reanunciosRestantes: number): void {
    anunciar()
    if (reanunciosRestantes <= 0) return
    temporizadorReanuncio = setTimeout(() => reanunciarPeriodicamente(reanunciosRestantes - 1), intervaloReanuncioMs)
  }

  function tentarAnunciar(tentativasRestantes: number): void {
    const instancia = obterInstanciaEditavel(janelaGlobal)
    if (instancia) {
      instanciaAtual = instancia
      marcarIframeDaInstancia(instancia)
      reanunciarPeriodicamente(reanunciosMax)
      return
    }
    if (tentativasRestantes <= 0) return
    temporizador = setTimeout(() => tentarAnunciar(tentativasRestantes - 1), intervaloMs)
  }

  function tratarComando(evento: Event): void {
    const { id, tipo, args } = (evento as CustomEvent<DetalheComando>).detail
    let resultado: unknown = null
    let erro: string | null = null
    try {
      if (!instanciaAtual) throw new Error('Nenhuma instância de CKEditor disponível')
      resultado = executarComando(janelaGlobal, instanciaAtual, tipo, args)
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e)
    }
    const resposta: DetalheResposta = { id, resultado, erro }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_RESPOSTA, { detail: resposta }))
  }

  janelaGlobal.addEventListener(EVENTO_COMANDO, tratarComando)
  tentarAnunciar(tentativasMax)

  return {
    destruir(): void {
      janelaGlobal.removeEventListener(EVENTO_COMANDO, tratarComando)
      if (temporizador) clearTimeout(temporizador)
      if (temporizadorReanuncio) clearTimeout(temporizadorReanuncio)
    },
  }
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npm test -- pontePrincipal`
Expected: PASS — todos os testes (os já existentes do Lote R + os 4 novos) verdes.

- [ ] **Step 6: Adicionar os métodos novos em `EditorSEI` (`ponteEditor.ts`)**

Em `src/content-scripts/documento_editar/ponteEditor.ts`, alterar o import:

```ts
import { ATRIBUTO_EDITOR_ALVO, EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DescritorEstiloTexto, DetalheComando, DetalhePronto, DetalheResposta, TipoComando } from './protocolo'
```

Alterar a interface `EditorSEI`:

```ts
export interface EditorSEI {
  obterTextoSelecionado: () => Promise<string>
  obterTextoCompleto: () => Promise<string>
  inserirHtml: (html: string) => Promise<void>
  inserirTexto: (texto: string) => Promise<void>
  aplicarClasseParagrafo: (classe: string) => Promise<void>
  aplicarEstiloTexto: (estilo: DescritorEstiloTexto) => Promise<void>
  corpo: HTMLElement
  documento: Document
  janela: Window
  iframe: HTMLIFrameElement
}
```

E no objeto retornado por `montarEditor`, adicionar as duas novas propriedades (mantendo as já existentes):

```ts
    return {
      corpo: documentoEditor.body,
      documento: documentoEditor,
      janela: janelaEditor,
      iframe,
      obterTextoSelecionado: () => enviarComando('getSelectedText', []).then(String),
      obterTextoCompleto: () => enviarComando('getTextoCompleto', []).then(String),
      inserirHtml: (html: string) => enviarComando('insertHtml', [html]).then(() => undefined),
      inserirTexto: (texto: string) => enviarComando('insertText', [texto]).then(() => undefined),
      aplicarClasseParagrafo: (classe: string) =>
        enviarComando('aplicarClasseParagrafo', [classe]).then(() => undefined),
      aplicarEstiloTexto: (estilo: DescritorEstiloTexto) =>
        enviarComando('aplicarEstiloTexto', [estilo]).then(() => undefined),
    }
```

- [ ] **Step 7: Adicionar testes em `ponteEditor.test.ts`**

Adicionar ao final do `describe('criarClienteEditor', ...)`:

```ts
  it('aplicarClasseParagrafo envia comando com a classe e resolve quando não há erro', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="classe"></iframe>`
    cliente = criarClienteEditor(window)
    pararDeResponder = responderComando(window, (detalhe) => {
      expect(detalhe.tipo).toBe('aplicarClasseParagrafo')
      expect(detalhe.args).toEqual(['Texto_Alinhado_Centro'])
      return { resultado: null, erro: null }
    })

    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'classe' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.aplicarClasseParagrafo('Texto_Alinhado_Centro')).resolves.toBeUndefined()
  })

  it('aplicarEstiloTexto envia comando com o descritor e resolve quando não há erro', async () => {
    document.body.innerHTML = `<iframe title="Corpo do Texto" ${ATRIBUTO_EDITOR_ALVO}="estilo"></iframe>`
    cliente = criarClienteEditor(window)
    pararDeResponder = responderComando(window, (detalhe) => {
      expect(detalhe.tipo).toBe('aplicarEstiloTexto')
      expect(detalhe.args).toEqual([{ fontSizePx: 16 }])
      return { resultado: null, erro: null }
    })

    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'estilo' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.aplicarEstiloTexto({ fontSizePx: 16 })).resolves.toBeUndefined()
  })
```

- [ ] **Step 8: Rodar os testes e confirmar que passam**

Run: `npm test -- ponteEditor`
Expected: PASS.

- [ ] **Step 9: Adicionar `FormatacaoBasicaConfig`/`AtalhoParagrafo` em `storage.ts`**

Em `src/lib/storage.ts`, adicionar (próximo a `CorretorOrtograficoConfig`):

```ts
export interface AtalhoParagrafo {
  tecla: string
  classe: string
  rotulo: string
}

export interface FormatacaoBasicaConfig {
  ativo: boolean
  atalhos: AtalhoParagrafo[]
}
```

Adicionar `formatacaoBasica: FormatacaoBasicaConfig` à interface `SyncConfig`:

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
}
```

Adicionar o default em `DEFAULT_SYNC_CONFIG` (depois de `corretorOrtografico`):

```ts
  corretorOrtografico: {
    ativo: false,
    palavrasIgnoradas: [],
  },
  formatacaoBasica: {
    ativo: false,
    atalhos: [],
  },
```

Nota: este bloco de `DEFAULT_SYNC_CONFIG` já existe no arquivo (`corretorOrtografico: { ativo: false, palavrasIgnoradas: [] },` seguido de `}`) — a mudança é só inserir o novo campo `formatacaoBasica` logo depois dele, mantendo `corretorOrtografico` como está.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 11: Commit**

```bash
git add src/content-scripts/documento_editar/protocolo.ts src/content-scripts/documento_editar/pontePrincipal.ts src/content-scripts/documento_editar/pontePrincipal.test.ts src/content-scripts/documento_editar/ponteEditor.ts src/content-scripts/documento_editar/ponteEditor.test.ts src/lib/storage.ts
git commit -m "feat(lote-i): comandos aplicarClasseParagrafo e aplicarEstiloTexto na ponte + config formatacaoBasica"
```

---

### Task 2: `features/formatacao-basica/paragrafoEstilos.ts` — catálogo de alinhamento e tamanho de fonte

**Files:**
- Create: `src/features/formatacao-basica/paragrafoEstilos.ts`
- Test: `src/features/formatacao-basica/paragrafoEstilos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `CLASSES_ALINHAMENTO: Record<AlinhamentoTexto, string>`, `type AlinhamentoTexto`, `proximoTamanhoFontePx(atualPx: number, direcao: 'up' | 'down'): number` — usados pela Task 3.

- [ ] **Step 1: Escrever o teste (vai falhar, o arquivo ainda não existe)**

Criar `src/features/formatacao-basica/paragrafoEstilos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CLASSES_ALINHAMENTO, proximoTamanhoFontePx } from './paragrafoEstilos'

describe('CLASSES_ALINHAMENTO', () => {
  it('tem uma classe CSS pra cada alinhamento', () => {
    expect(CLASSES_ALINHAMENTO.esquerda).toBe('Texto_Alinhado_Esquerda')
    expect(CLASSES_ALINHAMENTO.centro).toBe('Texto_Alinhado_Centro')
    expect(CLASSES_ALINHAMENTO.direita).toBe('Texto_Alinhado_Direita')
    expect(CLASSES_ALINHAMENTO.justificado).toBe('Texto_Justificado')
  })
})

describe('proximoTamanhoFontePx', () => {
  it('aumenta em 2px', () => {
    expect(proximoTamanhoFontePx(14, 'up')).toBe(16)
  })

  it('reduz em 2px', () => {
    expect(proximoTamanhoFontePx(14, 'down')).toBe(12)
  })

  it('não passa do máximo (72px)', () => {
    expect(proximoTamanhoFontePx(72, 'up')).toBe(72)
    expect(proximoTamanhoFontePx(71, 'up')).toBe(72)
  })

  it('não passa do mínimo (8px)', () => {
    expect(proximoTamanhoFontePx(8, 'down')).toBe(8)
    expect(proximoTamanhoFontePx(9, 'down')).toBe(8)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- paragrafoEstilos`
Expected: FAIL — `Cannot find module './paragrafoEstilos'`.

- [ ] **Step 3: Criar `paragrafoEstilos.ts`**

```ts
export const CLASSES_ALINHAMENTO = {
  esquerda: 'Texto_Alinhado_Esquerda',
  centro: 'Texto_Alinhado_Centro',
  direita: 'Texto_Alinhado_Direita',
  justificado: 'Texto_Justificado',
} as const

export type AlinhamentoTexto = keyof typeof CLASSES_ALINHAMENTO

const TAMANHO_FONTE_MIN_PX = 8
const TAMANHO_FONTE_MAX_PX = 72
const PASSO_TAMANHO_FONTE_PX = 2

export function proximoTamanhoFontePx(atualPx: number, direcao: 'up' | 'down'): number {
  const delta = direcao === 'up' ? PASSO_TAMANHO_FONTE_PX : -PASSO_TAMANHO_FONTE_PX
  const proximo = atualPx + delta
  return Math.min(TAMANHO_FONTE_MAX_PX, Math.max(TAMANHO_FONTE_MIN_PX, proximo))
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- paragrafoEstilos`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/features/formatacao-basica/paragrafoEstilos.ts src/features/formatacao-basica/paragrafoEstilos.test.ts
git commit -m "feat(lote-i): catálogo de alinhamento e tamanho de fonte"
```

---

### Task 3: Infra de injeção de toolbar (`dom.ts`) + `formatacaoBasica.ts` com alinhar texto e fonte

**Files:**
- Create: `src/content-scripts/documento_editar/dom.ts`
- Test: `src/content-scripts/documento_editar/dom.test.ts`
- Create: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Test: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`
- Modify: `src/content-scripts/documento_editar/corretorOrtografico.ts` (usa `injetarEstiloSeAusente` de `dom.ts` em vez de definição própria)

**Interfaces:**
- Consumes: `EditorSEI` de `ponteEditor.ts` (Task 1); `CLASSES_ALINHAMENTO`, `proximoTamanhoFontePx` de `paragrafoEstilos.ts` (Task 2).
- Produces: `injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void` de `dom.ts`, usado pelas Tasks seguintes; `iniciarFormatacaoBasica(editor: EditorSEI, config: FormatacaoBasicaConfig): Promise<void>` de `formatacaoBasica.ts`, usado pela Task 12 (`index.ts`).

- [ ] **Step 1: Escrever o teste de `dom.ts` (vai falhar, arquivo não existe)**

Criar `src/content-scripts/documento_editar/dom.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { injetarEstiloSeAusente } from './dom'

describe('injetarEstiloSeAusente', () => {
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('injeta uma tag <style> com o css e id dados', () => {
    injetarEstiloSeAusente(document, 'meu-estilo', '.x { color: red; }')
    const estilo = document.getElementById('meu-estilo')
    expect(estilo?.tagName).toBe('STYLE')
    expect(estilo?.textContent).toBe('.x { color: red; }')
  })

  it('não injeta de novo se o id já existe', () => {
    injetarEstiloSeAusente(document, 'meu-estilo', '.x { color: red; }')
    injetarEstiloSeAusente(document, 'meu-estilo', '.y { color: blue; }')
    expect(document.querySelectorAll('#meu-estilo').length).toBe(1)
    expect(document.getElementById('meu-estilo')?.textContent).toBe('.x { color: red; }')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- dom.test`
Expected: FAIL — `Cannot find module './dom'`.

- [ ] **Step 3: Criar `dom.ts`**

```ts
export function injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void {
  if (documentoAlvo.getElementById(id)) return
  const estilo = documentoAlvo.createElement('style')
  estilo.id = id
  estilo.textContent = css
  documentoAlvo.head.appendChild(estilo)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- dom.test`
Expected: PASS.

- [ ] **Step 5: Migrar `corretorOrtografico.ts` para usar `dom.ts`**

Em `src/content-scripts/documento_editar/corretorOrtografico.ts`, adicionar o import:

```ts
import { injetarEstiloSeAusente } from './dom'
```

E remover a definição local (vai estar duplicada com a de `dom.ts` — apagar do arquivo):

```ts
function injetarEstiloSeAusente(documentoAlvo: Document, id: string, css: string): void {
  if (documentoAlvo.getElementById(id)) return
  const estilo = documentoAlvo.createElement('style')
  estilo.id = id
  estilo.textContent = css
  documentoAlvo.head.appendChild(estilo)
}
```

- [ ] **Step 6: Rodar a suíte inteira e confirmar que nada quebrou**

Run: `npm test`
Expected: PASS — todos os testes existentes continuam verdes.

- [ ] **Step 7: Escrever o teste de `formatacaoBasica.ts` (vai falhar, arquivo não existe)**

Criar `src/content-scripts/documento_editar/formatacaoBasica.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { iniciarFormatacaoBasica } from './formatacaoBasica'
import type { EditorSEI } from './ponteEditor'

function montarToolboxFalsa(): { iframe: HTMLIFrameElement; toolbox: HTMLElement } {
  document.body.innerHTML =
    '<div class="cke"><span class="cke_inner"><span class="cke_top"><span class="cke_toolbox"></span></span>' +
    '<span class="cke_contents"><iframe title="Corpo do Texto"></iframe></span></span></div>'
  const iframe = document.querySelector('iframe') as HTMLIFrameElement
  const toolbox = document.querySelector('.cke_toolbox') as HTMLElement
  return { iframe, toolbox }
}

function criarEditorFalso(iframe: HTMLIFrameElement): EditorSEI {
  return {
    obterTextoSelecionado: vi.fn().mockResolvedValue(''),
    obterTextoCompleto: vi.fn().mockResolvedValue(''),
    inserirHtml: vi.fn().mockResolvedValue(undefined),
    inserirTexto: vi.fn().mockResolvedValue(undefined),
    aplicarClasseParagrafo: vi.fn().mockResolvedValue(undefined),
    aplicarEstiloTexto: vi.fn().mockResolvedValue(undefined),
    corpo: document.createElement('body'),
    documento: document,
    janela: window,
    iframe,
  }
}

describe('iniciarFormatacaoBasica', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('injeta 4 botões de alinhamento e 2 de fonte na toolbox', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    expect(toolbox.querySelectorAll('.seirmg-cke-button').length).toBeGreaterThanOrEqual(6)
  })

  it('clicar em "alinhar ao centro" chama aplicarClasseParagrafo com a classe certa', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const botao = toolbox.querySelector('#seirmg-cke-alinhar-centro') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.aplicarClasseParagrafo).toHaveBeenCalledWith('Texto_Alinhado_Centro')
  })

  it('não injeta nada quando a toolbox nunca aparece', async () => {
    document.body.innerHTML = '<iframe title="Corpo do Texto"></iframe>'
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    const editor = criarEditorFalso(iframe)

    await expect(iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] }, 5, 2)).rejects.toThrow(
      'Barra de ferramentas do CKEditor não apareceu a tempo'
    )
  })
})
```

- [ ] **Step 8: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL — `Cannot find module './formatacaoBasica'`.

- [ ] **Step 9: Criar `formatacaoBasica.ts`**

```ts
import alignLeftIconSvg from 'lucide-static/icons/align-left.svg?raw'
import alignCenterIconSvg from 'lucide-static/icons/align-center.svg?raw'
import alignRightIconSvg from 'lucide-static/icons/align-right.svg?raw'
import alignJustifyIconSvg from 'lucide-static/icons/align-justify.svg?raw'
import zoomInIconSvg from 'lucide-static/icons/zoom-in.svg?raw'
import zoomOutIconSvg from 'lucide-static/icons/zoom-out.svg?raw'
import { injetarEstiloSeAusente } from './dom'
import { CLASSES_ALINHAMENTO, proximoTamanhoFontePx } from '../../features/formatacao-basica/paragrafoEstilos'
import type { AlinhamentoTexto } from '../../features/formatacao-basica/paragrafoEstilos'
import type { EditorSEI } from './ponteEditor'
import type { AtalhoParagrafo, FormatacaoBasicaConfig } from '../../lib/storage'

const ESTILO_BOTOES = `
  .seirmg-cke-button-icone svg {
    width: 16px;
    height: 16px;
    display: block;
    margin: 0 auto;
  }
`

function localizarToolbox(iframe: HTMLIFrameElement): HTMLElement | null {
  const container = iframe.closest('.cke')
  return container?.querySelector<HTMLElement>('.cke_toolbox') ?? null
}

function aguardarToolbox(iframe: HTMLIFrameElement, intervaloMs: number, tentativasMax: number): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    function tentar(restantes: number): void {
      const toolbox = localizarToolbox(iframe)
      if (toolbox) {
        resolve(toolbox)
        return
      }
      if (restantes <= 0) {
        reject(new Error('Barra de ferramentas do CKEditor não apareceu a tempo'))
        return
      }
      setTimeout(() => tentar(restantes - 1), intervaloMs)
    }
    tentar(tentativasMax)
  })
}

function criarBotaoToolbar(id: string, titulo: string, iconeSvg: string, aoClicar: () => void): HTMLElement {
  const botao = document.createElement('a')
  botao.id = id
  botao.href = '#'
  botao.title = titulo
  botao.className = 'cke_button cke_button_off seirmg-cke-button'
  botao.innerHTML = `<span class="cke_button_icon seirmg-cke-button-icone">${iconeSvg}</span>`
  botao.addEventListener('click', (evento) => {
    evento.preventDefault()
    aoClicar()
  })
  return botao
}

function tratarErro(contexto: string): (erro: unknown) => void {
  return (erro) => console.error(`[SEIRMG] ${contexto}:`, erro)
}

function montarBotoesAlinhamento(editor: EditorSEI): HTMLElement[] {
  const icones: Record<AlinhamentoTexto, string> = {
    esquerda: alignLeftIconSvg,
    centro: alignCenterIconSvg,
    direita: alignRightIconSvg,
    justificado: alignJustifyIconSvg,
  }
  const rotulos: Record<AlinhamentoTexto, string> = {
    esquerda: 'Alinhar à esquerda',
    centro: 'Centralizar',
    direita: 'Alinhar à direita',
    justificado: 'Justificar',
  }

  return (Object.keys(CLASSES_ALINHAMENTO) as AlinhamentoTexto[]).map((alinhamento) =>
    criarBotaoToolbar(`seirmg-cke-alinhar-${alinhamento}`, rotulos[alinhamento], icones[alinhamento], () => {
      editor.aplicarClasseParagrafo(CLASSES_ALINHAMENTO[alinhamento]).catch(tratarErro('Falha ao alinhar texto'))
    })
  )
}

function lerTamanhoFonteAtualPx(editor: EditorSEI): number {
  const selecao = editor.janela.getSelection()
  const no = selecao?.anchorNode
  const elemento = no instanceof Element ? no : no?.parentElement
  if (!elemento) return 14
  const tamanho = Number.parseFloat(editor.janela.getComputedStyle(elemento).fontSize)
  return Number.isNaN(tamanho) ? 14 : Math.round(tamanho)
}

function montarBotoesFonte(editor: EditorSEI): HTMLElement[] {
  const aoClicar = (direcao: 'up' | 'down') => () => {
    const atual = lerTamanhoFonteAtualPx(editor)
    editor
      .aplicarEstiloTexto({ fontSizePx: proximoTamanhoFontePx(atual, direcao) })
      .catch(tratarErro('Falha ao alterar tamanho da fonte'))
  }

  return [
    criarBotaoToolbar('seirmg-cke-fonte-aumentar', 'Aumentar fonte', zoomInIconSvg, aoClicar('up')),
    criarBotaoToolbar('seirmg-cke-fonte-reduzir', 'Reduzir fonte', zoomOutIconSvg, aoClicar('down')),
  ]
}

function registrarAtalhos(editor: EditorSEI, atalhos: AtalhoParagrafo[]): void {
  if (atalhos.length === 0) return
  const porTecla = new Map(atalhos.map((atalho) => [atalho.tecla.toLowerCase(), atalho]))
  editor.janela.addEventListener('keydown', (evento) => {
    if (!(evento.ctrlKey && evento.altKey && evento.shiftKey)) return
    const atalho = porTecla.get(evento.key.toLowerCase())
    if (!atalho) return
    evento.preventDefault()
    editor.aplicarClasseParagrafo(atalho.classe).catch(tratarErro('Falha ao aplicar atalho de formatação'))
  })
}

export async function iniciarFormatacaoBasica(
  editor: EditorSEI,
  config: FormatacaoBasicaConfig,
  intervaloMs = 200,
  tentativasMax = 30
): Promise<void> {
  const toolbox = await aguardarToolbox(editor.iframe, intervaloMs, tentativasMax)
  injetarEstiloSeAusente(document, 'seirmg-estilo-botoes-formatacao', ESTILO_BOTOES)

  const botoes = [...montarBotoesAlinhamento(editor), ...montarBotoesFonte(editor)]
  botoes.forEach((botao) => toolbox.appendChild(botao))

  registrarAtalhos(editor, config.atalhos)
}
```

- [ ] **Step 10: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 11: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (a Task 1 já adicionou `FormatacaoBasicaConfig`/`AtalhoParagrafo` a `storage.ts`).

- [ ] **Step 12: Commit**

```bash
git add src/content-scripts/documento_editar/dom.ts src/content-scripts/documento_editar/dom.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts src/content-scripts/documento_editar/corretorOrtografico.ts
git commit -m "feat(lote-i): injeção de botões na toolbar nativa + alinhar texto e fonte"
```

---

### Task 4: Copiar formatação

**Files:**
- Create: `src/features/formatacao-basica/estiloTexto.ts`
- Test: `src/features/formatacao-basica/estiloTexto.test.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: `DescritorEstiloTexto` de `protocolo.ts` (Task 1).
- Produces: `lerEstiloElemento(elemento: Element): DescritorEstiloTexto` de `estiloTexto.ts`, usado só dentro de `formatacaoBasica.ts`.

- [ ] **Step 1: Escrever o teste de `estiloTexto.ts` (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/estiloTexto.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { lerEstiloElemento } from './estiloTexto'

describe('lerEstiloElemento', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lê tamanho de fonte, negrito, itálico, sublinhado e cor de um elemento', () => {
    document.body.innerHTML =
      '<span id="alvo" style="font-size:18px;font-weight:bold;font-style:italic;' +
      'text-decoration:underline;color:rgb(255, 0, 0)">x</span>'
    const elemento = document.getElementById('alvo') as HTMLElement

    expect(lerEstiloElemento(elemento)).toEqual({
      fontSizePx: 18,
      bold: true,
      italic: true,
      underline: true,
      color: 'rgb(255, 0, 0)',
    })
  })

  it('retorna false pra negrito/itálico/sublinhado quando o elemento não tem essa formatação', () => {
    document.body.innerHTML = '<span id="alvo">x</span>'
    const elemento = document.getElementById('alvo') as HTMLElement

    const resultado = lerEstiloElemento(elemento)
    expect(resultado.bold).toBe(false)
    expect(resultado.italic).toBe(false)
    expect(resultado.underline).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- estiloTexto`
Expected: FAIL — `Cannot find module './estiloTexto'`.

- [ ] **Step 3: Criar `estiloTexto.ts`**

```ts
import type { DescritorEstiloTexto } from '../../content-scripts/documento_editar/protocolo'

export function lerEstiloElemento(elemento: Element): DescritorEstiloTexto {
  const janela = elemento.ownerDocument.defaultView
  if (!janela) return {}
  const estiloComputado = janela.getComputedStyle(elemento)

  const fontSizePx = Number.parseFloat(estiloComputado.fontSize)
  const peso = estiloComputado.fontWeight

  return {
    fontSizePx: Number.isNaN(fontSizePx) ? undefined : Math.round(fontSizePx),
    bold: peso === 'bold' || Number(peso) >= 700,
    italic: estiloComputado.fontStyle === 'italic',
    underline: estiloComputado.textDecorationLine.includes('underline'),
    color: estiloComputado.color || undefined,
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- estiloTexto`
Expected: PASS.

- [ ] **Step 5: Adicionar o teste do botão "copiar formatação" em `formatacaoBasica.test.ts`**

Adicionar ao `describe('iniciarFormatacaoBasica', ...)`:

```ts
  it('copiar formatação: primeiro clique lê o estilo, segundo aplica e limpa', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    document.body.innerHTML +=
      '<span id="origem" style="font-size:20px;font-weight:bold">origem</span>' +
      '<span id="destino">destino</span>'

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const range = document.createRange()
    range.selectNodeContents(document.getElementById('origem') as HTMLElement)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const botao = toolbox.querySelector('#seirmg-cke-copiar-formatacao') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(botao.title).toBe('Colar formatação copiada')

    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(editor.aplicarEstiloTexto).toHaveBeenCalledWith(
      expect.objectContaining({ fontSizePx: 20, bold: true })
    )
    expect(botao.title).toBe('Copiar formatação')
  })
```

Nota: `editor.janela` no teste é o `window` real do jsdom (definido em `criarEditorFalso`), então `window.getSelection()` afeta o mesmo objeto que o código em `formatacaoBasica.ts` lê.

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL — `#seirmg-cke-copiar-formatacao` não existe ainda.

- [ ] **Step 7: Implementar em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import paintbrushIconSvg from 'lucide-static/icons/paintbrush.svg?raw'
import { lerEstiloElemento } from '../../features/formatacao-basica/estiloTexto'
import type { DescritorEstiloTexto } from './protocolo'
```

Adicionar a função (antes de `iniciarFormatacaoBasica`):

```ts
function elementoDaSelecao(editor: EditorSEI): Element | null {
  const selecao = editor.janela.getSelection()
  const no = selecao?.anchorNode
  if (!no) return null
  return no instanceof Element ? no : no.parentElement
}

function montarBotaoCopiarFormatacao(editor: EditorSEI): HTMLElement {
  let estiloCopiado: DescritorEstiloTexto | null = null

  const botao = criarBotaoToolbar('seirmg-cke-copiar-formatacao', 'Copiar formatação', paintbrushIconSvg, () => {
    if (estiloCopiado) {
      const paraAplicar = estiloCopiado
      estiloCopiado = null
      botao.title = 'Copiar formatação'
      editor.aplicarEstiloTexto(paraAplicar).catch(tratarErro('Falha ao aplicar formatação copiada'))
      return
    }

    const elemento = elementoDaSelecao(editor)
    if (!elemento) return
    estiloCopiado = lerEstiloElemento(elemento)
    botao.title = 'Colar formatação copiada'
  })

  return botao
}
```

E em `iniciarFormatacaoBasica`, adicionar o botão à lista:

```ts
  const botoes = [...montarBotoesAlinhamento(editor), ...montarBotoesFonte(editor), montarBotaoCopiarFormatacao(editor)]
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add src/features/formatacao-basica/estiloTexto.ts src/features/formatacao-basica/estiloTexto.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(lote-i): botão de copiar formatação"
```

---

### Task 5: Primeira letra maiúscula automática

**Files:**
- Create: `src/features/formatacao-basica/maiuscula.ts`
- Test: `src/features/formatacao-basica/maiuscula.test.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `primeiraLetraMaiuscula(texto: string): string` de `maiuscula.ts`.

- [ ] **Step 1: Escrever o teste (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/maiuscula.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { primeiraLetraMaiuscula } from './maiuscula'

describe('primeiraLetraMaiuscula', () => {
  it('deixa a primeira letra maiúscula', () => {
    expect(primeiraLetraMaiuscula('processo administrativo')).toBe('Processo administrativo')
  })

  it('não muda nada se já estiver maiúscula', () => {
    expect(primeiraLetraMaiuscula('Processo')).toBe('Processo')
  })

  it('retorna string vazia sem quebrar', () => {
    expect(primeiraLetraMaiuscula('')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- maiuscula`
Expected: FAIL — `Cannot find module './maiuscula'`.

- [ ] **Step 3: Criar `maiuscula.ts`**

```ts
export function primeiraLetraMaiuscula(texto: string): string {
  if (texto === '') return texto
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- maiuscula`
Expected: PASS.

- [ ] **Step 5: Adicionar o teste do botão em `formatacaoBasica.test.ts`**

```ts
  it('maiúscula automática: lê a seleção, capitaliza e reinsere', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    editor.obterTextoSelecionado = vi.fn().mockResolvedValue('processo administrativo')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })

    const botao = toolbox.querySelector('#seirmg-cke-maiuscula') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()

    expect(editor.inserirTexto).toHaveBeenCalledWith('Processo administrativo')
  })
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL — `#seirmg-cke-maiuscula` não existe.

- [ ] **Step 7: Implementar em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import caseSensitiveIconSvg from 'lucide-static/icons/case-sensitive.svg?raw'
import { primeiraLetraMaiuscula } from '../../features/formatacao-basica/maiuscula'
```

Adicionar a função:

```ts
function montarBotaoMaiuscula(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-maiuscula', 'Primeira letra maiúscula', caseSensitiveIconSvg, () => {
    editor
      .obterTextoSelecionado()
      .then((texto) => (texto ? editor.inserirTexto(primeiraLetraMaiuscula(texto)) : undefined))
      .catch(tratarErro('Falha ao aplicar maiúscula automática'))
  })
}
```

E adicionar à lista em `iniciarFormatacaoBasica`:

```ts
  const botoes = [
    ...montarBotoesAlinhamento(editor),
    ...montarBotoesFonte(editor),
    montarBotaoCopiarFormatacao(editor),
    montarBotaoMaiuscula(editor),
  ]
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/formatacao-basica/maiuscula.ts src/features/formatacao-basica/maiuscula.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(lote-i): botão de maiúscula automática"
```

---

### Task 6: Tabela rápida + estilo de tabela

**Files:**
- Create: `src/features/formatacao-basica/tabelaRapida.ts`
- Test: `src/features/formatacao-basica/tabelaRapida.test.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `montarTabelaHtml(linhas: number, colunas: number): string`, `CATALOGO_ESTILOS_TABELA: EstiloTabela[]`, `aplicarEstiloTabelaHtml(tabelaHtml: string, estilo: EstiloTabela): string` de `tabelaRapida.ts`.

**Nota de escopo (simplificação deliberada vs. Sei Pro):** o Sei Pro tem uma grade visual interativa tipo "passar o mouse pra escolher N×M". Esta versão usa um diálogo simples com dois campos numéricos (linhas/colunas) — funcionalmente equivalente, sem a grade hover. Documentado aqui pra não ser lido como corte de escopo não intencional depois.

- [ ] **Step 1: Escrever o teste (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/tabelaRapida.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOGO_ESTILOS_TABELA, aplicarEstiloTabelaHtml, montarTabelaHtml } from './tabelaRapida'

describe('montarTabelaHtml', () => {
  it('monta uma tabela com o número certo de linhas e colunas', () => {
    const html = montarTabelaHtml(2, 3)
    expect(html).toContain('<table class="Tabela">')
    expect((html.match(/<tr>/g) ?? []).length).toBe(2)
    expect((html.match(/<td>/g) ?? []).length).toBe(6)
  })
})

describe('aplicarEstiloTabelaHtml', () => {
  it('injeta o css do estilo escolhido no atributo style da tabela', () => {
    const html = montarTabelaHtml(1, 1)
    const comEstilo = aplicarEstiloTabelaHtml(html, CATALOGO_ESTILOS_TABELA[0])
    expect(comEstilo).toContain(`style="${CATALOGO_ESTILOS_TABELA[0].css}"`)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- tabelaRapida`
Expected: FAIL — `Cannot find module './tabelaRapida'`.

- [ ] **Step 3: Criar `tabelaRapida.ts`**

```ts
export function montarTabelaHtml(linhas: number, colunas: number): string {
  const linhaHtml = `<tr>${'<td>&nbsp;</td>'.repeat(colunas)}</tr>`
  return `<table class="Tabela"><tbody>${linhaHtml.repeat(linhas)}</tbody></table>`
}

export interface EstiloTabela {
  id: string
  nome: string
  css: string
}

export const CATALOGO_ESTILOS_TABELA: EstiloTabela[] = [
  { id: 'padrao', nome: 'Padrão', css: 'border-collapse:collapse;width:100%' },
  { id: 'bordas', nome: 'Com bordas', css: 'border-collapse:collapse;width:100%;border:1px solid #000' },
]

export function aplicarEstiloTabelaHtml(tabelaHtml: string, estilo: EstiloTabela): string {
  return tabelaHtml.replace('<table class="Tabela">', `<table class="Tabela" style="${estilo.css}">`)
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- tabelaRapida`
Expected: PASS.

- [ ] **Step 5: Adicionar o teste do botão em `formatacaoBasica.test.ts`**

```ts
  it('tabela rápida: pede linhas/colunas/estilo via prompt e insere a tabela já com o estilo escolhido', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValueOnce('2').mockReturnValueOnce('3').mockReturnValueOnce('bordas')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith(
      expect.stringContaining('<table class="Tabela" style="border-collapse:collapse;width:100%;border:1px solid #000">')
    )
    window.prompt = promptOriginal
  })

  it('tabela rápida: estilo inválido ou vazio cai no padrão (tabela sem style extra)', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValueOnce('1').mockReturnValueOnce('1').mockReturnValueOnce('')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-tabela') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<table class="Tabela">'))
    window.prompt = promptOriginal
  })
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL — `#seirmg-cke-tabela` não existe.

- [ ] **Step 7: Implementar em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import tableIconSvg from 'lucide-static/icons/table.svg?raw'
import { CATALOGO_ESTILOS_TABELA, aplicarEstiloTabelaHtml, montarTabelaHtml } from '../../features/formatacao-basica/tabelaRapida'
```

Adicionar a função:

```ts
function montarBotaoTabelaRapida(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-tabela', 'Inserir tabela rápida', tableIconSvg, () => {
    const linhas = Number.parseInt(window.prompt('Quantas linhas?', '2') ?? '', 10)
    const colunas = Number.parseInt(window.prompt('Quantas colunas?', '2') ?? '', 10)
    if (!Number.isInteger(linhas) || !Number.isInteger(colunas) || linhas < 1 || colunas < 1) return

    const idsValidos = CATALOGO_ESTILOS_TABELA.map((estilo) => estilo.id).join('/')
    const idEstilo = window.prompt(`Estilo (${idsValidos}) ou deixe em branco pro padrão:`, '') ?? ''
    const estilo = CATALOGO_ESTILOS_TABELA.find((item) => item.id === idEstilo.trim())

    const tabelaHtml = montarTabelaHtml(linhas, colunas)
    const htmlFinal = estilo ? aplicarEstiloTabelaHtml(tabelaHtml, estilo) : tabelaHtml
    editor.inserirHtml(htmlFinal).catch(tratarErro('Falha ao inserir tabela rápida'))
  })
}
```

E adicionar à lista em `iniciarFormatacaoBasica`.

**Nota de escopo (simplificação deliberada):** o seletor de estilo é um `prompt()` de texto com o id do estilo (ex.: `bordas`), não um seletor visual — mesma razão de risco/tempo documentada acima pra grade de tabela.

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/formatacao-basica/tabelaRapida.ts src/features/formatacao-basica/tabelaRapida.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(lote-i): botão de tabela rápida"
```

---

### Task 7: Quebra de página / quebra de seção

**Files:**
- Create: `src/features/formatacao-basica/quebraPagina.ts`
- Test: `src/features/formatacao-basica/quebraPagina.test.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `montarQuebraPaginaHtml(): string` de `quebraPagina.ts`.

**Nota de escopo:** "quebra de seção" (reset de numeração) fica fora desta rodada — só quebra de página. Simplificação deliberada, mesma razão de risco/tempo das outras já documentadas.

- [ ] **Step 1: Escrever o teste (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/quebraPagina.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarQuebraPaginaHtml } from './quebraPagina'

describe('montarQuebraPaginaHtml', () => {
  it('monta um marcador de quebra de página', () => {
    expect(montarQuebraPaginaHtml()).toBe('<div class="Quebra_Pagina" style="page-break-after:always">&nbsp;</div>')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- quebraPagina`
Expected: FAIL.

- [ ] **Step 3: Criar `quebraPagina.ts`**

```ts
export function montarQuebraPaginaHtml(): string {
  return '<div class="Quebra_Pagina" style="page-break-after:always">&nbsp;</div>'
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- quebraPagina`
Expected: PASS.

- [ ] **Step 5: Adicionar o teste do botão em `formatacaoBasica.test.ts`**

```ts
  it('quebra de página: insere o marcador direto, sem diálogo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-quebra-pagina') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(editor.inserirHtml).toHaveBeenCalledWith('<div class="Quebra_Pagina" style="page-break-after:always">&nbsp;</div>')
  })
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL.

- [ ] **Step 7: Implementar em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import separatorHorizontalIconSvg from 'lucide-static/icons/separator-horizontal.svg?raw'
import { montarQuebraPaginaHtml } from '../../features/formatacao-basica/quebraPagina'
```

Adicionar a função:

```ts
function montarBotaoQuebraPagina(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-quebra-pagina', 'Inserir quebra de página', separatorHorizontalIconSvg, () => {
    editor.inserirHtml(montarQuebraPaginaHtml()).catch(tratarErro('Falha ao inserir quebra de página'))
  })
}
```

E adicionar à lista em `iniciarFormatacaoBasica`.

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/formatacao-basica/quebraPagina.ts src/features/formatacao-basica/quebraPagina.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(lote-i): botão de quebra de página"
```

---

### Task 8: Parágrafos numerados (convenção) + Sumário

**Files:**
- Create: `src/features/formatacao-basica/numeracaoParagrafos.ts`
- Test: `src/features/formatacao-basica/numeracaoParagrafos.test.ts`
- Create: `src/features/formatacao-basica/sumario.ts`
- Test: `src/features/formatacao-basica/sumario.test.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `CLASSES_PARAGRAFO_NUMERADO`, `nivelDaClasse(classe: string): number | null` de `numeracaoParagrafos.ts`; `ItemSumario`, `extrairItensSumario(...)`, `montarSumarioHtml(...)` de `sumario.ts`.

**Nota sobre exceção de escrita direta:** atribuir o `id` de âncora em cada parágrafo do sumário é mutação direta do DOM (`editor.corpo`), não passa pela ponte — é metadado estrutural invisível (mesma categoria de exceção documentada na spec pra renumeração de nota de rodapé), não conteúdo novo do usuário.

- [ ] **Step 1: Escrever o teste de `numeracaoParagrafos.ts` (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/numeracaoParagrafos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nivelDaClasse } from './numeracaoParagrafos'

describe('nivelDaClasse', () => {
  it('retorna o nível 1-4 pras classes de parágrafo numerado', () => {
    expect(nivelDaClasse('Paragrafo_Numerado_Nivel1')).toBe(1)
    expect(nivelDaClasse('Paragrafo_Numerado_Nivel4')).toBe(4)
  })

  it('retorna null pra classes que não são de parágrafo numerado', () => {
    expect(nivelDaClasse('Texto_Alinhado_Centro')).toBeNull()
    expect(nivelDaClasse('')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- numeracaoParagrafos`
Expected: FAIL.

- [ ] **Step 3: Criar `numeracaoParagrafos.ts`**

```ts
export const CLASSES_PARAGRAFO_NUMERADO = [
  'Paragrafo_Numerado_Nivel1',
  'Paragrafo_Numerado_Nivel2',
  'Paragrafo_Numerado_Nivel3',
  'Paragrafo_Numerado_Nivel4',
] as const

export type ClasseParagrafoNumerado = (typeof CLASSES_PARAGRAFO_NUMERADO)[number]

export function nivelDaClasse(classe: string): number | null {
  const indice = CLASSES_PARAGRAFO_NUMERADO.indexOf(classe as ClasseParagrafoNumerado)
  return indice === -1 ? null : indice + 1
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- numeracaoParagrafos`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de `sumario.ts` (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/sumario.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extrairItensSumario, montarSumarioHtml } from './sumario'

describe('extrairItensSumario', () => {
  it('ignora parágrafos sem classe de numeração e mantém a ordem dos demais', () => {
    const itens = extrairItensSumario([
      { classe: 'Paragrafo_Numerado_Nivel1', texto: 'Introdução' },
      { classe: 'Texto_Alinhado_Centro', texto: 'texto comum' },
      { classe: 'Paragrafo_Numerado_Nivel2', texto: 'Objetivo' },
    ])

    expect(itens).toHaveLength(2)
    expect(itens[0]).toMatchObject({ texto: 'Introdução', nivel: 1 })
    expect(itens[1]).toMatchObject({ texto: 'Objetivo', nivel: 2 })
    expect(itens[0].id).not.toBe(itens[1].id)
  })
})

describe('montarSumarioHtml', () => {
  it('monta uma lista de links âncora indentada por nível', () => {
    const html = montarSumarioHtml([{ id: 'x1', texto: 'Introdução', nivel: 1 }])
    expect(html).toContain('<div class="Sumario">')
    expect(html).toContain('href="#x1"')
    expect(html).toContain('Introdução')
  })
})
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npm test -- sumario`
Expected: FAIL.

- [ ] **Step 7: Criar `sumario.ts`**

```ts
import { nivelDaClasse } from './numeracaoParagrafos'

export interface ItemSumario {
  id: string
  texto: string
  nivel: number
}

export function extrairItensSumario(paragrafos: { classe: string; texto: string }[]): ItemSumario[] {
  let proximoId = 0
  const itens: ItemSumario[] = []
  for (const paragrafo of paragrafos) {
    const nivel = nivelDaClasse(paragrafo.classe)
    if (nivel === null) continue
    itens.push({ id: `seirmg-sumario-${proximoId++}`, texto: paragrafo.texto, nivel })
  }
  return itens
}

export function montarSumarioHtml(itens: ItemSumario[]): string {
  const linhas = itens
    .map((item) => `<p style="margin-left:${(item.nivel - 1) * 16}px"><a href="#${item.id}">${item.texto}</a></p>`)
    .join('')
  return `<div class="Sumario">${linhas}</div>`
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npm test -- sumario`
Expected: PASS.

- [ ] **Step 9: Adicionar o teste do botão em `formatacaoBasica.test.ts`**

```ts
  it('sumário: lê os parágrafos numerados do corpo, atribui id, e insere a lista', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    editor.corpo.innerHTML =
      '<p class="Paragrafo_Numerado_Nivel1">Introdução</p><p>texto comum</p>'

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-sumario') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const paragrafoNumerado = editor.corpo.querySelector('.Paragrafo_Numerado_Nivel1') as HTMLElement
    expect(paragrafoNumerado.id).not.toBe('')
    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining(`href="#${paragrafoNumerado.id}"`))
  })
```

- [ ] **Step 10: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL.

- [ ] **Step 11: Implementar em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import listOrderedIconSvg from 'lucide-static/icons/list-ordered.svg?raw'
import { CLASSES_PARAGRAFO_NUMERADO } from '../../features/formatacao-basica/numeracaoParagrafos'
import { extrairItensSumario, montarSumarioHtml } from '../../features/formatacao-basica/sumario'
```

Adicionar a função:

```ts
function montarBotaoSumario(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-sumario', 'Inserir sumário', listOrderedIconSvg, () => {
    const paragrafos = Array.from(
      editor.corpo.querySelectorAll<HTMLElement>(CLASSES_PARAGRAFO_NUMERADO.map((c) => `.${c}`).join(','))
    )
    if (paragrafos.length === 0) return

    const itens = extrairItensSumario(
      paragrafos.map((p) => ({ classe: p.className, texto: p.textContent ?? '' }))
    )
    // Atribuição de id é metadado estrutural invisível (âncora), não conteúdo novo do
    // usuário — mutação direta do DOM, mesma exceção documentada na spec pra nota de
    // rodapé, em vez de passar pela ponte.
    paragrafos.forEach((p, indice) => {
      p.id = itens[indice].id
    })

    editor.inserirHtml(montarSumarioHtml(itens)).catch(tratarErro('Falha ao inserir sumário'))
  })
}
```

E adicionar à lista em `iniciarFormatacaoBasica`.

- [ ] **Step 12: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/features/formatacao-basica/numeracaoParagrafos.ts src/features/formatacao-basica/numeracaoParagrafos.test.ts src/features/formatacao-basica/sumario.ts src/features/formatacao-basica/sumario.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(lote-i): botão de sumário (parágrafos numerados)"
```

---

### Task 9: Nota de rodapé

**Files:**
- Create: `src/features/formatacao-basica/notaRodape.ts`
- Test: `src/features/formatacao-basica/notaRodape.test.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `montarChamadaHtml(id: string, numero: number): string`, `montarEntradaHtml(id: string, numero: number, texto: string): string` de `notaRodape.ts`.

**Nota de escopo (simplificação deliberada):** sem renumeração automática ao excluir uma nota do meio — cada nota nova recebe o próximo número sequencial baseado na contagem atual de `.Nota_Rodape` no documento. Se o usuário apagar uma nota manualmente, as posteriores não renumeram sozinhas. Documentado aqui, mesma categoria de trade-off aceito já registrada no projeto (ex.: ordem nativa da tabela não restaurada ao desligar agrupamento).

- [ ] **Step 1: Escrever o teste (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/notaRodape.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { montarChamadaHtml, montarEntradaHtml } from './notaRodape'

describe('montarChamadaHtml', () => {
  it('monta a chamada sobrescrita com link pra entrada', () => {
    const html = montarChamadaHtml('n1', 1)
    expect(html).toBe('<sup id="chamada-n1"><a href="#nota-n1">1</a></sup>')
  })
})

describe('montarEntradaHtml', () => {
  it('monta a entrada no rodapé com link de volta pra chamada', () => {
    const html = montarEntradaHtml('n1', 1, 'Texto da nota')
    expect(html).toBe('<p id="nota-n1" class="Nota_Rodape">1. Texto da nota <a href="#chamada-n1">&uarr;</a></p>')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- notaRodape`
Expected: FAIL.

- [ ] **Step 3: Criar `notaRodape.ts`**

```ts
export function montarChamadaHtml(id: string, numero: number): string {
  return `<sup id="chamada-${id}"><a href="#nota-${id}">${numero}</a></sup>`
}

export function montarEntradaHtml(id: string, numero: number, texto: string): string {
  return `<p id="nota-${id}" class="Nota_Rodape">${numero}. ${texto} <a href="#chamada-${id}">&uarr;</a></p>`
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- notaRodape`
Expected: PASS.

- [ ] **Step 5: Adicionar o teste do botão em `formatacaoBasica.test.ts`**

```ts
  it('nota de rodapé: pede o texto via prompt, insere a chamada e anexa a entrada no fim do corpo', async () => {
    const { iframe, toolbox } = montarToolboxFalsa()
    const editor = criarEditorFalso(iframe)
    const promptOriginal = window.prompt
    window.prompt = vi.fn().mockReturnValue('Texto da nota')

    await iniciarFormatacaoBasica(editor, { ativo: true, atalhos: [] })
    const botao = toolbox.querySelector('#seirmg-cke-nota-rodape') as HTMLElement
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(editor.inserirHtml).toHaveBeenCalledWith(expect.stringContaining('<sup id="chamada-'))
    expect(editor.corpo.querySelector('.Nota_Rodape')?.textContent).toContain('Texto da nota')
    window.prompt = promptOriginal
  })
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `npm test -- formatacaoBasica`
Expected: FAIL.

- [ ] **Step 7: Implementar em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import superscriptIconSvg from 'lucide-static/icons/superscript.svg?raw'
import { montarChamadaHtml, montarEntradaHtml } from '../../features/formatacao-basica/notaRodape'
```

Adicionar a função:

```ts
function proximoNumeroNota(corpo: HTMLElement): number {
  return corpo.querySelectorAll('.Nota_Rodape').length + 1
}

function montarBotaoNotaRodape(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-nota-rodape', 'Inserir nota de rodapé', superscriptIconSvg, () => {
    const texto = window.prompt('Texto da nota de rodapé:')
    if (!texto) return

    const id = `n${Date.now()}`
    const numero = proximoNumeroNota(editor.corpo)
    editor
      .inserirHtml(montarChamadaHtml(id, numero))
      .then(() => {
        // Entrada é anexada direto no DOM (não passa pela ponte): é bookkeeping
        // estrutural do documento (lista de notas), não texto novo digitado pelo
        // usuário no ponto do cursor — mesma exceção documentada na spec.
        editor.corpo.insertAdjacentHTML('beforeend', montarEntradaHtml(id, numero, texto))
      })
      .catch(tratarErro('Falha ao inserir nota de rodapé'))
  })
}
```

E adicionar à lista em `iniciarFormatacaoBasica`.

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `npm test -- formatacaoBasica`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/formatacao-basica/notaRodape.ts src/features/formatacao-basica/notaRodape.test.ts src/content-scripts/documento_editar/formatacaoBasica.ts src/content-scripts/documento_editar/formatacaoBasica.test.ts
git commit -m "feat(lote-i): botão de nota de rodapé"
```

---

### Task 10: Opções — toggle geral e teclas de atalho

**Files:**
- Create: `src/features/formatacao-basica/atalhos.ts`
- Test: `src/features/formatacao-basica/atalhos.test.ts`
- Modify: `src/options/index.html`
- Modify: `src/options/main.ts`

**Interfaces:**
- Consumes: `FormatacaoBasicaConfig`, `AtalhoParagrafo` de `storage.ts` (já existem desde a Task 1).
- Produces: `parsearAtalhos(texto: string): AtalhoParagrafo[]`, `formatarAtalhos(atalhos: AtalhoParagrafo[]): string` de `atalhos.ts`, usados só em `options/main.ts`.

- [ ] **Step 1: Escrever o teste de `atalhos.ts` (vai falhar, arquivo não existe)**

Criar `src/features/formatacao-basica/atalhos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatarAtalhos, parsearAtalhos } from './atalhos'

describe('parsearAtalhos', () => {
  it('parseia uma linha no formato tecla=classe:rótulo', () => {
    expect(parsearAtalhos('1=Titulo1:Título 1')).toEqual([
      { tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' },
    ])
  })

  it('usa a classe como rótulo quando o rótulo não é informado', () => {
    expect(parsearAtalhos('1=Titulo1')).toEqual([{ tecla: '1', classe: 'Titulo1', rotulo: 'Titulo1' }])
  })

  it('ignora linhas vazias e linhas malformadas', () => {
    expect(parsearAtalhos('1=Titulo1:Título 1\n\n=semtecla\nsoclasse')).toEqual([
      { tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' },
    ])
  })

  it('retorna lista vazia pra texto vazio', () => {
    expect(parsearAtalhos('')).toEqual([])
  })
})

describe('formatarAtalhos', () => {
  it('formata de volta pro formato tecla=classe:rótulo, uma linha por atalho', () => {
    expect(
      formatarAtalhos([
        { tecla: '1', classe: 'Titulo1', rotulo: 'Título 1' },
        { tecla: '2', classe: 'Titulo2', rotulo: 'Título 2' },
      ])
    ).toBe('1=Titulo1:Título 1\n2=Titulo2:Título 2')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- atalhos`
Expected: FAIL.

- [ ] **Step 3: Criar `atalhos.ts`**

```ts
import type { AtalhoParagrafo } from '../../lib/storage'

export function parsearAtalhos(texto: string): AtalhoParagrafo[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '')
    .flatMap((linha) => {
      const [tecla, resto] = linha.split('=')
      if (!tecla || !resto) return []
      const [classe, rotulo] = resto.split(':')
      if (!classe) return []
      return [{ tecla: tecla.trim(), classe: classe.trim(), rotulo: (rotulo ?? classe).trim() }]
    })
}

export function formatarAtalhos(atalhos: AtalhoParagrafo[]): string {
  return atalhos.map((atalho) => `${atalho.tecla}=${atalho.classe}:${atalho.rotulo}`).join('\n')
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- atalhos`
Expected: PASS.

- [ ] **Step 5: Adicionar a subseção "Formatação Básica" em `options/index.html`**

Em `src/options/index.html`, dentro de `<section id="painel-editor" class="painel">`, adicionar antes de `<button id="editor-salvar">Salvar</button>`:

```html
      <h3>Formatação Básica</h3>
      <label>
        <input type="checkbox" id="editor-formatacao-basica-ativo" />
        Ativar botões de formatação básica na barra do editor (alinhar texto, fonte, copiar formatação,
        tabela rápida, quebra de página, sumário, nota de rodapé, maiúscula automática, LaTeX)
      </label>
      <br />
      <label>
        Teclas de atalho (uma por linha, formato <code>tecla=classe:rótulo</code>, ex.: <code>1=Titulo1:Título 1</code>) —
        sempre combinadas com Ctrl+Alt+Shift:
        <br />
        <textarea id="editor-formatacao-basica-atalhos" rows="4" placeholder="1=Titulo1:Título 1"></textarea>
      </label>
      <br />
```

- [ ] **Step 6: Carregar/salvar em `options/main.ts`**

Em `src/options/main.ts`, dentro de `carregarAbaEditor` (a função que já carrega `painel-editor` — localizar pelo `document.getElementById('editor-doc-externo-ativo')`), adicionar:

```ts
    const inputFormatacaoBasicaAtivo = document.getElementById(
      'editor-formatacao-basica-ativo'
    ) as HTMLInputElement | null
    const inputFormatacaoBasicaAtalhos = document.getElementById(
      'editor-formatacao-basica-atalhos'
    ) as HTMLTextAreaElement | null

    if (inputFormatacaoBasicaAtivo) {
      inputFormatacaoBasicaAtivo.checked = config.formatacaoBasica.ativo
    }
    if (inputFormatacaoBasicaAtalhos) {
      inputFormatacaoBasicaAtalhos.value = formatarAtalhos(config.formatacaoBasica.atalhos)
    }
```

E no handler de clique de `editor-salvar` dessa mesma função, incluir `formatacaoBasica` no objeto `atualizado` (fazendo spread do `config.formatacaoBasica` existente, mesmo cuidado já registrado como bug corrigido pra `blocoAssinatura` — nunca reconstruir um bloco de config do zero):

```ts
          formatacaoBasica: {
            ...config.formatacaoBasica,
            ativo: inputFormatacaoBasicaAtivo?.checked ?? false,
            atalhos: parsearAtalhos(inputFormatacaoBasicaAtalhos?.value ?? ''),
          },
```

Adicionar o import no topo do arquivo:

```ts
import { formatarAtalhos, parsearAtalhos } from '../features/formatacao-basica/atalhos'
```

- [ ] **Step 7: Rodar a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS em ambos.

- [ ] **Step 8: Commit**

```bash
git add src/features/formatacao-basica/atalhos.ts src/features/formatacao-basica/atalhos.test.ts src/options/index.html src/options/main.ts
git commit -m "feat(lote-i): opções de formatação básica + teclas de atalho"
```

---

### Task 11: Equações LaTeX (KaTeX)

**Files:**
- Modify: `package.json` (nova dependência `katex`)
- Create: `src/features/latex/renderizarLatex.ts`
- Test: `src/features/latex/renderizarLatex.test.ts`
- Create: `src/content-scripts/documento_editar/latex.ts`
- Modify: `src/content-scripts/documento_editar/formatacaoBasica.ts` (adiciona o botão que abre o diálogo de `latex.ts`)

**Interfaces:**
- Consumes: `EditorSEI` (Task 1); `injetarEstiloSeAusente` de `dom.ts` (Task 3).
- Produces: `renderizarLatexHtml(formula: string): string` de `renderizarLatex.ts`; `abrirDialogoLatex(editor: EditorSEI): void` de `latex.ts`, usado por `formatacaoBasica.ts`.

- [ ] **Step 1: Instalar `katex`**

Run: `npm install katex`
Expected: `package.json`/`package-lock.json` atualizados, sem erro.

- [ ] **Step 2: Escrever o teste de `renderizarLatex.ts` (vai falhar, arquivo não existe)**

Criar `src/features/latex/renderizarLatex.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderizarLatexHtml } from './renderizarLatex'

describe('renderizarLatexHtml', () => {
  it('renderiza uma fórmula simples em HTML do KaTeX', () => {
    const html = renderizarLatexHtml('x^2')
    expect(html).toContain('katex')
  })

  it('lança erro pra sintaxe LaTeX inválida', () => {
    expect(() => renderizarLatexHtml('\\frac{1}')).toThrow()
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- renderizarLatex`
Expected: FAIL — `Cannot find module './renderizarLatex'`.

- [ ] **Step 4: Criar `renderizarLatex.ts`**

```ts
import katex from 'katex'

export function renderizarLatexHtml(formula: string): string {
  return katex.renderToString(formula, { throwOnError: true, displayMode: true })
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- renderizarLatex`
Expected: PASS.

- [ ] **Step 6: Criar `latex.ts` (diálogo)**

```ts
import katexCss from 'katex/dist/katex.min.css?raw'
import sigmaIconSvg from 'lucide-static/icons/sigma.svg?raw'
import { injetarEstiloSeAusente } from './dom'
import { renderizarLatexHtml } from '../../features/latex/renderizarLatex'
import type { EditorSEI } from './ponteEditor'

const ID_DIALOGO_LATEX = 'seirmg-dialogo-latex'

const ESTILO_DIALOGO = `
  #${ID_DIALOGO_LATEX} {
    position: fixed;
    top: 80px;
    right: 20px;
    width: 360px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
    z-index: 10000;
    font-family: Arial, Helvetica, sans-serif;
    padding: 14px;
  }
  #${ID_DIALOGO_LATEX} textarea {
    width: 100%;
    height: 60px;
    box-sizing: border-box;
    font-family: monospace;
  }
  #${ID_DIALOGO_LATEX} .seirmg-latex-preview {
    margin: 10px 0;
    min-height: 40px;
    overflow-x: auto;
  }
  #${ID_DIALOGO_LATEX} .seirmg-latex-erro {
    color: #c0392b;
    font-size: 12px;
  }
  #${ID_DIALOGO_LATEX} button {
    margin-right: 8px;
  }
`

function fecharDialogo(): void {
  document.getElementById(ID_DIALOGO_LATEX)?.remove()
}

export function abrirDialogoLatex(editor: EditorSEI): void {
  fecharDialogo()
  injetarEstiloSeAusente(document, 'seirmg-estilo-dialogo-latex', ESTILO_DIALOGO)
  injetarEstiloSeAusente(editor.documento, 'seirmg-estilo-katex-editor', katexCss)

  const dialogo = document.createElement('div')
  dialogo.id = ID_DIALOGO_LATEX
  dialogo.innerHTML = `
    <div><strong>Inserir equação (LaTeX)</strong></div>
    <textarea placeholder="ex.: x^2 + y^2 = z^2"></textarea>
    <div class="seirmg-latex-preview"></div>
    <button type="button" data-acao="inserir">Inserir</button>
    <button type="button" data-acao="cancelar">Cancelar</button>
  `
  document.body.appendChild(dialogo)

  const textarea = dialogo.querySelector('textarea') as HTMLTextAreaElement
  const preview = dialogo.querySelector('.seirmg-latex-preview') as HTMLElement

  function atualizarPreview(): void {
    try {
      preview.innerHTML = textarea.value.trim() ? renderizarLatexHtml(textarea.value) : ''
      preview.classList.remove('seirmg-latex-erro')
    } catch (erro) {
      preview.textContent = erro instanceof Error ? erro.message : String(erro)
      preview.classList.add('seirmg-latex-erro')
    }
  }

  textarea.addEventListener('input', atualizarPreview)

  dialogo.addEventListener('click', (evento) => {
    const alvo = evento.target
    if (!(alvo instanceof HTMLElement)) return
    const acao = alvo.dataset.acao
    if (acao === 'cancelar') {
      fecharDialogo()
      return
    }
    if (acao === 'inserir') {
      if (!textarea.value.trim()) return
      try {
        const html = renderizarLatexHtml(textarea.value)
        editor.inserirHtml(html).catch((erro) => console.error('[SEIRMG] Falha ao inserir equação LaTeX:', erro))
        fecharDialogo()
      } catch {
        // Erro já está visível no preview, não faz nada.
      }
    }
  })
}
```

- [ ] **Step 7: Adicionar o botão em `formatacaoBasica.ts`**

Adicionar o import:

```ts
import sigmaIconSvg from 'lucide-static/icons/sigma.svg?raw'
import { abrirDialogoLatex } from './latex'
```

Adicionar a função:

```ts
function montarBotaoLatex(editor: EditorSEI): HTMLElement {
  return criarBotaoToolbar('seirmg-cke-latex', 'Inserir equação (LaTeX)', sigmaIconSvg, () => {
    abrirDialogoLatex(editor)
  })
}
```

E adicionar à lista final de botões em `iniciarFormatacaoBasica`:

```ts
  const botoes = [
    ...montarBotoesAlinhamento(editor),
    ...montarBotoesFonte(editor),
    montarBotaoCopiarFormatacao(editor),
    montarBotaoMaiuscula(editor),
    montarBotaoTabelaRapida(editor),
    montarBotaoQuebraPagina(editor),
    montarBotaoSumario(editor),
    montarBotaoNotaRodape(editor),
    montarBotaoLatex(editor),
  ]
```

- [ ] **Step 8: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — todos os testes, incluindo o de contagem de botões da Task 3 (`toBeGreaterThanOrEqual(6)`, que continua válido com mais botões).

- [ ] **Step 9: Typecheck e build**

Run: `npm run typecheck && npm run build`
Expected: sem erros; build inclui o bundle do KaTeX no chunk do editor de documentos.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/features/latex/ src/content-scripts/documento_editar/latex.ts src/content-scripts/documento_editar/formatacaoBasica.ts
git commit -m "feat(lote-i): equações LaTeX via KaTeX local"
```

---

### Task 12: Ligar tudo no `bootstrap()` + atualizar roadmap

**Files:**
- Modify: `src/content-scripts/documento_editar/index.ts`
- Modify: `docs/ROADMAP-LOTES.md`

**Interfaces:**
- Consumes: `iniciarFormatacaoBasica` de `formatacaoBasica.ts` (Task 3).
- Produces: nada (arquivo final do content script).

- [ ] **Step 1: Ligar `iniciarFormatacaoBasica` em `bootstrap()`**

Em `src/content-scripts/documento_editar/index.ts`, dentro de `bootstrap()`, adicionar depois do bloco de `corretorOrtografico`:

```ts
    if (config.formatacaoBasica.ativo) {
      const { iniciarFormatacaoBasica } = await import('./formatacaoBasica')
      await iniciarFormatacaoBasica(editor, config.formatacaoBasica)
    }
```

- [ ] **Step 2: Rodar a suíte inteira, typecheck e build**

Run: `npm test && npm run typecheck && npm run build`
Expected: os três passam sem erro.

- [ ] **Step 3: Atualizar `docs/ROADMAP-LOTES.md`**

Depois da linha do Lote R (a última em "Já entregue"), adicionar:

```markdown
- **Lote I — Formatação Básica no Editor de Documentos (+ LaTeX)** — spec `docs/superpowers/specs/2026-07-14-seirmg-lote-i-formatacao-basica-design.md`, plano `docs/superpowers/plans/2026-07-14-seirmg-lote-i-formatacao-basica.md`. Botões injetados direto na barra nativa do CKEditor (mesma técnica do Sei Pro, confirmada por leitura de código: espera `.cke_toolbox` aparecer, injeta `<a class="cke_button">` imitando a marcação nativa, sem usar o sistema de plugins do CKEditor) — ícones `lucide-static`, tamanho nativo. Alinhar texto, tamanho de fonte, copiar formatação, tabela rápida, quebra de página, sumário, nota de rodapé, maiúscula automática, teclas de atalho configuráveis e equações LaTeX (via KaTeX local, não o serviço externo `latex.codecogs.com` que o Sei Pro usa). Fora de escopo por decisão do usuário: hiperlinks (nativo do CKEditor já cobre o essencial), salvamento automático (risco de deslogamento). Simplificações deliberadas documentadas no plano: tabela rápida usa diálogo com campos numéricos em vez de grade hover interativa; nota de rodapé não renumera automaticamente ao excluir uma nota do meio. ⚠️ **Pendente de validação manual numa instância SEI real** — mesmo tratamento de risco de todo lote que mexe com o editor de documentos (Lotes K/R).
```

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/documento_editar/index.ts docs/ROADMAP-LOTES.md
git commit -m "feat(lote-i): liga formatação básica no bootstrap do editor + marca lote entregue"
```

---

## Verificação final

- [ ] **Rodar a suíte completa + typecheck + build uma última vez, do zero**

Run: `npm run typecheck && npm test && npm run build`
Expected: os três passam sem erro.

**Lembrete de risco (spec, seção "Riscos conhecidos"):** a injeção de botões na toolbar e o comportamento real do CKEditor só podem ser validados numa instância SEI real, com um documento aberto pra edição — os testes automatizados cobrem a lógica pura (catálogos, HTML gerado, parsing) e a orquestração com toolbar/editor simulados via jsdom, não o CKEditor real da página.
