# SEIRMG — Lote L (núcleo): Favoritar processos + painel de Favoritos

> Spec resultante de brainstorming em 2026-07-10 (com mockup visual aprovado). Cobre só o
> núcleo do item "Lote L — Favoritos avançados" do roadmap: favoritar um processo, um
> painel listando os favoritos na tela de Controle de Processos, e a resolução da
> duplicação processo-aberto-e-favoritado. **Etiquetas coloridas, mapas (Leaflet),
> categorias, prazo com edição avançada e export/import ficam fora desta spec** —
> viram itens separados no roteiro, a exemplo de como G2b foi dividido em G2b-1/2/3/4.

## Contexto

O Sei Pro original (`sei-pro-favoritos.js`, ~1800 linhas) tem um sistema de favoritos
completo: favoritar a partir da tela do processo, painel na página inicial do SEI listando
favoritos com categorias/etiquetas/mapa/prazo avançado, export/import via FileSystem API.
Ele já lida com processo-favoritado-e-aberto-na-unidade, mas só troca o ícone (pasta
aberta/fechada) — a linha continua aparecendo duplicada, na tela de Controle de Processos
E no painel de favoritos.

## Decisões validadas com o usuário (2026-07-10, incluindo sessão com mockup visual)

- Quando um processo está **favoritado E aberto** (aparece na tabela nativa da tela
  atual), ele **some da tabela nativa** e aparece **só no painel de Favoritos** — o
  oposto do Sei Pro original (que mantém as duas cópias).
- O painel de Favoritos fica na **tela de Controle de Processos** (não na página inicial
  do SEI, ao contrário do original) — reaproveita a infraestrutura de tabela/linha que o
  SEIRMG já tem ali (prazos, cores, agrupamento, filtros, Planka).
- Favoritar é feito por um ícone de estrela em cada linha da tabela (mesmo padrão de
  inserção já usado por especificação/Planka: `insertAdjacentElement('afterend', ...)`).
- Fora de escopo desta spec (fica pro roteiro, mesma divisão por risco já usada em G2b):
  etiquetas coloridas, mapas, categorias, prazo com "edição avançada", export/import via
  FileSystem API.

## Arquitetura

### Reaproveitamento da infraestrutura de filtros existente

`src/content-scripts/procedimento_controlar/index.ts` já tem um sistema de filtros por
linha (`src/features/controle-processos/filtroTabela.ts`: `registrarFiltro`/
`removerFiltro`/`calcularVisibilidade`, combinados via `estadoFiltrosPorTabela` +
`reaplicarOrdemDaTabela`), usado hoje pela busca rápida e pelos filtros por
atribuição/bloco. **Esconder a linha nativa de um processo favoritado-e-aberto é
implementado como mais um filtro registrado nesse mesmo sistema** (sufixo
`'PorFavoritoAberto'`), não manipulação direta de `style.display` — isso garante
composição correta com os outros filtros já ativos, atualização automática da legenda de
contagem (`atualizarCaption`, já chamado por `aplicarVisibilidade`), e compatibilidade
com agrupamento/ordenação já existentes.

### Armazenamento

Novo módulo `src/features/controle-processos/favoritos.ts` com os tipos:

```ts
export interface FavoritoProcesso {
  numero: string // NUP, chave única
  link: string | null // href pra reabrir o processo (null se não capturado)
  adicionadoEm: string // ISO timestamp
}
```

`src/lib/storage.ts`: `ControleProcessosConfig` ganha:

```ts
export interface FavoritosConfig {
  ativo: boolean
  itens: FavoritoProcesso[]
}
```

```ts
export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
  rolagemInfinita: RolagemInfinitaConfig
  agrupamento: AgrupamentoConfig
  favoritos: FavoritosConfig // NOVO
}
```

Default: `{ ativo: false, itens: [] }` — segue o mesmo precedente de `rolagemInfinita`
(recurso que muda a tela estruturalmente, opt-in por padrão), diferente dos recursos
puramente aditivos (prazos/cores/especificação) que default `true`.

**Nota de risco (documentada, não resolvida nesta spec):** `favoritos.itens` mora dentro
de `SyncConfig`, que o projeto guarda inteiro sob uma única chave `chrome.storage.sync`
(limite de 8KB por item). Mesmo padrão já aceito por `coresProcesso.regras`/
`pontoControle.regras`. Pra um uso típico (dezenas de favoritos), a folga é confortável;
se algum usuário favoritar centenas de processos e estourar o limite, isso exigiria mover
`favoritos` pra `LocalConfig` (sem sincronização entre dispositivos, mas sem esse limite)
— não implementado agora, YAGNI.

### Extração do NUP e link por linha

Reaproveita o seletor já usado por outras funcionalidades desta mesma página:
`linha.querySelector('.processoVisualizado, .processoNaoVisualizado')`. O elemento é um
link nativo do SEI — `textContent` trimado é o NUP, `getAttribute('href')` é o link pra
reabrir o processo (usado ao favoritar, guardado no `FavoritoProcesso.link`).

### Favoritar/desfavoritar (ícone de estrela por linha)

Para cada linha das 3 tabelas (`IDS_TABELAS`, mesmo escopo de prazos/cores/Planka),
insere um ícone de estrela (Lucide `star`/`star-off` conforme o estado) logo após o
elemento do processo:

```ts
processo.insertAdjacentElement('afterend', estrela)
```

Clique alterna favorito/não-favorito: adiciona ou remove de
`config.controleProcessos.favoritos.itens` (persistido via `createSyncConfigStore`),
depois recalcula o filtro `'PorFavoritoAberto'` da tabela e rerenderiza o painel de
Favoritos (ver abaixo) — sem reload de página.

### Filtro de ocultação (processo aberto + favoritado)

Para cada tabela, ao montar (bootstrap) e ao chegar linhas novas (rolagem infinita):

```ts
const idsFavoritados = new Set(config.controleProcessos.favoritos.itens.map((f) => f.numero))
const resultado: Record<string, boolean> = {}
linhas.forEach((linha, index) => {
  const id = linha.id || String(index)
  const processo = linha.querySelector('.processoVisualizado, .processoNaoVisualizado')
  const nup = processo?.textContent?.trim()
  resultado[id] = !(nup && idsFavoritados.has(nup)) // false = esconde
})
estado = registrarFiltro(estado, 'PorFavoritoAberto', resultado)
estadoFiltrosPorTabela.set(idTabela, estado)
reaplicarOrdemDaTabela(idTabela)
```

Se `config.controleProcessos.favoritos.ativo` for `false`, o filtro não é registrado
(`removerFiltro` se já estava registrado) — comportamento nativo do SEI, sem nenhuma
linha escondida.

### Painel de Favoritos

Uma seção nova, montada uma vez no bootstrap e rerenderizada a cada favoritar/
desfavoritar, inserida logo após a última das três tabelas presentes na página (na ordem
de `IDS_TABELAS`). Estrutura visual reaproveita o padrão de tabela já usado no resto da
página (`tableInfo`/`infraTable`, mesmas classes nativas do SEI já usadas em outras
tabelas geradas pela extensão, ex. o painel de bloco de assinatura).

Pra cada item em `favoritos.itens` (ordenados por `adicionadoEm`, mais recente primeiro):
- NUP como link (`<a href="{item.link}">`, sem `href` se `link` for `null` — mostra só o
  texto nesse caso).
- Selo "Aberto na sua caixa" se o NUP estiver entre os NUPs atualmente renderizados em
  qualquer uma das 3 tabelas desta carga de página (calculado uma vez no bootstrap,
  reaproveita a mesma coleta usada pelo filtro de ocultação); sem selo (ou "Fechado",
  discreto) caso contrário.
- Ícone de remover (desfavoritar), mesma ação do clique na estrela.

Se `favoritos.itens` estiver vazio, o painel inteiro não aparece (mesma filosofia "sem
dado, sem poluição visual" já usada no resto do projeto).

### Opções

`src/options/index.html`, aba "Processos" (mesma aba de prazos/cores/especificação/
agrupamento/rolagem infinita), nova seção:

```html
<h3>Favoritos</h3>
<label>
  <input type="checkbox" id="processos-favoritos-ativo" />
  Ativar favoritos (esconde da listagem nativa o que já estiver favoritado)
</label>
```

`src/options/main.ts`: `carregarAbaProcessos` ganha a leitura/gravação desse campo, mesmo
padrão dos outros togles dessa aba. A lista de itens favoritados (`itens`) não tem UI de
edição nas Opções nesta spec — é gerenciada só pelas estrelas/painel na própria tela do
SEI.

## Testes

Lógica pura testável em `src/features/controle-processos/favoritos.ts`:
- `extrairFavoritoDaLinha(linha, agoraIso): FavoritoProcesso | null` — extrai NUP+link de
  uma linha, `null` se não achar o elemento do processo.
- `calcularOcultacaoPorFavorito(linhas, idsFavoritados): Record<string, boolean>` — monta
  o resultado que vira o filtro `'PorFavoritoAberto'` (pura, recebe os NUPs já
  extraídos por linha em vez de fazer a extração ela mesma, pra ficar testável sem DOM
  real de `.querySelector` complexo — na prática recebe `Array<{ id: string; nup: string
  | null }>`).
- `ordenarFavoritosPorData(itens: FavoritoProcesso[]): FavoritoProcesso[]` — mais recente
  primeiro.

Wiring de DOM/`chrome.*` no content script sem teste direto, mesma política já aplicada
ao resto do projeto.

## Fora de escopo

- Etiquetas coloridas, mapas (Leaflet), categorias, prazo com "edição avançada"
  (contagem relativa a partir de assinatura de documento), export/import via FileSystem
  API — todos ficam como itens separados no roteiro (`docs/ROADMAP-LOTES.md`), a
  exemplo da divisão já feita em G2b-1/2/3/4.
- Painel de favoritos na página inicial do SEI (só na tela de Controle de Processos por
  ora).
- Reordenação manual (drag-and-drop) dos favoritos no painel — ordem fixa por data de
  favoritação.
- UI de gerenciamento da lista de favoritos nas Opções (edição/remoção em massa) — só via
  estrela/painel na própria tela do SEI.
