# SEIRMG — Lote P: Menu e UX Diversos (Design)

> Spec do Lote P (escopo reduzido) do roteiro em `docs/ROADMAP-LOTES.md`. Porta `ocultarMenuAutomaticamente.js`, `moveLinkMenu.js`, `atalhoPublicacoesEletronicas.js`, `linkNeutroControleProcessos.js` e `indicarConfiguracao.js` do Sei++ (`core/idle/`) — todas de baixo risco (seletores estáveis, sem regex sobre `<script>` dinâmico). Os itens exclusivos do Sei Pro (menu suspenso, mover ícone de excluir, reprodução de vídeo) ficam no Lote P2, sem código-fonte lido.

## Contexto

As 5 features originais rodam em **toda página** do SEI (`core/idle/index.js`, chamado do `ModuleInit` genérico), então esta spec estende o `content-scripts/core/index.ts` já existente em vez de criar um content script novo.

## Arquitetura

Lógica pura mínima (a maior parte das features é manipulação de DOM direta, sem lógica de decisão complexa) em `features/core/` e `lib/seiVersion.ts`; wiring estendendo `content-scripts/core/index.ts` e `background/index.ts`.

### `features/core/menu.ts`

```ts
export function deveOcultarMenu(classes: string[]): boolean
```

Porta a condição de `ocultarMenuAutomaticamente.js`: verdadeiro quando `classes` contém `'infraAreaTelaEExibeGrande'`.

### `lib/seiVersion.ts` (estendido)

```ts
export function detectarSeiVersaoMajor(doc: Document): number | null
```

Generaliza a extração já usada por `detectarSeiVersionAtLeast4` (mesmo regex sobre `script[src*="sei.js?"]`), retornando o primeiro dígito como número em vez de um booleano fixo em "4". **Não modifica** `detectarSeiVersionAtLeast4` (evita risco de regressão em código já testado) — a função nova é adicionada ao lado, ambas convivem. Usada por `moveLinkMenu`, que só deve rodar em SEI < 5.0 (porta a checagem `seiVersionCompare('>=', '5.0')` do original).

### `features/core/indicarConfiguracao.ts`

```ts
export function estaNaTelaDeConfiguracao(url: string): boolean
```

Porta `document.URL.includes('controlador.php?acao=infra_configurar')`.

### Schema novo — `lib/storage.ts` (`LocalConfig`)

```ts
mostrarIndicadorConfiguracao?: boolean
linkNeutroControleProcessos?: string
```

`mostrarIndicadorConfiguracao`: substitui o `SavedOptions.InstallOrUpdate` do original — setado como `true` no `chrome.runtime.onInstalled` (listener já existe em `background/index.ts`), limpo pelo content script quando o usuário visita `acao=infra_configurar`. `linkNeutroControleProcessos`: mesmo papel do original — URL do link de Controle de Processos sem componentes específicos de sessão, salva quando disponível na página atual e restaurada quando não.

### Wiring — `background/index.ts` (estendido)

O listener `chrome.runtime.onInstalled` já existente ganha mais uma chamada: persiste `mostrarIndicadorConfiguracao: true` em `LocalConfig`, ao lado de `agendarAlarme()`/`agendarAlarmeProcessosNovos()` já existentes.

### Wiring — `content-scripts/core/index.ts` (estendido)

Adiciona ao `bootstrap()` já existente (cada etapa em seu próprio `try/catch`):

1. **Ocultar menu automaticamente**: lê as classes de `#divInfraAreaTelaE`, aplica `deveOcultarMenu`; se verdadeiro, clica em `#lnkInfraMenuSistema`.
2. **Mover link do menu**: só roda se `detectarSeiVersaoMajor(document) < 5` (ou `null`, tratado como "não é SEI 5+", mesmo espírito conservador de `detectarSeiVersionAtLeast4`); reestrutura o DOM do link de menu para `#divInfraBarraSistemaPadraoE`, mesma lógica do original.
3. **Atalho publicações eletrônicas**: `fetch` para verificar se a página de publicações existe; se sim, insere o link em `#divInfraBarraSistemaPadraoD`.
4. **Link neutro de Controle de Processos**: se `#frmProcedimentoControlar` tem `action`, salva em `LocalConfig.linkNeutroControleProcessos`; senão, lê o valor salvo e aplica em `#lnkControleProcessos` (removendo o `onclick` nativo, mesmo comportamento do original).
5. **Indicar configuração**: se `LocalConfig.mostrarIndicadorConfiguracao`, adiciona uma classe de animação (pulso, via `<style>` injetado inline — sem CSS/manifest novo) ao ícone de configuração (`#lnkConfiguracaoSistema img, #lnkConfiguracaoSistema i, #lnkInfraConfiguracaoSistema img`); se `estaNaTelaDeConfiguracao(document.URL)` for verdadeiro, limpa o flag e remove a classe.

## Testes

Vitest cobrindo `deveOcultarMenu`, `detectarSeiVersaoMajor` (com fixture de `<script src="sei.js?4...">` e variações), `estaNaTelaDeConfiguracao`. O wiring em `background/index.ts` e `content-scripts/core/index.ts` não é coberto por TDD — verificado via build.

## Tratamento de erros

Mesmo padrão já estabelecido: `try/catch` por etapa, loga via `console.error('[SEIRMG] ...', error)`, nunca lança.

## Fora de escopo (Lote P2 — Sei Pro, sem código-fonte lido)

Menu suspenso, mover ícone de excluir para o final, reprodução de vídeo no visualizador.
