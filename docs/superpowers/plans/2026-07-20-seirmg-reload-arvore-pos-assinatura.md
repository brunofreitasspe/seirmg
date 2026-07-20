# Reload da árvore logo após assinar (não ao escolher unidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o reload forçado da árvore (necessário pro ícone de "assinado" aparecer) do momento de escolher a unidade de destino (ruim — interrompe o usuário no meio do fluxo de envio) para logo depois que a janela do editor fecha após assinar (bom — acontece antes do usuário sequer chegar na tela de enviar).

**Architecture:** Novo content script isolado, rodando só na janela do editor (`acao=editor_montar`), que na hora de fechar (`pagehide`) alcança a árvore via `window.opener.parent.document.querySelector('#ifrArvore')` — o mesmo caminho que o próprio SEI usa nativamente na sua função `atualizarArvore()` (confirmado lendo o HTML real da página) — e força um `.reload()` de verdade (a atualização nativa do SEI é só manipulação de objetos JS já carregados, não busca HTML novo, por isso o ícone de assinado nunca aparecia só com ela). O alerta de documentos não assinados (`procedimento_enviar/index.ts`) para de forçar reload no momento de escolher a unidade — volta a só reler o `contentDocument` atual do iframe (não uma referência antiga capturada), o que já reflete o reload novo sem precisar disparar outro ali.

**Tech Stack:** TypeScript, Vite.

## Global Constraints

- Nenhuma mudança em `features/procedimento-enviar/detectarPendencias.ts` nem `detectarSelecaoUnidade.ts`.
- O novo content script roda **sem** `all_frames` (deliberado) — `editor_montar` tem vários iframes internos (um por campo do documento), e `window.opener` só existe no frame de topo da própria janela do editor, não nos iframes internos dela.
- Qualquer falha (acesso a `window.opener`, DOM) segue a política já estabelecida: `try/catch` com `console.error('[SEIRMG] ...', error)`, nunca lança erro visível pro usuário.

---

### Task 1: Novo content script — reload da árvore ao fechar o editor

**Files:**
- Create: `src/content-scripts/editor_montar/index.ts`
- Modify: `manifest.config.ts`

**Interfaces:**
- Consumes: nenhuma interface de outro arquivo do projeto.
- Produces: nenhuma interface exposta a outros arquivos.

- [ ] **Step 1: Criar o content script**

Criar `src/content-scripts/editor_montar/index.ts`:

```ts
// Depois de assinar um documento, a janela do editor (editor_montar) fecha e volta pra tela
// principal do SEI. O próprio SEI já roda, nesse momento, uma atualização "leve" da árvore --
// função nativa `atualizarArvore()`, visível no HTML real da página, que acessa
// `window.opener.parent.document.getElementById('ifrArvore')` -- mas essa atualização só manipula
// objetos JS já carregados (`objArvore`), não busca HTML novo do servidor. Por isso o ícone de
// "assinado" (`anchorA{id}`, lido por content-scripts/procedimento_enviar/index.ts) nunca aparece
// só com ela -- só um reload de verdade busca o HTML atualizado. Este script reusa o mesmo caminho
// nativo (`window.opener`), mas força esse reload de verdade ao fechar a janela do editor.
//
// Roda só no frame de topo da janela do editor (sem all_frames, de propósito) -- editor_montar tem
// vários iframes internos (um por campo do documento: Cabeçalho/Título/Corpo do Texto/etc., ver
// content-scripts/documento_editar/), e `window.opener` só existe no frame de topo da própria
// janela, não nesses iframes internos dela.
function obterIframeArvoreViaOpener(): HTMLIFrameElement | null {
  try {
    return window.opener?.parent?.document?.querySelector<HTMLIFrameElement>('#ifrArvore') ?? null
  } catch (error) {
    console.error('[SEIRMG] Falha ao acessar a árvore via window.opener:', error)
    return null
  }
}

window.addEventListener('pagehide', () => {
  try {
    obterIframeArvoreViaOpener()?.contentWindow?.location.reload()
  } catch (error) {
    console.error('[SEIRMG] Falha ao recarregar a árvore ao fechar o editor:', error)
  }
})
```

- [ ] **Step 2: Registrar o content script no manifest**

Em `manifest.config.ts`, adicionar uma nova entrada em `content_scripts` (pode ir logo depois da entrada de `procedimento_enviar`, ou em qualquer ponto da lista):

```ts
{
  matches: [
    '*://*.br/*controlador.php?acao=editor_montar*',
    '*://*.org/*controlador.php?acao=editor_montar*',
  ],
  js: ['src/content-scripts/editor_montar/index.ts'],
  run_at: 'document_idle',
},
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit` (a partir de `C:\sei\seirmg`)
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/content-scripts/editor_montar/index.ts manifest.config.ts
git commit -m "feat: recarrega a árvore ao fechar o editor após assinar (via window.opener)"
```

---

### Task 2: Remover o reload forçado no momento de escolher a unidade

**Files:**
- Modify: `src/content-scripts/procedimento_enviar/index.ts`

**Interfaces:**
- Consumes: `extrairDocumentosPendentes` (já importada), sem mudança de assinatura.
- Produces: nenhuma interface nova.

- [ ] **Step 1: Ler o arquivo atual pra confirmar que bate com o esperado**

O arquivo `src/content-scripts/procedimento_enviar/index.ts` deve ter as funções `recarregarArvore` e `observarSelecaoUnidade` exatamente como ficaram na correção anterior (reload forçado com `iframe.contentWindow?.location.reload()` dentro de `recarregarArvore`, chamada de dentro de `observarSelecaoUnidade`). Se o conteúdo divergir, pare e reporte a diferença em vez de aplicar a edição às cegas.

- [ ] **Step 2: Remover `recarregarArvore` e simplificar `observarSelecaoUnidade`**

Substituir:

```ts
// O ícone de "assinado" (elemento `anchorA{id}` lido por extrairDocumentosPendentes) só existe no
// DOM porque veio renderizado pelo servidor -- assinar um documento não faz o SEI mutar a árvore
// via AJAX (mesma constatação já registrada em content-scripts/anotacao_registrar/index.ts, que por
// isso força reload do iframe depois de salvar uma anotação). Por isso reconsultar o mesmo
// contentDocument capturado no carregamento inicial nunca vê uma assinatura feita nesse meio tempo
// -- só um reload de verdade do #ifrArvore busca o HTML atualizado do servidor.
function recarregarArvore(iframe: HTMLIFrameElement): Promise<Document | null> {
  return new Promise((resolve) => {
    const finalizar = (): void => resolve(iframe.contentDocument ?? null)

    iframe.addEventListener('load', finalizar, { once: true })
    // Salvaguarda: se o evento load nunca disparar (ex.: falha de rede), não trava o fluxo de envio.
    const timeout = setTimeout(() => {
      iframe.removeEventListener('load', finalizar)
      finalizar()
    }, 5000)

    iframe.addEventListener('load', () => clearTimeout(timeout), { once: true })
    iframe.contentWindow?.location.reload()
  })
}

function mostrarAviso(pendencias: DocumentoPendente[], unidadeAtual: string): void {
```

por:

```ts
function mostrarAviso(pendencias: DocumentoPendente[], unidadeAtual: string): void {
```

(ou seja: remove a função `recarregarArvore` inteira e o comentário acima dela, mantendo `mostrarAviso` como está.)

- [ ] **Step 3: Simplificar `observarSelecaoUnidade`**

Substituir:

```ts
function observarSelecaoUnidade(ifrArvore: HTMLIFrameElement, unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true

    recarregarArvore(ifrArvore)
      .then((arvoreFresca) => {
        if (!arvoreFresca) return
        const pendenciasAtuais = extrairDocumentosPendentes(arvoreFresca, unidadeAtual)
        if (pendenciasAtuais.length === 0) return
        mostrarAviso(pendenciasAtuais, unidadeAtual)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao recarregar árvore antes do alerta de documentos não assinados:', error)
      })
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
// Relê ifrArvore.contentDocument agora (não uma referência de Document capturada antes) -- se a
// árvore recarregou nesse meio tempo (fechamento da janela do editor após assinar, ver
// content-scripts/editor_montar/index.ts), essa leitura já enxerga o HTML novo automaticamente,
// sem precisar forçar outro reload aqui (que atrapalharia a interação de escolher a unidade de
// destino -- motivo pelo qual essa lógica saiu daqui na correção anterior).
function observarSelecaoUnidade(ifrArvore: HTMLIFrameElement, unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true

    const arvoreAtual = ifrArvore.contentDocument
    if (!arvoreAtual) return
    const pendenciasAtuais = extrairDocumentosPendentes(arvoreAtual, unidadeAtual)
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

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `bun run test`
Expected: PASS, sem regressão (este arquivo não tem teste próprio).

- [ ] **Step 6: Rodar o build**

Run: `bun run build`
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/content-scripts/procedimento_enviar/index.ts
git commit -m "fix: para de recarregar a árvore ao escolher a unidade -- reload já aconteceu ao fechar o editor"
```

---

## Verificação manual pendente (fora do escopo de teste automatizado)

Numa instância SEI real: abrir um processo com documento interno pendente de assinatura, assinar pelo
editor (Salvar e Assinar → digitar senha → confirmar), deixar a janela do editor fechar sozinha, ir direto
pra "Enviar Processo" sem F5, escolher a unidade de destino e confirmar que **não aparece nenhum reload
visível da árvore nesse momento** e que o aviso de documento não assinado **não aparece** (documento já
assinado). Também confirmar o caminho que deve continuar funcionando: processo com documento pendente que
**não** foi assinado antes de enviar — o aviso deve continuar aparecendo normalmente. Se o usuário assina
via Bloco de Assinatura (fluxo em lote, não passa pelo editor) em vez do editor individual, esse caminho
**não** é coberto por este fix — avaliar separadamente se for um problema real no uso do dia a dia.