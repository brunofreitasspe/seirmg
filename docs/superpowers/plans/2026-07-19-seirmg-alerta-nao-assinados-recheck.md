# Reconsultar árvore antes do alerta de não assinados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o alerta de "documentos não assinados" (SEIRMG, Lote Q) pra parar de avisar sobre documentos que o usuário já assinou na mesma sessão de página, sem precisar recarregar.

**Architecture:** A causa raiz é que `content-scripts/procedimento_enviar/index.ts` lê a árvore do processo (`extrairDocumentosPendentes`) uma única vez no carregamento da página e guarda o resultado numa variável capturada por closure. A correção move essa chamada pra dentro do callback que dispara o diálogo, reconsultando a árvore (uma referência viva ao DOM do iframe, não uma cópia) no momento exato em que o aviso apareceria — nenhuma função pura muda de assinatura, só o wiring.

**Tech Stack:** TypeScript, Vite, Vitest, Bun.

## Global Constraints

- Nenhuma mudança nas funções puras `extrairDocumentosPendentes` (`src/features/procedimento-enviar/detectarPendencias.ts`) ou `unidadeDestinoSelecionada` (`src/features/procedimento-enviar/detectarSelecaoUnidade.ts`) — assinatura e comportamento continuam exatamente como estão.
- Qualquer falha (leitura de DOM, storage) deve continuar em `try/catch` com `console.error('[SEIRMG] ...', error)`, sem travar o fluxo nativo de envio — mesma política já existente no arquivo.
- Nenhum teste automatizado novo — a mudança fica inteira em `content-scripts/`, que não tem cobertura automatizada neste projeto (mesmo padrão já estabelecido). Verificação via `tsc --noEmit`/`bun run test`/`bun run build` e validação manual.

---

### Task 1: Reconsultar a árvore no momento de mostrar o alerta

**Files:**
- Modify: `src/content-scripts/procedimento_enviar/index.ts` (arquivo inteiro tem 76 linhas — mudança concentrada nas funções `observarSelecaoUnidade` e `bootstrap`)

**Interfaces:**
- Consumes: `extrairDocumentosPendentes(doc: Document, unidadeAtual: string): DocumentoPendente[]` (já existe, `src/features/procedimento-enviar/detectarPendencias.ts`), `unidadeDestinoSelecionada(doc: Document): boolean` (já existe, `src/features/procedimento-enviar/detectarSelecaoUnidade.ts`), `montarDialogoAviso` (já existe, `src/features/procedimento-enviar/montarDialogo.ts`).
- Produces: nenhuma interface nova exposta a outros arquivos — `observarSelecaoUnidade` e `bootstrap` continuam privadas a este content script.

- [ ] **Step 1: Ler o arquivo atual pra confirmar que o conteúdo bate com o esperado**

O arquivo `src/content-scripts/procedimento_enviar/index.ts` deve ter exatamente este conteúdo antes da mudança (76 linhas):

```ts
import { extrairDocumentosPendentes, type DocumentoPendente } from '../../features/procedimento-enviar/detectarPendencias'
import { unidadeDestinoSelecionada } from '../../features/procedimento-enviar/detectarSelecaoUnidade'
import { montarDialogoAviso } from '../../features/procedimento-enviar/montarDialogo'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

function obterArvoreDocumento(): Document | null {
  const ifrArvore = window.parent.document.querySelector<HTMLIFrameElement>('#ifrArvore')
  return ifrArvore?.contentDocument ?? null
}

function mostrarAviso(pendencias: DocumentoPendente[], unidadeAtual: string): void {
  const dialog = montarDialogoAviso(pendencias, unidadeAtual)
  document.body.appendChild(dialog)

  const fechar = (): void => {
    dialog.close()
    dialog.remove()
  }

  dialog.querySelector('.seirmg-alerta-nao-assinados-confirmar')?.addEventListener('click', fechar)
  dialog.addEventListener('cancel', fechar)

  dialog.showModal()
}

// A tela de "Enviar Processo" não navega pra uma URL própria — o SEI injeta o
// formulário (campo de unidade + #selUnidades) dentro do mesmo documento via AJAX
// e só atualiza window.location.href via History API. Por isso não dá pra confiar
// em interceptar o clique de um botão de confirmação (o momento em que o form
// aparece não corresponde a nenhum evento de carregamento de página); em vez
// disso, observamos o DOM esperando #selUnidades ganhar opções, o que indica que
// o usuário escolheu a unidade de destino.
function observarSelecaoUnidade(pendencias: DocumentoPendente[], unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true
    mostrarAviso(pendencias, unidadeAtual)
  }

  verificar()
  if (avisoMostrado) return

  const observer = new MutationObserver(() => {
    verificar()
    if (avisoMostrado) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

async function bootstrap(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.controleProcessos.alertaNaoAssinados.ativo) return

    const arvore = obterArvoreDocumento()
    if (!arvore) return

    const localConfig = await createLocalConfigStore().get()
    const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
    if (!unidadeAtual) return

    const pendencias = extrairDocumentosPendentes(arvore, unidadeAtual)
    if (pendencias.length === 0) return

    observarSelecaoUnidade(pendencias, unidadeAtual)
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

bootstrap()
```

Se o conteúdo real divergir desse texto (por exemplo, se outra mudança tiver mexido nesse arquivo depois da escrita deste plano), pare e reporte a diferença em vez de aplicar a edição às cegas.

- [ ] **Step 2: Trocar `observarSelecaoUnidade` pra receber a árvore (não a lista de pendências) e reconsultar no momento certo**

Substituir:

```ts
function observarSelecaoUnidade(pendencias: DocumentoPendente[], unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true
    mostrarAviso(pendencias, unidadeAtual)
  }

  verificar()
  if (avisoMostrado) return

  const observer = new MutationObserver(() => {
    verificar()
    if (avisoMostrado) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
```

por:

```ts
// Recebe a árvore (referência viva ao contentDocument do #ifrArvore, não uma cópia) em vez de
// uma lista de pendências já calculada -- o usuário pode assinar um documento pendente entre o
// carregamento da página e o momento em que escolhe a unidade de destino (quando o aviso
// apareceria). Reconsultar aqui, e não usar um valor computado antes, é o que faz a extensão
// enxergar assinaturas feitas nesse meio tempo sem precisar recarregar a página (causa raiz
// confirmada do aviso falso: um F5 do usuário corrigia o aviso porque recarregava a página
// inteira, que por sua vez reconsultava a árvore do zero).
function observarSelecaoUnidade(arvore: Document, unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true

    const pendenciasAtuais = extrairDocumentosPendentes(arvore, unidadeAtual)
    if (pendenciasAtuais.length === 0) return

    mostrarAviso(pendenciasAtuais, unidadeAtual)
  }

  verificar()
  if (avisoMostrado) return

  const observer = new MutationObserver(() => {
    verificar()
    if (avisoMostrado) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
```

- [ ] **Step 3: Atualizar `bootstrap` pra passar a árvore em vez da lista de pendências**

Substituir:

```ts
    const pendencias = extrairDocumentosPendentes(arvore, unidadeAtual)
    if (pendencias.length === 0) return

    observarSelecaoUnidade(pendencias, unidadeAtual)
```

por:

```ts
    // Só decide SE instala o observer -- assinar um documento move ele de "pendente" pra
    // "assinado", nunca o contrário, dentro da mesma sessão de carregamento; se já começou em
    // zero pendências, garantidamente continua em zero, não precisa observar nada. A lista em si
    // é recalculada de novo dentro de observarSelecaoUnidade, no momento em que o aviso apareceria.
    const pendenciasIniciais = extrairDocumentosPendentes(arvore, unidadeAtual)
    if (pendenciasIniciais.length === 0) return

    observarSelecaoUnidade(arvore, unidadeAtual)
```

- [ ] **Step 4: Rodar o typecheck**

Run: `bunx tsc --noEmit` (a partir de `C:\sei\seirmg`)
Expected: sem erros. Isso confirma que `DocumentoPendente` (agora só usado como tipo do retorno de `extrairDocumentosPendentes`/parâmetro de `mostrarAviso`, não mais como parâmetro de `observarSelecaoUnidade`) continua importado corretamente e que não sobrou nenhuma referência a uma assinatura antiga.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS, sem regressão (esse arquivo não tem teste próprio; a suíte confirma que nada mais no projeto quebrou).

- [ ] **Step 6: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_enviar/index.ts
git commit -m "fix: reconsulta a árvore antes de mostrar alerta de documentos não assinados"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real: abrir um processo com pelo menos um documento interno pendente de
assinatura na unidade atual; assinar esse documento; sem recarregar a página, ir direto em "Enviar
Processo"; escolher a unidade de destino; confirmar que o aviso de documentos não assinados **não
aparece mais** (antes da correção, apareceria mesmo com o documento já assinado). Também confirmar o
caminho que ainda deve continuar funcionando: processo com documento pendente que **não** foi
assinado antes de enviar — o aviso deve continuar aparecendo normalmente.
