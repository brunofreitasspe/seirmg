# Editor — grupos na barra e "Inserir conteúdo" (sub-lote 1: funções locais)

Data: 2026-10-06 · Status: aprovado em conversa, aguardando revisão desta spec

## Contexto e objetivo

O usuário quer no editor de documentos do SEI as funções do SEI Pro listadas em "Editor: inserir
conteúdo", "Editor: formatação e impressão" e "Editor: imagens e links". Decisões tomadas na
conversa:

- Os botões ficam **na barra do próprio editor (CKEditor do SEI)**, **soltos** (um ícone por
  função, sem menus suspensos), mas **agrupados por tema**: cada grupo é um bloco visual próprio
  na barra, separado dos outros.
- O trabalho é feito em lotes. Este documento cobre a **organização em grupos** (vale pra todos
  os lotes) e o **sub-lote 1 de "Inserir conteúdo"**: as funções que não dependem de ler o SEI
  nem de buscar conteúdo em sites externos (exceto o TinyURL, por ação explícita do usuário).
- Sub-lotes seguintes, fora deste documento: (2) dados do SEI — dados do processo e campos
  dinâmicos, referência a documentos do processo, link de documento público; (3) fontes
  externas — Google Docs/Planilhas pelo link (o usuário escolheu "buscar pelo link"), link de
  legislação federal (LexML) e municipal de Campinas (precisa de investigação: a Biblioteca
  Jurídica usa IDs internos e carrega a busca por uma segunda chamada).

Critério de sucesso: no editor do SEI de Campinas (4.1.5), os botões aparecem organizados nos
grupos, as cinco funções novas inserem conteúdo no ponto do cursor, e **o conteúdo continua lá
depois de salvar e reabrir o documento**.

## Estado atual (o que já existe)

- `content-scripts/documento_editar/formatacaoBasica.ts` injeta botões em cada `.cke_toolbox`
  (há várias, uma por instância do CKEditor; ver comentário ali sobre a criação sob demanda):
  `criarBotaoToolbar(id, titulo, iconeSvg, aoClicar)` e `montarConjuntoBotoes(editor)`, hoje uma
  lista plana: alinhamento (4), fonte +/−, copiar formatação, maiúscula, tabela rápida, quebra de
  página, sumário, nota de rodapé, equação (LaTeX).
- `EditorSEI` (`ponteEditor.ts`): `obterTextoSelecionado`, `inserirHtml`, `inserirTexto`,
  `aplicarClasseParagrafo`, `corpo`, `documento`, `janela`, `iframe`.
- `dialogoFlutuante.ts`: `criarPainelFlutuante(titulo, icone)`, `criarBotaoDialogo`, `fecharPainel`.
- `features/formatacao-basica/numeracaoParagrafos.ts`: `CLASSES_PARAGRAFO_NUMERADO`, base do
  sumário e da referência interna.
- Ficam como estão, fora da barra: conversão de nº SEI em link (automática) e o botão flutuante
  do Assistente de IA.

## Parte 1 — Grupos na barra

### Comportamento

Cada grupo vira um bloco na `.cke_toolbox` com a mesma estrutura visual dos grupos nativos do
CKEditor 4 (`span.cke_toolbar` > `span.cke_toolgroup` com os `a.cke_button` dentro), e um
separador entre grupos. Ordem dos grupos e dos botões:

| Grupo | Botões |
|---|---|
| Inserir | Checklist · QR Code · Importar Word/HTML · Equação · Sumário |
| Referências e links | Referência interna · Link curto (TinyURL) · Nota de rodapé |
| Formatação | Alinhar (esq., centro, dir., justificado) · Fonte + · Fonte − · Maiúscula · Copiar formatação · Quebra de página |
| Tabelas | Tabela rápida |

Lotes futuros acrescentam botões a esses grupos e o grupo "Imagens".

### Desenho

- `features/editor/grupos.ts` (puro): o registro de grupos — `GRUPOS_BARRA` com `{ id, titulo,
  botoes: IdBotao[] }` na ordem acima — e `organizarEmGrupos(disponiveis: Map<IdBotao, T>):
  Array<{ grupo, itens: T[] }>`, que respeita a ordem do registro, ignora ids sem botão montado e
  omite grupos vazios.
- `formatacaoBasica.ts`: `montarConjuntoBotoes` passa a devolver os botões indexados por id;
  `injetarBotoesSeAusente` monta um bloco por grupo (via `organizarEmGrupos`) em vez de anexar a
  lista plana. Os `id`s DOM atuais dos botões (`seirmg-cke-*`) não mudam.
- Cada bloco recebe `title` com o nome do grupo (leitura por mouse/leitor de tela).

### Testes

- `grupos.test.ts`: ordem, grupos vazios omitidos, id desconhecido ignorado, nenhum id duplicado
  entre grupos.
- `formatacaoBasica.test.ts` (já existe, com toolbox simulada): passa a conferir um bloco por
  grupo, na ordem, cada um com seus botões.

## Parte 2 — As cinco funções

Cada função tem um módulo puro em `features/editor/` (testado) e a montagem do botão/diálogo em
`content-scripts/documento_editar/`.

### 1. Checklist (grupo Inserir)

- Insere `<span class="seirmg-checklist" data-marcado="nao">&#9744;</span>&nbsp;` no cursor. O
  `&nbsp;` deixa o cursor fora da caixa (o texto digitado não entra nela e o Enter não leva a
  caixa pro parágrafo seguinte — problema documentado no módulo do SEI Pro).
- Clique numa `.seirmg-checklist` dentro do corpo do editor alterna ☐ (U+2610) ↔ ☑ (U+2611) e o
  `data-marcado`; avisa o CKEditor da mudança (snapshot) pra entrar no salvar.
- Puro: `montarChecklistHtml()`, `alternarChecklist(estadoAtual) -> { simbolo, marcado }`.

### 2. QR Code (grupo Inserir)

- Diálogo: campo de texto/link (pré-preenchido com a seleção se ela for um link) e tamanho
  (pequeno 100 px, médio 150 px, grande 200 px); prévia ao vivo; botão Inserir.
- Geração local com `qrcode-generator` (MIT, sem rede): `createDataURL` produz imagem GIF em
  data URI sem depender de `<canvas>` (testável em jsdom). Correção de erro nível M.
- Insere `<img class="seirmg-qrcode" src="data:image/gif;base64,..." width=... height=... alt="QR Code: <texto>">`.
- Texto vazio ou longo demais pra um QR (limite da biblioteca no nível M) → mensagem no diálogo,
  sem inserir.
- Puro: `gerarQrCodeDataUrl(texto, tamanho)`, `montarQrCodeHtml(texto, tamanho)`.
- **Risco**: o SEI de Campinas manter `<img>` com data URI depois de salvar. Verificação no SEI
  real é a primeira coisa da implementação (ver "Verificação"); se o SEI remover, decidir o
  formato alternativo antes de seguir.

### 3. Link curto — TinyURL (grupo Referências e links)

- Diálogo: URL (pré-preenchida com a seleção se for um link), nome personalizado opcional
  (validado: letras, números e hífen), aviso "o link será enviado ao serviço TinyURL".
- Chamada só no clique de Gerar: `GET https://tinyurl.com/api-create.php?url=<url>[&alias=<nome>]`
  (resposta em texto puro: o link curto, ou `Error` / HTTP de erro). Feita pelo background (o
  editor roda numa página do SEI): mensagem nova `seirmg:fetch-externo`, que só aceita hosts de
  uma lista permitida (`tinyurl.com` neste lote; os sub-lotes seguintes acrescentam os seus).
- `manifest.config.ts`: `https://tinyurl.com/*` em `host_permissions`.
- Insere `<a href="<link curto>">texto</a>`: o texto é a seleção atual ou, sem seleção, o próprio
  link curto. Erros (alias já usado, URL inválida, falha de rede) aparecem no diálogo.
- Puro: `validarAlias`, `montarUrlTinyUrl(url, alias?)`, `interpretarRespostaTinyUrl(status, corpo)`,
  e a checagem de host permitido de `seirmg:fetch-externo`.

### 4. Referência interna (grupo Referências e links)

- Diálogo lista os parágrafos numerados do corpo (classes de `CLASSES_PARAGRAFO_NUMERADO`), cada
  um com número de exibição e começo do texto; seleção múltipla; prefixo opcional (texto livre,
  ex.: `item`, `art.`); opção "sem prefixo".
- Ao inserir:
  - cada parágrafo escolhido ganha (se ainda não tem) uma âncora `<a name="seirmg-ref-<id>"></a>`
    no início, com id aleatório estável;
  - no cursor entra o texto da referência, cada número como link interno
    `<a href="#seirmg-ref-<id>" class="seirmg-ref-interna" data-prefixo="...">item 3</a>`, com a
    junção em português: "item 3", "itens 3 e 5", "itens 3, 5 e 7" (prefixo no plural quando
    houver mais de um e o prefixo for `item`/`art.`; outros prefixos ficam como digitados);
  - as referências que já existem no documento são atualizadas com a numeração atual (o número
    de cada uma é recalculado pela posição do parágrafo-alvo).
- Puro: `listarParagrafosNumerados(paragrafos)`, `montarTextoReferencia(numeros, prefixo)`,
  `montarReferenciaHtml(...)`, `numeroAtualDaAncora(...)`.

### 5. Importar Word e HTML (grupo Inserir)

- Botão abre o seletor de arquivo (`.docx`, `.html`, `.htm`).
- `.docx`: convertido localmente com `mammoth` (BSD-2, sem rede) → HTML. `.html`: lido como texto.
- Limpeza (puro, `limparHtmlImportado`): mantém só `p, br, strong, b, em, i, u, s, sub, sup, ul,
  ol, li, table, thead, tbody, tr, th, td, a[href], h1-h6, img[src^="data:image/"]`; remove
  scripts, estilos, classes e atributos de evento; `a` só com `http(s):`/`mailto:`; desembrulha
  (mantém o conteúdo) elementos não permitidos.
- Estilos do SEI (puro, `aplicarEstilosSei`), usando classes que existem no SEI 4.1:
  `p` → `<p class="Texto_Justificado">`; `h1` → `<p class="Texto_Fundo_Cinza_Maiusculas_Negrito">`;
  `h2`–`h6` → `<p class="Texto_Fundo_Cinza_Negrito">`; `table` → `<table class="Tabela"
  style="border-collapse:collapse;width:100%;">` (mesmo formato da tabela rápida), com o texto de
  cada célula em `<p class="Tabela_Texto_Alinhado_Esquerda">`; listas mantêm `ul`/`ol`/`li`.
- Insere no cursor via `inserirHtml`. Arquivo vazio/ilegível → mensagem, nada inserido.
- Imagens do Word entram como data URI, sujeitas ao mesmo risco do QR Code.

## Dependências novas

- `qrcode-generator` (MIT) — geração de QR local.
- `mammoth` (BSD-2-Clause) — conversão de `.docx` local.

Ambas carregam só no clique (import dinâmico), pra não pesar o carregamento do editor.

## Erros e privacidade

- Nenhum conteúdo do documento sai do navegador, exceto a URL que o usuário manda encurtar no
  TinyURL, com aviso no próprio diálogo.
- Toda falha aparece no diálogo da função (não em `alert`), e é registrada com `console.error`
  com prefixo `[SEIRMG]`, como no resto da extensão.

## Verificação

1. Testes automatizados de toda a lógica pura (listada em cada função) e da organização em grupos.
2. Chromium com um editor simulado (CKEditor 4 numa página de teste): botões nos grupos certos,
   cada função inserindo o conteúdo esperado.
3. **SEI real (HMMG/Campinas, 4.1.5)**, primeiro de tudo: inserir um `<img>` data URI pequeno,
   salvar e reabrir o documento, pra confirmar que o SEI mantém imagem embutida. Depois, as cinco
   funções, salvando e reabrindo.

## Fora do escopo

- Sub-lotes 2 e 3 de "Inserir conteúdo", e os lotes de formatação/impressão e imagens/links.
- Mover o Assistente de IA ou a conversão de nº SEI para a barra.
- Editor CKEditor 5 (SEI 5): o SEI de Campinas é 4.1.5 (CKEditor 4).
