# SEIRMG — Lote H: Autopreencher Recebimento de Documento Externo (Design)

> Spec do Lote H (escopo reduzido) do roteiro em `docs/ROADMAP-LOTES.md`. Porta `autopreencherDocumentoExterno.js` do Sei++ — a única feature do Lote H original com código-fonte Sei++ real (as demais são Sei Pro sem código lido, viram Lote H2).

## Contexto

Feature de baixo risco: todos os seletores são IDs estáveis e nativos do formulário de "Incluir Documento Externo" do SEI (`#txtDataElaboracao`, `#optNato`/`#optDigitalizado`, `#selTipoConferencia`, `#optPublico`/`#optRestrito`/`#optSigiloso`, `#selHipoteseLegal`, `#btnSalvar`) — mesmo nível de confiança dos lotes B–E2/G. Roda na mesma tela `documento_receber` que já tem content script (Lote F).

## Arquitetura

### `features/documento-receber/autopreencher.ts`

```ts
export function formatarDataHoje(data: Date): string
```

Porta `getFormattedDate` do original — formato `DD/MM/AAAA`.

### Schema novo — `lib/storage.ts`

```ts
export type FormatoDocumento = 'N' | 'D'
export type NivelAcessoDocumento = 'P' | 'R' | 'S'

export interface DocumentoExternoConfig {
  ativo: boolean
  formato: FormatoDocumento
  tipoConferencia: string
  nivelAcesso: NivelAcessoDocumento
  hipoteseLegal: string
}
```

`SyncConfig.documentoExterno` novo. Defaults **conservadores por segurança**: `ativo: true`, `formato: 'N'` (Nato), `nivelAcesso: 'P'` (Público), `tipoConferencia`/`hipoteseLegal` vazios — nunca pré-seleciona um nível de acesso sigiloso/restrito por padrão.

### Wiring — `content-scripts/documento_receber/index.ts` (estendido)

Nova função independente `autopreencherDocumentoExterno(config)`, chamada no início do bootstrap já existente (Lote F), guardada pela presença de `#txtDataElaboracao` (só roda na tela de novo documento externo, não nas demais sub-telas de `documento_receber`):

1. Preenche `#txtDataElaboracao` com a data de hoje via `formatarDataHoje`.
2. Após 500ms (mesmo delay do original, aguardando o JS nativo do SEI inicializar os campos): clica em `#optNato` ou `#optDigitalizado` conforme `config.formato` (usa `.click()`, não só `checked`, para dos parar os handlers nativos do SEI — mesma técnica do original); se digitalizado, seta `#selTipoConferencia`.
3. Clica em `#optPublico`/`#optRestrito`/`#optSigiloso` conforme `config.nivelAcesso`.
4. Se restrito/sigiloso, após 500ms seta `#selHipoteseLegal`.
5. Insere aviso vermelho ("Houve preenchimento de valores pré configurados...") antes dos botões Salvar (superior e inferior) — mesmo texto/posição do original.

### Options — aba Editor de Documentos

Primeira implementação real (hoje só texto placeholder): checkbox "Ativar" + campos para os 4 valores de configuração (`formato` via select N/D, `tipoConferencia` texto, `nivelAcesso` via select P/R/S, `hipoteseLegal` texto).

## Testes

Vitest cobrindo `formatarDataHoje` (data com dia/mês de um dígito, exige zero à esquerda). O wiring não é coberto por TDD — verificado via build.

## Tratamento de erros

Mesmo padrão já estabelecido: `try/catch` na função inteira e no `setTimeout` interno, loga via `console.error('[SEIRMG] ...', error)`, nunca lança.

## Fora de escopo (Lote H2 — Sei Pro, sem código-fonte lido)

Envio múltiplo de documentos externos, Ações em Lote (ciência/excluir/sigilo/assinar/cancelar), Documentos em Lote via CSV com campos dinâmicos.
