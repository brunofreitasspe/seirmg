# SEIRMG — Lote D: Controle de Processos — Prazos, Cor por Especificação e Especificação na Listagem (Design)

> Spec do Lote D do roteiro em `docs/ROADMAP-LOTES.md`. Porta 3 funcionalidades do Sei++ que atuam sobre as tabelas da tela Controle de Processos (`acao=procedimento_controlar`): `incluirCalculoPrazos.js`, `marcarCorProcesso.js`, `mostrarEspecificacao.js` + `listaPorEspecificacao.js`.

## Contexto

As 3 funcionalidades leem o atributo `onmouseover` dos marcadores/links de processo nas linhas de `#tblProcessosDetalhado`/`#tblProcessosGerados`/`#tblProcessosRecebidos` (tabelas nativas do SEI) e anotam a tabela: coluna de dias/prazo com destaque de cor por urgência, cor de fundo do link do processo por palavra-chave da especificação, e exibição da especificação (como subtítulo ou substituindo o número do processo).

`marcarCorProcesso.js` depende de uma lista configurável de regras `{valor, cor}[]` — mesmo padrão de UI que o lote de "ponto de controle" (já separado no roteiro) também vai precisar. Decisão desta sessão: construir agora um componente de lista editável **genérico e reutilizável**, usado aqui pela primeira vez e reaproveitado sem mudanças pelo lote do ponto de controle depois.

## Arquitetura

Mesmo padrão já estabelecido: lógica pura testável em `features/`, componente de UI reutilizável testável em `options/` (segue o precedente de `tabs.ts`/`tabs.test.ts` — utilitário DOM puro, sem `chrome.*`, testável via jsdom), wiring fino não-testado em `content-scripts/`/`options/main.ts`.

### Lógica pura — `features/controle-processos/`

**`prazos.ts`** (porta `incluirCalculoPrazos.js`):

```ts
export type TipoCalculoPrazo = 'prazo' | 'qtddias'

export function extrairTextoMarcador(onmouseover: string): string
export function isValidDate(dataString: string): boolean
export function calcularDiasDoMarcador(
  textosMarcadores: string[],
  tipo: TipoCalculoPrazo,
  agora: Date
): number | null

export interface ConfiguracaoLimites {
  alerta: number
  critico: number
}
export function classificarPrazo(
  valor: number,
  tipo: TipoCalculoPrazo,
  config: ConfiguracaoLimites
): 'alerta' | 'critico' | null
```

- `extrairTextoMarcador`: porta a extração `str.substring(str.indexOf("'") + 1, str.indexOf("'", str.indexOf("'") + 1))` do original — pega o texto entre as duas primeiras aspas simples do atributo.
- `calcularDiasDoMarcador`: recebe já os textos de `onmouseover` de todos os marcadores de uma linha (a leitura do DOM fica no wiring), aplica a mesma lógica do `Calcular` original (normaliza acento/caixa, extrai a data conforme o tipo, valida, calcula a diferença em dias) e para no primeiro marcador válido — idêntico ao `return days` do original.
- `classificarPrazo`: porta `FormatarTabela`, retornando qual classe se aplica em vez de mutar a linha diretamente (mutação fica no wiring).

**`corProcesso.ts`** (porta `marcarCorProcesso.js`):

```ts
export interface ConfiguracaoCor {
  valor: string
  cor: string
}
export function extrairEspecificacaoParaCor(onmouseover: string): string
export function escolherCorProcesso(
  especificacao: string,
  configuracoes: ConfiguracaoCor[]
): string | null
```

- `extrairEspecificacaoParaCor`: porta `texto.substring(texto.indexOf('(\'') + 2, texto.indexOf(')') - 1).toLowerCase()` — literal do original, mantido separado da extração de `prazos.ts` mesmo sendo string parsing parecido (limites de substring diferentes; sem uma instância SEI ao vivo para confirmar equivalência, prefiro portar cada um exatamente como está).
- `escolherCorProcesso`: porta o `reduce` original — primeira regra cujo `valor` (em minúsculo) aparece na especificação vence; retorna `null` em vez de string vazia quando nada casa.

**`especificacao.ts`** (porta `mostrarEspecificacao.js` + `listaPorEspecificacao.js`):

```ts
export function extrairEspecificacaoParaExibicao(onmouseover: string): string
export function extrairEspecificacaoParaLista(onmouseover: string): string
```

- `extrairEspecificacaoParaExibicao`: porta `texto.substring(texto.indexOf("('") + 2, texto.indexOf(',') - 1)` (de `mostrarEspecificacao.js`) — usado no modo "mostrar" (acrescenta a especificação como subtítulo, sem alterar o texto original do link).
- `extrairEspecificacaoParaLista`: porta `info.split("'")[1]` (de `listaPorEspecificacao.js`) — usado no modo "substituir" (troca o texto do link pela especificação; se vazio, o wiring acrescenta o texto fixo `" (sem especificação)"`, igual ao original).

### Componente reutilizável — `options/listaEditavel.ts`

```ts
export interface CampoListaEditavel {
  chave: string
  rotulo: string
  tipo: 'text' | 'color'
}

export interface ListaEditavelControle<T extends Record<string, string>> {
  obterItens: () => T[]
}

export function montarListaEditavel<T extends Record<string, string>>(
  container: HTMLElement,
  campos: CampoListaEditavel[],
  itensIniciais: T[]
): ListaEditavelControle<T>
```

Renderiza uma linha por item inicial (um `<input>` por campo configurado — `text` ou `color` — mais um botão "Remover" que apaga a linha), e um botão "Adicionar" que anexa uma linha vazia. `obterItens()` relê o DOM atual e retorna os itens cujo campo de texto principal não está vazio (linhas em branco deixadas pelo usuário são ignoradas). Testado via jsdom (mesmo padrão de `tabs.test.ts`): renderização inicial, adicionar linha, remover linha, `obterItens()` refletindo o estado.

Generalização deliberada: `campos` é uma lista arbitrária, não hardcoded para "valor/cor" — o lote do ponto de controle vai reaproveitar esta mesma função passando `campos: [{chave:'nome', ...}, {chave:'cor', ...}]` sem tocar na implementação.

### Schema novo — `lib/storage.ts`

```ts
export interface PrazosConfig {
  ativo: boolean
  exibirDias: boolean
  exibirPrazo: boolean
  alertaDias: number
  criticoDias: number
  alertaPrazo: number
  criticoPrazo: number
}

export interface CoresProcessoConfig {
  ativo: boolean
  regras: ConfiguracaoCor[] // { valor: string; cor: string }[]
}

export type ModoEspecificacao = 'mostrar' | 'substituir'

export interface EspecificacaoConfig {
  ativo: boolean
  modo: ModoEspecificacao
}

export interface ControleProcessosConfig {
  prazos: PrazosConfig
  coresProcesso: CoresProcessoConfig
  especificacao: EspecificacaoConfig
}
```

`SyncConfig.controleProcessos` novo. Defaults: todas as 3 seções `ativo: true`; `exibirDias`/`exibirPrazo` ambos `true`; `regras: []` (nenhuma regra configurada = nenhuma cor aplicada, comportamento neutro); `modo: 'mostrar'`. **Suposição documentada**: os arquivos originais não expõem um valor default para os limiares de alerta/crítico (vêm de configuração do usuário, lida de `SavedOptions`, sem default visível no código analisado) — esta spec assume `alertaDias: 30, criticoDias: 60, alertaPrazo: 10, criticoPrazo: 5` como ponto de partida razoável, ajustável na aba Processos.

### Wiring — `content-scripts/procedimento_controlar/index.ts` (novo)

Content script novo, `matches` restrito a `acao=procedimento_controlar*` (mesma tela do Controle de Processos já usada pela Task 7 do Lote A). Lê `createSyncConfigStore().get()` e, para cada uma das 3 tabelas (`#tblProcessosDetalhado`, `#tblProcessosGerados`, `#tblProcessosRecebidos`) presentes na página:

1. Se `controleProcessos.prazos.ativo`: para cada coluna habilitada (`exibirDias`/`exibirPrazo`), adiciona o `<th>` de cabeçalho e, por linha, extrai os `onmouseover` dos marcadores, chama `calcularDiasDoMarcador` + `classificarPrazo`, adiciona a célula e a classe CSS (`infraTrseippalerta`/`infraTrseippcritico` — mesmas classes que os temas `black`/`super-black` do Lote C já sabem estilizar).
2. Se `controleProcessos.coresProcesso.ativo`: por linha, extrai a especificação via `extrairEspecificacaoParaCor`, chama `escolherCorProcesso` com `coresProcesso.regras`, aplica `style="background-color: ...; padding: 0 1em 0 1em"` no link do processo quando há cor.
3. Se `controleProcessos.especificacao.ativo`: por linha, extrai a especificação (via `extrairEspecificacaoParaExibicao` ou `extrairEspecificacaoParaLista`, conforme `modo`) e aplica — modo `mostrar` acrescenta um `<span>` de subtítulo; modo `substituir` troca o `textContent` do link (com fallback `" (sem especificação)"` se vazio).

Guard `try/catch` em todo o bootstrap, loga via `console.error('[SEIRMG] ...', error)`, nunca lança — mesmo padrão já estabelecido.

### `manifest.config.ts`

Novo bloco `content_scripts`:

```ts
{
  matches: [
    '*://*.br/*controlador.php?acao=procedimento_controlar*',
    '*://*.org/*controlador.php?acao=procedimento_controlar*',
  ],
  js: ['src/content-scripts/procedimento_controlar/index.ts'],
  run_at: 'document_idle',
}
```

Nenhuma permissão nova, nenhum host novo.

### Aba Processos (`options/index.html` + `main.ts`)

Primeira implementação real (hoje placeholder). Três seções, mesmo padrão visual das abas já implementadas:

- **Prazos**: checkboxes "Ativar", "Exibir coluna Dias", "Exibir coluna Prazo" + 4 inputs numéricos (alerta/crítico de cada).
- **Cor por especificação**: checkbox "Ativar" + `montarListaEditavel` com campos `valor` (texto) e `cor` (color).
- **Especificação na listagem**: checkbox "Ativar" + `<select>` com `mostrar`/`substituir`.
- Um botão "Salvar" único para a aba inteira (lê todos os campos das 3 seções de uma vez), mesmo padrão de status "Salvo!" já usado.

## Testes

Vitest cobrindo: `prazos.ts` (extração de texto, validação de data, cálculo de dias para os 2 tipos, classificação alerta/crítico incluindo limites exatos), `corProcesso.ts` (extração, escolha de cor incluindo empate/nenhuma regra casando), `especificacao.ts` (os 2 modos de extração), `listaEditavel.ts` (renderização inicial, adicionar linha, remover linha, leitura do estado incluindo linhas em branco ignoradas). O content script e o wiring de opções não são cobertos por TDD (mesmo padrão já estabelecido) — verificados via build.

## Tratamento de erros

Todo o bootstrap do content script roda em `try/catch`, loga e nunca lança. Ausência de qualquer uma das 3 tabelas na página é tratada como caso normal (feature simplesmente não se aplica àquela tabela), não como erro.

## Fora de escopo

- Ponto de controle com cor customizável (`pontoControleCores.js`/`colorToFilter.js`) — lote próprio seguinte, reaproveita `listaEditavel.ts` sem mudanças.
- Agrupamento de lista de processos (Sei Pro) — Lote E.
- Sem mudança de permissões no manifest.
