# Lote R — Ponte CKEditor (main world) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desbloquear Ferramentas de IA e Corretor Ortográfico (que já existem no código mas nunca funcionaram numa instância SEI real) trocando o acesso direto e quebrado a `window.CKEDITOR` por uma ponte isolated↔main world, e corrigir o ícone do botão flutuante de Ferramentas de IA.

**Architecture:** Um novo content script declarado com `"world": "MAIN"` no manifest roda no contexto real da página (onde `window.CKEDITOR` existe de verdade), escolhe a instância CKEditor editável e expõe 4 comandos via `CustomEvent` no `window`. O content script isolado existente consome essa ponte através de um cliente (`ponteEditor.ts`) que expõe um objeto `EditorSEI` com métodos assíncronos; `index.ts` (painel de Ferramentas de IA) e `corretorOrtografico.ts` passam a usar esse objeto em vez de tocar em `CKEDITOR` diretamente.

**Tech Stack:** TypeScript, Vite + `@crxjs/vite-plugin` (Manifest V3), Vitest + jsdom, `lucide-static` (ícones SVG).

## Global Constraints

- Escopo desta rodada é só a ponte + desbloqueio de Ferramentas de IA/Corretor Ortográfico + ícone — nenhuma outra feature de editor do Sei Pro (nota de rodapé, tabela, legis, sigilo, sumário, QR Code, dados, editLink, batch imagem) entra aqui (spec, seção "Escopo").
- Suporte fica limitado a CKEditor 4 / SEI clássico (iframe), igual ao código atual — SEI 5 continua fora de escopo (spec, seção "Escopo").
- A técnica é `"world": "MAIN"` nativo do Manifest V3 (Chrome 111+), não vendoring de CKEditor nem `chrome.scripting.executeScript` (spec, seção "Arquitetura da ponte").
- Nomes de função/variável em português, seguindo a convenção já usada no resto do projeto.
- `tsconfig.json` tem `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` — todo código novo precisa passar em `npm run typecheck` sem warnings.

---

### Task 1: `protocolo.ts` + `pontePrincipal.ts` (núcleo testável da ponte, main world)

**Files:**
- Create: `src/content-scripts/documento_editar/protocolo.ts`
- Create: `src/content-scripts/documento_editar/pontePrincipal.ts`
- Test: `src/content-scripts/documento_editar/pontePrincipal.test.ts`

**Interfaces:**
- Consumes: nada (arquivos novos, sem dependência de outras tasks).
- Produces: `EVENTO_PRONTO`, `EVENTO_COMANDO`, `EVENTO_RESPOSTA` (strings), tipos `TipoComando`, `DetalheComando { id: string; tipo: TipoComando; args: unknown[] }`, `DetalheResposta { id: string; resultado: unknown; erro: string | null }`, `DetalhePronto { nome: string }` — todos de `protocolo.ts`, usados pela Task 2 (`ponteEditor.ts`) e pela Task 3 (`pontePrincipalMain.ts`). `criarPonteMainWorld(janelaGlobal: Window, intervaloMs?: number, tentativasMax?: number): { destruir(): void }` de `pontePrincipal.ts`, usado pela Task 3.

- [ ] **Step 1: Criar `protocolo.ts`**

```ts
export const EVENTO_PRONTO = 'seirmg:editor-pronto'
export const EVENTO_COMANDO = 'seirmg:comando-editor'
export const EVENTO_RESPOSTA = 'seirmg:resposta-editor'

export type TipoComando = 'getSelectedText' | 'insertHtml' | 'insertText' | 'getTextoCompleto'

export interface DetalheComando {
  id: string
  tipo: TipoComando
  args: unknown[]
}

export interface DetalheResposta {
  id: string
  resultado: unknown
  erro: string | null
}

export interface DetalhePronto {
  nome: string
}
```

- [ ] **Step 2: Escrever o teste de `pontePrincipal.ts` (vai falhar, o arquivo ainda não existe)**

Criar `src/content-scripts/documento_editar/pontePrincipal.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { criarPonteMainWorld } from './pontePrincipal'
import { EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalhePronto, DetalheResposta } from './protocolo'

function criarJanelaFalsa(): Window {
  return new EventTarget() as unknown as Window
}

function criarInstanciaFalsa(nome: string, editavel: boolean) {
  return {
    name: nome,
    getSelection: () => ({ getSelectedText: () => `selecionado-${nome}` }),
    insertHtml: vi.fn(),
    insertText: vi.fn(),
    editable: () => ({ getText: () => `texto-completo-${nome}` }),
    document: {
      getBody: () => ({ $: { contentEditable: editavel ? 'true' : 'false' } as unknown as HTMLElement }),
    },
  }
}

function definirCkeditor(janela: Window, instances: Record<string, unknown>): void {
  ;(janela as unknown as { CKEDITOR: unknown }).CKEDITOR = { instances }
}

describe('criarPonteMainWorld', () => {
  it('anuncia a instância editável quando há mais de uma instância CKEditor', async () => {
    const janela = criarJanelaFalsa()
    definirCkeditor(janela, {
      cabecalho: criarInstanciaFalsa('cabecalho', false),
      corpo: criarInstanciaFalsa('corpo', true),
    })

    const pronto = new Promise<DetalhePronto>((resolve) => {
      janela.addEventListener(
        EVENTO_PRONTO,
        (evento) => resolve((evento as CustomEvent<DetalhePronto>).detail),
        { once: true }
      )
    })

    const ponte = criarPonteMainWorld(janela, 10, 5)
    await expect(pronto).resolves.toEqual({ nome: 'corpo' })
    ponte.destruir()
  })

  it('executa getSelectedText na instância editável e responde pelo evento de resposta', async () => {
    const janela = criarJanelaFalsa()
    definirCkeditor(janela, { corpo: criarInstanciaFalsa('corpo', true) })
    const ponte = criarPonteMainWorld(janela, 10, 5)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '1', tipo: 'getSelectedText', args: [] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '1', resultado: 'selecionado-corpo', erro: null })
    ponte.destruir()
  })

  it('executa insertHtml repassando o argumento pra instância', async () => {
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
    const comando: DetalheComando = { id: '2', tipo: 'insertHtml', args: ['<p>oi</p>'] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({ id: '2', resultado: null, erro: null })
    expect(instancia.insertHtml).toHaveBeenCalledWith('<p>oi</p>')
    ponte.destruir()
  })

  it('responde com erro quando nenhuma instância está disponível ainda', async () => {
    const janela = criarJanelaFalsa()
    const ponte = criarPonteMainWorld(janela, 10, 0)

    const resposta = new Promise<DetalheResposta>((resolve) => {
      janela.addEventListener(
        EVENTO_RESPOSTA,
        (evento) => resolve((evento as CustomEvent<DetalheResposta>).detail),
        { once: true }
      )
    })
    const comando: DetalheComando = { id: '3', tipo: 'getSelectedText', args: [] }
    janela.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: comando }))

    await expect(resposta).resolves.toEqual({
      id: '3',
      resultado: null,
      erro: 'Nenhuma instância de CKEditor disponível',
    })
    ponte.destruir()
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npm test -- pontePrincipal`
Expected: FAIL — `Cannot find module './pontePrincipal'` (o arquivo ainda não existe).

- [ ] **Step 4: Criar `pontePrincipal.ts`**

```ts
import { EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalheResposta, DetalhePronto, TipoComando } from './protocolo'

interface InstanciaCKEditor {
  name: string
  getSelection: () => { getSelectedText: () => string } | null
  insertHtml: (html: string) => void
  insertText: (texto: string) => void
  editable?: () => { getText: () => string } | undefined
  document: { getBody: () => { $: HTMLElement } }
}

interface JanelaComCKEditor {
  CKEDITOR?: { instances: Record<string, InstanciaCKEditor> }
}

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

function executarComando(instancia: InstanciaCKEditor, tipo: TipoComando, args: unknown[]): unknown {
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
  tentativasMax = 50
): PonteMainWorld {
  let instanciaAtual: InstanciaCKEditor | null = null
  let temporizador: ReturnType<typeof setTimeout> | undefined

  function tentarAnunciar(tentativasRestantes: number): void {
    const instancia = obterInstanciaEditavel(janelaGlobal)
    if (instancia) {
      instanciaAtual = instancia
      const detalhe: DetalhePronto = { nome: instancia.name }
      janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: detalhe }))
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
      resultado = executarComando(instanciaAtual, tipo, args)
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
    },
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npm test -- pontePrincipal`
Expected: PASS — 4 testes verdes.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/documento_editar/protocolo.ts src/content-scripts/documento_editar/pontePrincipal.ts src/content-scripts/documento_editar/pontePrincipal.test.ts
git commit -m "feat(lote-r): núcleo da ponte main-world (protocolo + escolha de instância CKEditor)"
```

---

### Task 2: `pontePrincipalMain.ts` + wiring no manifest/vite (content script `world: MAIN`)

**Files:**
- Create: `src/content-scripts/documento_editar/pontePrincipalMain.ts`
- Modify: `manifest.config.ts` (adicionar entrada em `content_scripts`)
- Modify: `vite.config.ts` (registrar `standaloneFiles`)

**Interfaces:**
- Consumes: `criarPonteMainWorld` de `pontePrincipal.ts` (Task 1).
- Produces: nada consumido por outras tasks — só efeito de build/runtime.

- [ ] **Step 1: Criar `pontePrincipalMain.ts`**

```ts
import { criarPonteMainWorld } from './pontePrincipal'

criarPonteMainWorld(window)
```

- [ ] **Step 2: Adicionar a entrada `world: 'MAIN'` no manifest**

Em `manifest.config.ts`, localizar a última entrada de `content_scripts` (a de `documento_editar/index.ts`, linhas 128-144 do arquivo atual) e adicionar logo depois:

```ts
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/documento_editar/index.ts'],
      all_frames: true,
      run_at: 'document_idle',
    },
    {
      matches: [
        '*://*.br/*controlador.php?acao=*',
        '*://*.org/*controlador.php?acao=*',
      ],
      js: ['src/content-scripts/documento_editar/pontePrincipalMain.ts'],
      all_frames: true,
      run_at: 'document_idle',
      world: 'MAIN',
    },
  ],
})
```

(a entrada `documento_editar/index.ts` já existente não muda — só está copiada aqui pra mostrar onde a nova entra logo em seguida, antes do `],\n})` final do arquivo).

- [ ] **Step 3: Registrar o arquivo como bundle IIFE standalone no vite.config.ts**

O `@crxjs/vite-plugin` precisa que scripts `world: 'MAIN'` sejam bundlados como IIFE autocontido (sem o loader de módulos que os content scripts isolados usam, que não funciona no main world). Substituir `vite.config.ts` inteiro por:

```ts
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [
    crx({
      manifest,
      contentScripts: {
        standaloneFiles: ['src/content-scripts/documento_editar/pontePrincipalMain.ts'],
      },
    }),
  ],
})
```

- [ ] **Step 4: Rodar o build e confirmar que o manifest gerado tem `world: "MAIN"`**

Run: `npm run build`
Expected: build termina sem erro.

Run: `grep -o '"world"[[:space:]]*:[[:space:]]*"MAIN"' dist/manifest.json`
Expected: imprime `"world": "MAIN"` (confirma que a entrada foi gerada corretamente).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/documento_editar/pontePrincipalMain.ts manifest.config.ts vite.config.ts
git commit -m "feat(lote-r): registra content script world:MAIN da ponte CKEditor"
```

---

### Task 3: `ponteEditor.ts` (cliente da ponte, isolated world)

**Files:**
- Create: `src/content-scripts/documento_editar/ponteEditor.ts`
- Test: `src/content-scripts/documento_editar/ponteEditor.test.ts`

**Interfaces:**
- Consumes: `EVENTO_PRONTO`, `EVENTO_COMANDO`, `EVENTO_RESPOSTA`, `TipoComando`, `DetalheComando`, `DetalheResposta`, `DetalhePronto` de `protocolo.ts` (Task 1).
- Produces: `EditorSEI { obterTextoSelecionado(): Promise<string>; obterTextoCompleto(): Promise<string>; inserirHtml(html: string): Promise<void>; inserirTexto(texto: string): Promise<void>; corpo: HTMLElement; documento: Document; janela: Window }` e `criarClienteEditor(janelaGlobal: Window, timeoutComandoMs?: number): { aguardarEditorPronto(documentoGlobal?: Document): Promise<EditorSEI>; destruir(): void }` — usados pela Task 4 (`corretorOrtografico.ts`) e Task 5 (`index.ts`).

- [ ] **Step 1: Escrever o teste de `ponteEditor.ts` (vai falhar, o arquivo ainda não existe)**

Criar `src/content-scripts/documento_editar/ponteEditor.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { criarClienteEditor } from './ponteEditor'
import { EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalheResposta } from './protocolo'

function responderComando(
  janelaGlobal: Window,
  resolver: (detalhe: DetalheComando) => { resultado: unknown; erro: string | null }
): () => void {
  const handler = (evento: Event): void => {
    const detalhe = (evento as CustomEvent<DetalheComando>).detail
    const { resultado, erro } = resolver(detalhe)
    const resposta: DetalheResposta = { id: detalhe.id, resultado, erro }
    janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_RESPOSTA, { detail: resposta }))
  }
  janelaGlobal.addEventListener(EVENTO_COMANDO, handler)
  return () => janelaGlobal.removeEventListener(EVENTO_COMANDO, handler)
}

describe('criarClienteEditor', () => {
  let pararDeResponder: (() => void) | null = null
  let cliente: ReturnType<typeof criarClienteEditor> | null = null

  afterEach(() => {
    pararDeResponder?.()
    cliente?.destruir()
    pararDeResponder = null
    cliente = null
    document.body.innerHTML = ''
  })

  it('monta o EditorSEI a partir do evento de pronto e localiza o iframe pelo nome', async () => {
    document.body.innerHTML = '<iframe title="txaEditor_123"></iframe>'
    cliente = criarClienteEditor(window)

    const promessa = cliente.aguardarEditorPronto(document)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: '123' } }))

    const editor = await promessa
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    expect(editor.documento).toBe(iframe.contentDocument)
    expect(editor.corpo).toBe(iframe.contentDocument?.body)
  })

  it('resolve imediatamente se o evento de pronto já tinha disparado antes de aguardar', async () => {
    document.body.innerHTML = '<iframe title="txaEditor_456"></iframe>'
    cliente = criarClienteEditor(window)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: '456' } }))

    const editor = await cliente.aguardarEditorPronto(document)
    expect(editor.documento).toBe((document.querySelector('iframe') as HTMLIFrameElement).contentDocument)
  })

  it('obterTextoSelecionado envia comando getSelectedText e resolve com o resultado', async () => {
    document.body.innerHTML = '<iframe title="txaEditor_789"></iframe>'
    cliente = criarClienteEditor(window)
    pararDeResponder = responderComando(window, (detalhe) => {
      expect(detalhe.tipo).toBe('getSelectedText')
      return { resultado: 'texto selecionado', erro: null }
    })

    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: '789' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.obterTextoSelecionado()).resolves.toBe('texto selecionado')
  })

  it('inserirHtml rejeita quando o comando responde com erro', async () => {
    document.body.innerHTML = '<iframe title="txaEditor_err"></iframe>'
    cliente = criarClienteEditor(window)
    pararDeResponder = responderComando(window, () => ({ resultado: null, erro: 'falhou' }))

    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'err' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.inserirHtml('<p>x</p>')).rejects.toThrow('falhou')
  })

  it('rejeita quando não encontra o iframe correspondente ao nome anunciado', async () => {
    cliente = criarClienteEditor(window)
    const promessa = cliente.aguardarEditorPronto(document)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'inexistente' } }))
    await expect(promessa).rejects.toThrow('Não foi possível localizar')
  })

  it('rejeita com timeout se nenhuma resposta ao comando chegar', async () => {
    document.body.innerHTML = '<iframe title="txaEditor_to"></iframe>'
    cliente = criarClienteEditor(window, 20)
    window.dispatchEvent(new CustomEvent(EVENTO_PRONTO, { detail: { nome: 'to' } }))
    const editor = await cliente.aguardarEditorPronto(document)

    await expect(editor.obterTextoCompleto()).rejects.toThrow('Timeout')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- ponteEditor`
Expected: FAIL — `Cannot find module './ponteEditor'`.

- [ ] **Step 3: Criar `ponteEditor.ts`**

```ts
import { EVENTO_COMANDO, EVENTO_PRONTO, EVENTO_RESPOSTA } from './protocolo'
import type { DetalheComando, DetalhePronto, DetalheResposta, TipoComando } from './protocolo'

export interface EditorSEI {
  obterTextoSelecionado: () => Promise<string>
  obterTextoCompleto: () => Promise<string>
  inserirHtml: (html: string) => Promise<void>
  inserirTexto: (texto: string) => Promise<void>
  corpo: HTMLElement
  documento: Document
  janela: Window
}

export interface ClienteEditor {
  aguardarEditorPronto: (documentoGlobal?: Document) => Promise<EditorSEI>
  destruir: () => void
}

const TIMEOUT_COMANDO_MS_PADRAO = 5000

export function criarClienteEditor(janelaGlobal: Window, timeoutComandoMs = TIMEOUT_COMANDO_MS_PADRAO): ClienteEditor {
  let proximoId = 0
  const pendentes = new Map<string, (resposta: DetalheResposta) => void>()
  let ultimoPronto: DetalhePronto | null = null
  const aguardandoPronto: Array<(detalhe: DetalhePronto) => void> = []

  function tratarResposta(evento: Event): void {
    const detalhe = (evento as CustomEvent<DetalheResposta>).detail
    const resolver = pendentes.get(detalhe.id)
    if (!resolver) return
    pendentes.delete(detalhe.id)
    resolver(detalhe)
  }

  function tratarPronto(evento: Event): void {
    const detalhe = (evento as CustomEvent<DetalhePronto>).detail
    ultimoPronto = detalhe
    aguardandoPronto.splice(0).forEach((resolver) => resolver(detalhe))
  }

  janelaGlobal.addEventListener(EVENTO_RESPOSTA, tratarResposta)
  janelaGlobal.addEventListener(EVENTO_PRONTO, tratarPronto)

  function obterDetalhePronto(): Promise<DetalhePronto> {
    if (ultimoPronto) return Promise.resolve(ultimoPronto)
    return new Promise((resolve) => aguardandoPronto.push(resolve))
  }

  function enviarComando(tipo: TipoComando, args: unknown[]): Promise<unknown> {
    const id = String(proximoId++)
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => {
        pendentes.delete(id)
        reject(new Error(`Timeout aguardando resposta do comando "${tipo}"`))
      }, timeoutComandoMs)

      pendentes.set(id, (resposta) => {
        clearTimeout(temporizador)
        if (resposta.erro) {
          reject(new Error(resposta.erro))
          return
        }
        resolve(resposta.resultado)
      })

      const detalhe: DetalheComando = { id, tipo, args }
      janelaGlobal.dispatchEvent(new CustomEvent(EVENTO_COMANDO, { detail: detalhe }))
    })
  }

  function montarEditor(nome: string, documentoGlobal: Document): EditorSEI | null {
    const iframe = documentoGlobal.querySelector<HTMLIFrameElement>(`iframe[title*="${nome}"]`)
    const documentoEditor = iframe?.contentDocument
    const janelaEditor = iframe?.contentWindow
    if (!documentoEditor || !janelaEditor) return null

    return {
      corpo: documentoEditor.body,
      documento: documentoEditor,
      janela: janelaEditor,
      obterTextoSelecionado: () => enviarComando('getSelectedText', []).then(String),
      obterTextoCompleto: () => enviarComando('getTextoCompleto', []).then(String),
      inserirHtml: (html: string) => enviarComando('insertHtml', [html]).then(() => undefined),
      inserirTexto: (texto: string) => enviarComando('insertText', [texto]).then(() => undefined),
    }
  }

  function aguardarEditorPronto(documentoGlobal: Document = document): Promise<EditorSEI> {
    return obterDetalhePronto().then(({ nome }) => {
      const editor = montarEditor(nome, documentoGlobal)
      if (!editor) throw new Error(`Não foi possível localizar o iframe do editor "${nome}"`)
      return editor
    })
  }

  return {
    aguardarEditorPronto,
    destruir(): void {
      janelaGlobal.removeEventListener(EVENTO_RESPOSTA, tratarResposta)
      janelaGlobal.removeEventListener(EVENTO_PRONTO, tratarPronto)
    },
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- ponteEditor`
Expected: PASS — 6 testes verdes.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/documento_editar/ponteEditor.ts src/content-scripts/documento_editar/ponteEditor.test.ts
git commit -m "feat(lote-r): cliente isolated-world da ponte (EditorSEI)"
```

---

### Task 4: Migrar `corretorOrtografico.ts` para `EditorSEI`

**Files:**
- Modify: `src/content-scripts/documento_editar/corretorOrtografico.ts`

**Interfaces:**
- Consumes: `EditorSEI` de `./ponteEditor` (Task 3).
- Produces: `iniciarCorretorOrtografico(editor: EditorSEI, config: CorretorOrtograficoConfig): Promise<void>` — usado pela Task 5 (`index.ts`).

- [ ] **Step 1: Trocar o import do tipo do editor**

Substituir:
```ts
import type { EditorCKEditor } from './index'
```
por:
```ts
import type { EditorSEI } from './ponteEditor'
```

- [ ] **Step 2: Trocar todas as ocorrências de `EditorCKEditor` por `EditorSEI`**

O tipo `EditorCKEditor` aparece como anotação de parâmetro em `reescanearAlterados`, `atualizarDestaque`, `obterJanelaComHighlight`, `aplicarSugestao`, `ignorarOcorrencia`, `adicionarAoDicionario`, `abrirMenuSugestoes`, `tentarInterceptarCliqueDireito`, `tratarMousedown`, `tratarContextMenu` e `iniciarCorretorOrtografico`. Substituir (find & replace em todo o arquivo) `EditorCKEditor` → `EditorSEI` em cada uma dessas assinaturas — é troca de nome de tipo, sem mudança de lógica.

- [ ] **Step 3: Trocar acesso direto ao DOM do editor pelos campos do `EditorSEI`**

Em `obterJanelaComHighlight`, substituir:
```ts
function obterJanelaComHighlight(editor: EditorSEI): JanelaComHighlightApi {
  return editor.document.getWindow().$ as unknown as JanelaComHighlightApi
}
```
por:
```ts
function obterJanelaComHighlight(editor: EditorSEI): JanelaComHighlightApi {
  return editor.janela as unknown as JanelaComHighlightApi
}
```

Em `reescanearAlterados`, substituir:
```ts
    const corpo = editor.document.getBody().$
```
por:
```ts
    const corpo = editor.corpo
```

Em `iniciarCorretorOrtografico`, substituir:
```ts
  const documentoEditor = editor.document.$
  const corpo = editor.document.getBody().$
  const janelaEditor = editor.document.getWindow().$
```
por:
```ts
  const documentoEditor = editor.documento
  const corpo = editor.corpo
  const janelaEditor = editor.janela
```

- [ ] **Step 4: Tornar `aplicarSugestao` assíncrono (agora `insertText` passa pela ponte)**

Substituir:
```ts
function aplicarSugestao(erro: ErroComRange, sugestao: string, editor: EditorSEI): void {
  const janela = obterJanelaComHighlight(editor)
  const selecao = janela.getSelection()
  if (!selecao) return
  selecao.removeAllRanges()
  selecao.addRange(erro.range.cloneRange())
  editor.insertText(sugestao)
  removerErroDoMapa(erro)
  atualizarDestaque(editor)
  atualizarIndicador()
}
```
por:
```ts
async function aplicarSugestao(erro: ErroComRange, sugestao: string, editor: EditorSEI): Promise<void> {
  const janela = obterJanelaComHighlight(editor)
  const selecao = janela.getSelection()
  if (!selecao) return
  selecao.removeAllRanges()
  selecao.addRange(erro.range.cloneRange())
  await editor.inserirTexto(sugestao)
  removerErroDoMapa(erro)
  atualizarDestaque(editor)
  atualizarIndicador()
}
```

E no chamador, dentro de `abrirMenuSugestoes`, substituir:
```ts
    item.addEventListener('click', () => {
      aplicarSugestao(erro, sugestao, editor)
      fecharMenuSugestoes(documentoEditor)
    })
```
por:
```ts
    item.addEventListener('click', () => {
      aplicarSugestao(erro, sugestao, editor).catch((error) => {
        console.error('[SEIRMG] Falha ao aplicar sugestão do corretor ortográfico:', error)
      })
      fecharMenuSugestoes(documentoEditor)
    })
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (nenhum teste unitário existente cobre este arquivo — `corretor.ts`/`diffParagrafos.ts`, que têm testes próprios, não mudam).

- [ ] **Step 6: Commit**

```bash
git add src/content-scripts/documento_editar/corretorOrtografico.ts
git commit -m "fix(lote-r): corretor ortográfico usa EditorSEI (ponte main-world) em vez de CKEDITOR direto"
```

---

### Task 5: Migrar `index.ts` (Ferramentas de IA) para `EditorSEI` + ícone `sparkles`

**Files:**
- Modify: `src/content-scripts/documento_editar/index.ts`

**Interfaces:**
- Consumes: `criarClienteEditor`, `EditorSEI` de `./ponteEditor` (Task 3); `iniciarCorretorOrtografico(editor: EditorSEI, ...)` de `./corretorOrtografico` (Task 4).
- Produces: nada consumido por outras tasks (arquivo final do content script).

- [ ] **Step 1: Reescrever `index.ts` por completo**

Substituir o conteúdo inteiro do arquivo por (as únicas mudanças de comportamento em relação ao arquivo atual são: import do `sparklesIconSvg` e do cliente da ponte; remoção de `EditorCKEditor`/`JanelaComCKEditor`/`esperarCKEditor`/`obterInstanciaCKEditor`; `obterTextoSelecionado`, `obterTextoDocumentoInteiro` e `atualizarPainel` viram assíncronas; `tratarCliquePainel` vira assíncrona; `montarBotaoFlutuante` usa o ícone SVG; `bootstrap` usa `criarClienteEditor`/`aguardarEditorPronto`):

```ts
import { montarPromptComContexto, montarPromptPronto, type TipoPromptPronto } from '../../features/ferramentas-ia/prompts'
import { montarRequisicao, extrairResposta } from '../../features/ferramentas-ia/adaptadores'
import { fetchIA } from '../../lib/fetchIaViaBackground'
import { createSyncConfigStore } from '../../lib/storage'
import type { ProvedorIA, FerramentasIAConfig } from '../../lib/storage'
import openaiIconSvg from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import geminiIconSvg from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import claudeIconSvg from '@lobehub/icons-static-svg/icons/claude-color.svg?raw'
import sparklesIconSvg from 'lucide-static/icons/sparkles.svg?raw'
import { criarClienteEditor, type EditorSEI } from './ponteEditor'

const ESTILO_PAINEL_IA = `
  #seirmg-botao-ia {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    height: 32px;
    padding: 0 12px;
    background: #017fff;
    border: none;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #fff;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
  }
  #seirmg-botao-ia:hover {
    background: #0066cc;
  }
  #seirmg-botao-ia svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  #seirmg-painel-ia {
    position: fixed;
    top: 60px;
    right: 20px;
    width: 420px;
    max-width: calc(100vw - 40px);
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
    z-index: 10000;
    font-family: Arial, Helvetica, sans-serif;
    color: #222;
    overflow: hidden;
  }
  .seirmg-ia-cabecalho {
    background: #017fff;
    color: #fff;
    padding: 10px 14px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .seirmg-ia-cabecalho span:last-child {
    cursor: pointer;
  }
  .seirmg-ia-provedores {
    display: flex;
    border-bottom: 1px solid #eee;
  }
  .seirmg-ia-provedor {
    flex: 1;
    text-align: center;
    padding: 10px 4px;
    font-size: 12px;
    color: #666;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .seirmg-ia-icone-provedor {
    display: inline-flex;
  }
  .seirmg-ia-icone-provedor svg {
    width: 18px;
    height: 18px;
  }
  .seirmg-ia-provedor.ativo {
    background: #eef6ff;
    border-bottom: 2px solid #017fff;
    font-weight: bold;
    color: #017fff;
  }
  .seirmg-ia-confirmacao {
    padding: 10px 14px;
    background: #fff8e1;
    border-bottom: 1px solid #f0d9a0;
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .seirmg-ia-confirmacao.confirmado {
    background: #eef7ee;
    border-bottom: 1px solid #cde5cd;
    color: #2e7d32;
  }
  .seirmg-ia-bloqueio {
    padding: 10px 14px;
    background: #fdecea;
    border-bottom: 1px solid #f3c1bb;
    color: #c0392b;
    font-size: 12px;
  }
  .seirmg-ia-modos {
    display: flex;
    border-bottom: 1px solid #eee;
    font-size: 12px;
  }
  .seirmg-ia-modo {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    color: #666;
    cursor: pointer;
  }
  .seirmg-ia-modo.ativo {
    border-bottom: 2px solid #017fff;
    color: #017fff;
    font-weight: bold;
  }
  .seirmg-ia-corpo {
    padding: 14px;
  }
  .seirmg-ia-selecao-info {
    font-size: 11px;
    color: #888;
    margin-bottom: 6px;
  }
  .seirmg-ia-corpo textarea {
    width: 100%;
    height: 60px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    font-size: 13px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
  }
  .seirmg-ia-botao-enviar {
    margin-top: 10px;
    width: 100%;
    padding: 9px;
    background: #017fff;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
  .seirmg-ia-botao-enviar:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  .seirmg-ia-prontos-botao {
    display: block;
    width: 100%;
    margin-bottom: 8px;
    padding: 9px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .seirmg-ia-resposta {
    border: 1px solid #017fff;
    border-radius: 4px;
    padding: 10px;
    background: #fafcff;
    margin-top: 12px;
  }
  .seirmg-ia-resposta-rotulo {
    font-size: 11px;
    color: #017fff;
    font-weight: bold;
    margin-bottom: 6px;
  }
  .seirmg-ia-resposta-texto {
    font-size: 13px;
    color: #333;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .seirmg-ia-resposta-acoes {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .seirmg-ia-resposta-acoes button {
    flex: 1;
    padding: 9px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
  .seirmg-ia-inserir {
    background: #017fff;
    color: #fff;
    border: none;
    font-weight: bold;
  }
  .seirmg-ia-descartar {
    background: #fff;
    color: #666;
    border: 1px solid #ccc;
  }
`

function injetarEstilos(): void {
  if (document.getElementById('seirmg-estilo-ia')) return
  const style = document.createElement('style')
  style.id = 'seirmg-estilo-ia'
  style.textContent = ESTILO_PAINEL_IA
  document.head.appendChild(style)
}

const ICONES_PROVEDOR: Record<ProvedorIA, string> = {
  openai: openaiIconSvg,
  gemini: geminiIconSvg,
  claude: claudeIconSvg,
}

const ROTULOS_PROVEDOR: Record<ProvedorIA, string> = {
  openai: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
}

const MODOS = [
  { id: 'livre', rotulo: 'Prompt livre' },
  { id: 'prontos', rotulo: 'Prontos' },
  { id: 'redigir', rotulo: 'Redigir' },
] as const
type ModoPainel = (typeof MODOS)[number]['id']

type ProvedorPainel = ProvedorIA | 'jusia'

interface EstadoPainel {
  provedor: ProvedorPainel
  modo: ModoPainel
  confirmado: boolean
}

let estadoAtual: EstadoPainel = { provedor: 'openai', modo: 'livre', confirmado: false }
let respostaAtual: string | null = null
let enviandoAtual = false

async function obterTextoSelecionado(editor: EditorSEI): Promise<string> {
  try {
    return (await editor.obterTextoSelecionado()).trim()
  } catch {
    return ''
  }
}

function montarHtmlProvedores(config: FerramentasIAConfig): string {
  const provedoresComChave = (['openai', 'gemini', 'claude'] as const).filter(
    (provedor) => config[provedor].apiKey.trim() !== ''
  )

  const abasApi = provedoresComChave
    .map((provedor) => {
      const ativo = provedor === estadoAtual.provedor ? ' ativo' : ''
      return `
        <div class="seirmg-ia-provedor${ativo}" data-acao="provedor" data-provedor="${provedor}">
          <span class="seirmg-ia-icone-provedor">${ICONES_PROVEDOR[provedor]}</span>
          ${ROTULOS_PROVEDOR[provedor]}
        </div>
      `
    })
    .join('')

  const ativoJusia = estadoAtual.provedor === 'jusia' ? ' ativo' : ''
  const abaJusia = `
    <div class="seirmg-ia-provedor${ativoJusia}" data-acao="provedor" data-provedor="jusia">
      <img src="https://ia.jusbrasil.com.br/favicon.ico" alt="" onerror="this.style.visibility='hidden'">
      JusIA
    </div>
  `

  return abasApi + abaJusia
}

function montarHtmlModos(): string {
  return MODOS.map(({ id, rotulo }) => {
    const ativo = id === estadoAtual.modo ? ' ativo' : ''
    return `<div class="seirmg-ia-modo${ativo}" data-acao="modo" data-modo="${id}">${rotulo}</div>`
  }).join('')
}

function escaparHtml(texto: string): string {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}

function montarHtmlResposta(): string {
  if (respostaAtual === null || estadoAtual.provedor === 'jusia') return ''
  return `
    <div class="seirmg-ia-resposta">
      <div class="seirmg-ia-resposta-rotulo">RESPOSTA — ${ROTULOS_PROVEDOR[estadoAtual.provedor]}</div>
      <div class="seirmg-ia-resposta-texto">${escaparHtml(respostaAtual)}</div>
    </div>
    <div class="seirmg-ia-resposta-acoes">
      <button class="seirmg-ia-inserir" data-acao="inserir">Inserir no documento</button>
      <button class="seirmg-ia-descartar" data-acao="descartar">Descartar</button>
    </div>
  `
}

function montarHtmlCorpo(textoSelecionado: string): string {
  const desabilitado = !estadoAtual.confirmado || enviandoAtual
  const semSelecaoLivre =
    estadoAtual.modo === 'livre' ? 'Nenhum texto selecionado — a pergunta vai considerar o documento inteiro.' : 'Nenhum texto selecionado.'
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em>`
    : semSelecaoLivre

  if (estadoAtual.modo === 'prontos') {
    const semSelecao = textoSelecionado === ''
    const rotulos: Record<TipoPromptPronto, string> = {
      resumir: 'Resumir',
      revisar: 'Revisar/corrigir português',
      formal: 'Deixar mais formal',
    }
    const botoes = (Object.keys(rotulos) as TipoPromptPronto[])
      .map(
        (tipo) => `
        <button class="seirmg-ia-prontos-botao" data-acao="enviar-pronto" data-tipo="${tipo}"
          ${desabilitado || semSelecao ? 'disabled' : ''}>${rotulos[tipo]}</button>
      `
      )
      .join('')
    return `
      <div class="seirmg-ia-selecao-info">${textoInfo}</div>
      ${botoes}
      ${semSelecao ? '<div class="seirmg-ia-selecao-info">Selecione um trecho no documento pra usar os prompts prontos.</div>' : ''}
      ${montarHtmlResposta()}
    `
  }

  const rotuloBotao = estadoAtual.modo === 'redigir' ? 'Gerar' : 'Perguntar'
  const placeholder =
    estadoAtual.modo === 'redigir'
      ? 'Descreva o que você quer redigir...'
      : 'Digite sua pergunta sobre o texto selecionado...'
  const textoBotao = enviandoAtual
    ? 'Enviando...'
    : !estadoAtual.confirmado
      ? `${rotuloBotao} (marque a confirmação acima)`
      : rotuloBotao

  return `
    <div class="seirmg-ia-selecao-info">${textoInfo}</div>
    <textarea id="seirmg-ia-instrucao" placeholder="${placeholder}" ${desabilitado ? 'disabled' : ''}></textarea>
    <button class="seirmg-ia-botao-enviar" data-acao="enviar-${estadoAtual.modo}" ${desabilitado ? 'disabled' : ''}>${textoBotao}</button>
    ${montarHtmlResposta()}
  `
}

function montarHtmlCorpoJusia(textoSelecionado: string): string {
  const textoInfo = textoSelecionado
    ? `Texto selecionado: <em>"${escaparHtml(textoSelecionado.slice(0, 80))}${textoSelecionado.length > 80 ? '...' : ''}"</em> (copiado pra área de transferência ao clicar)`
    : 'Nenhum texto selecionado — o JusIA abre sem nada copiado.'

  return `
    <div class="seirmg-ia-selecao-info">${textoInfo}</div>
    <button class="seirmg-ia-botao-enviar" data-acao="ir-jusia" ${!estadoAtual.confirmado ? 'disabled' : ''}>
      ${estadoAtual.confirmado ? 'Ir pro JusIA' : 'Ir pro JusIA (marque a confirmação acima)'}
    </button>
  `
}

function montarHtmlPainel(
  config: FerramentasIAConfig,
  textoSelecionado: string,
  documentoRestrito: boolean
): string {
  const confirmacaoClasse = estadoAtual.confirmado ? ' confirmado' : ''
  const confirmacaoTexto = estadoAtual.confirmado
    ? '✓ Confirmado: documento não sigiloso/restrito.'
    : 'Confirmo que este documento <strong>não é sigiloso/restrito</strong> — o texto enviado sai do ambiente do SEI para um serviço externo.'
  const checkbox = estadoAtual.confirmado
    ? ''
    : '<input type="checkbox" id="seirmg-ia-checkbox-confirmar" data-acao="confirmar">'

  const blocoConfirmacao = documentoRestrito
    ? '<div class="seirmg-ia-bloqueio">⚠ Este documento parece ter acesso restrito/sigiloso (detectado automaticamente) — ferramentas de IA bloqueadas.</div>'
    : `<div class="seirmg-ia-confirmacao${confirmacaoClasse}">${checkbox}<span>${confirmacaoTexto}</span></div>`

  const modosOuVazio = estadoAtual.provedor === 'jusia' ? '' : `<div class="seirmg-ia-modos">${montarHtmlModos()}</div>`
  const corpo =
    estadoAtual.provedor === 'jusia' ? montarHtmlCorpoJusia(textoSelecionado) : montarHtmlCorpo(textoSelecionado)

  return `
    <div class="seirmg-ia-cabecalho">
      <span>Ferramentas de IA</span>
      <span data-acao="fechar">✕</span>
    </div>
    <div class="seirmg-ia-provedores">${montarHtmlProvedores(config)}</div>
    ${blocoConfirmacao}
    ${documentoRestrito ? '' : modosOuVazio}
    <div class="seirmg-ia-corpo">${documentoRestrito ? '' : corpo}</div>
  `
}

async function obterTextoDocumentoInteiro(editor: EditorSEI): Promise<string> {
  try {
    return (await editor.obterTextoCompleto()).trim()
  } catch {
    return ''
  }
}

function obterIdDocumentoAtual(): string | null {
  return new URLSearchParams(window.location.search).get('id_documento')
}

function detectarDocumentoRestrito(): boolean {
  const idDocumento = obterIdDocumentoAtual()
  if (!idDocumento) return false
  return document.getElementById(`anchorNA${idDocumento}`) !== null
}

async function atualizarPainel(config: FerramentasIAConfig, editor: EditorSEI): Promise<void> {
  const painel = document.getElementById('seirmg-painel-ia')
  if (!painel) return
  const textoSelecionado = await obterTextoSelecionado(editor)
  painel.innerHTML = montarHtmlPainel(config, textoSelecionado, detectarDocumentoRestrito())
}

async function enviar(
  prompt: string,
  provedor: ProvedorIA,
  config: FerramentasIAConfig,
  editor: EditorSEI
): Promise<void> {
  enviandoAtual = true
  respostaAtual = null
  await atualizarPainel(config, editor)

  try {
    const provedorConfig = config[provedor]
    const requisicao = montarRequisicao(provedor, provedorConfig.modelo, prompt, provedorConfig.apiKey)
    const resultado = await fetchIA(requisicao.url, {
      method: requisicao.method,
      headers: requisicao.headers,
      body: requisicao.body,
    })

    if (!resultado.ok) {
      respostaAtual = `Erro ao consultar ${ROTULOS_PROVEDOR[provedor]}: ${resultado.error}`
    } else {
      respostaAtual = extrairResposta(provedor, resultado.data) ?? 'Não foi possível interpretar a resposta.'
    }
  } catch (error) {
    respostaAtual = `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    enviandoAtual = false
    await atualizarPainel(config, editor)
  }
}

async function tratarCliquePainel(evento: MouseEvent, config: FerramentasIAConfig, editor: EditorSEI): Promise<void> {
  if (!(evento.target instanceof HTMLElement)) return
  const elemento = evento.target.closest<HTMLElement>('[data-acao]')
  if (!elemento) return
  const acao = elemento.dataset.acao

  if (acao === 'fechar') {
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'provedor') {
    const provedor = elemento.dataset.provedor as ProvedorPainel
    estadoAtual = { ...estadoAtual, provedor }
    respostaAtual = null
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'modo') {
    const modo = elemento.dataset.modo as ModoPainel
    estadoAtual = { ...estadoAtual, modo }
    respostaAtual = null
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'confirmar' && elemento instanceof HTMLInputElement) {
    estadoAtual = { ...estadoAtual, confirmado: elemento.checked }
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'descartar') {
    respostaAtual = null
    await atualizarPainel(config, editor)
    return
  }

  if (acao === 'inserir') {
    if (respostaAtual) await editor.inserirHtml(escaparHtml(respostaAtual).replace(/\n/g, '<br>'))
    document.getElementById('seirmg-painel-ia')?.remove()
    return
  }

  if (acao === 'ir-jusia') {
    if (!estadoAtual.confirmado) return
    const textoSelecionado = await obterTextoSelecionado(editor)
    if (textoSelecionado) {
      navigator.clipboard.writeText(textoSelecionado).catch((error) => {
        console.error('[SEIRMG] Falha ao copiar texto pra área de transferência:', error)
      })
    }
    window.open('https://ia.jusbrasil.com.br', '_blank')
    return
  }

  if (acao === 'enviar-livre') {
    if (estadoAtual.provedor === 'jusia') return
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const pergunta = textarea?.value.trim() ?? ''
    if (!pergunta || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = await obterTextoSelecionado(editor)
    const contexto = textoSelecionado || (await obterTextoDocumentoInteiro(editor))
    const prompt = montarPromptComContexto(pergunta, contexto || null)
    await enviar(prompt, estadoAtual.provedor, config, editor)
    return
  }

  if (acao === 'enviar-redigir') {
    if (estadoAtual.provedor === 'jusia') return
    const textarea = document.getElementById('seirmg-ia-instrucao') as HTMLTextAreaElement | null
    const instrucao = textarea?.value.trim() ?? ''
    if (!instrucao || !estadoAtual.confirmado || enviandoAtual) return
    const textoSelecionado = await obterTextoSelecionado(editor)
    const prompt = montarPromptComContexto(instrucao, textoSelecionado || null)
    await enviar(prompt, estadoAtual.provedor, config, editor)
    return
  }

  if (acao === 'enviar-pronto') {
    if (estadoAtual.provedor === 'jusia') return
    const tipo = elemento.dataset.tipo as TipoPromptPronto
    const textoSelecionado = await obterTextoSelecionado(editor)
    if (!textoSelecionado || !estadoAtual.confirmado || enviandoAtual) return
    const prompt = montarPromptPronto(tipo, textoSelecionado)
    await enviar(prompt, estadoAtual.provedor, config, editor)
  }
}

function montarPainel(config: FerramentasIAConfig, editor: EditorSEI): void {
  document.getElementById('seirmg-painel-ia')?.remove()
  estadoAtual = { provedor: config.provedorAtivo, modo: 'livre', confirmado: false }
  respostaAtual = null
  enviandoAtual = false

  const painel = document.createElement('div')
  painel.id = 'seirmg-painel-ia'
  document.body.appendChild(painel)
  painel.addEventListener('click', (evento) => {
    tratarCliquePainel(evento, config, editor).catch((error) => {
      console.error('[SEIRMG] Falha ao tratar clique no painel de IA:', error)
    })
  })

  atualizarPainel(config, editor).catch((error) => {
    console.error('[SEIRMG] Falha ao atualizar painel de IA:', error)
  })
}

// Botão flutuante, independente da barra de ferramentas do CKEditor — item próprio,
// não misturado com os botões nativos de formatação do editor.
function montarBotaoFlutuante(editor: EditorSEI, config: FerramentasIAConfig): void {
  if (document.getElementById('seirmg-botao-ia')) return

  const botao = document.createElement('button')
  botao.type = 'button'
  botao.id = 'seirmg-botao-ia'
  botao.innerHTML = `${sparklesIconSvg}<span>Ferramentas de IA</span>`
  botao.title = 'Ferramentas de IA'
  botao.addEventListener('click', () => montarPainel(config, editor))
  document.body.appendChild(botao)
}

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.ferramentasIA.ativo && !config.corretorOrtografico.ativo) return

    const clienteEditor = criarClienteEditor(window)
    const editor = await clienteEditor.aguardarEditorPronto()

    if (config.ferramentasIA.ativo) {
      injetarEstilos()
      montarBotaoFlutuante(editor, config.ferramentasIA)
    }

    if (config.corretorOrtografico.ativo) {
      const { iniciarCorretorOrtografico } = await import('./corretorOrtografico')
      await iniciarCorretorOrtografico(editor, config.corretorOrtografico)
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar recursos do editor de documentos:', error)
  }
}

bootstrap()
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (nenhum "unused" — `EditorCKEditor`/`esperarCKEditor`/`obterInstanciaCKEditor`/`JanelaComCKEditor` saíram por completo do arquivo).

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — todos os testes existentes continuam verdes, mais os novos de `pontePrincipal`/`ponteEditor`.

- [ ] **Step 4: Build final**

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/documento_editar/index.ts
git commit -m "fix(lote-r): Ferramentas de IA usa EditorSEI (ponte main-world) + ícone sparkles no botão flutuante"
```

---

### Task 6: Atualizar `docs/ROADMAP-LOTES.md`

**Files:**
- Modify: `docs/ROADMAP-LOTES.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada (documentação).

- [ ] **Step 1: Adicionar o Lote R em "Já entregue"**

Depois da linha da "Melhoria do Lote B" (linha 26 do arquivo atual, logo antes de `## Roteiro (ordem sugerida)`), adicionar:

```markdown
- **Lote R — Ponte CKEditor (main world) + desbloqueio de Ferramentas de IA e Corretor Ortográfico** — spec `docs/superpowers/specs/2026-07-13-seirmg-lote-r-ponte-ckeditor-design.md`, plano `docs/superpowers/plans/2026-07-13-seirmg-lote-r-ponte-ckeditor.md`. Causa raiz confirmada por teste ao vivo (ver `project-seirmg-ckeditor-isolated-world` na memória do projeto): `window.CKEDITOR` só existe no main world da página, invisível pro content script isolado — por isso Ferramentas de IA (Lote K) e Corretor Ortográfico nunca funcionaram de fato numa instância SEI real. Corrigido com `"world": "MAIN"` nativo do Manifest V3 (Chrome 111+): um segundo content script roda no main world, único lugar que toca em `CKEDITOR`, e conversa com o content script isolado (que mantém toda a UI/storage/fetch) via `CustomEvent` no `window`. Ícone do botão flutuante de Ferramentas de IA trocado do emoji "✨" pelo SVG `sparkles` do `lucide-static` (mesmo já usado pra essa seção nas Opções). ⚠️ **Pendente de validação manual numa instância SEI real** — a ponte em si depende de `window.CKEDITOR`/iframe reais, não testável fora de produção.
```

- [ ] **Step 2: Marcar a dependência satisfeita nos itens `I` e `J` do roteiro**

Na tabela "Roteiro (ordem sugerida)", ao final da célula "Escopo" da linha `I` (nota de rodapé/tabela rápida/sumário/etc.), adicionar: ` **Pré-requisito técnico (ponte main-world) já disponível desde o Lote R.**`

Ao final da célula "Escopo" da linha `J` (QR Code/sigilo/etc.), adicionar a mesma frase: ` **Pré-requisito técnico (ponte main-world) já disponível desde o Lote R.**`

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP-LOTES.md
git commit -m "docs(lote-r): marca Lote R como entregue no roadmap"
```

---

## Verificação final

- [ ] **Rodar a suíte completa + typecheck + build uma última vez, do zero**

Run: `npm run typecheck && npm test && npm run build`
Expected: os três passam sem erro.

**Lembrete de risco (spec, seção "Validação"):** a ponte em si (main world ↔ `window.CKEDITOR` ↔ isolated world) só pode ser validada de verdade numa instância SEI real, com um documento aberto pra edição — os testes automatizados cobrem a lógica de escolha de instância e o protocolo de RPC, não o comportamento real do CKEditor da página.
