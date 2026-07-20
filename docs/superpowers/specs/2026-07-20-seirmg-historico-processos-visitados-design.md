# SEIRMG — Histórico de processos visitados — Design

> Porta a funcionalidade "Histórico de processos visitados" do Sei Pro (`seipro/pages/HISTORICOPROC.md`),
> fora do ciclo lote-a-lote formal — pedido direto do usuário, na mesma sessão em que o painel lateral
> da árvore (`docs/superpowers/specs/2026-07-20-seirmg-info-adicional-arvore-design.md`) foi construído.

## Contexto

O Sei Pro grava, no `localStorage`, um registro de cada processo cujos dados são buscados (mesmo fetch
que alimenta o painel "informações adicionais na árvore" e a inserção de dados no editor), e mostra essa
lista num diálogo modal disparado por um item de menu, com colunas Processo/Tipo-Descrição/Acesso.

O SEIRMG já tem, desde hoje (`docs/superpowers/specs/2026-07-20-seirmg-info-adicional-arvore-design.md`),
`montarPainelTipoEInteressados` (`src/content-scripts/procedimento_visualizar/index.ts`) fazendo esse
mesmo fetch a cada carregamento da árvore, e já extrai `extrairTipoProcesso(doc)`. Não precisa de nenhuma
chamada de rede nova — só gravar um registro leve como efeito colateral desse fetch já existente.

## Decisões validadas com o usuário (2026-07-20)

- **Onde mostrar:** no popup da extensão (clicar no ícone da barra do Chrome), abaixo do status do bloco
  de assinatura já existente — não um diálogo dentro da página do SEI como o Sei Pro original.
- **Quantidade:** últimos 10 processos, mais recente primeiro. Revisitar um processo já na lista move ele
  pro topo (sem duplicar).
- **Opt-in:** desligado por padrão — o usuário liga explicitamente numa aba das Opções (mesmo padrão do
  Sei Pro original, que também é opt-in).
- **Conteúdo de cada item:** número do processo + tipo do processo (sem data/hora relativa).
- **Clique:** abre o processo (`acao=procedimento_trabalhar`) numa aba nova.

## Arquitetura

### `lib/storage.ts`

Novo tipo, exportado (usado tanto pelo content script quanto pelo popup):

```ts
export interface HistoricoProcessoEntry {
  idProcedimento: string
  numero: string
  tipo: string
  acessadoEm: string // ISO 8601
}

export interface HistoricoProcessosConfig {
  ativo: boolean
}
```

- `SyncConfig` ganha o campo `historicoProcessos: HistoricoProcessosConfig`. `DEFAULT_SYNC_CONFIG` inclui
  `historicoProcessos: { ativo: false }`.
- `LocalConfig` ganha o campo `historicoProcessos: HistoricoProcessoEntry[]`. `DEFAULT_LOCAL_CONFIG`
  inclui `historicoProcessos: []`.

### `features/procedimento-visualizar/historico.ts` (novo arquivo)

Função pura, testável, sem dependência de DOM/storage:

```ts
export function registrarProcessoVisitado(
  historicoAtual: HistoricoProcessoEntry[],
  novo: HistoricoProcessoEntry,
  limite = 10
): HistoricoProcessoEntry[]
```

- Remove qualquer entrada existente com o mesmo `idProcedimento` (revisita não duplica).
- Insere `novo` no início (posição 0).
- Corta a lista em `limite` itens (mais antigos saem primeiro).

### `content-scripts/procedimento_visualizar/index.ts`

Dentro de `montarPainelTipoEInteressados`, depois que `doc` é parseado com sucesso (mesmo ponto em que
`extrairTipoProcesso(doc)` já é chamado para a seção "Tipo do processo"):

- Lê `syncConfig.historicoProcessos.ativo` (precisa que `bootstrap()`/`montarPainelLateral()` passem o
  `syncConfig` já carregado adiante, ou que essa função busque `createSyncConfigStore().get()` de novo —
  a decidir na task, preferindo reaproveitar o que já existe no arquivo se `bootstrap()` já carrega config
  em algum ponto próximo; caso contrário, um novo `await createSyncConfigStore().get()` local, mesmo
  padrão de leitura pontual já usado em `montarPainelAtribuicao`).
- Se ativo: monta um `HistoricoProcessoEntry` (`idProcedimento` do `id_procedimento` da URL atual,
  `numero` de `obterNumeroProcesso()`, `tipo` de `extrairTipoProcesso(doc)`, `acessadoEm` de
  `new Date().toISOString()`), lê `LocalConfig` atual, aplica `registrarProcessoVisitado`, salva de volta.
- Falha (leitura/escrita de storage) segue a política já estabelecida do arquivo: `try/catch` com
  `console.error('[SEIRMG] ...', error)`, nunca interrompe o resto do painel.

### `popup/index.html` + `popup/main.ts`

- Novo bloco HTML (`<div id="historico"></div>` ou similar) abaixo do bloco de status/contagem existente,
  antes do botão "Abrir opções".
- `main.ts`: lê `LocalConfig.historicoProcessos` e `LocalConfig.baseUrlSei`. Se a lista estiver vazia (seja
  porque a opção está desligada, seja porque ainda não há registros), o bloco não é renderizado (`display:
  none` ou simplesmente não populado) — sem estado vazio ocupando espaço no popup pequeno.
- Cada item: `<a target="_blank">` com texto `"{numero} — {tipo}"`, `href` montado a partir de
  `baseUrlSei` + `controlador.php?acao=procedimento_trabalhar&id_procedimento={idProcedimento}` (mesmo
  padrão de montagem de URL já usado no Sei Pro original e implicitamente no projeto via `baseUrlSei`
  salvo em `LocalConfig`).
- `body` do popup pode crescer em altura (o `width: 260px` fixo continua, mas a lista de até 10 itens
  quebra a altura fixa que existia antes — sem limite de altura/scroll nesta primeira versão, YAGNI).

### `options/index.html` + `options/main.ts`

Aba "Processos": novo checkbox "Guardar histórico de processos visitados (mostrado no popup da extensão)",
ligado a `historicoProcessos.ativo`. Segue o mesmo padrão de outros toggles já existentes nessa aba
(leitura/gravação no handler de salvar já existente — lembrar do gotcha já documentado no projeto: um
campo novo em `SyncConfig` exige passthrough explícito no handler de salvar mesmo sem UI, e aqui *tem* UI,
então o handler precisa ler o valor do checkbox).

## Fora de escopo

- Diálogo dentro da página do SEI (Sei Pro original) — só o popup da extensão.
- Colunas adicionais (nível de acesso, assuntos, observações, descrição, data de geração) que o Sei Pro
  grava mas que não aparecem na UI decidida aqui (número + tipo apenas).
- Ordenação/filtro dentro da lista do popup (Sei Pro tem tabela ordenável — aqui é uma lista simples, já
  ordenada por mais recente).
- Limite configurável (fixo em 10, sem opção de mudar).
- Registro de processos vistos em outras telas além da árvore (Controle de Processos, por exemplo) — só
  quando a árvore de um processo é aberta, mesmo gatilho de `montarPainelTipoEInteressados`.

## Testes

`historico.test.ts`: casos para `registrarProcessoVisitado` — lista vazia, adiciona no início, revisita
move pro topo sem duplicar, corta no limite quando excede. Wiring em `procedimento_visualizar/index.ts` e
`popup/main.ts` sem teste automatizado, mesmo padrão já estabelecido no projeto para content scripts —
verificado via `tsc --noEmit`/`bun run test`/`bun run build` e depois validação manual (visitar 2-3
processos diferentes com a opção ligada, confirmar que aparecem no popup na ordem certa, sem duplicar ao
revisitar um já visto).
