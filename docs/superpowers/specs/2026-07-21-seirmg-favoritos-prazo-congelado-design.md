# SEIRMG — Prazo/marcadores/atribuição congelados no painel de Favoritos (processo fechado) — Design

## Contexto

O painel "★ Favoritos" (`renderizarPainelFavoritos`, `content-scripts/procedimento_controlar/index.ts`) mostra
todos os processos favoritados pelo usuário, cruzando a lista salva (`config.controleProcessos.favoritos.itens`,
em `chrome.storage.sync`) com as linhas nativas presentes na página atual (`mapaLinhasAbertasNaPagina()`).

Quando o processo favoritado ainda está aberto na unidade, a linha nativa existe na tabela (Recebidos/Gerados/
Detalhado) e o painel extrai ao vivo marcadores (`obterMarcadoresDaLinha`), prazo (`obterControleDePrazoDaLinha`)
e atribuição (`obterTextoAtribuido`) dela. Quando o processo **fecha na unidade**, ele para de aparecer nessas
tabelas — a linha nativa nunca mais existe — e `montarLinhaPainelFavoritos` colapsa a linha do painel pra só o
número do processo + badge "fechado" (`colSpan = 4`), perdendo marcadores, prazo e atribuição de vez.

Mockup (comparativo hoje/depois) aprovado: https://claude.ai/code/artifact/10b0d6d5-f3d0-467a-a2a5-4352877f13d8

## Decisões validadas com o usuário (2026-07-21)

- **Escopo:** prazo, marcadores e atribuição — os três somem pela mesma causa (dependem da linha nativa), então
  os três ganham o mesmo tratamento nesta entrega (não só o prazo, que foi o pedido original).
- **Mecanismo:** a cada vez que o painel é renderizado (carregamento da página e após rolagem infinita) e a
  linha nativa de um favorito ainda existe, a extensão grava um "retrato" (`ultimoSnapshot`) desses três campos
  no próprio `FavoritoProcesso`, sobrescrevendo o anterior. Quando a linha nativa some (processo fechado), o
  painel usa esse retrato em vez de colapsar a linha.
- **Marcadores congelados sem ícone/cor original:** só o nome de cada marcador é persistido — não o `iconeHtml`
  nem o `style` que vêm do SEI. Motivo: toda a config da extensão (incluindo a lista de favoritos, que cresce
  com o tempo) mora num único item do `chrome.storage.sync`, limitado a 8KB; HTML de ícone por marcador,
  multiplicado por cada processo favoritado, é o tipo de coisa que estoura essa cota silenciosamente. Marcadores
  de processos fechados mostram um ícone genérico (mesmo `flag` já usado hoje como fallback quando o SEI não
  manda ícone) em vez do ícone/cor reais — só processos abertos mantêm a aparência 100% fiel ao SEI.
- **"Dias restantes" nunca é congelado:** só a data fixa do prazo (`dataTexto`, ex. "15/08/2026") é persistida.
  A contagem de dias é recalculada a cada carregamento com `calcularDiasAteVencimento` (já existe, testado) —
  nunca fica desatualizada, e passa a mostrar corretamente "venceu há N dias" se o prazo já passou desde que o
  processo fechou.
- **Sem aviso de "dado desatualizado":** um processo fechado na unidade não muda mais (marcadores/atribuição são
  o estado final dele) — só a contagem de dias do prazo muda com o tempo, e essa é sempre recalculada. Por isso
  a linha congelada não precisa de nenhum aviso extra de "pode estar desatualizado".
- **Risco de concorrência aceito, não tratado nesta entrega:** a atualização do snapshot faz
  leitura-modificação-escrita do `SyncConfig` inteiro (mesmo padrão já usado em `alternarFavorito` e em outros
  pontos do arquivo, ex. `verificarBlocoAssinaturaOportunisticamente`). Se dois eventos escreverem quase ao
  mesmo tempo (ex. favoritar um processo e o snapshot de outro atualizando junto), a escrita mais recente vence
  — mesmo risco que já existe hoje nesse arquivo, não é novo.

## Arquitetura

### `src/lib/storage.ts`

```ts
export interface SnapshotFavorito {
  prazoDataTexto: string | null
  atribuicao: string | null
  marcadoresNomes: string[]
}

export interface FavoritoProcesso {
  numero: string
  link: string | null
  adicionadoEm: string
  especificacao?: string
  ultimoSnapshot?: SnapshotFavorito // novo campo, opcional — favoritos antigos não têm, sem migração necessária
}
```

### `src/features/controle-processos/prazos.ts` (novo helper puro, testável)

```ts
export function formatarDiasRestantes(dias: number): string
```

Usa a mesma convenção de `calcularDiasAteVencimento` (1 = vence hoje, valores ≤ 0 = já venceu):
- `dias === 1` → `"Vence hoje"`
- `dias > 1` → `"Vence em {dias - 1} dia(s)"`
- `dias <= 0` → `"Venceu há {1 - dias} dia(s)"`

(singular/plural conforme a quantidade)

### `src/features/controle-processos/favoritos.ts` (novos helpers puros, testáveis)

```ts
export function snapshotsIguais(a: SnapshotFavorito | undefined, b: SnapshotFavorito): boolean

export function atualizarSnapshotsFavoritos(
  itens: FavoritoProcesso[],
  snapshotsPorNumero: Map<string, SnapshotFavorito>
): { itens: FavoritoProcesso[]; mudou: boolean }
```

- `snapshotsIguais`: compara campo a campo (`prazoDataTexto`, `atribuicao`, e `marcadoresNomes` elemento a
  elemento) — `a === undefined` sempre retorna `false` (força a primeira gravação).
- `atualizarSnapshotsFavoritos`: para cada item, se `snapshotsPorNumero` tem uma entrada pro `numero` dele e ela
  é diferente do `ultimoSnapshot` atual, substitui; senão mantém o item como está. `mudou` indica se algo mudou
  (controla se vale a pena persistir).

### `src/content-scripts/procedimento_controlar/index.ts` (modificado)

Novo import: `import clockIconSvg from 'lucide-static/icons/clock.svg?raw'` e os dois helpers puros novos.

```ts
function capturarSnapshotDaLinha(linhaNativa: Element): SnapshotFavorito {
  const prazo = obterControleDePrazoDaLinha(linhaNativa)
  return {
    prazoDataTexto: prazo?.dataTexto ?? null,
    atribuicao: obterTextoAtribuido(linhaNativa),
    marcadoresNomes: obterMarcadoresDaLinha(linhaNativa).map((marcador) => marcador.nome),
  }
}

function construirSnapshotsPorNumero(
  itens: FavoritoProcesso[],
  linhasAbertas: Map<string, Element>
): Map<string, SnapshotFavorito>
```

- `construirSnapshotsPorNumero`: só computa snapshot pros favoritos cuja linha nativa está presente na página
  atual (evita trabalho à toa pra linhas abertas que não são favoritas).

```ts
function persistirFavoritosAtualizados(): void
```

- Lê o `SyncConfig` atual, substitui só `controleProcessos.favoritos.itens` pelo `itensFavoritados` (já
  atualizado em memória) e grava de volta — fire-and-forget com `.catch(console.error)`, mesmo padrão já usado
  em `aplicarLinksPlankaEmLinhas(...)`/`verificarBlocoAssinaturaOportunisticamente(...)` no bootstrap.

`renderizarPainelFavoritos` ganha, logo após calcular `linhasAbertas`:

```ts
const snapshotsPorNumero = construirSnapshotsPorNumero(itensFavoritados, linhasAbertas)
const resultado = atualizarSnapshotsFavoritos(itensFavoritados, snapshotsPorNumero)
itensFavoritados = resultado.itens
if (resultado.mudou) persistirFavoritosAtualizados()
```

A atualização em memória é síncrona — a própria renderização que acontece na sequência já usa
`itensFavoritados` atualizado, sem precisar re-renderizar depois que a escrita assíncrona terminar.

**Refatoração de `montarCelulaAtribuicao`:** hoje recebe `linhaNativa: Element` e chama
`obterTextoAtribuido` internamente. Passa a receber `atribuicao: string | null` diretamente — elimina a
duplicação entre o caminho "ao vivo" e o caminho "congelado" (os dois só precisam montar a célula a partir de um
texto, a diferença é de onde esse texto vem). Chamada ao vivo vira
`montarCelulaAtribuicao(obterTextoAtribuido(linhaNativa))`.

**Duas células novas** (caminho congelado, `linhaNativa` ausente):

```ts
function montarCelulaMarcadoresCongelados(nomes: string[]): HTMLTableCellElement
function montarCelulaPrazoCongelado(prazoDataTexto: string | null): HTMLTableCellElement
```

- `montarCelulaMarcadoresCongelados`: mesma estrutura visual de `montarCelulaMarcadores` (pills
  `.seirmg-favoritos-marcador`), mas cada pill usa `criarIcone(flagIconSvg)` (ícone genérico, já importado) em
  vez do `iconeHtml`/`estilo` reais — que não existem mais porque não são persistidos. `nomes.length === 0` →
  célula vazia (`—`), igual ao padrão já usado nas outras células.
- `montarCelulaPrazoCongelado`: mesma estrutura visual de `montarCelulaPrazo` (linha da data + linha dos dias),
  usando `criarIcone(clockIconSvg)` em vez do `iconeHtml` do link nativo, e
  `formatarDiasRestantes(calcularDiasAteVencimento(prazoDataTexto, new Date())!)` pra segunda linha (com guarda
  pra `prazoDataTexto === null` → célula vazia).

**`montarLinhaPainelFavoritos` reescrita** — remove o `colSpan = 4` e o caminho colapsado; sempre monta as 5
células (Processo, Marcadores, Prazo, Atribuição, Remover), escolhendo a fonte dos dados conforme
`linhaNativa` existe ou não:

```ts
function montarLinhaPainelFavoritos(item: FavoritoProcesso, linhaNativa: Element | undefined): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const especificacao = linhaNativa ? (obterEspecificacaoDaLinha(linhaNativa) ?? item.especificacao) : item.especificacao

  tr.appendChild(montarCelulaProcesso(item, !!linhaNativa, especificacao))

  if (linhaNativa) {
    tr.appendChild(montarCelulaMarcadores(linhaNativa))
    tr.appendChild(montarCelulaPrazo(linhaNativa))
    tr.appendChild(montarCelulaAtribuicao(obterTextoAtribuido(linhaNativa)))
  } else {
    tr.appendChild(montarCelulaMarcadoresCongelados(item.ultimoSnapshot?.marcadoresNomes ?? []))
    tr.appendChild(montarCelulaPrazoCongelado(item.ultimoSnapshot?.prazoDataTexto ?? null))
    tr.appendChild(montarCelulaAtribuicao(item.ultimoSnapshot?.atribuicao ?? null))
  }

  tr.appendChild(montarCelulaRemover(item))
  return tr
}
```

Favoritos antigos (sem `ultimoSnapshot`, favoritados antes desta mudança) simplesmente mostram "—" nas três
células até a próxima vez em que o processo aparecer aberto numa página — sem precisar de migração de dados.

## Fora de escopo

- Persistir o ícone/cor originais dos marcadores (risco de cota do `chrome.storage.sync`).
- Aviso visual de "dado desatualizado" na linha congelada (decisão: desnecessário, processo fechado não muda).
- Lock/transação na leitura-modificação-escrita do `SyncConfig` (risco pré-existente, não introduzido aqui).
- Migração de favoritos antigos — o campo é opcional, populado organicamente na próxima vez que o processo for
  visto aberto.

## Testes

- `prazos.test.ts`: `formatarDiasRestantes` — vence hoje (1), vence em N dias (>1, singular e plural), já
  venceu há N dias (≤0, singular e plural).
- `favoritos.test.ts`: `snapshotsIguais` (igual, diferente em cada campo, `undefined` vs. definido) e
  `atualizarSnapshotsFavoritos` (item sem entrada no mapa não muda, item com snapshot diferente atualiza e marca
  `mudou`, item com snapshot igual não marca `mudou`, lista com mistura dos três casos).
- Wiring em `procedimento_controlar/index.ts` (extração de dados da linha nativa, persistência, escolha de
  célula ao vivo vs. congelada) sem teste automatizado, mesmo padrão já estabelecido no arquivo — verificado via
  `tsc --noEmit`/`bun run test`/`bun run build` e depois validação manual numa instância SEI real: favoritar um
  processo aberto, confirmar que os dados aparecem no painel, fechar o processo na unidade (ou simular removendo
  a linha manualmente via DevTools numa segunda checagem), recarregar a página e confirmar que marcadores/prazo/
  atribuição continuam aparecendo com os últimos valores vistos, e que o "dias restantes" do prazo bate com a
  data de hoje.
