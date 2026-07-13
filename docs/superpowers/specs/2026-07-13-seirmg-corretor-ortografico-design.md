# SEIRMG — Corretor ortográfico no editor de documentos (CKEditor)

> Spec resultante de brainstorming em 2026-07-13.

## Contexto

No editor de documentos do SEI (`acao=documento_editar`, CKEditor 4 clássico), o navegador já sublinha palavras erradas em vermelho, mas o clique com o botão direito não mostra sugestões — porque o CKEditor tem seu próprio menu de contexto customizado, que substitui o menu nativo do navegador (o único lugar onde as sugestões apareceriam). Navegadores não expõem pra extensões a lista de sugestões do corretor nativo (bloqueado por privacidade), então não há como "pegar emprestado" o corretor do Chrome — a extensão precisa do próprio dicionário e do próprio motor de sugestões, como um corretor de verdade (tipo Word).

## Escopo

- Verificação ortográfica em português (pt-BR) do conteúdo do corpo do CKEditor em `src/content-scripts/documento_editar/`.
- Sublinhado visual de palavras não reconhecidas, sem tocar no HTML/conteúdo real do documento.
- Menu de contexto próprio (sugestões, ignorar, adicionar ao dicionário) ao clicar com o botão direito numa palavra sublinhada — sem interferir no menu nativo do CKEditor em qualquer outro clique.
- Toggle de ativação e lista de palavras adicionadas ao dicionário, na página de Opções.

**Fora de escopo**: outros campos de texto do SEI (textareas de bloco, anotação, despacho etc. — o problema do menu de contexto é específico do CKEditor); sugestões gramaticais (só ortografia); "Ignorar todas as ocorrências" (só ignora a ocorrência clicada); dicionários em outros idiomas.

## Bibliotecas novas

- **`nspell`** — motor de sugestão em JS puro (sem WASM), entende regras de afixo do Hunspell (plurais, conjugações). Escolhido em vez de `hunspell-asm` (WASM, mais pesado e mais difícil de depurar dentro de um content script/iframe) e em vez de `typo.js` (menos mantido).
- **`dictionary-pt-br`** — dicionário Hunspell pt-BR pronto no formato que o `nspell` espera (projeto `wooorm/dictionaries`, extraído do LibreOffice, licença aberta). Preferido a baixar `.aff`/`.dic` manualmente do LibreOffice (sem ganho, mais manutenção) e a uma lista de frequência sem regras de afixo (gera excesso de falsos positivos em português, idioma com muita flexão verbal/nominal).

## Armazenamento (`src/lib/storage.ts`)

```ts
export interface SpellcheckConfig {
  ativo: boolean
  palavrasIgnoradas: string[]
}
```

Adicionado como `spellcheck: SpellcheckConfig` na config sincronizada (`createSyncConfigStore`), mesmo padrão de `FerramentasIAConfig`. `palavrasIgnoradas` é a lista de "adicionar ao dicionário" (sincroniza entre navegadores do mesmo usuário).

## Detecção e sublinhado

- Roda com *debounce* de ~600ms após parada de digitação.
- Tokenização do texto do corpo do CKEditor em palavras, ignorando números, e-mails e siglas em CAIXA ALTA (ex. "SEI", "RMG") — siglas não entram na checagem, pra evitar ruído.
- **Reprocessamento por parágrafo, não o documento inteiro**: cada bloco de nível superior do corpo (`<p>`, `<li>`, célula de tabela etc.) recebe um atributo `data-seirmg-par-id` estável, gerado na primeira varredura. A cada debounce, compara o texto atual de cada `data-seirmg-par-id` com um snapshot em memória da última verificação, e só reprocessa os parágrafos que mudaram (tipicamente 1 — onde está o cursor). Parágrafos novos (sem id ainda) ganham id e entram na fila; parágrafos removidos têm seus destaques descartados.
- Palavras não encontradas no dicionário (nem em `palavrasIgnoradas`, nem ignoradas nesta sessão) geram um `Range` de DOM adicionado a um único `Highlight` global (`CSS.highlights.set('seirmg-erro-ortografico', highlight)`), registrado na janela interna do iframe do CKEditor — acessível via a própria API do CKEditor (`editor.document`/`editor.window`), sem precisar de `all_frames` extra no manifest para esse iframe específico. Um `<style>` injetado no mesmo documento define `::highlight(seirmg-erro-ortografico) { text-decoration: red wavy underline }`.
- Essa abordagem (CSS Custom Highlight API, em vez de envolver cada palavra errada em `<span>`) não modifica o DOM do editor — preserva 100% o histórico de desfazer (Ctrl+Z) do CKEditor e nunca corrompe o HTML salvo do documento.

## Menu de contexto e correção

- Listener em fase de captura no corpo do CKEditor intercepta `contextmenu`. Usa `document.caretRangeFromPoint(x, y)` (chamado no `document` do próprio iframe) pra achar a posição do clique.
  - Clique **fora** de um destaque de erro: não faz nada — menu nativo do CKEditor abre normalmente (cortar/colar/tabela etc.).
  - Clique **dentro** de um destaque de erro: `preventDefault()`/`stopPropagation()` bloqueiam o menu do CKEditor; abre um menu próprio, posicionado nas coordenadas do clique, com identidade visual distinta (rótulo "SEIRMG", borda de destaque) pra nunca ser confundido com o menu nativo — validado no mockup da sessão de brainstorming.
- Conteúdo do menu: até 5 sugestões do `nspell` (ordenadas por proximidade), separador, "Ignorar", "Adicionar ao dicionário".
- **Aplicar sugestão**: converte a posição da palavra num `CKEDITOR.dom.range` (API do CKEditor), seleciona (`range.select()`) e chama `editor.insertText(sugestão)` — substitui o texto, registra passo no undo e marca o documento como alterado, como uma edição manual.
- **Ignorar**: remove o destaque daquela ocorrência específica até a próxima edição do parágrafo (não persiste).
- **Adicionar ao dicionário**: grava a palavra em `SpellcheckConfig.palavrasIgnoradas`, refaz a varredura pra remover todos os destaques daquela palavra no documento atual.

## Interface de configuração (Opções)

- Nova aba "Corretor ortográfico" em `src/options`, seguindo o padrão das abas existentes (`tabs.ts`).
- Toggle único: **Ativar corretor ortográfico**.
- Lista editável das palavras adicionadas ao dicionário, reaproveitando o componente `listaEditavel.ts` já existente, com opção de remover cada palavra manualmente.

## Indicador visual (sem depender do DevTools)

Pequeno indicador discreto perto do botão flutuante de "Ferramentas de IA" (ex. "Corretor: 3 erros encontrados"), atualizado a cada varredura — não é `console.log`/`alert`, é visível na própria página, pra permitir confirmar visualmente que o recurso está rodando sem precisar abrir o DevTools.

## Testes

- **Unitários (Vitest, sem DOM real)**, em `src/features/spellcheck/`: tokenização de palavras; decisão "está no dicionário / está ignorada / é sigla"; geração de sugestões via `nspell`; lógica de diff por parágrafo (comparação de snapshots por `data-seirmg-par-id`).
- **Manual no SEI real** (CKEditor/iframe não são simuláveis no Vitest): digitar palavra errada → sublinhado aparece; clique direito nela → menu próprio com sugestões; aplicar sugestão → texto corrigido e Ctrl+Z desfaz; clique fora de erro → menu nativo do CKEditor abre normalmente, sem alteração.

## Riscos e mitigações

- **Performance em documentos longos** (dezenas de páginas): mitigado pelo reprocessamento por parágrafo (só o que mudou, não o documento inteiro). Se ainda assim pesar na prática, ajuste fino futuro: limitar a verificação aos parágrafos visíveis na tela.
- **Falsos positivos em jargão jurídico/administrativo específico do SEI-MG**: dicionário genérico não conhece esses termos; mitigado pelo fluxo "Adicionar ao dicionário", que cresce com o uso.
