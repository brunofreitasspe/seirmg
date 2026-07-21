# SEIRMG — Redesenho visual da tela de arraste de documento externo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o overlay cru de "arraste para incluir documento externo" (retângulo cinza tracejado, sem ícone, sem estado de sucesso/erro) por um cartão "glass" com 4 estados visuais (arraste/enviando/sucesso/erro), incluindo retry funcional no erro.

**Architecture:** Três frentes independentes que se encaixam: (1) helpers puros de texto em `dropzone.ts` (testáveis via vitest), (2) CSS novo em `theme.css` (visual dos 4 estados via `[data-state]`), (3) reescrita da máquina de estados em `documento_externo_arraste/index.ts` (wiring de DOM/eventos, sem teste automatizado — mesmo padrão já usado nesse arquivo hoje).

**Tech Stack:** TypeScript, Vite (`?raw` imports), Vitest, `lucide-static` (ícones SVG já usado no projeto em `latex.ts`).

## Global Constraints

- Reaproveitar cores já existentes no tema: verde `#17875a` (já usado em `.seirmg-badge-nivel-publico`), vermelho `#b3261e` (já usado em `.seirmg-btn-acao-perigo`), azul `var(--seirmg-accent-color)`.
- Reaproveitar classes de botão já existentes: `.seirmg-btn-acao` / `.seirmg-btn-acao-primario`.
- Ícones vêm de `lucide-static` (`upload`, `loader-circle`, `check`, `x`), nunca SVG desenhado à mão.
- Sem progresso real de upload (sem `%` fake) — estado "enviando" usa spinner indeterminado.
- Sem suporte a tema escuro (nem o resto do `theme.css`, nem o SEI, têm modo escuro hoje).
- DOM construído via `document.createElement`/`.append()` (convenção já usada em `dialogoFlutuante.ts`), não via `innerHTML` de template string.
- Animações novas (`seirmg-dropzone-pulso`, `seirmg-dropzone-girar`) desligadas em `prefers-reduced-motion: reduce`.

Spec completa: `docs/superpowers/specs/2026-07-21-seirmg-dropzone-arraste-redesign-design.md`

---

### Task 1: Helpers de texto (`formatarMensagemEnviando`, `formatarMensagemSucesso`, `formatarListaFalhas`)

**Files:**
- Modify: `src/features/procedimento-visualizar/dropzone.ts` (adicionar ao final do arquivo, depois da linha 173)
- Test: `src/features/procedimento-visualizar/dropzone.test.ts` (adicionar `describe` blocks novos ao final)

**Interfaces:**
- Produces: `formatarMensagemEnviando(nomesArquivos: string[]): string`, `formatarMensagemSucesso(quantidade: number): string`, `formatarListaFalhas(nomesArquivos: string[]): string` — usados pela Task 3 (`documento_externo_arraste/index.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/procedimento-visualizar/dropzone.test.ts`:

```ts
describe('formatarMensagemEnviando', () => {
  it('menciona o nome do arquivo quando há só um', () => {
    expect(formatarMensagemEnviando(['relatorio.pdf'])).toBe('Enviando relatorio.pdf')
  })

  it('menciona a quantidade quando há mais de um arquivo', () => {
    expect(formatarMensagemEnviando(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('Enviando 3 arquivos')
  })
})

describe('formatarMensagemSucesso', () => {
  it('usa singular para 1 documento', () => {
    expect(formatarMensagemSucesso(1)).toBe('Documento incluído com sucesso')
  })

  it('usa plural com a quantidade para mais de 1 documento', () => {
    expect(formatarMensagemSucesso(3)).toBe('3 documentos incluídos com sucesso')
  })
})

describe('formatarListaFalhas', () => {
  it('junta os nomes com vírgula', () => {
    expect(formatarListaFalhas(['a.pdf', 'b.pdf'])).toBe('a.pdf, b.pdf')
  })

  it('retorna string vazia para lista vazia', () => {
    expect(formatarListaFalhas([])).toBe('')
  })
})
```

E adicionar os três novos nomes ao import existente no topo do arquivo (linha 3-15):

```ts
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
  formatarMensagemEnviando,
  formatarMensagemSucesso,
  formatarListaFalhas,
} from './dropzone'
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test`
Expected: FAIL — `formatarMensagemEnviando`/`formatarMensagemSucesso`/`formatarListaFalhas` não exportados por `./dropzone`.

- [ ] **Step 3: Implementar as funções**

Adicionar ao final de `src/features/procedimento-visualizar/dropzone.ts` (depois da linha 173):

```ts

export function formatarMensagemEnviando(nomesArquivos: string[]): string {
  if (nomesArquivos.length === 1) return `Enviando ${nomesArquivos[0]}`
  return `Enviando ${nomesArquivos.length} arquivos`
}

export function formatarMensagemSucesso(quantidade: number): string {
  if (quantidade === 1) return 'Documento incluído com sucesso'
  return `${quantidade} documentos incluídos com sucesso`
}

export function formatarListaFalhas(nomesArquivos: string[]): string {
  return nomesArquivos.join(', ')
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test`
Expected: PASS (todos os testes do arquivo, incluindo os novos).

- [ ] **Step 5: Commit**

```bash
git add src/features/procedimento-visualizar/dropzone.ts src/features/procedimento-visualizar/dropzone.test.ts
git commit -m "feat: helpers de texto pro redesenho da tela de arraste de documento externo"
```

---

### Task 2: CSS do overlay (4 estados, cartão glass)

**Files:**
- Modify: `src/content-scripts/core/theme.css:697-709` (bloco `#seirmg-dropzone-overlay` atual)

**Interfaces:**
- Consumes: nenhum.
- Produces: seletores CSS consumidos pela Task 3 — `#seirmg-dropzone-overlay` (com `dataset.state` em `'arraste'|'enviando'|'sucesso'|'erro'`), `.seirmg-dropzone-card`, `.seirmg-dropzone-badge`, `.seirmg-dropzone-titulo`, `.seirmg-dropzone-sub`, `.seirmg-dropzone-falhas`, `.seirmg-dropzone-acoes`.

- [ ] **Step 1: Substituir o bloco `#seirmg-dropzone-overlay`**

Em `src/content-scripts/core/theme.css`, substituir exatamente este bloco (linhas 697-709):

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

por:

```css
#seirmg-dropzone-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  align-items: center;
  justify-content: center;
  background: rgba(10, 16, 28, 0.32);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

#seirmg-dropzone-overlay .seirmg-dropzone-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  max-width: 320px;
  padding: 28px 34px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 20px 40px -16px rgba(20, 30, 50, 0.35);
}

#seirmg-dropzone-overlay[data-state='arraste'] .seirmg-dropzone-card {
  animation: seirmg-dropzone-pulso 1.8s ease-in-out infinite;
}

#seirmg-dropzone-overlay .seirmg-dropzone-badge {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(145deg, var(--seirmg-accent-color), #6fb8ff);
  box-shadow: 0 0 0 6px rgba(1, 127, 255, 0.16);
  margin-bottom: 6px;
}

#seirmg-dropzone-overlay .seirmg-dropzone-badge svg {
  width: 22px;
  height: 22px;
}

#seirmg-dropzone-overlay[data-state='enviando'] .seirmg-dropzone-badge svg {
  animation: seirmg-dropzone-girar 0.9s linear infinite;
}

#seirmg-dropzone-overlay[data-state='sucesso'] .seirmg-dropzone-badge {
  background: linear-gradient(145deg, #17875a, #6fce9e);
  box-shadow: 0 0 0 6px rgba(23, 135, 90, 0.16);
}

#seirmg-dropzone-overlay[data-state='erro'] .seirmg-dropzone-badge {
  background: linear-gradient(145deg, #b3261e, #e07f78);
  box-shadow: 0 0 0 6px rgba(179, 38, 30, 0.16);
}

#seirmg-dropzone-overlay .seirmg-dropzone-titulo {
  font-size: 14px;
  font-weight: 700;
  color: #1a2130;
}

#seirmg-dropzone-overlay .seirmg-dropzone-sub {
  font-size: 12px;
  color: #5c6577;
  max-width: 240px;
}

#seirmg-dropzone-overlay .seirmg-dropzone-falhas {
  font-size: 11px;
  color: #b3261e;
  max-width: 260px;
  word-break: break-word;
}

#seirmg-dropzone-overlay .seirmg-dropzone-acoes {
  display: none;
  gap: 8px;
  margin-top: 12px;
  pointer-events: auto;
}

#seirmg-dropzone-overlay[data-state='erro'] .seirmg-dropzone-acoes {
  display: flex;
}

@keyframes seirmg-dropzone-pulso {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

@keyframes seirmg-dropzone-girar {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  #seirmg-dropzone-overlay .seirmg-dropzone-card,
  #seirmg-dropzone-overlay .seirmg-dropzone-badge svg {
    animation: none;
  }
}
```

- [ ] **Step 2: Verificar que o build processa o CSS sem erro**

Run: `bun run build`
Expected: build termina sem erro (CSS não tem teste automatizado — este comando é a única validação sintática disponível antes da checagem visual manual da Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/content-scripts/core/theme.css
git commit -m "feat: CSS do cartão glass com 4 estados pra tela de arraste de documento externo"
```

---

### Task 3: Máquina de estados do overlay (`documento_externo_arraste/index.ts`)

**Files:**
- Modify: `src/content-scripts/documento_externo_arraste/index.ts` (reescrita completa)

**Interfaces:**
- Consumes: `formatarMensagemEnviando`, `formatarMensagemSucesso`, `formatarListaFalhas` (Task 1, `../../features/procedimento-visualizar/dropzone`); classes CSS `.seirmg-dropzone-card`/`.seirmg-dropzone-badge`/`.seirmg-dropzone-titulo`/`.seirmg-dropzone-sub`/`.seirmg-dropzone-falhas`/`.seirmg-dropzone-acoes`/`.seirmg-btn-acao`/`.seirmg-btn-acao-primario` (Task 2 + já existentes em `theme.css`); ícones `lucide-static/icons/{upload,loader-circle,check,x}.svg?raw`.
- Produces: nenhuma outra parte do código importa deste arquivo (content script raiz, auto-executa `montarDropzone()`).

- [ ] **Step 1: Substituir o conteúdo do arquivo**

Conteúdo completo novo de `src/content-scripts/documento_externo_arraste/index.ts`:

```ts
import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import loaderIconSvg from 'lucide-static/icons/loader-circle.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
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
  formatarMensagemEnviando,
  formatarMensagemSucesso,
  formatarListaFalhas,
} from '../../features/procedimento-visualizar/dropzone'
import { fetchText } from '../../lib/fetchViaBackground'
import { createSyncConfigStore } from '../../lib/storage'

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
    bodyRaw: corpo,
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

type EstadoDropzone = 'arraste' | 'enviando' | 'sucesso' | 'erro'

const ICONES_POR_ESTADO: Record<EstadoDropzone, string> = {
  arraste: uploadIconSvg,
  enviando: loaderIconSvg,
  sucesso: checkIconSvg,
  erro: xIconSvg,
}

interface OverlayDropzone {
  raiz: HTMLDivElement
  badge: HTMLDivElement
  titulo: HTMLDivElement
  sub: HTMLDivElement
  falhas: HTMLDivElement
  botaoFechar: HTMLButtonElement
  botaoTentarNovamente: HTMLButtonElement
}

function criarOverlayArraste(): OverlayDropzone {
  const raiz = document.createElement('div')
  raiz.id = 'seirmg-dropzone-overlay'

  const card = document.createElement('div')
  card.className = 'seirmg-dropzone-card'

  const badge = document.createElement('div')
  badge.className = 'seirmg-dropzone-badge'

  const titulo = document.createElement('div')
  titulo.className = 'seirmg-dropzone-titulo'

  const sub = document.createElement('div')
  sub.className = 'seirmg-dropzone-sub'

  const falhas = document.createElement('div')
  falhas.className = 'seirmg-dropzone-falhas'

  const acoes = document.createElement('div')
  acoes.className = 'seirmg-dropzone-acoes'

  const botaoFechar = document.createElement('button')
  botaoFechar.type = 'button'
  botaoFechar.className = 'seirmg-btn-acao'
  botaoFechar.textContent = 'Fechar'

  const botaoTentarNovamente = document.createElement('button')
  botaoTentarNovamente.type = 'button'
  botaoTentarNovamente.className = 'seirmg-btn-acao seirmg-btn-acao-primario'
  botaoTentarNovamente.textContent = 'Tentar novamente'

  acoes.append(botaoFechar, botaoTentarNovamente)
  card.append(badge, titulo, sub, falhas, acoes)
  raiz.append(card)
  document.body.appendChild(raiz)

  return { raiz, badge, titulo, sub, falhas, botaoFechar, botaoTentarNovamente }
}

function definirEstado(
  overlay: OverlayDropzone,
  estado: EstadoDropzone,
  opcoes: { titulo: string; sub?: string; falhas?: string }
): void {
  overlay.raiz.dataset.state = estado
  overlay.raiz.style.display = 'flex'
  overlay.badge.innerHTML = ICONES_POR_ESTADO[estado]
  overlay.titulo.textContent = opcoes.titulo
  overlay.sub.textContent = opcoes.sub ?? ''
  overlay.falhas.textContent = opcoes.falhas ?? ''
}

function esconderOverlay(overlay: OverlayDropzone): void {
  overlay.raiz.style.display = 'none'
}

function contemArquivos(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && !!dataTransfer.types && dataTransfer.types.includes('Files')
}

function montarDropzone(): void {
  try {
    const overlay = criarOverlayArraste()
    let enviando = false
    let arquivosPendentes: File[] = []

    function processarArquivos(arquivos: File[]): void {
      enviando = true
      definirEstado(overlay, 'enviando', {
        titulo: formatarMensagemEnviando(arquivos.map((arquivo) => arquivo.name)),
      })

      Promise.allSettled(arquivos.map((arquivo) => criarDocumentoExternoPorArraste(arquivo)))
        .then((resultados) => {
          const falhas = arquivos.filter((_, indice) => resultados[indice]?.status === 'rejected')
          const sucessos = arquivos.length - falhas.length

          if (falhas.length === 0) {
            arquivosPendentes = []
            definirEstado(overlay, 'sucesso', { titulo: formatarMensagemSucesso(sucessos) })
            setTimeout(() => location.reload(), 900)
            return
          }

          arquivosPendentes = falhas
          enviando = false
          definirEstado(overlay, 'erro', {
            titulo: 'Não foi possível incluir o documento',
            sub: 'Verifique se o processo está aberto na sua unidade',
            falhas: formatarListaFalhas(falhas.map((arquivo) => arquivo.name)),
          })
        })
        .catch((error) => {
          enviando = false
          console.error('[SEIRMG] Falha ao finalizar criação de documentos por arraste:', error)
        })
    }

    window.addEventListener('dragover', (evento) => {
      evento.preventDefault()
    })

    window.addEventListener('dragenter', (evento) => {
      evento.preventDefault()
      if (enviando || !contemArquivos(evento.dataTransfer)) return
      definirEstado(overlay, 'arraste', {
        titulo: 'Solte para incluir como documento externo',
        sub: 'O arquivo será anexado ao processo aberto nesta unidade',
      })
    })

    window.addEventListener('dragleave', (evento) => {
      evento.preventDefault()
      if (enviando) return
      if (evento.relatedTarget === null) esconderOverlay(overlay)
    })

    window.addEventListener('drop', (evento) => {
      evento.preventDefault()
      if (enviando || !contemArquivos(evento.dataTransfer)) {
        esconderOverlay(overlay)
        return
      }
      const arquivos = Array.from(evento.dataTransfer?.files ?? [])
      if (arquivos.length === 0) {
        esconderOverlay(overlay)
        return
      }
      processarArquivos(arquivos)
    })

    overlay.botaoFechar.addEventListener('click', () => {
      esconderOverlay(overlay)
      location.reload()
    })

    overlay.botaoTentarNovamente.addEventListener('click', () => {
      if (arquivosPendentes.length > 0) processarArquivos(arquivosPendentes)
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar dropzone:', error)
  }
}

montarDropzone()
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 3: Rodar a suíte de testes completa (garante que nada quebrou)**

Run: `bun run test`
Expected: PASS (inclui os testes da Task 1).

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/content-scripts/documento_externo_arraste/index.ts
git commit -m "feat: reescreve a máquina de estados da tela de arraste (arraste/enviando/sucesso/erro + retry)"
```

- [ ] **Step 6: Validação manual numa instância SEI real**

Carregar a extensão atualizada (`bun run build` + recarregar em `chrome://extensions`) numa página de processo real e verificar:
1. Arrastar 1 arquivo sobre a página → cartão glass aparece com ícone de upload e pulso sutil.
2. Soltar o arquivo → estado "enviando" (spinner girando) → estado "sucesso" (~900ms) → página recarrega e o documento aparece na árvore.
3. Arrastar 2+ arquivos de uma vez → mensagem "Enviando N arquivos", sucesso mostra "N documentos incluídos com sucesso".
4. Forçar um erro (ex.: fechar o processo na unidade antes de soltar o arquivo) → estado "erro" aparece com a lista de arquivo(s) que falhou(aram), sem `alert()` do navegador, sem recarregar sozinho.
5. Clicar "Tentar novamente" no estado de erro → reenvia só os arquivos que falharam.
6. Clicar "Fechar" no estado de erro → overlay some e a página recarrega.

---

## Self-Review

**Cobertura da spec:** visual do cartão glass (Task 2), 4 estados com ícones Lucide (Tasks 2+3), estado "enviando" sem % fake (Task 3, spinner indeterminado), estado "sucesso" com flash de ~900ms (Task 3), estado "erro" com lista de falhas + retry funcional + "Fechar" que só aí recarrega (Task 3), cores reaproveitadas do tema (Task 2), `prefers-reduced-motion` (Task 2), helpers testáveis (Task 1) — toda a spec de 2026-07-21 está coberta.

**Placeholders:** nenhum "TBD"/"implementar depois" — todos os steps têm código completo.

**Consistência de tipos:** `OverlayDropzone` (Task 3) usado de forma consistente entre `criarOverlayArraste`, `definirEstado` e `esconderOverlay`; `EstadoDropzone` usado tanto no `Record` de ícones quanto nas chamadas de `definirEstado`; nomes dos helpers da Task 1 (`formatarMensagemEnviando`/`formatarMensagemSucesso`/`formatarListaFalhas`) idênticos entre export (Task 1) e import (Task 3).
