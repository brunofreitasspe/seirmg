# SEIRMG — Painel de Favoritos: enriquecer linhas com marcador, prazo, atribuição e especificação

> Spec resultante de brainstorming em 2026-07-11 (com mockups visuais aprovados). É um
> incremento sobre `docs/superpowers/specs/2026-07-10-seirmg-lote-l-favoritos-nucleo-design.md`
> (já entregue) — não reabre nenhuma decisão daquela spec, só enriquece a linha do painel
> de Favoritos com dados que já são calculados hoje para as linhas nativas da tabela, mas
> nunca chegavam ao painel.

## Contexto

O painel de Favoritos (Lote L núcleo) hoje mostra, por item, só: NUP (link), selo "aberto
na sua caixa"/"fechado" e botão de remover. O usuário reportou que isso é pouco — quer ver,
na mesma linha, o que já existe nas outras funcionalidades do Controle de Processos:
marcador(es), prazo, atribuição e especificação.

## Decisões validadas com o usuário (2026-07-11, sessão com mockups visuais)

- Layout: tabela (não cartão) com colunas **Processo | Marcadores | Prazo | Atribuição |
  (remover)** — mockup "opção D" (mistura do formato tabular com os ícones/badges
  coloridos usados no mockup "A").
- **Prazo mostra dias E a data de vencimento** juntos (ex.: "⏰ 45 dias" / "vence
  25/08/2026"), não só a contagem de dias que a tabela nativa mostra hoje.
- Texto longo (marcador ou especificação) **quebra linha, nunca trunca** — a linha cresce
  em altura, mas a informação nunca fica escondida atrás de reticências/tooltip.
- Restrição de dados aceita: marcador/prazo/atribuição só existem pra favoritos
  **"aberto na sua caixa"** (presentes numa das 3 tabelas da página atual), porque são
  extraídos ao vivo do HTML nativo daquela linha — não há como calculá-los pra um
  favorito "fechado" sem essa linha disponível.
- Para favoritos **"fechados"**: linha "achatada" — processo + especificação ocupam o
  espaço das colunas Marcadores/Prazo/Atribuição (`colspan`), só a estrela de remover
  fica na coluna própria. Não mostra "—" repetido nessas colunas.
- Incluir o indicador nativo do SEI de "documento novo/pendente" (ícone de triângulo
  amarelo com "!" preto) ao lado da estrela, quando presente na linha nativa de um
  favorito aberto.

## Arquitetura

### Fonte dos dados novos (reaproveitamento, sem nova extração)

Tudo já é calculado por código existente em `src/features/controle-processos/` a partir
do mesmo `onmouseover` nativo dos marcadores (`td > a[href*='acao=andamento_marcador_gerenciar']`)
e do link de atribuição (`td:nth-child(4) a`). O painel de Favoritos passa a chamar essas
mesmas funções para a linha do favorito, quando ela existe na página atual:

- **Marcadores** (lista completa, não só o primeiro): para cada `<a>` de marcador da
  linha, `extrairNomeMarcador(onmouseover)` (`features/controle-processos/agrupamento.ts`,
  já usado pelo agrupamento por marcador) dá o nome de cada um. Renderiza uma pílula por
  marcador (mesmo estilo visual do mockup aprovado); sem marcador → célula com "—".
- **Prazo**: para os dois tipos configurados (`qtddias`/`prazo`, mesmos de
  `definirTiposPrazo` em `index.ts`, respeitando `config.controleProcessos.prazos.ativo` e
  `exibirDias`/`exibirPrazo`), `calcularDiasDoMarcador` (`features/controle-processos/prazos.ts`)
  já calcula a diferença em dias a partir da data do marcador — mas descarta a `Date`
  depois de calcular. **Refatorar `prazos.ts`** pra expor também a data parseada (ex.:
  extrair um `extrairDataDoMarcador(textosMarcadores, tipo, agora): Date | null`
  compartilhado, do qual `calcularDiasDoMarcador` passa a derivar o número de dias — sem
  duplicar a lógica de parsing). O painel mostra "N dias" (cor por `classificarPrazo`,
  mesmos limites de alerta/crítico já configurados) + "vence dd/mm/aaaa" pro tipo `prazo`,
  ou "N dias" + "desde dd/mm/aaaa" pro tipo `qtddias`. Sem marcador de prazo → "—".
- **Atribuição**: reaproveita a função privada `obterTextoAtribuido(linha)` já existente em
  `index.ts` (usada hoje pelo filtro de atribuição e pelo agrupamento por responsável).
  Sem atribuição → "—".
- **Especificação**: reaproveita `extrairEspecificacaoParaExibicao`
  (`features/controle-processos/especificacao.ts`), já usada hoje pra mostrar a
  especificação embaixo do processo na tabela nativa. Sem especificação → célula/trecho
  simplesmente omitido (não mostra "—" pra isso, é o comportamento atual já aceito).
- **Indicador de documento novo/pendente**: ícone nativo do SEI (triângulo amarelo, "!"
  preto) já presente no HTML da linha nativa quando aplicável — a extensão só precisa
  localizá-lo e clonar/reinserir ao lado da estrela. **Seletor exato não verificado nesta
  spec** (ver Riscos).

### Quando NÃO há a linha nativa (favorito "fechado")

`renderizarPainelFavoritos` já calcula `nupsAbertosNaPagina()` pra decidir o selo
aberto/fechado. Essa mesma checagem decide o modo de renderização da linha:

- **Aberto**: busca a linha nativa correspondente (mesmo seletor usado em
  `nupsAbertosNaPagina`, guardando a referência ao `Element` em vez de só o NUP) e extrai
  marcadores/prazo/atribuição/indicador dela.
- **Fechado**: renderiza só `<td colspan="4">` com processo + especificação (se o
  `FavoritoProcesso` tiver especificação guardada — ver abaixo) + célula de remover. Não
  tenta calcular marcador/prazo/atribuição.

### Especificação de um favorito "fechado"

Hoje `FavoritoProcesso` só guarda `{ numero, link, adicionadoEm }`. Pra mostrar
especificação mesmo quando o favorito está fechado (não há linha nativa pra extrair na
carga atual), **capturar a especificação no momento de favoritar** (quando a linha nativa
com o `onmouseover` está disponível) e persistir: `FavoritoProcesso.especificacao?: string`.
Favoritos já existentes antes desta mudança simplesmente não têm o campo (`undefined`) —
tratado igual a "sem especificação", sem migração necessária.

### Estrutura da linha do painel (tabela)

Colunas: **Processo | Marcadores | Prazo | Atribuição | (estrela remover)**. Cabeçalho
(`<thead>`) fixo com esses rótulos. Larguras via `<colgroup>` (evita reflow ao trocar
conteúdo). CSS novo em `ESTILO_FILTROS_E_ESPECIFICACAO` (mesmo `<style>` já injetado uma
vez no bootstrap): pílulas de marcador (`background`/`color` por classificação — reaproveita
paleta já usada por `infraTrseippalerta`/`infraTrseippcritico` pra manter consistência
visual com o resto da página), texto de prazo colorido pela mesma classificação.

## Testes

Lógica pura testável (sem DOM), seguindo o padrão já usado no projeto (funções em
`features/controle-processos/*.ts`, wiring de DOM em `index.ts` sem teste direto):

- `prazos.ts`: `extrairDataDoMarcador` (nova) — mesmos casos de `calcularDiasDoMarcador`,
  mas retornando a `Date` (ou `null`); `calcularDiasDoMarcador` passa a ser implementado
  em cima dela (teste de regressão garante que os resultados de dias não mudam).
- `favoritos.ts`: nova função pura pra decidir o modo de renderização da linha (aberto
  com dados vs. fechado achatado), recebendo os dados já extraídos (mesma filosofia de
  `calcularOcultacaoPorFavorito`: função pura recebe dados simples, não faz
  `querySelector`).

## Riscos / verificação pendente

- **Indicador de documento novo/pendente (triângulo amarelo)**: seletor/classe exata do
  ícone nativo não foi identificada no código-fonte já lido do projeto (`sei-pro.js`) nem
  confirmada — precisa validação numa instância SEI real antes de implementar, mesmo
  tratamento de risco já documentado no Lote F (`docs/superpowers/specs/2026-07-07-seirmg-lote-f-acoes-lote-design.md`).
  Se o seletor não puder ser confirmado com segurança, este item específico fica de fora
  da implementação (o resto do enriquecimento — marcador/prazo/atribuição/especificação —
  não depende dele).

## Fora de escopo

- Qualquer mudança na spec do núcleo (favoritar/desfavoritar, ocultação da linha nativa,
  ordenação por data) — só a renderização do painel muda.
- Edição de marcador/prazo/atribuição a partir do painel de Favoritos (somente leitura,
  como as outras funcionalidades de Controle de Processos).
- Reordenação manual do painel — continua por data de favoritação (decisão do núcleo).
