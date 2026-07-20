# SEIRMG — Tabela Rápida (grade + catálogo de estilos) e diálogos do editor — Design

> Início do Lote J (`docs/ROADMAP-LOTES.md`), escopo restrito por decisão do usuário: só a Tabela
> Rápida (já entregue no Lote I com uma versão simplificada baseada em `window.prompt`) + os outros
> dois diálogos do editor que ainda usam `window.prompt`/botões crus (Nota de Rodapé, Equação LaTeX).
> QR Code e Hashcode ficam explicitamente fora desta e de qualquer implementação futura do Lote J,
> por pedido direto do usuário. O resto do Lote J (referências internas, campos dinâmicos, etc.) fica
> pra uma conversa futura.

## Contexto

`montarBotaoTabelaRapida` (`content-scripts/documento_editar/formatacaoBasica.ts`) hoje encadeia três
`window.prompt()` (linhas, colunas, id de estilo digitado como texto) — uma simplificação deliberada
do Lote I, documentada no plano daquele lote. `montarBotaoNotaRodape` usa um quarto `window.prompt()`
pro texto da nota. O diálogo de Equação (`latex.ts`) já é um painel flutuante de verdade, mas com
botões sem nenhum estilo — nenhum dos três usa o padrão visual (ícone no cabeçalho, botões
`seirmg-btn-acao`) já estabelecido hoje no painel lateral da árvore e no popup.

O usuário pediu pra portar a experiência real do Sei Pro pra Tabela Rápida: uma grade visual (passa o
mouse, escolhe linhas×colunas, clica) e um catálogo rico de estilos (cor + padrão estrutural), em vez
da versão simplificada atual. Investigação do CSS real do Sei Pro encontrou a técnica deles pro
catálogo (sprite de 21 padrões × `filter: hue-rotate()` pra gerar 10 variações de cor da mesma
imagem) — mas **decisão explícita do usuário: não reusar o asset deles**, mesma linha já seguida
antes com ícones (Font Awesome Pro → Lucide). Os padrões e cores abaixo são desenho próprio,
renderizados como tabelas HTML reais (não imagens), mesmo espírito (rico, com cor) sem copiar nada.

## Decisões validadas com o usuário (2026-07-20, com mockup aprovado)

Mockup: https://claude.ai/code/artifact/82020ae6-d7b1-409c-8cd3-ff73607a3816

- **Grade de inserção:** tamanho **fixo** 10 colunas × 8 linhas (não cresce dinamicamente ao passar o
  mouse como o Sei Pro original — simplificação deliberada, evita ter que mutar a grade em tempo real;
  10×8 já cobre a grande maioria dos casos de uso). Passa o mouse destaca as células até a posição
  atual + mostra "R × C"; clica avança pro diálogo de estilo (não insere ainda).
- **Diálogo de estilo:** paleta de 9 cores (cinza/azul/verde/laranja/vermelho/roxo/rosa/petróleo/dourado,
  valores hex fixos, curados à mão — não gerados por rotação de matiz) × 7 padrões estruturais
  (abaixo). Cancelar fecha sem inserir nada (a tabela só é inserida ao clicar Aplicar — nada é
  inserido no clique da grade). Aplicar monta o HTML final (linhas×colunas + padrão + cor) numa
  chamada só e insere.
- **Nota de Rodapé:** troca o `prompt()` por um painel flutuante com textarea + Cancelar/Inserir.
- **Equação (LaTeX):** mesmo texto/comportamento de hoje, só re-estilizado (cabeçalho com ícone,
  botões `Cancelar`/`Inserir` no padrão novo em vez de `<button>` cru).
- **Sem "restilizar depois"**: diferente do Sei Pro (que tem um botão separado "Estilo de tabela" pra
  reaplicar estilo numa tabela já existente, habilitado só quando o cursor está dentro de uma), aqui é
  um fluxo único (grade → estilo → insere já formatada). Reestilizar uma tabela já inserida fica fora
  de escopo — pode virar um pedido futuro.

## Arquitetura

### `features/formatacao-basica/tabelaRapida.ts` (reescrito)

Remove `CATALOGO_ESTILOS_TABELA`/`aplicarEstiloTabelaHtml`. Novo conteúdo:

```ts
export interface CorTabela {
  id: string
  nome: string
  hex: string
}

export const CORES_TABELA: CorTabela[] = [
  { id: 'cinza', nome: 'Cinza', hex: '#94a3b8' },
  { id: 'azul', nome: 'Azul', hex: '#017fff' },
  { id: 'verde', nome: 'Verde', hex: '#17875a' },
  { id: 'laranja', nome: 'Laranja', hex: '#b5530a' },
  { id: 'vermelho', nome: 'Vermelho', hex: '#b3261e' },
  { id: 'roxo', nome: 'Roxo', hex: '#7c3aed' },
  { id: 'rosa', nome: 'Rosa', hex: '#c026a3' },
  { id: 'petroleo', nome: 'Petróleo', hex: '#0d9488' },
  { id: 'dourado', nome: 'Dourado', hex: '#ca8a04' },
]

export type PadraoTabelaId =
  | 'simples' | 'bordas' | 'bordas-grossas'
  | 'cabecalho-solido' | 'cabecalho-leve' | 'zebra' | 'cabecalho-zebra'

export interface PadraoTabela {
  id: PadraoTabelaId
  nome: string
  usaCor: boolean
}

export const PADROES_TABELA: PadraoTabela[] = [
  { id: 'simples', nome: 'Simples', usaCor: false },
  { id: 'bordas', nome: 'Com bordas', usaCor: false },
  { id: 'bordas-grossas', nome: 'Bordas grossas', usaCor: true },
  { id: 'cabecalho-solido', nome: 'Cabeçalho sólido', usaCor: true },
  { id: 'cabecalho-leve', nome: 'Cabeçalho leve', usaCor: true },
  { id: 'zebra', nome: 'Linhas alternadas', usaCor: true },
  { id: 'cabecalho-zebra', nome: 'Cabeçalho + zebra', usaCor: true },
]

export function clarearHex(hex: string, fator: number): string
export function calcularEstiloCelula(padraoId: PadraoTabelaId, corHex: string, indiceLinha: number): string
export function montarTabelaHtml(
  linhas: number,
  colunas: number,
  padraoId?: PadraoTabelaId, // default 'simples'
  corId?: string // default 'cinza'
): string
```

- `clarearHex`: mistura a cor com branco por um fator (0-1) — usado pra gerar o tom claro de fundo em
  `cabecalho-leve`/`zebra`/`cabecalho-zebra`.
- `calcularEstiloCelula`: retorna a string `style` inline de UMA célula, dado o padrão, a cor (hex) e o
  índice da linha (0 = cabeçalho). `bordas-grossas` aplica borda de 2px em todas as células (não só as
  externas — simplificação deliberada, evita ter que saber a posição de coluna também).
- `montarTabelaHtml`: monta o HTML final da tabela, célula por célula, cada uma já com o `style`
  calculado — substitui `montarTabelaHtml` + `aplicarEstiloTabelaHtml` de hoje numa função só.

### `content-scripts/documento_editar/dialogoFlutuante.ts` (novo)

Helper compartilhado pelos 3 diálogos (grade, estilo, nota de rodapé) e reaproveitado pelo de LaTeX
(que já existe, só passa a usar isso em vez do HTML cru que tem hoje):

```ts
export function criarPainelFlutuante(titulo: string, iconeSvg: string): { painel: HTMLDivElement; corpo: HTMLDivElement }
export function criarBotaoDialogo(texto: string, iconeSvg: string, classeExtra?: string): HTMLButtonElement
export function fecharPainel(painel: HTMLElement): void
```

CSS compartilhado (injetado via `injetarEstiloSeAusente`, mesmo padrão já usado por `latex.ts`):
painel branco arredondado com sombra (mesma receita visual já usada no painel de Anotações/árvore —
`seirmg-secao-cabecalho`-like: ícone azul + título em maiúsculas pequenas), botões via
`.seirmg-btn-acao`/`.seirmg-btn-acao-primario` (mesmas classes/visual já definidas em `theme.css` pro
painel de Anotações — repetidas aqui porque esses diálogos são injetados no documento do editor
(`editor.documento`) ou no `document` de topo, não necessariamente onde `theme.css` já está injetado).

### `content-scripts/documento_editar/tabelaDialogo.ts` (novo)

```ts
export function abrirGradeInsercao(editor: EditorSEI): void
```

- Cria o painel flutuante (10×8 células), em posição fixa (mesmo canto já usado pelo diálogo de LaTeX,
  `top:80px; right:20px`) — mesma simplificação já aceita naquele diálogo, evita ter que calcular a
  posição do botão na toolbar (que fica no documento de topo, fora do iframe do editor).
- `mouseover` numa célula: marca como "ativa" todas as células com linha ≤ e coluna ≤ à célula sob o
  mouse (mesmo efeito visual do Sei Pro, sem crescer a grade); atualiza o texto "R × C".
- `click` numa célula: fecha a grade, chama `abrirDialogoEstilo(editor, linhas, colunas)`.
- Fecha ao clicar fora (`click` no `document`, fora do painel) ou `Escape`.

```ts
function abrirDialogoEstilo(editor: EditorSEI, linhas: number, colunas: number): void
```

- Painel com paleta de cores (9 `<button>` circulares, `aria-pressed` no selecionado) + grade 2 colunas
  de padrões (preview real: uma tabelinha HTML pequena com o `calcularEstiloCelula` aplicado, não uma
  imagem) + `Cancelar`/`Aplicar`.
- Estado inicial: `padraoId='simples'`, `corId='cinza'` já selecionados (Aplicar utilizável de
  imediato, sem obrigar escolha).
- `Aplicar`: `editor.inserirHtml(montarTabelaHtml(linhas, colunas, padraoEscolhido, corEscolhida))`,
  fecha o painel.
- `Cancelar`: fecha sem inserir nada.

### `content-scripts/documento_editar/notaRodapeDialogo.ts` (novo)

```ts
export function abrirDialogoNotaRodape(aoConfirmar: (texto: string) => void): void
```

Painel com `<textarea>` + `Cancelar`/`Inserir`. Substitui o `window.prompt('Texto da nota de
rodapé:')` em `montarBotaoNotaRodape` — o callback (`aoConfirmar`) recebe o texto só quando o usuário
confirma, preservando a lógica de numeração/inserção que já existe em `formatacaoBasica.ts`.

### `content-scripts/documento_editar/latex.ts` (modificado)

Troca a construção manual do `<div>`/`<button>` por `criarPainelFlutuante`/`criarBotaoDialogo`
(mesmo header com ícone `sigma`, mesmos botões `Cancelar`/`Inserir` no padrão novo). Nenhuma mudança
de comportamento (preview ao vivo, erro de sintaxe, inserir/cancelar continuam iguais).

### `content-scripts/documento_editar/formatacaoBasica.ts` (modificado)

- `montarBotaoTabelaRapida`: substitui o corpo inteiro (3 prompts) por `abrirGradeInsercao(editor,
  botao)`.
- `montarBotaoNotaRodape`: substitui `window.prompt(...)` por `abrirDialogoNotaRodape((texto) => {
  ...lógica de numeração/inserção que já existe... })`.

## Fora de escopo

- QR Code, Hashcode (decisão explícita do usuário — nem entram em implementações futuras do Lote J
  sem pedido novo).
- Reestilizar uma tabela já existente (botão separado, como o Sei Pro tem) — fluxo único por agora.
- Grade que cresce dinamicamente além de 10×8.
- Resto do Lote J (referências internas, ~30 campos dinâmicos, marca d'água, sigilo/tarjas, etc.).

## Testes

`tabelaRapida.test.ts` reescrito: `clarearHex` (mistura correta em alguns fatores conhecidos),
`calcularEstiloCelula` (cada padrão, linha 0 vs. linha ímpar/par, com/sem `usaCor`),
`montarTabelaHtml` (número de linhas/células continua correto, `style` de cada célula bate com
`calcularEstiloCelula`, defaults `simples`/`cinza` quando parâmetros omitidos). Wiring nos 3 arquivos
de content script sem teste automatizado, mesmo padrão já estabelecido no projeto — verificado via
`tsc --noEmit`/`bun run test`/`bun run build` e depois validação manual numa instância SEI real.
