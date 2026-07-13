---
title: "Lote R — Ponte CKEditor (main world) + desbloqueio de Ferramentas de IA e Corretor Ortográfico"
date: 2026-07-13
status: aprovado
---

# Lote R — Ponte CKEditor (main world)

## Problema

`src/content-scripts/documento_editar/index.ts` e `corretorOrtografico.ts` já implementam as
features **Ferramentas de IA** (Lote K) e **Corretor Ortográfico**, mas nenhuma das duas jamais
funcionou numa instância SEI real. Causa raiz confirmada (ver memória do projeto
`project-seirmg-ckeditor-isolated-world`, teste ao vivo em Campinas 2026-07-13): o content script
roda no **isolated world** do Chrome, que compartilha o DOM com a página mas não os globais JS
criados por scripts da própria página — `window.CKEDITOR` é setado pelo script do SEI no **main
world**, genuinamente invisível pro content script isolado. `esperarCKEditor()` faz polling de até
30s e nunca encontra nada; não é um problema de timing.

Análise do código de produção do Sei Pro (`docs/analise-tecnica-ckeditor-sei-pro.md`) confirma que
ele **não vendoriza um CKEditor próprio** pra estender o editor de documento do SEI — pra isso ele
roda código no main world da página (via injeção manual de `<script>`) e manipula a instância viva
do CKEDITOR de lá. A ideia registrada anteriormente na memória do projeto (vendorizar CKEditor) foi
uma leitura equivocada da técnica real do Sei Pro, corrigida por essa análise.

## Escopo

- Implementar a ponte isolated↔main world (item 1 abaixo) e usá-la pra desbloquear Ferramentas de
  IA e Corretor Ortográfico, que já existem no código.
- Corrigir o ícone do botão flutuante de Ferramentas de IA (troca do emoji "✨" pelo SVG `sparkles`
  do `lucide-static`, já usado pra essa mesma seção na tela de Opções).
- **Fora de escopo** (viram lotes futuros próprios no roadmap, cada um com seu brainstorming): nota
  de rodapé, tabela rápida, enumerar normas/legis, sigilo, sumário, QR Code, dados do processo,
  editar link, qualidade de imagem em lote. Essas features já aparecem descritas nos itens `I`/`J`
  do `docs/ROADMAP-LOTES.md`; este lote R é o que as torna implementáveis (a ponte é pré-requisito
  técnico comum a todas), mas nenhuma delas é construída aqui.
- **Fora de escopo, permanente**: suporte a SEI 5 (CKEditor 5 nativo, sem iframe). O código atual só
  lida com CKEditor 4 (SEI clássico, iframe `txaEditor_*`); este lote mantém esse mesmo limite, só
  corrige o acesso ao CK4 existente.

## Arquitetura da ponte

Técnica escolhida: `"world": "MAIN"` nativo do Manifest V3 (Chrome 111+), declarado direto no
manifest — variante moderna do mesmo princípio que o Sei Pro usa em produção (rodar código no
contexto real da página onde `window.CKEDITOR` existe), só que sem precisar de
`web_accessible_resources` + injeção manual de `<script>`.

Três arquivos novos em `src/content-scripts/documento_editar/`:

**`protocolo.ts`** — nomes de evento e tipos do contrato, compartilhados só em tempo de build (cada
lado é bundlado separadamente; não há import cruzado em runtime):
```ts
export const EVENTO_PRONTO = 'seirmg:editor-pronto'
export const EVENTO_COMANDO = 'seirmg:comando-editor'
export const EVENTO_RESPOSTA = 'seirmg:resposta-editor'

export type TipoComando = 'getSelectedText' | 'insertHtml' | 'insertText' | 'getTextoCompleto'
export interface DetalheComando { id: string; tipo: TipoComando; args: unknown[] }
export interface DetalheResposta { id: string; resultado: unknown; erro: string | null }
export interface DetalhePronto { nome: string }
```

**`pontePrincipal.ts`** — roda no **main world**. Contém a lógica de "escolher a instância CKEditor
editável" que já existe hoje em `index.ts` (várias instâncias de CKEditor na mesma tela de edição —
cabeçalho/despacho/data/corpo/rodapé —, só uma com `contentEditable`), movida pra cá porque só aqui
`window.CKEDITOR` existe de fato. Faz polling até achar a instância, dispara `EVENTO_PRONTO` com
`{ nome: instancia.name }`, e fica escutando `EVENTO_COMANDO` pra executar `getSelection().getSelectedText()`,
`insertHtml()`, `insertText()` ou `editable().getText()` na instância e responder via `EVENTO_RESPOSTA`.

**`ponteEditor.ts`** — roda no **isolated world** (junto com o resto do content script). Expõe
`aguardarEditorPronto(): Promise<EditorSEI>`:
```ts
export interface EditorSEI {
  obterTextoSelecionado(): Promise<string>
  obterTextoCompleto(): Promise<string>
  inserirHtml(html: string): Promise<void>
  inserirTexto(texto: string): Promise<void>
  corpo: HTMLElement   // iframe.contentDocument.body
  documento: Document  // iframe.contentDocument
  janela: Window       // iframe.contentWindow
}
```
`corpo`/`documento`/`janela` vêm de `document.querySelector('iframe[title*="<nome>"]')` — acesso
direto ao DOM, que já é compartilhado entre isolated/main world, sem precisar de ponte. Só os 4
métodos que chamam API do próprio objeto CKEditor passam pelo `EVENTO_COMANDO`/`EVENTO_RESPOSTA`,
com timeout de 5s (rejeita a Promise se o main world não responder nesse prazo).

`manifest.config.ts` ganha uma entrada nova em `content_scripts`, mesmo `matches`/`all_frames` da
entrada já existente de `documento_editar`, com `js: ['.../pontePrincipal.ts']` e `world: 'MAIN'`.

## Mudanças em Ferramentas de IA e Corretor Ortográfico

- `index.ts`: troca o acesso direto a `CKEDITOR`/`EditorCKEditor` por `EditorSEI` vindo de
  `aguardarEditorPronto()`. Funções que hoje leem texto selecionado/documento inteiro de forma
  síncrona (`obterTextoSelecionado`, `obterTextoDocumentoInteiro`, `atualizarPainel`, a ação
  `inserir`) passam a `await` essas chamadas — mesmo padrão de `.catch(console.error)` já usado nos
  outros handlers assíncronos do arquivo.
- `corretorOrtografico.ts`: troca `editor.document.getBody().$`/`.getWindow().$`/`.$` (acesso direto
  ao DOM do editor) por `editor.corpo`/`editor.janela`/`editor.documento` — sem mudança de
  comportamento, só renomeação. `editor.insertText(sugestao)` em `aplicarSugestao` vira
  `await editor.inserirTexto(sugestao)`: como isso agora depende de um round-trip pra ponte,
  existe uma pequena janela de atraso (deve ficar bem abaixo de 100ms na prática) entre o clique
  numa sugestão e o texto realmente mudar dentro do editor — mudança real de comportamento, aceita
  pelo usuário nesta spec.

## Ícone

Botão flutuante `#seirmg-botao-ia` (`montarBotaoFlutuante` em `index.ts`) troca o texto
`'✨ Ferramentas de IA'` pelo SVG `sparkles` de `lucide-static` (mesmo pacote/ícone já usado em
`src/options/main.ts` pra rotular a seção "Ferramentas de IA" nas Opções), com uma regra CSS de
tamanho consistente com o padrão já usado em `.seirmg-ia-icone-provedor svg` no mesmo arquivo.

## Validação

A lógica pura (`corretor-ortografico/corretor.ts`, `diffParagrafos.ts`, `ferramentas-ia/adaptadores.ts`,
`prompts.ts`) já tem testes e não muda. A ponte em si depende de `window.CKEDITOR` real + iframe real
do SEI — não é testável de forma significativa fora de uma instância SEI ao vivo. Fica marcada como
**pendente de validação manual numa instância SEI real**, mesmo tratamento de risco já usado nos
Lotes F e K.

## Atualização do roadmap

`docs/ROADMAP-LOTES.md`: este lote entra em "Já entregue" como Lote R ao concluir. As entradas `I`
e `J` (que descrevem nota de rodapé/tabela/sumário/QR Code/sigilo etc.) ganham uma nota indicando
que a ponte técnica pré-requisito (Lote R) já está disponível.
