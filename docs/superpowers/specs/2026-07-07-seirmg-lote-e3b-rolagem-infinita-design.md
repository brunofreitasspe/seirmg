# SEIRMG — Lote E3b: Rolagem Infinita em Controle de Processos — Design

## Contexto

Item `E3b` do `docs/ROADMAP-LOTES.md`, desmembrado do Lote E3 original por risco. Porta a funcionalidade "Rolagem infinita na pesquisa de processos" do Sei Pro (`pages/ROLAGEMINFINITA.md`), investigada a partir do código-fonte real e legível `C:\sei\seipro\dist\js\sei-pro.js:465-899`.

**O mecanismo real não é scroll incremental.** É remoção de paginação: ao carregar a tela de Controle de Processos, se a opção estiver ativa, a extensão busca recursivamente todas as páginas restantes via POST ao `frmProcedimentoControlar` (com um campo oculto de página sobrescrito) e concatena as linhas retornadas na tabela existente, escondendo os controles de paginação nativa. O nome "rolagem infinita" descreve o efeito visual (processo único, sem clicar em "próxima página"), não a técnica.

**Bug identificado e corrigido no porte.** O original só coleta `tr.infraTrClara` ao concatenar páginas (`sei-pro.js:849`), descartando silenciosamente linhas com classe `infraTrEscura` ou `trVermelha` — classes reais já tratadas em `filtroBloco.ts:10-12` deste projeto. O SEIRMG coleta as três.

**Decisão de escopo (usuário, ver histórico da sessão):** reaplicar todos os tratamentos já existentes (prazos, cor por especificação, especificação na listagem, filtros, ordenação do Lote E3) nas linhas carregadas via rolagem infinita — exceto seleção múltipla, que fica desabilitada nessas linhas, replicando a própria cautela do Sei Pro original (ver seção Risco).

## Risco (mesmo tratamento do Lote F — portar documentando)

- Dependemos de nomes de campo internos do SEI não documentados: `hdn{tipo}PaginaAtual`, `hdn{tipo}NroItens`, e da estrutura `#div{tipo}AreaPaginacaoSuperior` / `#div{tipo} .infraAreaPaginacao`. Nada disso é verificável sem uma instância SEI real.
- O original deixa dois campos ocultos (`hdn{tipo}Itens`, `hdn{tipo}ItensHash`) propositalmente desatualizados ao concatenar páginas (linhas comentadas no próprio código-fonte: `//Itens_.val(...)`, `//ItensHash_.val(...)`). O SEIRMG preserva esse comportamento por não ter como verificar seu propósito real sem instância ao vivo.
- Essa mesma desatualização é, com grande probabilidade, o motivo pelo qual o **próprio autor do Sei Pro desabilita a seleção via checkbox** nas linhas carregadas por essa via (`sei-pro.js:852`, com tooltip pedindo para desativar a opção antes de selecionar) — evidência de que ações em lote sobre essas linhas podem falhar na validação nativa do SEI (hash de itens selecionados não bateria com o que o servidor espera). O SEIRMG replica essa mesma cautela (ver "Seleção desabilitada" abaixo) em vez de expor o risco ao usuário sem proteção.
- Ao final da varredura (página vazia), o original dispara um POST de "reset" fire-and-forget (`hdn{tipo}PaginaAtual = 0`) cujo propósito exato não é claro sem instância ao vivo. Portado por paridade, sem bloquear o fluxo (não aguardado).

## Escopo

- Só as tabelas **Recebidos** e **Gerados** (`#tblProcessosRecebidos`, `#tblProcessosGerados`) — a tabela **Detalhado** não tem paginação removível na fonte original (só verifica `#divRecebidosAreaPaginacaoSuperior`/`#divGeradosAreaPaginacaoSuperior`).
- Config novo, opt-in, padrão desligado (`ativo: false`) — igual ao original ("não vem ativada por padrão").
- Fora de escopo: agrupamento de lista (Lote G2b) e qualquer outra tabela do sistema além de Controle de Processos.

## Arquitetura

### 1. Lógica pura nova — `features/controle-processos/rolagemInfinita.ts` (testada)

```ts
export function extrairCamposOcultos(form: HTMLFormElement): Record<string, string>
export function extrairLinhasValidas(doc: Document, idTabela: string): Element[]
export function extrairNroItens(doc: Document, tipo: string): number | null
```

- `extrairCamposOcultos`: coleta genericamente todo `input[type="hidden"]` do formulário cujo atributo `id` contenha `"hdn"` E que tenha `name`, retornando `{name: value}`. Sem lista fixa de nomes de campo (mesma estratégia genérica do original) — resiliente a campos que não conhecemos.
- `extrairLinhasValidas`: dentro de `doc.querySelector(idTabela)`, retorna as `<tr>` do `tbody` cuja classe seja `infraTrClara`, `infraTrEscura` ou `trVermelha` (as três, ao contrário do original). Retorna `[]` se a tabela não existir no documento.
- `extrairNroItens`: lê `#hdn{tipo}NroItens` do documento parseado e retorna o número, ou `null` se o campo não existir ou não for numérico.

### 2. Refatoração de `content-scripts/procedimento_controlar/index.ts` (não testada, convenção já estabelecida)

As três funções que hoje aplicam tratamento a **todas** as linhas da tabela de uma vez (`aplicarPrazos`, `aplicarCorProcesso`, `aplicarEspecificacao`) não são idempotentes: rodar de novo duplicaria cabeçalho (`aplicarPrazos`) ou `<span>`s (`aplicarEspecificacao` no modo "mostrar"). Cada uma é dividida em duas:

- `aplicar<X>EmLinhas(config, linhas: Element[]): void` — a lógica por-linha extraída, aceitando explicitamente o subconjunto de linhas a tratar. Já checa `ativo`/flags internamente.
- `aplicar<X>(config)` (assinatura existente, comportamento idêntico ao atual) — mantém a criação de cabeçalho quando aplicável (só `aplicarPrazos`) e delega o corpo por-linha para `aplicar<X>EmLinhas(config, linhasDaTabela(idTabela))`.

Isso é um refactor comportamento-preservando (extração de função), sem mudança de comportamento no caminho já existente — por isso não precisa de novos testes (as três já não são testadas, por serem wiring de DOM).

O código de ordenação do Lote E3 (`ordenarTabelaPelaColuna`) recebe o mesmo tratamento: a parte "decide a direção por toggle" é separada da parte "aplica uma direção explícita", nascendo:

```ts
function aplicarOrdenacaoNaTabela(idTabela, indiceColuna, direcao, headers): void  // aplica direção explícita, sem decidir
function ordenarTabelaPelaColuna(idTabela, indiceColuna, headers): void            // decide direção (toggle) e delega
function reaplicarOrdenacaoAtual(idTabela): void                                    // reaplica a direção já ativa, sem alternar
```

`reaplicarOrdenacaoAtual` não faz nada se não houver ordenação ativa para aquela tabela (`estadoOrdenacaoPorTabela.get(idTabela)` vazio).

### 3. Reaproveitamento dos filtros já existentes (registro de callbacks)

`montarBuscaRapida`, `montarFiltroAtribuicao` e `montarFiltroBloco` já releem a tabela inteira do zero a cada chamada de suas funções internas de aplicação (`atualizar`, `aplicar`, `aplicarFiltroBloco`) — não haveria diferença nenhuma se essas mesmas funções forem chamadas de novo depois que linhas novas chegarem. Cada uma passa a registrar um fechamento sem argumento (lembrando o último valor aplicado) num array module-level:

```ts
const reaplicarFiltrosAposNovasLinhas: Array<() => void> = []
```

- `montarBuscaRapida` registra `() => atualizar()` (já lê `inputBusca.value` toda vez).
- `montarFiltroAtribuicao` registra `() => aplicar(select.value)`.
- `montarFiltroBloco` passa a guardar o último `numeros` aplicado numa variável (`ultimoNumerosBloco`) e registra `() => aplicarFiltroBloco(ultimoNumerosBloco)`.

### 4. Seleção desabilitada nas linhas novas (medida de segurança, ver Risco)

```ts
function desabilitarSelecaoNaLinha(linha: Element): void
```

Desabilita o checkbox da linha (`input.infraCheckbox`) e adiciona tooltip nativo (`onmouseover`/`onmouseout` com `infraTooltipMostrar`/`infraTooltipOcultar`, mesmo padrão já usado em outros pontos do projeto) explicando que a seleção requer desativar a rolagem infinita nas Opções. Chamada em toda linha recém-carregada, antes de qualquer outro tratamento.

### 5. Orquestração — nova em `content-scripts/procedimento_controlar/index.ts`

```ts
async function iniciarRemocaoPaginacao(tipo: 'Recebidos' | 'Gerados', idTabela: string, config: SyncConfig): Promise<void>
async function buscarProximasPaginas(tipo, idTabela, form, config, indice: number): Promise<void>
function reaplicarTratamentosNasLinhasNovas(idTabela, config, linhas: Element[]): void
```

Fluxo de `iniciarRemocaoPaginacao`:
1. Se não há link de paginação visível (`#div{tipo}AreaPaginacaoSuperior a` ausente) → nada a fazer, retorna.
2. Se o campo `hdn{tipo}PaginaAtual` indica página > 0 (usuário navegou direto pra página 2+) → zera o campo e recarrega a página via `form.submit()` (mesmo comportamento do original — a varredura só faz sentido a partir da página 1).
3. Caso contrário: esconde os controles de paginação (`#div{tipo} .infraAreaPaginacao a, select`) e inicia `buscarProximasPaginas(tipo, idTabela, form, config, 1)`.

Fluxo de `buscarProximasPaginas` (recursivo):
1. Monta os parâmetros via `extrairCamposOcultos(form)`, sobrescrevendo `hdn{tipo}PaginaAtual` com `indice`.
2. `fetchText(form.action, { method: 'POST', body: new URLSearchParams(campos) })` (reaproveita `lib/result.ts`, já usado em outros lotes — sem dependência nova).
3. Se a resposta falhar → loga e para (sem recursão infinita).
4. Faz parse da resposta com `DOMParser`, extrai linhas válidas com `extrairLinhasValidas`.
5. Se não houver linhas → dispara o POST de reset fire-and-forget (ver Risco) e encerra a recursão.
6. Se houver linhas → `document.adoptNode` em cada uma (vêm de um `Document` parseado à parte) e anexa ao `tbody` real; atualiza `hdn{tipo}NroItens` somando ao valor anterior; atualiza a legenda via `atualizarCaption` (já existente, mesmo formato "N registros:"); chama `desabilitarSelecaoNaLinha` em cada linha nova; chama `reaplicarTratamentosNasLinhasNovas` (prazos, cor, especificação, filtros, ordenação — nessa ordem); recursa para `indice + 1`.

`bootstrap()` ganha, depois de `aplicarEspecificacao(...)`:

```ts
if (config.controleProcessos.rolagemInfinita.ativo) {
  [
    { tipo: 'Recebidos' as const, idTabela: '#tblProcessosRecebidos' },
    { tipo: 'Gerados' as const, idTabela: '#tblProcessosGerados' },
  ].forEach(({ tipo, idTabela }) => {
    iniciarRemocaoPaginacao(tipo, idTabela, config).catch((error) => {
      console.error(`[SEIRMG] Falha ao iniciar remoção de paginação (${tipo}):`, error)
    })
  })
}
```

### 6. Config — `lib/storage.ts`

```ts
export interface RolagemInfinitaConfig {
  ativo: boolean
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
}
```

`DEFAULT_SYNC_CONFIG.controleProcessos.rolagemInfinita = { ativo: false }`.

### 7. Opções — `options/index.html` + `options/main.ts`

Novo bloco na aba "Processos", depois de "Ponto de Controle":

```html
<h3>Rolagem infinita</h3>
<label>
  <input type="checkbox" id="processos-rolagem-infinita-ativo" />
  Ativar rolagem infinita (remover paginação e carregar todos os processos)
</label>
```

`carregarAbaProcessos` em `main.ts` lê/grava `config.controleProcessos.rolagemInfinita.ativo` do mesmo jeito que os demais toggles dessa aba.

## Testes

`rolagemInfinita.test.ts` (13 testes): `extrairCamposOcultos` (coleta só hidden com "hdn" no id e com name; ignora sem name; múltiplos campos; vazio quando não há nenhum), `extrairLinhasValidas` (cada uma das 3 classes válidas; ignora linha sem classe válida; tabela ausente retorna vazio; preserva ordem), `extrairNroItens` (número válido; campo ausente; valor não numérico).

`storage.test.ts`: um teste de round-trip para `controleProcessos.rolagemInfinita`, seguindo o padrão já usado para os demais campos de `ControleProcessosConfig`.

O restante (refactor de `aplicarPrazos`/`aplicarCorProcesso`/`aplicarEspecificacao`/ordenação, wiring de `iniciarRemocaoPaginacao`/`buscarProximasPaginas`, opções) não é coberto por teste automatizado, seguindo a convenção já estabelecida para `content-scripts/procedimento_controlar/index.ts` e `options/main.ts` (DOM wiring verificado via build/typecheck).
