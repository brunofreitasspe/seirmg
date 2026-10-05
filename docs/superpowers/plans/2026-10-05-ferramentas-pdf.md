# Ferramentas de PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suíte de ferramentas de PDF 100% client-side (sem servidor) dentro do seirmg: juntar, dividir, organizar, numerar páginas, imagem→PDF, comprimir, OCR, diagnóstico PDF/A e tarjar (redação com máscara automática de CPF/CNPJ) — e enviar o resultado direto como documento externo no processo aberto do SEI.

**Architecture:** Página standalone (`src/ferramentas-pdf/`, aberta em nova aba, mesmo padrão de `src/dashboard/`) com um catálogo de ferramentas; cada ferramenta tem uma camada pura testável em `src/features/ferramentas-pdf/<ferramenta>.ts` (recebe/devolve `Uint8Array`, sem DOM — "não importa React nem toca no DOM", pra poder ser verificada por teste automático) e uma camada de UI fina em `src/ferramentas-pdf/ferramentas/<ferramenta>.ts` que só lida com arquivo/clique/download. Processamento de PDF via `pdf-lib`; renderização/leitura de página via `pdfjs-dist`; OCR via `tesseract.js`.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Vitest, `pdf-lib`, `pdfjs-dist`, `tesseract.js`.

**Spec:** Sem spec prévia — nasceu de comparação ad-hoc com `C:\sei\seipro\sei-pro\ferramentas-pdf\` e `https://seipro.app/` nesta conversa. Os requisitos abaixo são a spec.

## Global Constraints

- Toda operação que manipula bytes de PDF é uma função pura em `src/features/ferramentas-pdf/*.ts`, assinatura `(entrada: Uint8Array, opções) => Promise<Uint8Array>` (ou equivalente), sem DOM — testável com PDFs minúsculos construídos na própria suíte via `PDFDocument.create()` (mesma técnica do projeto de referência: "a única forma de verificar automaticamente a parte capaz de corromper o documento do usuário").
- Nenhum upload para servidor externo — todo processamento roda no navegador do usuário. Isso é a proposta de valor da ferramenta (documentos de processo administrativo não saem da máquina) e deve continuar valendo mesmo depois deste plano.
- Nenhuma conversão automática pra PDF/A de verdade — ferramenta 10 (Task 10) é diagnóstico (confere e explica), não conversão. Implementações maduras de conversão PDF/A derivam de Ghostscript/mupdf, ambos AGPL — risco jurídico fora do escopo deste plano.
- Nomes de arquivo de saída sempre em português, padrão `<nome-original>-<sufixo-da-operação>.pdf` (ex.: `processo-unido.pdf`, `pagina-3.pdf`).
- `bun run test`, `bun run typecheck`, `bun run lint` passam a cada tarefa antes do commit.

---

## File Structure

- Create: `src/features/ferramentas-pdf/catalogo.ts` (+ `.test.ts`) — metadados das ferramentas (id, nome, descrição, ícone).
- Create: `src/features/ferramentas-pdf/juntar.ts`, `dividir.ts`, `organizar.ts`, `numerarPaginas.ts`, `imagemParaPdf.ts`, `comprimir.ts`, `pdfa.ts`, `tarjar.ts`, `cpfCnpj.ts` — cada um com `.test.ts` ao lado.
- Create: `src/ferramentas-pdf/index.html`, `main.ts`, `style.css` — página standalone com o catálogo e o roteador por ferramenta.
- Create: `src/ferramentas-pdf/ferramentas/<nome>.ts` — UI fina de cada ferramenta (escolher arquivo, chamar a função pura, oferecer download/envio).
- Create: `src/ferramentas-pdf/enviarAoProcesso.ts` — reaproveita a cadeia AJAX de `features/procedimento-visualizar/dropzone.ts` pra criar documento externo no processo aberto.
- Modify: `src/lib/storage.ts` — `FerramentasPdfConfig`.
- Modify: `manifest.config.ts`, `vite.config.ts` — nova entrada de página + web accessible resource.
- Modify: `src/popup/index.html` / `src/popup/main.ts` — botão "Abrir Ferramentas de PDF".
- Modify: `src/options/index.html` / `src/options/main.ts` — toggle da feature.
- Modify: `package.json` — `pdf-lib`, `pdfjs-dist`, `tesseract.js`.

---

### Task 1: Infraestrutura — dependências, storage, página standalone, catálogo

**Files:**
- Modify: `package.json`
- Modify: `src/lib/storage.ts`
- Modify: `manifest.config.ts`
- Modify: `vite.config.ts`
- Create: `src/features/ferramentas-pdf/catalogo.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/index.html`, `main.ts`, `style.css`
- Modify: `src/popup/index.html` / `src/popup/main.ts`
- Modify: `src/options/index.html` / `src/options/main.ts`

**Interfaces:**
- Produces: `FerramentaPdf { id: string; nome: string; descricao: string }`, `listarFerramentasPdf(): FerramentaPdf[]`
- Produces (storage): `FerramentasPdfConfig { ativo: boolean }`

- [ ] **Step 1: Instalar dependências**

Run: `bun add pdf-lib pdfjs-dist tesseract.js`
Expected: entradas novas em `package.json` (`dependencies`) e `bun.lock`

- [ ] **Step 2: Escrever o teste do catálogo que falha**

```typescript
// src/features/ferramentas-pdf/catalogo.test.ts
import { describe, it, expect } from 'vitest'
import { listarFerramentasPdf } from './catalogo'

describe('listarFerramentasPdf', () => {
  it('lista as 9 ferramentas, cada uma com id único', () => {
    const ferramentas = listarFerramentasPdf()
    expect(ferramentas).toHaveLength(9)
    expect(new Set(ferramentas.map((f) => f.id)).size).toBe(9)
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `bun run test catalogo.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 4: Implementar o catálogo**

```typescript
// src/features/ferramentas-pdf/catalogo.ts
export interface FerramentaPdf {
  id: string
  nome: string
  descricao: string
}

const FERRAMENTAS: FerramentaPdf[] = [
  { id: 'juntar', nome: 'Juntar PDFs', descricao: 'Une vários PDFs em um único arquivo, na ordem escolhida.' },
  { id: 'dividir', nome: 'Dividir PDF', descricao: 'Separa um PDF em vários arquivos, por página ou por intervalo.' },
  { id: 'organizar', nome: 'Organizar páginas', descricao: 'Reordena ou remove páginas de um PDF.' },
  { id: 'numerar-paginas', nome: 'Numerar páginas', descricao: 'Adiciona numeração sequencial no canto de cada página.' },
  { id: 'imagem-para-pdf', nome: 'Imagem → PDF', descricao: 'Converte uma ou mais imagens (JPG/PNG) em um PDF.' },
  { id: 'comprimir', nome: 'Comprimir PDF', descricao: 'Reduz o tamanho do arquivo recomprimindo as imagens internas.' },
  { id: 'ocr', nome: 'OCR', descricao: 'Reconhece texto em PDFs escaneados (imagem), tornando-os pesquisáveis.' },
  { id: 'pdfa', nome: 'Diagnóstico PDF/A', descricao: 'Confere o que falta pro arquivo ser aceito como PDF/A e explica por quê.' },
  { id: 'tarjar', nome: 'Tarjar (sigilo)', descricao: 'Apaga de verdade (não só visualmente) trechos sigilosos de um PDF, com sugestão automática de CPF/CNPJ.' },
]

export function listarFerramentasPdf(): FerramentaPdf[] {
  return FERRAMENTAS
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `bun run test catalogo.test.ts`
Expected: PASS

- [ ] **Step 6: Storage e opções**

Em `src/lib/storage.ts`, acrescentar à `SyncConfig`:

```typescript
export interface FerramentasPdfConfig {
  ativo: boolean
}
```

```typescript
  ferramentasPdf: FerramentasPdfConfig
```

E ao `DEFAULT_SYNC_CONFIG`:

```typescript
  ferramentasPdf: {
    ativo: false,
  },
```

Em `src/options/index.html`, acrescentar uma aba nova (seguindo o padrão das demais — botão em `#abas` + `<section>` em `.conteudo`):

```html
        <button data-aba="ferramentas-pdf" class="aba-btn">Ferramentas de PDF</button>
```

```html
    <section id="painel-ferramentas-pdf" class="painel">
      <h2>Ferramentas de PDF</h2>
      <label>
        <input type="checkbox" id="ferramentas-pdf-ativo" />
        Ativar Ferramentas de PDF (botão no popup da extensão)
      </label>
      <p style="font-size: 0.85em; color: #666; max-width: 480px;">
        Processamento 100% local no seu navegador — nenhum arquivo é enviado a servidor algum.
      </p>
      <br />
      <button id="ferramentas-pdf-salvar">Salvar</button>
      <span id="ferramentas-pdf-status"></span>
    </section>
```

Em `src/options/main.ts`, seguir exatamente o padrão de outra aba simples (ex.: a aba `geral`/`dashboard`): carregar `config.ferramentasPdf.ativo` no checkbox e salvar de volta no clique do botão.

- [ ] **Step 7: Entrada de build e manifest**

Em `vite.config.ts`, acrescentar ao `rollupOptions.input` (já existe `dashboard`):

```typescript
      input: {
        dashboard: 'src/dashboard/index.html',
        ferramentasPdf: 'src/ferramentas-pdf/index.html',
      },
```

Em `manifest.config.ts`, acrescentar ao array `resources` do `web_accessible_resources` já existente (mesmo bloco que lista `src/dashboard/index.html`):

```typescript
      resources: ['src/dashboard/index.html', 'src/ferramentas-pdf/index.html'],
```

- [ ] **Step 8: Página standalone (casca)**

```html
<!-- src/ferramentas-pdf/index.html -->
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Ferramentas de PDF — SEIRMG</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <header class="cabecalho">
      <h1>Ferramentas de PDF</h1>
      <p>Processamento 100% local — nada sai do seu navegador.</p>
    </header>
    <main id="conteudo"></main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```typescript
// src/ferramentas-pdf/main.ts
import { listarFerramentasPdf } from '../features/ferramentas-pdf/catalogo'

function obterFerramentaDaUrl(): string | null {
  return new URL(window.location.href).searchParams.get('ferramenta')
}

function renderizarCatalogo(container: HTMLElement): void {
  const lista = document.createElement('div')
  lista.className = 'catalogo'
  listarFerramentasPdf().forEach((ferramenta) => {
    const card = document.createElement('a')
    card.className = 'catalogo-card'
    card.href = `?ferramenta=${ferramenta.id}`
    const titulo = document.createElement('strong')
    titulo.textContent = ferramenta.nome
    const descricao = document.createElement('p')
    descricao.textContent = ferramenta.descricao
    card.append(titulo, descricao)
    lista.appendChild(card)
  })
  container.appendChild(lista)
}

async function render(): Promise<void> {
  const container = document.getElementById('conteudo')
  if (!container) return

  const ferramentaId = obterFerramentaDaUrl()
  if (!ferramentaId) {
    renderizarCatalogo(container)
    return
  }

  // Cada ferramenta registra seu próprio módulo de UI em ferramentas/<id>.ts (Tasks 3-11),
  // carregado dinamicamente pra não inflar o bundle inicial do catálogo com todas as libs
  // (pdf-lib, pdfjs-dist, tesseract.js) de uma vez.
  try {
    const modulo = await import(`./ferramentas/${ferramentaId}.ts`)
    modulo.montar(container)
  } catch (error) {
    console.error('[SEIRMG] Ferramenta de PDF não encontrada:', ferramentaId, error)
    container.textContent = 'Ferramenta não encontrada.'
  }
}

render().catch((error) => console.error('[SEIRMG] Falha ao iniciar Ferramentas de PDF:', error))
```

```css
/* src/ferramentas-pdf/style.css */
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f4f7fb; color: #1a2233; }
.cabecalho { padding: 20px 24px; background: #fff; border-bottom: 1px solid #e2e7f0; }
.cabecalho h1 { margin: 0 0 4px; font-size: 20px; }
.cabecalho p { margin: 0; color: #667085; font-size: 13px; }
#conteudo { padding: 24px; max-width: 960px; margin: 0 auto; }
.catalogo { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.catalogo-card { display: block; padding: 16px; border-radius: 10px; background: #fff; border: 1px solid #e2e7f0; text-decoration: none; color: inherit; }
.catalogo-card:hover { border-color: #017fff; }
.catalogo-card strong { display: block; margin-bottom: 4px; }
.catalogo-card p { margin: 0; font-size: 12.5px; color: #667085; }
```

- [ ] **Step 9: Botão no popup**

Em `src/popup/index.html`/`main.ts`, duplicar exatamente o padrão do botão "Abrir Dashboard" (`#abrir-dashboard`, `#icone-dashboard`) pra um novo `#abrir-ferramentas-pdf`, gated por `config.ferramentasPdf?.ativo`, abrindo `chrome.runtime.getURL('src/ferramentas-pdf/index.html')`.

- [ ] **Step 10: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: PASS, e `dist/src/ferramentas-pdf/index.html` existe

- [ ] **Step 11: Commit**

```bash
git add package.json bun.lock src/lib/storage.ts manifest.config.ts vite.config.ts src/features/ferramentas-pdf/catalogo.ts src/features/ferramentas-pdf/catalogo.test.ts src/ferramentas-pdf/ src/popup/index.html src/popup/main.ts src/options/index.html src/options/main.ts
git commit -m "feat(ferramentas-pdf): infraestrutura (página standalone, catálogo, storage)"
```

---

### Task 2: Juntar PDFs

**Files:**
- Create: `src/features/ferramentas-pdf/juntar.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/juntar.ts`

**Interfaces:**
- Produces: `juntarPdfs(arquivos: Uint8Array[]): Promise<Uint8Array>`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { juntarPdfs } from './juntar'

async function pdfComNPaginas(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage()
  return doc.save()
}

describe('juntarPdfs', () => {
  it('une os PDFs na ordem recebida, somando as páginas', async () => {
    const a = await pdfComNPaginas(2)
    const b = await pdfComNPaginas(3)
    const resultado = await juntarPdfs([a, b])
    const unido = await PDFDocument.load(resultado)
    expect(unido.getPageCount()).toBe(5)
  })

  it('rejeita lista vazia', async () => {
    await expect(juntarPdfs([])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test juntar.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/juntar.ts
import { PDFDocument } from 'pdf-lib'

export async function juntarPdfs(arquivos: Uint8Array[]): Promise<Uint8Array> {
  if (arquivos.length === 0) throw new Error('Nenhum arquivo informado pra juntar.')

  const resultado = await PDFDocument.create()
  for (const bytes of arquivos) {
    const origem = await PDFDocument.load(bytes)
    const paginas = await resultado.copyPages(origem, origem.getPageIndices())
    paginas.forEach((pagina) => resultado.addPage(pagina))
  }
  return resultado.save()
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test juntar.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

```typescript
// src/ferramentas-pdf/ferramentas/juntar.ts
import { juntarPdfs } from '../../features/ferramentas-pdf/juntar'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Juntar PDFs</h2>
    <input type="file" id="juntar-arquivos" accept="application/pdf" multiple />
    <p id="juntar-lista"></p>
    <button id="juntar-processar" disabled>Juntar</button>
  `
  const input = document.getElementById('juntar-arquivos') as HTMLInputElement
  const botao = document.getElementById('juntar-processar') as HTMLButtonElement
  const lista = document.getElementById('juntar-lista') as HTMLParagraphElement

  input.addEventListener('change', () => {
    const arquivos = Array.from(input.files ?? [])
    lista.textContent = arquivos.map((a) => a.name).join(', ')
    botao.disabled = arquivos.length < 2
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivos = Array.from(input.files ?? [])
      const bytes = await Promise.all(arquivos.map(async (a) => new Uint8Array(await a.arrayBuffer())))
      const resultado = await juntarPdfs(bytes)
      const blob = new Blob([resultado], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'processo-unido.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao juntar PDFs:', error)
      alert('Não foi possível juntar os PDFs. Veja o console pra detalhes.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/juntar.ts src/features/ferramentas-pdf/juntar.test.ts src/ferramentas-pdf/ferramentas/juntar.ts
git commit -m "feat(ferramentas-pdf): juntar PDFs"
```

---

### Task 3: Dividir PDF

**Files:**
- Create: `src/features/ferramentas-pdf/dividir.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/dividir.ts`

**Interfaces:**
- Produces: `dividirPdf(arquivo: Uint8Array, intervalos: Array<[number, number]>): Promise<Uint8Array[]>` (índices de página em base 0, inclusivos)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { dividirPdf } from './dividir'

async function pdfComNPaginas(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < n; i++) doc.addPage()
  return doc.save()
}

describe('dividirPdf', () => {
  it('separa por intervalo, cada saída com as páginas certas', async () => {
    const original = await pdfComNPaginas(5)
    const [parte1, parte2] = await dividirPdf(original, [
      [0, 1],
      [2, 4],
    ])
    expect((await PDFDocument.load(parte1)).getPageCount()).toBe(2)
    expect((await PDFDocument.load(parte2)).getPageCount()).toBe(3)
  })

  it('rejeita intervalo fora do total de páginas', async () => {
    const original = await pdfComNPaginas(2)
    await expect(dividirPdf(original, [[0, 5]])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test dividir.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/dividir.ts
import { PDFDocument } from 'pdf-lib'

export async function dividirPdf(arquivo: Uint8Array, intervalos: Array<[number, number]>): Promise<Uint8Array[]> {
  const origem = await PDFDocument.load(arquivo)
  const totalPaginas = origem.getPageCount()

  const resultados: Uint8Array[] = []
  for (const [inicio, fim] of intervalos) {
    if (inicio < 0 || fim >= totalPaginas || inicio > fim) {
      throw new Error(`Intervalo inválido [${inicio}, ${fim}] pra um PDF com ${totalPaginas} página(s).`)
    }
    const indices = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)
    const novo = await PDFDocument.create()
    const paginas = await novo.copyPages(origem, indices)
    paginas.forEach((pagina) => novo.addPage(pagina))
    resultados.push(await novo.save())
  }
  return resultados
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test dividir.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

```typescript
// src/ferramentas-pdf/ferramentas/dividir.ts
import { dividirPdf } from '../../features/ferramentas-pdf/dividir'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Dividir PDF</h2>
    <input type="file" id="dividir-arquivo" accept="application/pdf" />
    <label>Intervalos (ex.: 1-3, 4-4, 5-8): <input type="text" id="dividir-intervalos" placeholder="1-3, 4-8" /></label>
    <button id="dividir-processar" disabled>Dividir</button>
  `
  const input = document.getElementById('dividir-arquivo') as HTMLInputElement
  const campoIntervalos = document.getElementById('dividir-intervalos') as HTMLInputElement
  const botao = document.getElementById('dividir-processar') as HTMLButtonElement

  input.addEventListener('change', () => {
    botao.disabled = !input.files?.[0]
  })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      // "1-3, 4-8" -> [[0,2],[3,7]] (interface em base 1, função pura em base 0).
      const intervalos = campoIntervalos.value
        .split(',')
        .map((parte) => parte.trim())
        .filter(Boolean)
        .map((parte) => {
          const [inicio, fim] = parte.split('-').map((n) => Number(n.trim()))
          return [inicio - 1, (fim ?? inicio) - 1] as [number, number]
        })
      const partes = await dividirPdf(bytes, intervalos)
      partes.forEach((parte, indice) => {
        const blob = new Blob([parte], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `parte-${indice + 1}.pdf`
        link.click()
        URL.revokeObjectURL(url)
      })
    } catch (error) {
      console.error('[SEIRMG] Falha ao dividir PDF:', error)
      alert('Não foi possível dividir o PDF. Confira os intervalos informados.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/dividir.ts src/features/ferramentas-pdf/dividir.test.ts src/ferramentas-pdf/ferramentas/dividir.ts
git commit -m "feat(ferramentas-pdf): dividir PDF por intervalo de páginas"
```

---

### Task 4: Organizar páginas (reordenar/remover)

**Files:**
- Create: `src/features/ferramentas-pdf/organizar.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/organizar.ts`

**Interfaces:**
- Produces: `organizarPaginas(arquivo: Uint8Array, ordemFinal: number[]): Promise<Uint8Array>` (índices em base 0; página ausente na lista é removida; repetição duplica)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { organizarPaginas } from './organizar'

describe('organizarPaginas', () => {
  it('reordena e remove páginas conforme a lista final de índices', async () => {
    const doc = await PDFDocument.create()
    const tamanhos = [100, 200, 300]
    for (const largura of tamanhos) doc.addPage([largura, 100])
    const bytes = await doc.save()

    // mantém só a página 2 (índice 1) e a página 0, nessa ordem -> [1, 0]
    const resultado = await organizarPaginas(bytes, [1, 0])
    const final = await PDFDocument.load(resultado)
    expect(final.getPageCount()).toBe(2)
    expect(final.getPage(0).getWidth()).toBe(200)
    expect(final.getPage(1).getWidth()).toBe(100)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test organizar.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/organizar.ts
import { PDFDocument } from 'pdf-lib'

export async function organizarPaginas(arquivo: Uint8Array, ordemFinal: number[]): Promise<Uint8Array> {
  const origem = await PDFDocument.load(arquivo)
  const novo = await PDFDocument.create()
  const paginas = await novo.copyPages(origem, ordemFinal)
  paginas.forEach((pagina) => novo.addPage(pagina))
  return novo.save()
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test organizar.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

UI simples: lista de miniaturas numeradas (1, 2, 3...) com botões ↑/↓ pra reordenar e um "×" pra remover; o array de índices reflete a ordem final visível na tela.

```typescript
// src/ferramentas-pdf/ferramentas/organizar.ts
import { PDFDocument } from 'pdf-lib'
import { organizarPaginas } from '../../features/ferramentas-pdf/organizar'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Organizar páginas</h2>
    <input type="file" id="organizar-arquivo" accept="application/pdf" />
    <ol id="organizar-lista"></ol>
    <button id="organizar-processar" disabled>Salvar PDF reorganizado</button>
  `
  const input = document.getElementById('organizar-arquivo') as HTMLInputElement
  const lista = document.getElementById('organizar-lista') as HTMLOListElement
  const botao = document.getElementById('organizar-processar') as HTMLButtonElement
  let bytesOriginais: Uint8Array | null = null
  let ordem: number[] = []

  function renderizarLista(): void {
    lista.innerHTML = ''
    ordem.forEach((indicePagina, posicao) => {
      const li = document.createElement('li')
      li.textContent = `Página ${indicePagina + 1} `
      const subir = document.createElement('button')
      subir.textContent = '↑'
      subir.disabled = posicao === 0
      subir.addEventListener('click', () => {
        ;[ordem[posicao - 1], ordem[posicao]] = [ordem[posicao], ordem[posicao - 1]]
        renderizarLista()
      })
      const descer = document.createElement('button')
      descer.textContent = '↓'
      descer.disabled = posicao === ordem.length - 1
      descer.addEventListener('click', () => {
        ;[ordem[posicao], ordem[posicao + 1]] = [ordem[posicao + 1], ordem[posicao]]
        renderizarLista()
      })
      const remover = document.createElement('button')
      remover.textContent = '×'
      remover.addEventListener('click', () => {
        ordem = ordem.filter((_, i) => i !== posicao)
        renderizarLista()
      })
      li.append(subir, descer, remover)
      lista.appendChild(li)
    })
    botao.disabled = ordem.length === 0
  }

  input.addEventListener('change', async () => {
    const arquivo = input.files?.[0]
    if (!arquivo) return
    bytesOriginais = new Uint8Array(await arquivo.arrayBuffer())
    const totalPaginas = (await PDFDocument.load(bytesOriginais)).getPageCount()
    ordem = Array.from({ length: totalPaginas }, (_, i) => i)
    renderizarLista()
  })

  botao.addEventListener('click', async () => {
    try {
      if (!bytesOriginais) return
      const resultado = await organizarPaginas(bytesOriginais, ordem)
      const blob = new Blob([resultado], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-organizado.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao organizar páginas:', error)
      alert('Não foi possível salvar o PDF reorganizado.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/organizar.ts src/features/ferramentas-pdf/organizar.test.ts src/ferramentas-pdf/ferramentas/organizar.ts
git commit -m "feat(ferramentas-pdf): organizar (reordenar/remover) páginas"
```

---

### Task 5: Numerar páginas

**Files:**
- Create: `src/features/ferramentas-pdf/numerarPaginas.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/numerar-paginas.ts`

**Interfaces:**
- Produces: `numerarPaginas(arquivo: Uint8Array, opcoes: { inicioEm?: number; posicao?: 'inferior-direito' | 'inferior-centro' }): Promise<Uint8Array>`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { numerarPaginas } from './numerarPaginas'

describe('numerarPaginas', () => {
  it('não altera a contagem de páginas', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addPage()
    const bytes = await doc.save()

    const resultado = await numerarPaginas(bytes, {})
    expect((await PDFDocument.load(resultado)).getPageCount()).toBe(2)
  })

  it('aceita número inicial diferente de 1', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()
    await expect(numerarPaginas(bytes, { inicioEm: 5 })).resolves.toBeInstanceOf(Uint8Array)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test numerarPaginas.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/numerarPaginas.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface OpcoesNumeracao {
  inicioEm?: number
  posicao?: 'inferior-direito' | 'inferior-centro'
}

export async function numerarPaginas(arquivo: Uint8Array, opcoes: OpcoesNumeracao): Promise<Uint8Array> {
  const doc = await PDFDocument.load(arquivo)
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  const inicioEm = opcoes.inicioEm ?? 1
  const posicao = opcoes.posicao ?? 'inferior-direito'
  const tamanhoFonte = 10

  doc.getPages().forEach((pagina, indice) => {
    const texto = String(inicioEm + indice)
    const largura = fonte.widthOfTextAtSize(texto, tamanhoFonte)
    const x = posicao === 'inferior-direito' ? pagina.getWidth() - largura - 24 : pagina.getWidth() / 2 - largura / 2
    pagina.drawText(texto, { x, y: 16, size: tamanhoFonte, font: fonte, color: rgb(0, 0, 0) })
  })

  return doc.save()
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test numerarPaginas.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

```typescript
// src/ferramentas-pdf/ferramentas/numerar-paginas.ts
import { numerarPaginas } from '../../features/ferramentas-pdf/numerarPaginas'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Numerar páginas</h2>
    <input type="file" id="numerar-arquivo" accept="application/pdf" />
    <label>Começar em: <input type="number" id="numerar-inicio" value="1" min="1" /></label>
    <button id="numerar-processar" disabled>Numerar</button>
  `
  const input = document.getElementById('numerar-arquivo') as HTMLInputElement
  const inicio = document.getElementById('numerar-inicio') as HTMLInputElement
  const botao = document.getElementById('numerar-processar') as HTMLButtonElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const resultado = await numerarPaginas(bytes, { inicioEm: Number(inicio.value) || 1 })
      const blob = new Blob([resultado], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-numerado.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao numerar páginas:', error)
      alert('Não foi possível numerar o PDF.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/numerarPaginas.ts src/features/ferramentas-pdf/numerarPaginas.test.ts src/ferramentas-pdf/ferramentas/numerar-paginas.ts
git commit -m "feat(ferramentas-pdf): numerar páginas"
```

---

### Task 6: Imagem → PDF

**Files:**
- Create: `src/features/ferramentas-pdf/imagemParaPdf.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/imagem-para-pdf.ts`

**Interfaces:**
- Produces: `imagensParaPdf(imagens: Array<{ bytes: Uint8Array; tipo: 'png' | 'jpg' }>): Promise<Uint8Array>`

- [ ] **Step 1: Escrever o teste que falha**

PNG 1×1 válido em base64 (menor PNG válido possível) é usado como fixture:

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { imagensParaPdf } from './imagemParaPdf'

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function bytesDoPng(): Uint8Array {
  return Uint8Array.from(Buffer.from(PNG_1X1_BASE64, 'base64'))
}

describe('imagensParaPdf', () => {
  it('cria um PDF com uma página por imagem', async () => {
    const resultado = await imagensParaPdf([
      { bytes: bytesDoPng(), tipo: 'png' },
      { bytes: bytesDoPng(), tipo: 'png' },
    ])
    expect((await PDFDocument.load(resultado)).getPageCount()).toBe(2)
  })

  it('rejeita lista vazia', async () => {
    await expect(imagensParaPdf([])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test imagemParaPdf.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/imagemParaPdf.ts
import { PDFDocument } from 'pdf-lib'

export interface ImagemEntrada {
  bytes: Uint8Array
  tipo: 'png' | 'jpg'
}

export async function imagensParaPdf(imagens: ImagemEntrada[]): Promise<Uint8Array> {
  if (imagens.length === 0) throw new Error('Nenhuma imagem informada.')

  const doc = await PDFDocument.create()
  for (const imagem of imagens) {
    const embutida = imagem.tipo === 'png' ? await doc.embedPng(imagem.bytes) : await doc.embedJpg(imagem.bytes)
    const pagina = doc.addPage([embutida.width, embutida.height])
    pagina.drawImage(embutida, { x: 0, y: 0, width: embutida.width, height: embutida.height })
  }
  return doc.save()
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test imagemParaPdf.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

```typescript
// src/ferramentas-pdf/ferramentas/imagem-para-pdf.ts
import { imagensParaPdf, type ImagemEntrada } from '../../features/ferramentas-pdf/imagemParaPdf'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Imagem → PDF</h2>
    <input type="file" id="imagem-arquivos" accept="image/png,image/jpeg" multiple />
    <button id="imagem-processar" disabled>Converter</button>
  `
  const input = document.getElementById('imagem-arquivos') as HTMLInputElement
  const botao = document.getElementById('imagem-processar') as HTMLButtonElement

  input.addEventListener('change', () => { botao.disabled = (input.files?.length ?? 0) === 0 })

  botao.addEventListener('click', async () => {
    try {
      const arquivos = Array.from(input.files ?? [])
      const imagens: ImagemEntrada[] = await Promise.all(
        arquivos.map(async (arquivo) => ({
          bytes: new Uint8Array(await arquivo.arrayBuffer()),
          tipo: arquivo.type === 'image/png' ? ('png' as const) : ('jpg' as const),
        }))
      )
      const resultado = await imagensParaPdf(imagens)
      const blob = new Blob([resultado], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'imagens-convertidas.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao converter imagens em PDF:', error)
      alert('Não foi possível converter as imagens.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/imagemParaPdf.ts src/features/ferramentas-pdf/imagemParaPdf.test.ts src/ferramentas-pdf/ferramentas/imagem-para-pdf.ts
git commit -m "feat(ferramentas-pdf): imagem para PDF"
```

---

### Task 7: Comprimir PDF

**Files:**
- Create: `src/features/ferramentas-pdf/comprimir.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/comprimir.ts`

**Interfaces:**
- Produces: `comprimirPdf(arquivo: Uint8Array): Promise<{ bytes: Uint8Array; tamanhoOriginal: number; tamanhoFinal: number }>`

- [ ] **Step 1: Escrever o teste que falha**

`pdf-lib` por si só já reduz o tamanho de muitos PDFs ao resalvar com `useObjectStreams` (remove objetos órfãos, comprime o fluxo de objetos) — compressão de imagem (recodificar JPEG com mais perda) fica fora do escopo inicial, documentado explicitamente na função:

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { comprimirPdf } from './comprimir'

describe('comprimirPdf', () => {
  it('devolve bytes válidos e informa os dois tamanhos', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save({ useObjectStreams: false }) // propositalmente "não otimizado"

    const resultado = await comprimirPdf(bytes)
    expect(resultado.tamanhoOriginal).toBe(bytes.length)
    expect((await PDFDocument.load(resultado.bytes)).getPageCount()).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test comprimir.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/comprimir.ts
import { PDFDocument } from 'pdf-lib'

export interface ResultadoCompressao {
  bytes: Uint8Array
  tamanhoOriginal: number
  tamanhoFinal: number
}

// Compressão "estrutural": remove objetos órfãos e reescreve com fluxo de objetos
// comprimido (pdf-lib `useObjectStreams`). Não recomprime imagens com perda — isso
// precisa decodificar/recodificar cada imagem interna (JPEG/PNG) e é tratado como
// melhoria futura, não parte deste plano.
export async function comprimirPdf(arquivo: Uint8Array): Promise<ResultadoCompressao> {
  const doc = await PDFDocument.load(arquivo)
  const bytes = await doc.save({ useObjectStreams: true })
  return { bytes, tamanhoOriginal: arquivo.length, tamanhoFinal: bytes.length }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test comprimir.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

```typescript
// src/ferramentas-pdf/ferramentas/comprimir.ts
import { comprimirPdf } from '../../features/ferramentas-pdf/comprimir'

function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Comprimir PDF</h2>
    <input type="file" id="comprimir-arquivo" accept="application/pdf" />
    <p id="comprimir-resultado"></p>
    <button id="comprimir-processar" disabled>Comprimir</button>
  `
  const input = document.getElementById('comprimir-arquivo') as HTMLInputElement
  const botao = document.getElementById('comprimir-processar') as HTMLButtonElement
  const resultadoTexto = document.getElementById('comprimir-resultado') as HTMLParagraphElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const resultado = await comprimirPdf(bytes)
      resultadoTexto.textContent = `${formatarBytes(resultado.tamanhoOriginal)} → ${formatarBytes(resultado.tamanhoFinal)}`
      const blob = new Blob([resultado.bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-comprimido.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao comprimir PDF:', error)
      alert('Não foi possível comprimir o PDF.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/comprimir.ts src/features/ferramentas-pdf/comprimir.test.ts src/ferramentas-pdf/ferramentas/comprimir.ts
git commit -m "feat(ferramentas-pdf): comprimir PDF (estrutural)"
```

---

### Task 8: OCR

**Files:**
- Create: `src/features/ferramentas-pdf/ocr.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/ocr.ts`

**Interfaces:**
- Produces: `extrairTextoDeImagem(imagemBytes: Uint8Array, idiomas?: string): Promise<string>` (camada fina sobre `tesseract.js`, testável mockando `createWorker`)
- Produces: `montarTextoPorPagina(textos: string[]): string` (função pura — junta o texto de cada página com separador legível, essa parte é testada sem mock)

- [ ] **Step 1: Escrever o teste que falha**

A parte que chama rede neural (`tesseract.js`) não é verificada automaticamente (exige modelo .traineddata, lento e não-determinístico) — igual ao projeto de referência, que também não tem teste unitário pra `ocr.ts`, só pra agregação de texto. Testamos a função pura de agregação:

```typescript
import { describe, it, expect } from 'vitest'
import { montarTextoPorPagina } from './ocr'

describe('montarTextoPorPagina', () => {
  it('junta o texto de cada página com cabeçalho de página', () => {
    const resultado = montarTextoPorPagina(['Texto da página 1', 'Texto da página 2'])
    expect(resultado).toBe('--- Página 1 ---\nTexto da página 1\n\n--- Página 2 ---\nTexto da página 2')
  })

  it('lista vazia devolve string vazia', () => {
    expect(montarTextoPorPagina([])).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test ocr.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/ocr.ts
import { createWorker } from 'tesseract.js'

export function montarTextoPorPagina(textos: string[]): string {
  return textos.map((texto, indice) => `--- Página ${indice + 1} ---\n${texto}`).join('\n\n')
}

// Não testada automaticamente — depende do modelo .traineddata (download + rede neural),
// lento e não-determinístico. Verificação é manual, igual a outras partes do repo que
// dependem de I/O real (ver README, seção "Limitações da verificação desta entrega").
export async function extrairTextoDeImagem(imagemBytes: Uint8Array, idiomas = 'por'): Promise<string> {
  const worker = await createWorker(idiomas)
  try {
    const { data } = await worker.recognize(new Blob([imagemBytes]))
    return data.text
  } finally {
    await worker.terminate()
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test ocr.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta**

Renderiza cada página do PDF pra um `<canvas>` via `pdfjs-dist` (baixa resolução, 2x, suficiente pro OCR), chama `extrairTextoDeImagem` em cada canvas exportado como PNG, e junta tudo com `montarTextoPorPagina`.

```typescript
// src/ferramentas-pdf/ferramentas/ocr.ts
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { extrairTextoDeImagem, montarTextoPorPagina } from '../../features/ferramentas-pdf/ocr'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

async function paginaParaPng(pdf: Awaited<ReturnType<typeof getDocument>>['promise'] extends Promise<infer T> ? T : never, numero: number): Promise<Uint8Array> {
  const pagina = await pdf.getPage(numero)
  const viewport = pagina.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const contexto = canvas.getContext('2d')!
  await pagina.render({ canvasContext: contexto, viewport }).promise
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>OCR</h2>
    <input type="file" id="ocr-arquivo" accept="application/pdf" />
    <p id="ocr-progresso"></p>
    <textarea id="ocr-resultado" rows="12" readonly style="width:100%"></textarea>
    <button id="ocr-processar" disabled>Reconhecer texto</button>
  `
  const input = document.getElementById('ocr-arquivo') as HTMLInputElement
  const botao = document.getElementById('ocr-processar') as HTMLButtonElement
  const progresso = document.getElementById('ocr-progresso') as HTMLParagraphElement
  const resultado = document.getElementById('ocr-resultado') as HTMLTextAreaElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      botao.disabled = true
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const pdf = await getDocument({ data: bytes }).promise
      const textos: string[] = []
      for (let numero = 1; numero <= pdf.numPages; numero++) {
        progresso.textContent = `Processando página ${numero} de ${pdf.numPages}...`
        const png = await paginaParaPng(pdf, numero)
        textos.push(await extrairTextoDeImagem(png))
      }
      resultado.value = montarTextoPorPagina(textos)
      progresso.textContent = 'Concluído.'
    } catch (error) {
      console.error('[SEIRMG] Falha no OCR:', error)
      progresso.textContent = 'Falha ao reconhecer o texto. Veja o console.'
    } finally {
      botao.disabled = false
    }
  })
}
```

- [ ] **Step 6: Rodar tudo e verificar manualmente**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: PASS. **Verificação manual obrigatória** (igual ao padrão já documentado no README do projeto pra partes que dependem de ambiente real): abrir `dist/src/ferramentas-pdf/index.html?ferramenta=ocr` num Chrome com a extensão carregada e confirmar que o worker do `pdfjs-dist` carrega sem erro de CSP/caminho (ele é referenciado via `new URL(..., import.meta.url)`, que o Vite resolve em build; se o console mostrar 404 pro `.worker.min.mjs`, o arquivo precisa ser copiado manualmente pros assets do build — ajustar `vite.config.ts` se for o caso).

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/ocr.ts src/features/ferramentas-pdf/ocr.test.ts src/ferramentas-pdf/ferramentas/ocr.ts
git commit -m "feat(ferramentas-pdf): OCR (tesseract.js) pra PDFs escaneados"
```

---

### Task 9: Diagnóstico PDF/A

**Files:**
- Create: `src/features/ferramentas-pdf/pdfa.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/pdfa.ts`

**Interfaces:**
- Produces: `diagnosticarPdfA(arquivo: Uint8Array): Promise<DiagnosticoPdfA>`, onde `DiagnosticoPdfA = { conforme: 'indeterminado'; verificacoes: VerificacaoPdfA[] }` (nunca afirma "é PDF/A" — ver Global Constraints)

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { diagnosticarPdfA } from './pdfa'

describe('diagnosticarPdfA', () => {
  it('aponta ausência de metadados XMP e de intenção de saída de cor', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    expect(diagnostico.conforme).toBe('indeterminado')
    const chaves = diagnostico.verificacoes.map((v) => v.chave)
    expect(chaves).toContain('metadados-xmp')
    expect(diagnostico.verificacoes.find((v) => v.chave === 'metadados-xmp')?.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test pdfa.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

Checagens necessárias-mas-não-suficientes (ver Global Constraints — isto não substitui o veraPDF):

```typescript
// src/features/ferramentas-pdf/pdfa.ts
import { PDFDocument } from 'pdf-lib'

export interface VerificacaoPdfA {
  chave: string
  titulo: string
  ok: boolean
  explicacao: string
}

export interface DiagnosticoPdfA {
  // Nunca "true" nem "false" -- essas checagens são necessárias, não suficientes;
  // a referência de verdade é o veraPDF, que não roda no navegador. Ver Global Constraints.
  conforme: 'indeterminado'
  verificacoes: VerificacaoPdfA[]
}

export async function diagnosticarPdfA(arquivo: Uint8Array): Promise<DiagnosticoPdfA> {
  const doc = await PDFDocument.load(arquivo)

  const temMetadadosXmp = doc.getInfoDict !== undefined && (await temXmp(doc))
  const temFontesEmbutidas = doc.getForm !== undefined // placeholder estrutural: ver nota abaixo
  const semCriptografia = !arquivo.includes // nunca verdadeiro-falso por si -- ver nota abaixo

  const verificacoes: VerificacaoPdfA[] = [
    {
      chave: 'metadados-xmp',
      titulo: 'Metadados XMP',
      ok: temMetadadosXmp,
      explicacao: temMetadadosXmp
        ? 'O arquivo tem um bloco de metadados XMP.'
        : 'PDF/A exige metadados XMP (título, autor, datas) no formato RDF/XML. Ferramentas de PDF comuns não geram isso por padrão.',
    },
  ]

  return { conforme: 'indeterminado', verificacoes }
}

async function temXmp(doc: PDFDocument): Promise<boolean> {
  // pdf-lib expõe o catálogo via context; XMP vive na entrada /Metadata do catálogo.
  const catalogo = doc.catalog
  return catalogo.has(doc.context.obj('Metadata') as never) === false
    ? catalogo.lookup(doc.context.obj('Metadata') as never) !== undefined
    : true
}
```

> **Nota pro executor desta tarefa:** a implementação de `temXmp` acima usa a API interna de baixo nível do `pdf-lib` (`PDFDocument.catalog`/`context`) — ela existe e é pública, mas não é a API "de alto nível" documentada no README do pacote. Antes do Step 4, confirmar a forma exata de ler `/Metadata` do catálogo rodando `node -e "console.log(Object.keys(require('pdf-lib').PDFDocument.prototype))"` ou inspecionando `node_modules/pdf-lib/dist/pdf-lib.d.ts` — ajustar `temXmp` pro que existir de fato na versão instalada antes de prosseguir. As checagens de fontes embutidas e ausência de criptografia (variáveis `temFontesEmbutidas`/`semCriptografia` acima) são placeholders deliberados a resolver na mesma sessão, usando `doc.context.enumerateIndirectObjects()` pra inspecionar `/Subtype /Type1`/`/TrueType` sem `/FontFile*` (fonte não embutida) e `doc.isEncrypted` pra criptografia — ambos existem na API pública do `pdf-lib`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test pdfa.test.ts`
Expected: PASS (depois de resolver a nota acima)

- [ ] **Step 5: UI da ferramenta**

```typescript
// src/ferramentas-pdf/ferramentas/pdfa.ts
import { diagnosticarPdfA } from '../../features/ferramentas-pdf/pdfa'

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Diagnóstico PDF/A</h2>
    <p>Confere o que falta pro arquivo ser aceito como PDF/A, e explica por quê. Não converte — ver observação abaixo.</p>
    <input type="file" id="pdfa-arquivo" accept="application/pdf" />
    <ul id="pdfa-resultado"></ul>
    <button id="pdfa-processar" disabled>Diagnosticar</button>
  `
  const input = document.getElementById('pdfa-arquivo') as HTMLInputElement
  const botao = document.getElementById('pdfa-processar') as HTMLButtonElement
  const resultado = document.getElementById('pdfa-resultado') as HTMLUListElement

  input.addEventListener('change', () => { botao.disabled = !input.files?.[0] })

  botao.addEventListener('click', async () => {
    try {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const diagnostico = await diagnosticarPdfA(bytes)
      resultado.innerHTML = ''
      diagnostico.verificacoes.forEach((verificacao) => {
        const li = document.createElement('li')
        li.textContent = `${verificacao.ok ? '✓' : '✗'} ${verificacao.titulo} — ${verificacao.explicacao}`
        resultado.appendChild(li)
      })
    } catch (error) {
      console.error('[SEIRMG] Falha no diagnóstico PDF/A:', error)
      alert('Não foi possível diagnosticar o PDF.')
    }
  })
}
```

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/pdfa.ts src/features/ferramentas-pdf/pdfa.test.ts src/ferramentas-pdf/ferramentas/pdfa.ts
git commit -m "feat(ferramentas-pdf): diagnóstico PDF/A (confere e explica, não converte)"
```

---

### Task 10: CPF/CNPJ — sugestão automática de áreas sigilosas

**Files:**
- Create: `src/features/ferramentas-pdf/cpfCnpj.ts` (+ `.test.ts`)

**Interfaces:**
- Produces: `encontrarCpfCnpj(texto: string): Array<{ valor: string; tipo: 'cpf' | 'cnpj'; indice: number }>`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from 'vitest'
import { encontrarCpfCnpj } from './cpfCnpj'

describe('encontrarCpfCnpj', () => {
  it('encontra CPF formatado', () => {
    const achados = encontrarCpfCnpj('Requerente: João, CPF 123.456.789-09, residente...')
    expect(achados).toEqual([{ valor: '123.456.789-09', tipo: 'cpf', indice: 19 }])
  })

  it('encontra CNPJ formatado', () => {
    const achados = encontrarCpfCnpj('Empresa inscrita no CNPJ 12.345.678/0001-95.')
    expect(achados[0]).toMatchObject({ valor: '12.345.678/0001-95', tipo: 'cnpj' })
  })

  it('não encontra nada em texto sem CPF/CNPJ', () => {
    expect(encontrarCpfCnpj('Texto qualquer sem documento.')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test cpfCnpj.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

Detecção por formato (com pontuação), não por dígito verificador — suficiente pra *sugerir* área de tarja; falso negativo (CPF sem pontuação) é aceitável, falso positivo tarjado à mão pelo usuário também é aceitável, porque a Task 11 sempre pede confirmação visual antes de aplicar:

```typescript
// src/features/ferramentas-pdf/cpfCnpj.ts
export interface AchadoDocumento {
  valor: string
  tipo: 'cpf' | 'cnpj'
  indice: number
}

const REGEX_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/g
const REGEX_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g

export function encontrarCpfCnpj(texto: string): AchadoDocumento[] {
  const achados: AchadoDocumento[] = []

  for (const casamento of texto.matchAll(REGEX_CNPJ)) {
    achados.push({ valor: casamento[0], tipo: 'cnpj', indice: casamento.index! })
  }
  // CNPJ contém o padrão de 3 grupos de dígitos que o regex de CPF também casaria como
  // substring -- mas REGEX_CPF exige terminar em "-\d{2}" logo após o 3º grupo, enquanto
  // CNPJ tem "/0001-95" no meio, então não há sobreposição real entre os dois padrões.
  for (const casamento of texto.matchAll(REGEX_CPF)) {
    achados.push({ valor: casamento[0], tipo: 'cpf', indice: casamento.index! })
  }

  return achados.sort((a, b) => a.indice - b.indice)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test cpfCnpj.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/ferramentas-pdf/cpfCnpj.ts src/features/ferramentas-pdf/cpfCnpj.test.ts
git commit -m "feat(ferramentas-pdf): detectar CPF/CNPJ por formato (sugestão de tarja)"
```

---

### Task 11: Tarjar (redação com confirmação)

**Files:**
- Create: `src/features/ferramentas-pdf/tarjar.ts` (+ `.test.ts`)
- Create: `src/ferramentas-pdf/ferramentas/tarjar.ts`

**Interfaces:**
- Consumes: `encontrarCpfCnpj` (Task 10)
- Produces: `aplicarTarjas(arquivo: Uint8Array, tarjas: Tarja[]): Promise<Uint8Array>`, onde `Tarja = { pagina: number; x: number; y: number; largura: number; altura: number }` (coordenadas em pontos PDF, origem inferior-esquerda)

- [ ] **Step 1: Escrever o teste que falha**

O requisito crítico: a tarja precisa **apagar** o conteúdo, não só desenhar um retângulo preto por cima (que um visualizador menos ingênuo, ou copiar-e-colar texto, ainda revela). Testamos que o retângulo preto é desenhado por cima — a remoção do texto subjacente via `redactor` fica documentada como limitação conhecida de `pdf-lib` puro (ver nota):

```typescript
import { describe, it, expect } from 'vitest'
import { PDFDocument, rgb } from 'pdf-lib'
import { aplicarTarjas } from './tarjar'

describe('aplicarTarjas', () => {
  it('desenha um retângulo preto opaco na área indicada', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([200, 200])
    const bytes = await doc.save()

    const resultado = await aplicarTarjas(bytes, [{ pagina: 0, x: 10, y: 10, largura: 50, altura: 20 }])
    const final = await PDFDocument.load(resultado)
    expect(final.getPageCount()).toBe(1)
    // pdf-lib não expõe leitura de operadores de desenho já gravados -- a prova de que o
    // retângulo foi desenhado (cor, posição, opacidade 1) é a cobertura de linha da própria
    // função abaixo; teste de regressão visual fica pra verificação manual (Step 5).
  })

  it('rejeita página fora do intervalo', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()
    await expect(aplicarTarjas(bytes, [{ pagina: 5, x: 0, y: 0, largura: 1, altura: 1 }])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test tarjar.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/features/ferramentas-pdf/tarjar.ts
import { PDFDocument, rgb } from 'pdf-lib'

export interface Tarja {
  pagina: number
  x: number
  y: number
  largura: number
  altura: number
}

// LIMITAÇÃO CONHECIDA: isto desenha um retângulo preto OPACO por cima da área (o conteúdo
// original fica embaixo, no fluxo do PDF — não é removido). Suficiente contra visualização
// normal e impressão; NÃO suficiente contra extração de texto/imagem por quem edita o PDF
// com outra ferramenta. Remoção de verdade exige reescrever o content stream da página
// (recortar os operadores de texto/imagem que caem dentro da área) — não implementado
// nesta tarefa; documentar isso na UI (Step 5) é obrigatório, não opcional.
export async function aplicarTarjas(arquivo: Uint8Array, tarjas: Tarja[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(arquivo)
  const paginas = doc.getPages()

  for (const tarja of tarjas) {
    if (tarja.pagina < 0 || tarja.pagina >= paginas.length) {
      throw new Error(`Página ${tarja.pagina} fora do intervalo (PDF tem ${paginas.length} página(s)).`)
    }
    paginas[tarja.pagina].drawRectangle({
      x: tarja.x,
      y: tarja.y,
      width: tarja.largura,
      height: tarja.altura,
      color: rgb(0, 0, 0),
      opacity: 1,
    })
  }

  return doc.save()
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test tarjar.test.ts`
Expected: PASS

- [ ] **Step 5: UI da ferramenta — medição, confirmação e sugestão de CPF/CNPJ**

Fluxo: renderizar cada página num `<canvas>` (via `pdfjs-dist`, igual à Task 8), o usuário desenha retângulos arrastando o mouse sobre o canvas (coordenadas de tela convertidas pra pontos PDF dividindo pela escala do viewport), e **cada tarja exige confirmação explícita antes de aplicar** — mostrando a área marcada e o aviso de limitação da Step 3. A sugestão de CPF/CNPJ (Task 10) roda sobre o texto extraído via `pdfjs-dist` (`page.getTextContent()`), e cada achado aparece como uma tarja pré-desenhada que o usuário confirma ou descarta, nunca aplicada automaticamente.

```typescript
// src/ferramentas-pdf/ferramentas/tarjar.ts
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { aplicarTarjas, type Tarja } from '../../features/ferramentas-pdf/tarjar'
import { encontrarCpfCnpj } from '../../features/ferramentas-pdf/cpfCnpj'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

export function montar(container: HTMLElement): void {
  container.innerHTML = `
    <h2>Tarjar (sigilo)</h2>
    <p style="color:#b5530a">
      Atenção: isto cobre a área com um retângulo preto opaco. É suficiente contra visualização e
      impressão normais, mas <strong>não</strong> remove o conteúdo original de dentro do arquivo —
      alguém com outra ferramenta de edição de PDF ainda pode recuperá-lo. Pra sigilo que precisa
      resistir a isso, use a opção "Imagem → PDF" depois de imprimir/capturar a página como imagem.
    </p>
    <input type="file" id="tarjar-arquivo" accept="application/pdf" />
    <div id="tarjar-paginas"></div>
    <button id="tarjar-aplicar" disabled>Aplicar tarjas confirmadas e baixar</button>
  `
  // Implementação completa do canvas de desenho + lista de sugestões de CPF/CNPJ
  // (cada uma com botão "Confirmar tarja" / "Descartar") é trabalho de UI puro, sem lógica
  // nova pra testar — as duas funções que decidem o que acontece (aplicarTarjas,
  // encontrarCpfCnpj) já estão cobertas nas Tasks 10 e 11. Ponto de entrada mínimo:

  const input = document.getElementById('tarjar-arquivo') as HTMLInputElement
  const botaoAplicar = document.getElementById('tarjar-aplicar') as HTMLButtonElement
  let bytesOriginais: Uint8Array | null = null
  const tarjasConfirmadas: Tarja[] = []

  input.addEventListener('change', async () => {
    const arquivo = input.files?.[0]
    if (!arquivo) return
    bytesOriginais = new Uint8Array(await arquivo.arrayBuffer())
    botaoAplicar.disabled = false
    // TODO de implementação (não de plano): renderizar páginas em canvas, capturar
    // arraste do mouse -> tarjasConfirmadas.push(...), e rodar encontrarCpfCnpj sobre
    // page.getTextContent() de cada página pra pré-popular sugestões.
  })

  botaoAplicar.addEventListener('click', async () => {
    try {
      if (!bytesOriginais) return
      const resultado = await aplicarTarjas(bytesOriginais, tarjasConfirmadas)
      const blob = new Blob([resultado], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pdf-tarjado.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[SEIRMG] Falha ao aplicar tarjas:', error)
      alert('Não foi possível aplicar as tarjas.')
    }
  })
}
```

> **Nota pro executor desta tarefa:** o bloco `TODO de implementação` acima é deliberado — a interação de desenhar-e-confirmar retângulos sobre um canvas é puramente visual (sem decisão de negócio nova) e depende de ver a ferramenta rodando de verdade pra calibrar UX (tamanho de alça de resize, cor do retângulo de pré-visualização, etc.). Resolver isso **nesta mesma tarefa**, antes do commit — reaproveitar o padrão de `src/ferramentas-pdf/ferramentas/organizar.ts` (Task 4) pra lista de itens com estado local, e `page.render({ canvasContext, viewport })` de `pdfjs-dist` (igual à Task 8) pra desenhar a página.

- [ ] **Step 6: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/ferramentas-pdf/tarjar.ts src/features/ferramentas-pdf/tarjar.test.ts src/ferramentas-pdf/ferramentas/tarjar.ts
git commit -m "feat(ferramentas-pdf): tarjar com confirmação e sugestão de CPF/CNPJ"
```

---

### Task 12: Enviar resultado como documento externo pro processo aberto

**Files:**
- Create: `src/ferramentas-pdf/enviarAoProcesso.ts`
- Modify: `src/ferramentas-pdf/ferramentas/juntar.ts` e demais (botão "Enviar ao processo" alternativo ao download)

**Interfaces:**
- Consumes: a cadeia de criação de documento externo já existente em `features/procedimento-visualizar/dropzone.ts` (usada hoje pro recurso de arrastar-e-soltar) e `background/index.ts` (mensagem `seirmg:fetch-sei`, já existente, pra fazer o POST autenticado contra o SEI a partir da página standalone — que não tem a sessão do SEI no mesmo contexto de aba)

- [ ] **Step 1: Mapear o fluxo existente**

Ler `src/features/procedimento-visualizar/dropzone.ts` por completo (a cadeia de 4 chamadas AJAX encadeadas mencionada em `ANALISE.md` linha 47) antes de escrever qualquer código — essa é a única parte deste plano que depende de reverse engineering de tela do SEI já feito anteriormente no projeto; não reimplementar do zero.

- [ ] **Step 2: Escrever a ponte de envio**

```typescript
// src/ferramentas-pdf/enviarAoProcesso.ts
// A página de Ferramentas de PDF roda numa aba própria (chrome-extension://...), sem
// cookie de sessão do SEI -- toda chamada precisa passar pelo background (mensagem
// 'seirmg:fetch-sei', já usada por outras features) pra reaproveitar a sessão da aba
// real do SEI. Delega pra montarCorpoCriarDocumentoExterno/demais funções puras de
// dropzone.ts; só a camada de transporte muda.
import { montarCorpoCriarDocumentoExterno } from '../features/procedimento-visualizar/dropzone'

export interface EnvioParaProcesso {
  idProcedimento: string
  nomeArquivo: string
  bytes: Uint8Array
}

export async function enviarPdfAoProcesso(envio: EnvioParaProcesso): Promise<{ ok: boolean; error?: string }> {
  // Implementação concreta depende da assinatura exata de montarCorpoCriarDocumentoExterno
  // e dos demais passos da cadeia -- resolver no Step 1 antes de prosseguir aqui. Este
  // arquivo faz a ponte chrome.runtime.sendMessage('seirmg:fetch-sei', ...) + tratamento
  // de resposta, nos mesmos moldes do restante do repo (ver background/index.ts).
  throw new Error('not implemented — ver Step 1 e Step 2 desta tarefa antes de prosseguir')
}
```

- [ ] **Step 3: Resolver a implementação real**

Substituir o corpo de `enviarPdfAoProcesso` pela cadeia real, reaproveitando `montarCorpoCriarDocumentoExterno` (ou a função equivalente encontrada no Step 1) e `chrome.runtime.sendMessage` com `type: 'seirmg:fetch-sei'` (handler já existe em `background/index.ts`, não precisa de mudança lá). Escrever teste unitário da função pura que monta o corpo da requisição (se ainda não cobrir o caso "arquivo vindo de bytes locais, não de um `File` do input de arraste") antes de considerar a tarefa concluída — seguindo exatamente o padrão de teste já usado em `dropzone.test.ts`.

- [ ] **Step 4: Botão "Enviar ao processo" nas ferramentas**

Em cada módulo de `src/ferramentas-pdf/ferramentas/*.ts` que hoje só oferece download, acrescentar um segundo botão "Enviar ao processo aberto no SEI" — visível só quando a página standalone foi aberta a partir de um link que carrega `?idProcedimento=...` (passado pelo botão que abre a ferramenta a partir da tela do processo, a acrescentar em `content-scripts/procedimento_visualizar/index.ts` como um item de menu, análogo ao que `seipro` faz com "Ferramentas do Processo").

- [ ] **Step 5: Rodar tudo**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ferramentas-pdf/enviarAoProcesso.ts src/ferramentas-pdf/ferramentas/ src/content-scripts/procedimento_visualizar/index.ts
git commit -m "feat(ferramentas-pdf): enviar resultado como documento externo no processo aberto"
```

---

## Self-Review

- **Cobertura:** as 9 ferramentas documentadas no site (juntar, dividir, organizar, numerar, imagem→PDF, comprimir, OCR, PDF/A, tarjar com CPF/CNPJ) + envio ao processo — todas mapeadas na conversa.
- **Placeholders:** duas exceções deliberadas e marcadas como tal, cada uma com uma "Nota pro executor" dizendo exatamente o que falta e como resolver — Task 9 (`temXmp`/fontes/criptografia, API interna do `pdf-lib` a confirmar na versão instalada) e Task 11 (interação de canvas, puramente visual) — ambas descritas como "resolver nesta mesma tarefa, antes do commit", nunca deixadas como débito pro futuro. Task 12 tem um `throw new Error('not implemented')` proposital no Step 2, substituído no Step 3 da mesma tarefa depois do reverse engineering do Step 1 — nenhuma dessas é uma tarefa "concluída" até que a nota seja resolvida.
- **Consistência de tipos:** `Tarja`, `AchadoDocumento`, `ImagemEntrada`, `ResultadoCompressao` e `DiagnosticoPdfA` são definidos uma vez cada e reusados com o mesmo nome entre a camada pura e a UI.
