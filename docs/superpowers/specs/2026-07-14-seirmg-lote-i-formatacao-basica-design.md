# Lote I — Formatação Básica no Editor de Documentos (+ LaTeX)

**Data:** 2026-07-14
**Status:** Aprovado, pronto para plano de implementação

## Contexto

O roadmap (`docs/ROADMAP-LOTES.md`) lista o Lote I como "Editor de documentos — formatação e produtividade básica", uma das ~90 funcionalidades de paridade com Sei Pro. Até agora essas funcionalidades só estavam confirmadas por documentação (`pages/*.md` do Sei Pro), nunca por leitura do código-fonte real — diferente de outros lotes do projeto, que sempre que possível leem o código-fonte real do Sei Pro/Sei++ antes de especificar (ex.: Lote E3, Lote Q).

Antes deste spec, `sei-pro-editor.js` (8.253 linhas) foi lido por completo pela primeira vez. Achados que mudam o escopo original do roadmap:

- **"Hashcode/verificação de integridade"** e **"título da página"/"URL amigável"** não foram encontrados no arquivo do editor — não são tratados aqui, ficam para investigação futura separada (podem nem ser funcionalidades reais do Sei Pro, ou viver em outro arquivo).
- **"Salvamento automático"** foi explicitamente excluído pelo usuário antes deste spec — mexe com salvar/rede, mesma categoria de risco que já causou o histórico sério de deslogamento automático do projeto (ver memória `project-seirmg-hardening`).
- **"Hiperlinks"**: o link em si já é nativo do CKEditor (funciona sem nenhum código nosso). O Sei Pro só adiciona uma barrinha hover de conveniência (abrir/copiar/editar/remover) sobre links existentes — decisão do usuário: **fora de escopo** desta rodada.
- **Equações LaTeX**: o Sei Pro não renderiza localmente — monta a fórmula como uma tag `<img>` apontando para `https://latex.codecogs.com` (serviço de terceiro), convertida para base64 antes de inserir. Isso envia o conteúdo da equação para fora do SEI. Decisão do usuário: usar **KaTeX local** em vez disso (renderiza no navegador, zero rede), aceitando o custo de ~250KB adicionais no bundle da extensão.

## Escopo final deste lote

1. Alinhar texto (esquerda/centro/direita/justificado)
2. Aumentar/reduzir fonte
3. Copiar formatação
4. Tabela rápida + estilo de tabela (catálogo de presets visuais)
5. Quebra de página / quebra de seção
6. Parágrafos numerados (infraestrutura de convenção de classes CSS, compartilhada pelos itens 7 e 8)
7. Sumário
8. Nota de rodapé
9. Primeira letra maiúscula automática
10. Teclas de atalho configuráveis (associar `Ctrl+Alt+Shift+<tecla>` a um estilo de parágrafo)
11. Equações LaTeX (via KaTeX)

## Arquitetura

### Onde os botões aparecem

Confirmado por leitura de código (`sei-pro-editor.js:378-476`): o Sei Pro **não usa o sistema de plugins do CKEditor** para adicionar botões — ele espera a barra de ferramentas nativa renderizar (poll com timeout, já que é assíncrono) e injeta elementos `<a class="cke_button">` diretamente no DOM da toolbar (`span.cke_toolbox`/`span.cke_toolgroup`), imitando a marcação e as classes CSS nativas do CKEditor pra parecer parte do editor de verdade.

O SEIRMG replica essa técnica, mas com uma simplificação importante: como a toolbar do CKEditor é um elemento DOM comum (não um objeto JS do `CKEDITOR`), o **mundo isolado** já enxerga e pode manipular esse DOM diretamente — sem precisar do mundo principal pra isso. Novo módulo `content-scripts/documento_editar/formatacaoBasica.ts`, no mesmo padrão de `corretorOrtografico.ts`: aguarda `editor` (via `criarClienteEditor`, já existente), localiza a toolbar associada à instância certa, e injeta os botões usando ícones **lucide-static** no tamanho nativo do CKEditor (16×16) — mesma biblioteca de ícones já usada em Ferramentas de IA/Opções, para não repetir a inconsistência visual que o botão flutuante de Ferramentas de IA acabou tendo.

### Ler vs. escrever no documento

Regra única para todo o lote, decidida a partir do padrão já usado (sem saber, até agora) em `corretorOrtografico.ts`:

- **Leitura é sempre direta**, sem passar pela ponte: `editor.corpo`/`editor.documento`/`editor.janela` são referências DOM/Window reais (o iframe é same-origin), o mundo isolado já as usa diretamente hoje (`corretorOrtografico.ts` já faz `obterParagrafos(corpo)`, leitura de seleção, etc. sem nenhum comando de ponte). Decidir "que estilo aplicar", "quais classes de parágrafo existem no documento" (para montar o sumário) ou "qual é o elemento sob o cursor" (para copiar formatação) não precisa de nenhum comando novo.
- **Escrita sempre passa pela ponte** (`ponteEditor.ts`/`pontePrincipal.ts`, executada no mundo principal contra a instância real do CKEditor), nunca mutação direta do DOM do editor. Motivo: o CKEditor 4 mantém seu próprio sistema de undo/redo e de detecção de "documento alterado" (`checkDirty`), independente do undo nativo do navegador — mutações diretas no DOM por fora da API do CKEditor não entram nesse histórico, e o usuário perderia a capacidade de desfazer (Ctrl+Z) essas mudanças, ou o SEI poderia não perceber que o documento foi alterado.

A ponte (`protocolo.ts`'s `TipoComando`) ganha comandos novos, nomeados e fechados (não um "executar qualquer coisa" genérico — mantém testável e seguro, mesmo padrão dos 4 comandos já existentes):
- Um comando para aplicar uma classe/estilo ao parágrafo/seleção atual (cobre alinhar texto, aumentar/reduzir fonte, copiar formatação, maiúscula automática).
- `inserirHtml`/`inserirTexto` já existentes cobrem tabela rápida, quebra de página, LaTeX, sumário (inserção da lista) e nota de rodapé (inserção da chamada+entrada).

**Nota de rodapé e sumário fazem exceção controlada à regra "leitura direta, escrita via ponte":** renumerar chamadas de nota já existentes (ex.: inserir uma nota no meio do texto empurra os números seguintes) é uma atualização de texto em vários elementos `<sup>` já existentes, não inserção de conteúdo novo. Fazer isso via `insertHtml` repetido seria estranho (múltiplos passos de undo pra uma ação conceitualmente única) — a renumeração em si faz mutação direta de texto (não estrutural) nesses elementos. Trade-off aceito: a renumeração não aparece como um único passo de "desfazer" no CKEditor. Documentado aqui para não ser redescoberto como bug depois.

### LaTeX

Módulo próprio `content-scripts/documento_editar/latex.ts` + `features/latex/` (mesmo padrão de pasta dedicada que Ferramentas de IA e Corretor Ortográfico já têm). Fluxo: botão na toolbar abre um diálogo (construído no mundo isolado, mesmo estilo visual já usado no painel de Ferramentas de IA) com campo de entrada da fórmula (sintaxe LaTeX) + pré-visualização ao vivo renderizada com **KaTeX** (import local, sem CDN — consistente com o resto do projeto, que não carrega nada de fora exceto os 3 provedores de IA já existentes e explicitamente aprovados). Ao confirmar, insere o HTML renderizado do KaTeX no documento via `inserirHtml`.

### Organização de código

- `content-scripts/documento_editar/formatacaoBasica.ts` — orquestração (toolbar, cliques, diálogos simples)
- `content-scripts/documento_editar/latex.ts` — orquestração do diálogo de LaTeX
- `features/formatacao-basica/` — lógica pura testável: catálogo de estilos de tabela, convenção de classes de parágrafo numerado, lógica de renumeração de notas de rodapé, geração da lista do sumário
- `features/latex/` — wrapper fino sobre KaTeX (render → string HTML)
- `protocolo.ts` — novos tipos de comando
- `pontePrincipal.ts` — implementação dos novos comandos no mundo principal
- `options/index.html`/`main.ts` — nova subseção "Formatação Básica" dentro da aba "Editor de Documentos" já existente (mesmo padrão de `<h3>` já usado ali para "Autopreencher Documento Externo"/"Arrastar e Soltar"): toggle geral ativo/inativo + configuração de teclas de atalho.

## Ícones

Todos os novos botões usam SVGs da lib `lucide-static` (já vendorizada no projeto), dimensionados para o padrão nativo do CKEditor (`cke_button_icon`, 16×16), em vez de qualquer solução visual própria — objetivo explícito é que os botões pareçam parte do editor nativo, não um adendo do SEIRMG.

## Testes

Segue o padrão já estabelecido no projeto: lógica pura (catálogo de estilos, convenção de classes de parágrafo, renumeração de notas, geração de sumário) ganha testes unitários em `features/`, isolados de DOM/CKEditor real (mesmo padrão de `bloco-assinatura`/`corretor-ortografico`). Orquestração DOM-pesada em `content-scripts/` não é coberta por teste automatizado, mesma decisão já tomada e documentada para `corretorOrtografico.ts` — validação real depende de instância SEI ao vivo.

## Apêndice — mecanismos confirmados por leitura de código (`sei-pro-editor.js`, 8.253 linhas, lido por completo em 2026-07-14)

| Funcionalidade | Função(ões)/linhas | Mecanismo real |
|---|---|---|
| Alinhar texto | `setAlignText`/`openAlignText`, L914-958 | Troca a classe CSS do parágrafo (`Texto_Alinhado_Esquerda` etc.) — não usa `text-align` inline nem o comando nativo `justifyleft` do CKEditor, por convenção própria de formatação de documento SEI |
| Aumentar/reduzir fonte | `changeFontSize`, L961-979 | `CKEDITOR.style` com `font-size` em px, aplicado via `oEditor.applyStyle()` sobre a seleção |
| Copiar formatação | `setCopyStyle`/`applyCopyStyle`, L1348-1427 | Lê propriedades CSS do elemento selecionado (cor, tamanho, negrito, itálico), guarda em `sessionStorage`, aplica no próximo clique via `execCommand('bold')` etc. |
| Tabela rápida + estilo de tabela | `getQuickTable`/`quickTableClick`/`getSyleTable`, L1619-1881 | Grade visual N×N em HTML puro, insere via `insertHtml`; estilo é um catálogo de presets CSS aplicados por atributo `style` |
| Quebra de página / seção | `getPageBreak`/`getSessionBreak`, L870-904 | Insere um `<div>`/`<p>` marcador com `page-break-after:always` ou resetando contadores CSS de numeração |
| Parágrafos numerados (convenção) | `extrairTextoComNumeracao`, L677-777 (uso em referência interna, L7181-7283) | Convenção de classes CSS (`Item_Nivel1..4`, `Paragrafo_Numerado_Nivel1..4`) lida por várias features via `querySelectorAll('p')` + contador JS |
| Sumário | `getSumarioDocumento`/`insertSumarioDocumento`, L3231-3413 | Lista classes CSS de parágrafo existentes no documento, usuário escolhe até 3 como "Título 1/2/3", gera lista de links âncora |
| Nota de rodapé | `getNotaRodape`/`insertNtRodape`/`reorderNtRodape`, L2392-2618 | Par de âncoras (chamada `[n]` sobrescrita + rodapé no fim do body), reordena numeração percorrendo o DOM |
| Maiúscula automática | `convertFirstLetter`, L2285-2294 | Pega texto selecionado, `capitalizeFirstLetter()`, reinsere via `insertHtml` |
| Teclas de atalho configuráveis | `stylesEditorKeystroke`, L1489-1561 | Lista de "estilos" (classes de parágrafo) associados a `Ctrl+Alt+Shift+0-9/A-Z` via `oEditor.setKeystroke()` |
| Equações LaTeX (Sei Pro, referência) | `openDialogLatex`/`updatePreviewLatex`, L5612-5749 | **Não renderiza local** — `<img>` de `https://latex.codecogs.com/png.latex?...` convertida a base64 antes de inserir. **SEIRMG usa KaTeX local em vez disso, decisão já tomada acima.** |
| Injeção de botões na toolbar | `addButton`/`htmlButton`, L378-476 | Poll (até 9s) esperando `.cke_toolbox` existir, injeta `<a class="cke_button ...">` via jQuery `.append()`/`.before()`/`.after()`, imitando marcação nativa; cliques via `.on('click', ...)` direto, sem passar pelo sistema de plugins/comandos do CKEditor |
| Hiperlinks (fora de escopo) | `insertTextTotLink`/`editLinkPro`/L3785-3900 | Link em si é o diálogo nativo do CKEditor; Sei Pro só adiciona barrinha hover (abrir/copiar/editar/remover) — decisão do usuário: não replicar |

## Riscos conhecidos

- **Injeção de botão na toolbar depende da estrutura DOM atual do CKEditor 4 do SEI** (classes `cke_toolbox`/`cke_toolgroup`) — se o SEI atualizar a versão do CKEditor, a injeção pode quebrar silenciosamente (botões não aparecem, sem erro). Mesma categoria de risco que o resto do projeto já aceita (raspagem de DOM nativo do SEI, sem API oficial).
- **Pendente de validação manual numa instância SEI real**, como todo lote que mexe com o editor de documentos (mesmo aviso já registrado nos Lotes K/R) — os testes automatizados cobrem só a lógica pura, não o comportamento real do CKEditor da página.
- **Renumeração de nota de rodapé não é um único passo de undo** (ver seção "Ler vs. escrever no documento" acima) — tradeoff aceito, não é um bug a ser corrigido depois.
