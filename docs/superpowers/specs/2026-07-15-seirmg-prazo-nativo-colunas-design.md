# SEIRMG — Colunas Dias/Prazo com fonte nativa + correção de ordenação — Design

> Melhoria sobre o **Lote D** (`docs/superpowers/specs/2026-07-07-seirmg-lote-d-controle-processos-design.md`)
> e o **Lote E3** (`docs/superpowers/specs/2026-07-07-seirmg-lote-e3-ordenar-tabela-design.md`), a partir do
> item pendente já registrado em `docs/ROADMAP-LOTES.md` (item M): "aplicar essa mesma fonte na coluna
> Dias/Prazo da tabela nativa (Lote D, que continua baseada em marcador)". Pedido do usuário, a partir de
> `docs/melhorias.png`: as colunas "Dias" e "Prazo" da tabela de Controle de Processos apareciam vazias na
> maioria das linhas e não eram ordenáveis por clique no cabeçalho.

## Contexto

Duas causas raiz identificadas em `src/content-scripts/procedimento_controlar/index.ts`:

1. **Ordenação quebrada nessas duas colunas**: `montarOrdenacaoTabelas()` roda em `bootstrap()` *antes* de
   `aplicarPrazos()`, mas é `aplicarPrazos()` quem cria os `<th>` de "Dias"/"Prazo". Como
   `montarOrdenacaoTabelas()` só itera os `<th>` que já existem no DOM no momento em que roda, essas duas
   colunas nunca recebem o listener de clique — mesmo as outras colunas nativas já sendo ordenáveis desde
   o Lote E3.
2. **Fonte de dado frágil**: hoje as colunas são calculadas a partir de texto embutido manualmente num
   *marcador* (convenção do Sei++, `onmouseover` de `td > a[href*='acao=andamento_marcador_gerenciar']`),
   herdada do Lote D. A maioria dos processos não usa essa convenção, por isso as colunas ficam vazias. O
   projeto já tem uma fonte mais confiável e validada ao vivo: o ícone nativo **"Controle de Prazo"** do
   próprio SEI (`td > a[href*='acao=controle_prazo_definir']`), lido por `obterControleDePrazoDaLinha`
   (hoje usado só pelo painel de Favoritos, `docs/superpowers/specs/2026-07-11-seirmg-favoritos-painel-enriquecido-design.md`).

## Decisões validadas com o usuário (2026-07-15)

- O Controle de Prazo nativo do SEI vira a **única** fonte das colunas Dias/Prazo da tabela nativa — sem
  fallback pro cálculo antigo por marcador. Processo sem Controle de Prazo definido no SEI → célula vazia
  (mesmo comportamento que o painel de Favoritos já tem hoje para "sem prazo").
- Coluna "Dias" mostra **número puro** (ex. `8`), nunca o texto bruto do tooltip nativo do SEI — garante
  ordenação numérica correta via `detectarTipoColuna`/`compararValores` (`features/controle-processos/ordenarTabela.ts`,
  inalterados).
- Coluna "Prazo" mostra a **data de vencimento** (`dd/mm/aaaa`), não mais uma contagem de dias — ordena
  como tipo `'data'`, também já suportado sem alterações.

## Arquitetura

### `features/controle-processos/prazos.ts`

Remove o que só servia ao cálculo por marcador (sem mais nenhum uso após a troca de fonte):
`calcularDiasDoMarcador`, `extrairDataDoMarcador`, o tipo `TipoCalculoPrazo`. Mantém `extrairTextoMarcador`
(reaproveitada dentro de `obterControleDePrazoDaLinha` para o parsing do tooltip do Controle de Prazo),
`isValidDate`, `parseDataBr` (privada), `formatarDataBr` (já sem uso em produção antes desta mudança — fora
de escopo, não mexer).

Nova função pura:

```ts
export function calcularDiasAteVencimento(dataTexto: string, agora: Date): number | null
```

- Valida `dataTexto` com `isValidDate`; se inválida, retorna `null`.
- Caso válida, aplica a mesma fórmula que já existia para o tipo `'prazo'`:
  `Math.floor((data.getTime() - agora.getTime()) / msPorDia) + 1`.

`classificarPrazo` perde o parâmetro `tipo` (só resta um significado — "dias até vencer" — então a
comparação fica fixa nesse sentido):

```ts
export interface ConfiguracaoLimites {
  alerta: number
  critico: number
}
export function classificarPrazo(valor: number, config: ConfiguracaoLimites): 'alerta' | 'critico' | null
```

- `valor >= config.critico && valor < config.alerta` → `'alerta'`.
- `valor < config.critico` → `'critico'`.
- Caso contrário → `null`.

### `content-scripts/procedimento_controlar/index.ts`

- `definirTiposPrazo`/`aplicarUmTipoDePrazo` são substituídas por uma única função `aplicarPrazoNaLinha(linha, config)`
  que: chama `obterControleDePrazoDaLinha(linha)` uma vez; se `exibirDias`, cria `<td>` com
  `calcularDiasAteVencimento(prazo.dataTexto, new Date())` (ou vazio); se `exibirPrazo`, cria `<td>` com
  `prazo.dataTexto` (ou vazio); se houve dias calculados, aplica `classificarPrazo` e as classes
  `infraTrseippalerta`/`infraTrseippcritico` na linha (mesmas classes já estilizadas pelos temas do Lote C).
- `aplicarPrazosEmLinhas` (usada tanto no bootstrap quanto ao chegarem linhas novas da rolagem infinita)
  passa a chamar `aplicarPrazoNaLinha` por linha.
- `aplicarPrazos` (cria os `<th>` uma vez por tabela) simplifica para dois blocos condicionais
  (`exibirDias`/`exibirPrazo`) em vez de iterar `definirTiposPrazo`.
- **Correção de ordem no `bootstrap()`**: `createSyncConfigStore().get()` + `aplicarPrazos(...)` passam a
  rodar antes de `montarOrdenacaoTabelas()` (troca de posição apenas; nenhuma outra função do bootstrap
  depende de rodar antes ou depois desse bloco).
- `obterControleDePrazoDaLinha` não muda — continua sendo a mesma função já usada pelo painel de Favoritos,
  agora com um segundo chamador.

### `lib/storage.ts`

```ts
export interface PrazosConfig {
  ativo: boolean
  exibirDias: boolean
  exibirPrazo: boolean
  alerta: number
  critico: number
}
```

Remove `alertaDias`/`criticoDias`/`alertaPrazo`/`criticoPrazo`. Novo default:
`{ ativo: true, exibirDias: true, exibirPrazo: true, alerta: 10, critico: 5 }` (reaproveita os valores que
já eram usados pelo antigo tipo `'prazo'`, mesma semântica "dias até vencer").

**Sem migração de config existente** — usuários com config antiga salva (`alertaDias` etc.) simplesmente
passam a usar os novos defaults `alerta`/`critico` na próxima leitura, já que os campos antigos deixam de
ser lidos. Mesmo padrão de "sem migração" já aceito em outras mudanças de schema do projeto (ex. Lote L,
`FavoritoProcesso.especificacao?`).

### `options/index.html` + `options/main.ts`

Aba "Processos", seção "Prazos": remove os campos "Alerta (dias)"/"Crítico (dias)"
(`processos-prazos-alerta-dias`/`processos-prazos-critico-dias`). Renomeia
`processos-prazos-alerta-prazo`/`processos-prazos-critico-prazo` para `processos-prazos-alerta`/`processos-prazos-critico`
com rótulos "Alerta (dias até vencer)"/"Crítico (dias até vencer)" — únicos limiares, valem para as duas
colunas. Checkboxes "Exibir coluna Dias"/"Exibir coluna Prazo" continuam como estão (controlam visibilidade
de cada coluna independentemente, mesmos dados de base).

## Fora de escopo

- Painel de Favoritos (`montarCelulaPrazo`) — já usa `obterControleDePrazoDaLinha`, não muda.
- Qualquer novo fallback para a convenção antiga de marcador.
- Sei Pro / agrupamento / rolagem infinita / novas permissões de manifest.

## Testes

`prazos.test.ts`: remove os testes de `calcularDiasDoMarcador`/`extrairDataDoMarcador`/`TipoCalculoPrazo`;
adiciona casos para `calcularDiasAteVencimento` (data futura, passada, hoje, texto inválido); atualiza os
casos de `classificarPrazo` pra nova assinatura sem `tipo` (alerta, crítico, neutro, limites exatos).
`storage.test.ts`: atualiza expectativas de default de `controleProcessos.prazos`. Wiring em
`content-scripts/procedimento_controlar/index.ts` e `options/main.ts` seguem sem teste automatizado, mesmo
padrão já estabelecido no projeto (verificado via build/typecheck).
