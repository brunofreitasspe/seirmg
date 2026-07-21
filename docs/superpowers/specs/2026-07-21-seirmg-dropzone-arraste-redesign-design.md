# SEIRMG — Redesenho visual da tela de arraste de documento externo — Design

## Contexto

Hoje, arrastar um arquivo sobre uma página de processo mostra um overlay cru: retângulo cinza
(`rgba(242,242,242,0.9)`) com borda tracejada `#424242` e um `textContent` que só troca entre
"Arraste aqui para criar documento externo..." e "Criando documento(s)...". Não há ícone, não há
transição entre estados, e os dois desfechos reais do fluxo não têm feedback visual próprio:

- **Sucesso:** `location.reload()` acontece na hora, sem nenhuma indicação.
- **Erro:** um `alert()` do navegador lista os arquivos que falharam — e a página recarrega mesmo
  assim, mesmo se **todos** os arquivos falharem.

O usuário achou a tela feia e pediu um redesenho. Foram apresentados 3 mockups (institucional,
glass, ilustrado) — decisão: **opção B (glass)**.

## Decisões validadas com o usuário (2026-07-21, com mockup aprovado)

Mockup: https://claude.ai/code/artifact/c7a8fb23-d9c5-4459-b4d2-4e8796ea03e3 (opção B escolhida)

- **Visual:** scrim translúcido escurecido cobrindo a viewport (`backdrop-filter: blur`) com um
  cartão de vidro (glass) centralizado — fundo semitransparente com blur, cantos arredondados,
  sombra suave. Selo circular colorido com ícone no topo do cartão, título + subtítulo abaixo.
- **Estado "arraste":** ícone de upload, cartão com pulso sutil (`scale` 1 → 1.02 em loop).
- **Estado "enviando":** sem porcentagem real — o fluxo faz várias chamadas sequenciais
  (`fetch`/`FormData`, sem eventos de progresso) e simular uma porcentagem falsa seria enganoso.
  Em vez disso, ícone de loader girando (spinner honesto e indeterminado).
- **Estado "sucesso" (novo — hoje não existe):** selo verde com check, título conforme quantidade
  de arquivos, exibido por **~900ms antes de recarregar** — dá o feedback que hoje não existe.
- **Estado "erro" (substitui o `alert()`):** selo vermelho com X, lista dos arquivos que falharam,
  botões **"Fechar"** e **"Tentar novamente"**.
  - "Tentar novamente" reenvia **só os arquivos que falharam** (os `File` já estão em memória —
    não precisa o usuário arrastar de novo).
  - A página **só recarrega ao clicar "Fechar"** (ou quando um retry termina 100% de sucesso) —
    nunca recarrega com o erro ainda na tela, ao contrário do comportamento atual.
- **Cores reaproveitadas do tema já existente** (não inventar nova paleta): sucesso usa o verde já
  usado em `.seirmg-badge-nivel-publico` (`#17875a`), erro usa o vermelho já usado em
  `.seirmg-btn-acao-perigo` (`#b3261e`), e os botões do painel de erro reaproveitam as classes
  `.seirmg-btn-acao` / `.seirmg-btn-acao-primario` já usadas em outros diálogos do projeto.
- **Ícones:** `lucide-static` (mesma biblioteca já usada em `latex.ts`/`dialogoFlutuante.ts`), não
  SVG desenhado à mão — `upload`, `loader-circle`, `check`, `x`.
- **`prefers-reduced-motion`:** as duas animações novas (pulso do cartão, giro do loader) são
  desligadas quando o usuário pediu menos movimento no SO.

## Arquitetura

### `src/features/procedimento-visualizar/dropzone.ts` (helpers puros, testáveis)

```ts
export function formatarMensagemEnviando(nomesArquivos: string[]): string
// 1 arquivo → "Enviando <nome>"; N arquivos → "Enviando N arquivos"

export function formatarMensagemSucesso(quantidade: number): string
// 1 → "Documento incluído com sucesso"; N → "N documentos incluídos com sucesso"

export function formatarListaFalhas(nomesArquivos: string[]): string
// nomesArquivos.join(', ')
```

`dropzone.test.ts` ganha casos para as três funções (singular vs. plural, lista vazia/1/N nomes).

### `src/content-scripts/core/theme.css`

Substitui o bloco `#seirmg-dropzone-overlay` atual (linhas ~697-709) por:

- `#seirmg-dropzone-overlay`: `position: fixed; inset: 0`, scrim `rgba(10,16,28,0.32)` +
  `backdrop-filter: blur(2px)`, `pointer-events: none` no container (preserva o comportamento
  atual de deixar os eventos de `drag`/`drop` passarem para o `window`).
- `.seirmg-dropzone-card`: cartão glass centralizado (`backdrop-filter: blur(14px)`, fundo branco
  translúcido, borda 1px translúcida, `border-radius: 16px`, sombra).
- `.seirmg-dropzone-badge`: selo circular 46px com gradiente por estado (`[data-state]` no
  container raiz seleciona a cor: azul/`--seirmg-accent-color` no "arraste"/"enviando", verde
  `#17875a` no "sucesso", vermelho `#b3261e` no "erro").
- `.seirmg-dropzone-titulo` / `.seirmg-dropzone-sub` / `.seirmg-dropzone-falhas`: textos.
- `.seirmg-dropzone-acoes`: `display: none` por padrão, `display: flex` só quando
  `[data-state="erro"]`; `pointer-events: auto` nos botões (única parte clicável do overlay).
- Duas `@keyframes` novas: `seirmg-dropzone-pulso` (cartão, só no estado "arraste") e
  `seirmg-dropzone-girar` (ícone do loader, só no estado "enviando"), ambas desligadas dentro de
  `@media (prefers-reduced-motion: reduce)`.

### `src/content-scripts/documento_externo_arraste/index.ts` (reescrito)

```ts
import uploadIconSvg from 'lucide-static/icons/upload.svg?raw'
import loaderIconSvg from 'lucide-static/icons/loader-circle.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'

type EstadoDropzone = 'arraste' | 'enviando' | 'sucesso' | 'erro'

interface OverlayDropzone {
  raiz: HTMLDivElement
  badge: HTMLDivElement
  titulo: HTMLDivElement
  sub: HTMLDivElement
  falhas: HTMLDivElement
  botaoFechar: HTMLButtonElement
  botaoTentarNovamente: HTMLButtonElement
}

function criarOverlayArraste(): OverlayDropzone
function definirEstado(overlay: OverlayDropzone, estado: EstadoDropzone, opcoes: { titulo: string; sub?: string; falhas?: string }): void
```

- `criarOverlayArraste`: monta o DOM do cartão uma única vez (innerHTML com as 5 sub-áreas +
  botões `data-acao="fechar"|"retry"`) e devolve as referências já resolvidas.
- `definirEstado`: seta `overlay.raiz.dataset.state`, troca o ícone do badge (mapa
  estado → SVG importado), preenche título/subtítulo/lista de falhas, garante
  `display: flex` no container.

`montarDropzone` ganha duas variáveis de estado no closure:

- `enviando: boolean` — trava novos `drop`/`dragenter` enquanto uma leva de arquivos está sendo
  processada (guarda que não existe hoje).
- `arquivosPendentes: File[]` — arquivos que falharam na última tentativa, usados pelo
  "Tentar novamente".

Fluxo consolidado em `processarArquivos(arquivos: File[])` (extraído do handler de `drop`, também
usado pelo clique em "Tentar novamente"):

1. `enviando = true`, `definirEstado(overlay, 'enviando', { titulo: formatarMensagemEnviando(...) })`.
2. `Promise.allSettled(arquivos.map(criarDocumentoExternoPorArraste))`.
3. Sem falhas → `arquivosPendentes = []`, `definirEstado('sucesso', ...)`,
   `setTimeout(() => location.reload(), 900)`.
4. Com falhas → `arquivosPendentes = falhas`, `definirEstado('erro', { ...,
   falhas: formatarListaFalhas(falhas.map(a => a.name)) })`, `enviando = false` (libera novo
   drag/drop ou retry).
5. Erro inesperado na promise (`.catch`) → `enviando = false` + `console.error` (mesmo tratamento
   de hoje, só sem deixar a UI travada).

Handlers:

- `dragenter`/`drop`: ignoram o evento se `enviando === true` (evita duas levas concorrentes).
- Clique em "Fechar": esconde o overlay e `location.reload()` (reflete no HTML os documentos que
  tiverem sido incluídos com sucesso antes da falha, se for o caso de falha parcial).
- Clique em "Tentar novamente": chama `processarArquivos(arquivosPendentes)` de novo.

`criarDocumentoExternoPorArraste` e `contemArquivos` continuam iguais — a mudança é só na camada
de UI/estado ao redor deles.

## Fora de escopo

- Progresso real de upload (exigiria trocar `fetch` por `XMLHttpRequest` com `upload.onprogress`
  só para um valor aproximado, já que o fluxo tem múltiplas chamadas sequenciais antes do upload
  em si — desproporcional para um redesenho visual).
- Suporte a tema escuro no overlay (o resto do `theme.css` não tem `prefers-color-scheme` hoje; a
  página do SEI em si também não tem modo escuro).
- Qualquer mudança nas opções A (institucional) e C (ilustrada) do mockup — descartadas.

## Testes

`dropzone.test.ts`: casos novos para `formatarMensagemEnviando`, `formatarMensagemSucesso`,
`formatarListaFalhas` (singular, plural, lista vazia). Wiring de `documento_externo_arraste/index.ts`
sem teste automatizado, mesmo padrão já estabelecido no projeto (manipulação de DOM/eventos de
`drag` direto no `window`) — verificado via `tsc --noEmit`/`bun run test`/`bun run build` e depois
validação manual numa instância SEI real (arrastar 1 arquivo, arrastar 2 arquivos, forçar erro
fechando o processo antes de soltar o arquivo, testar "Tentar novamente").
