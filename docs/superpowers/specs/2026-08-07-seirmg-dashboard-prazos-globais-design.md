# SEIRMG — Dashboard: aba Prazos mostra todos os processos com prazo (não só favoritos) — Design

## Contexto

A aba Prazos do Dashboard (spec `2026-08-03-seirmg-dashboard-design.md`) foi implementada lendo
`SyncConfig.controleProcessos.favoritos.itens` — só mostra prazo de processos favoritados. Na validação ao vivo
(2026-08-07), ficou claro que isso é limitado demais: um processo com prazo definido no SEI, mas nunca
favoritado, nunca aparece ali. O usuário quer que a aba mostre **todos os processos com prazo já vistos no
Controle de Processos**, favoritados ou não.

Hoje não existe nenhum lugar que persista prazo de processo não favoritado — só existe:

1. Cálculo **ao vivo** na tela nativa do Controle de Processos (`features/controle-processos/prazos.ts`,
   `aplicarPrazos`), que colore linhas mas não persiste nada.
2. O "snapshot congelado" só de itens **favoritados** (`FavoritoProcesso.ultimoSnapshot`,
   `content-scripts/procedimento_controlar/index.ts`), que continua existindo e alimentando a aba Favoritos —
   este design **não mexe nisso**.

## Decisão validada com o usuário (2026-08-07)

- Fonte de dados: todo processo **visto no Controle de Processos** (qualquer unidade), não só favoritos.
- Captura condicionada a **`config.dashboard.ativo` E `config.controleProcessos.prazos.ativo`** (as duas
  ligadas).
- **Sem expiração por tempo.** Uma entrada só sai da lista quando o processo for revisitado no Controle de
  Processos e a extensão constatar que ele **não tem mais prazo definido** ali (ou seja, o prazo foi retirado
  manualmente no SEI). Processos não revisitados permanecem na lista indefinidamente, mesmo que o prazo exibido
  fique desatualizado até a próxima visita — limitação aceita conscientemente.

## Arquitetura

### `src/lib/storage.ts`

```ts
export interface SnapshotPrazoProcesso {
  numero: string
  especificacao?: string
  link: string | null
  prazoDataTexto: string
  vistoEm: string // ISO — informativo, não usado para expirar nada
}
```

- `LocalConfig` ganha `snapshotPrazosProcessos: SnapshotPrazoProcesso[]` (default `[]`) — local, não sync, mesmo
  raciocínio já usado para `historicoEventos` (evita competir pela cota de 8KB do `chrome.storage.sync`).

### `src/features/controle-processos/prazos.ts` (extraído de `procedimento_controlar/index.ts`)

`obterControleDePrazoDaLinha()` e a interface `ControleDePrazoFavorito` hoje são privadas em
`content-scripts/procedimento_controlar/index.ts`. Passam a ser exportadas deste módulo (mesmo padrão já usado
para extrair `favoritosRender.ts` na spec original do Dashboard) — comportamento não muda, só a localização.
`procedimento_controlar/index.ts` passa a importar dali.

### `src/features/dashboard/snapshotPrazos.ts` (novo, puro, testável)

```ts
export interface LinhaVisivelComPrazo {
  numero: string
  prazoDataTexto: string | null
  especificacao?: string
  link: string | null
}

export function atualizarSnapshotPrazos(
  atuais: SnapshotPrazoProcesso[],
  linhasVisiveis: LinhaVisivelComPrazo[],
  agoraIso: string
): SnapshotPrazoProcesso[]
```

Regras (uma passagem sobre `linhasVisiveis`, indexado por `numero`):

- Linha visível **com** `prazoDataTexto` → grava ou atualiza a entrada (`vistoEm` = `agoraIso`).
- Linha visível **sem** `prazoDataTexto` (prazo foi retirado no SEI) → remove a entrada, se existir.
- Processo que não aparece em `linhasVisiveis` (não foi revisitado nesta página) → entrada existente permanece
  intocada.

Retorna a lista resultante (imutável — não modifica `atuais`).

### Captura no content script (`procedimento_controlar/index.ts`)

Dentro de `bootstrap()`, logo após `todasAsLinhas` ser montado (mesmo ponto onde `aplicarEstrelasEmLinhas` e
`renderizarPainelFavoritos` já rodam):

```ts
if (config.dashboard?.ativo && config.controleProcessos.prazos.ativo) {
  capturarSnapshotGlobalDePrazos(todasAsLinhas)
}
```

`capturarSnapshotGlobalDePrazos(linhas: Element[])`:

1. Mapeia cada linha para `LinhaVisivelComPrazo` combinando `extrairFavoritoDaLinha(linha, agoraIso)` (numero,
   link, especificacao — já existe, reuso direto) com `obterControleDePrazoDaLinha(linha)?.dataTexto ?? null`.
   Linhas sem `numero` (retorno `null` de `extrairFavoritoDaLinha`) são ignoradas.
2. Lê `LocalConfig` atual, chama `atualizarSnapshotPrazos`, grava de volta **só se mudou** (mesmo padrão
   read-modify-write já usado para favoritos, `resultadoSnapshot.mudou`).

Limitação assumida: só varre as linhas já renderizadas no carregamento da página (não força expandir rolagem
infinita) — mesma limitação que já existe hoje para o painel de favoritos.

### `src/dashboard/main.ts` — `renderizarPrazos()` reescrita

- Lê `localConfig.snapshotPrazosProcessos ?? []` em vez de `config.controleProcessos.favoritos.itens`.
- Mesma classificação (`calcularDiasAteVencimento` + `classificarPrazo`, limites de
  `config.controleProcessos.prazos`), mesma ordenação ascendente por dias.
- Tabela ganha uma coluna **"Abrir"** (nova — a aba não tem hoje), pois nem todo processo listado está
  favoritado; reaproveita a mesma lógica de `montarCelulaAbrirFavorito` (extração de
  `id_procedimento`/`localConfig.baseUrlSei`), generalizada para aceitar `{ link: string | null }` em vez de
  exigir `FavoritoProcesso` completo.
- Colunas finais: Processo | Especificação | Prazo | Situação | Abrir.

## Fora de escopo

- Expiração por tempo/limite de quantidade — decisão explícita do usuário: só sai da lista se o prazo for
  removido manualmente no SEI.
- Forçar carregamento de rolagem infinita para capturar todas as páginas de uma vez — captura só o que já está
  renderizado.
- Qualquer mudança na aba Favoritos ou no mecanismo de `ultimoSnapshot` de favoritos — continuam exatamente como
  estão.

## Testes

- `snapshotPrazos.test.ts`: upsert de linha com prazo (nova e atualização de existente), remoção quando prazo
  some numa linha revisitada, processo não visto permanece intocado, lista vazia de entrada não quebra.
- `prazos.test.ts` (já existe): adicionar casos para `obterControleDePrazoDaLinha` extraído (mesmos casos que já
  cobrem a versão privada, só muda a localização).
- Wiring no content script e leitura no Dashboard: sem teste automatizado, mesmo padrão já estabelecido no
  projeto — verificado via `tsc --noEmit`/`bun run test`/`bun run build` e validação manual numa instância SEI
  real.
