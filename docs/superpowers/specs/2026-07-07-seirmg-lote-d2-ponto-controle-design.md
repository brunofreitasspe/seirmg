# SEIRMG — Lote D2: Ponto de Controle com Cor Customizável (Design)

> Spec do Lote D2 do roteiro em `docs/ROADMAP-LOTES.md`. Porta `colorToFilter.js` (solver CSS filter) e `pontoControleCores.js` do Sei++, reaproveitando o componente `listaEditavel.ts` genérico já entregue no Lote D.

## Contexto

`pontoControleCores.js` altera a cor visual dos ícones de "ponto de controle" nativos do SEI aplicando um filtro CSS (`img.style.filter`) que aproxima uma cor HEX/RGB configurada pelo usuário — não há como recolorir um ícone `<img>` estático via CSS diretamente, então `colorToFilter.js` resolve isso numericamente (algoritmo baseado em [css-color-filter-generator](https://github.com/angel-rs/css-color-filter-generator), busca SPSA) gerando uma cadeia de filtros (`invert`/`sepia`/`saturate`/`hue-rotate`/`brightness`/`contrast`) que, aplicada a um ícone preto, aproxima a cor alvo.

**Decisão desta sessão**: o filtro é **computado e cacheado no momento em que o usuário salva a regra nas opções** (não recalculado a cada carregamento de página) — mesma abordagem do original, que guarda `{nome, cor, filter}` já resolvido. O solver SPSA não é caro o bastante para travar a UI da tela de opções, mas rodá-lo a cada navegação do SEI (para cada regra configurada) é desperdício evitável.

## Arquitetura

Mesmo padrão já estabelecido: lógica pura testável em `features/`, wiring fino não-testado em `content-scripts/`/`options/main.ts`, reaproveita `listaEditavel.ts` (Lote D) sem alterações.

### Lógica pura — `features/ponto-controle/colorToFilter.ts`

Porte de `C:\sei\seiplus\cs_modules\lib\colorToFilter.js`. Exporta as funções determinísticas (testáveis com valores exatos) e a função principal (testável por contrato, não por valor exato — o solver interno usa busca aleatória, então a mesma cor de entrada pode gerar filtros ligeiramente diferentes entre execuções, todos igualmente válidos):

```ts
export function isHEXValid(color: string): boolean
export function isRGBValid(color: string): boolean
export function hexToRgb(hex: string): [number, number, number] | null
export function rgbToHex(r: number, g: number, b: number): string
export function colorToFilter(input: string): string
```

`colorToFilter` lança `Error('Invalid format!')` para entrada fora do formato HEX/RGB, e `Error('No suitable filter found!')` no caso raro de não convergir em 10 tentativas — mesmo contrato do original. As classes internas `Color`/`Solver` (implementação do solver SPSA) permanecem não-exportadas, detalhe de implementação.

### Lógica pura — `features/ponto-controle/seletor.ts`

```ts
export function construirSeletorPontoControle(nome: string, emProcedimentoVisualizar: boolean): string
```

Porte da lógica de seleção de `pontoControleCores.js` (`document.location.search.indexOf('acao=procedimento_visualizar') > 0 ? ... : ...`), extraída como função pura recebendo o booleano em vez de ler `document.location` diretamente — a leitura da URL fica no wiring.

### Schema novo — `lib/storage.ts`

```ts
export interface ConfiguracaoPontoControle {
  nome: string
  cor: string
  filter: string
}

export interface PontoControleConfig {
  ativo: boolean
  regras: ConfiguracaoPontoControle[]
}
```

`SyncConfig.pontoControle: PontoControleConfig` novo (campo irmão de `controleProcessos`, não aninhado nele — a feature se aplica a qualquer tela com ícones de ponto de controle, não só às tabelas de listagem do Lote D). Default: `{ ativo: true, regras: [] }`.

### Wiring — `content-scripts/ponto_controle/index.ts` (novo)

`matches` idêntico ao `core` (`acao=*`, broad — mesma universalidade do original, que roda em qualquer tela do SEI), frame único (sem `all_frames` — o original não tinha necessidade documentada de cobrir iframes para esta feature especificamente). Lê `createSyncConfigStore().get()`; se `pontoControle.ativo`, para cada regra aplica o `filter` já cacheado aos elementos encontrados por `construirSeletorPontoControle`.

```ts
async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.pontoControle.ativo) return

    const emProcedimentoVisualizar = document.location.search.indexOf('acao=procedimento_visualizar') > 0

    config.pontoControle.regras.forEach((regra) => {
      const seletor = construirSeletorPontoControle(regra.nome, emProcedimentoVisualizar)
      document.querySelectorAll<HTMLImageElement>(seletor).forEach((img) => {
        img.style.filter = regra.filter
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar cores de ponto de controle:', error)
  }
}
```

### Options — nova seção "Ponto de Controle" na aba Processos

Adiciona uma 4ª seção à aba Processos (já implementada no Lote D): checkbox "Ativar" + `montarListaEditavel` com campos `nome` (texto) e `cor` (cor) — mesmo componente genérico já usado pela seção "Cor por especificação", sem alterações nele.

No momento de salvar, para cada `{nome, cor}` retornado por `obterItens()`, calcula `filter = colorToFilter(cor)` **naquele momento** (não no content script) e persiste `{nome, cor, filter}`. Cada cálculo roda em `try/catch` individual — se uma regra falhar (formato inválido, ou o caso raro de não-convergência), essa regra é descartada silenciosamente da lista salva (loga o erro, não trava o salvamento das demais regras válidas).

## Testes

Vitest cobrindo: `isHEXValid`/`isRGBValid`/`hexToRgb`/`rgbToHex` (valores exatos, determinísticos); `colorToFilter` (contrato — não lança para HEX/RGB válidos, retorna string no formato `filter: ...` esperado via regex, lança `Error` para formato inválido; sem asserção de valor exato de saída); `construirSeletorPontoControle` (os 2 ramos: dentro e fora de `procedimento_visualizar`). O content script e o wiring de opções (incluindo o cálculo de filtro no salvamento) não são cobertos por TDD — verificados via build.

## Tratamento de erros

`colorToFilter` pode lançar (contrato herdado do original) — todo call site (options ao salvar, testes) trata explicitamente. Bootstrap do content script roda em `try/catch`, loga via `console.error('[SEIRMG] ...', error)`, nunca lança.

## Fora de escopo

- Sem mudança de manifest além do novo bloco de `content_scripts` (mesmos `matches` do `core`, nenhuma permissão nova).
- Sem recorte/validação de imagem além do que já existe nativamente no SEI — a feature só recolore ícones já presentes na página.
