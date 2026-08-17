# SEIRMG — Backup e Restauração de Configurações — Design

## Contexto

Pedido direto do usuário: hoje o SEIRMG só exporta/importa **favoritos** (JSON/CSV, botões na
própria tela de Controle de Processos — `src/features/controle-processos/favoritosExportar.ts`,
usados em `src/content-scripts/procedimento_controlar/index.ts`). O usuário quer um backup mais
amplo, cobrindo *toda* configuração do sistema — deu como exemplos o dicionário do corretor
ortográfico (palavras ignoradas), o visual do Kanban (listas/cores), a definição de prazo
(alerta/crítico) e o tempo de aviso do bloco de assinatura.

Levantamento do `src/lib/storage.ts` confirma que praticamente tudo isso já vive num único
objeto: `SyncConfig` (chave `config` em `chrome.storage.sync`), que contém `featureFlags`, `tema`,
`blocoAssinatura`, `controleProcessos` (que por sua vez inclui `prazos`, `coresProcesso`,
`especificacao`, `rolagemInfinita`, `agrupamento`, `favoritos`, `alertaNaoAssinados`, `kanban`),
`pontoControle`, `documentoExterno`, `ferramentasIA` (inclui chaves de API), `corretorOrtografico`,
`formatacaoBasica`, `referenciaLink`, `tarefas`, `historicoProcessos`, `dashboard`. Isso torna o
backup completo bem mais simples que o export de favoritos: não precisa extrair campo a campo, é
o objeto inteiro.

O outro lado do storage, `LocalConfig` (chave `config` em `chrome.storage.local`), guarda coisas
que são mais cache/estado de sessão do que "configuração" (token/e-mail do Planka, estado de
notificações já disparadas, `baseUrlSei`, `sessaoInvalidaAte` etc.) — decisão do usuário, tomada
durante o brainstorming, foi deixar esse conjunto de fora do backup, **exceto** três campos com
valor de "histórico"/dado do usuário que fazem sentido preservar: `historicoProcessosVisitados`,
`historicoEventos`, `snapshotPrazosProcessos`.

Também decidido no brainstorming: as chaves de API de IA (`ferramentasIA.openai/gemini/claude.
apiKey`) **entram no backup em texto puro**, sem redação — escolha explícita do usuário pra manter
simples, dado que o arquivo é um download local que fica só com ele.

## Escopo

- Novo módulo puro `src/features/backup/backup.ts`: monta e valida o objeto de backup, sem I/O
  (mesmo padrão de `favoritosExportar.ts`).
- Nova aba **"Backup"** na tela de Options (`src/options/`), entre "Aparência" e "Corretor
  Ortográfico" na ordem alfabética das abas.
- Botão "Baixar backup": baixa um `.json` com `SyncConfig` inteiro + os 3 campos combinados do
  `LocalConfig`.
- Fluxo de restauração: escolher arquivo → validar → diálogo de confirmação nativo (`confirm()`)
  avisando que vai **substituir todas as configurações atuais** e que não pode ser desfeito →
  aplicar.
- Fora de escopo: qualquer coisa do `LocalConfig` além dos 3 campos citados (token/e-mail do
  Planka, estado de sessão, notificações já disparadas); merge/mesclagem com a configuração atual
  (restauração é sempre substituição total); exportação em CSV (dado é hierárquico, não tabular);
  sincronização/backup automático em nuvem (é sempre um download/upload manual de arquivo).

## Formato dos dados

```ts
export interface BackupCompleto {
  versaoSeirmg: string        // chrome.runtime.getManifest().version
  exportadoEm: string         // ISO (Date.toISOString())
  sync: SyncConfig
  local: {
    historicoProcessosVisitados: HistoricoProcessoEntry[]
    historicoEventos: EventoHistorico[]
    snapshotPrazosProcessos: SnapshotPrazoProcesso[]
  }
}
```

`sync` é o `SyncConfig` completo, sem seleção de campos — cobre dicionário do corretor
(`corretorOrtografico.palavrasIgnoradas`), listas/cores do Kanban (`controleProcessos.kanban`),
prazos (`controleProcessos.prazos`), tempo de aviso do bloco (`blocoAssinatura.
lembreteIntervaloMinutos` e `checagemOportunistaIntervaloMinutos`), tema, atalhos de formatação,
regras de ponto de controle, config de documento externo, chaves/modelo de IA, favoritos, tarefas,
histórico (toggle), dashboard (toggle) — tudo de uma vez, porque já é um objeto único no storage
hoje.

## API do módulo `backup.ts`

```ts
export function montarBackupCompleto(
  sync: SyncConfig,
  local: Pick<LocalConfig, 'historicoProcessosVisitados' | 'historicoEventos' | 'snapshotPrazosProcessos'>,
  versaoSeirmg: string,
  agora: Date
): BackupCompleto

// Retorna null se o JSON for inválido, não for objeto, ou não tiver `sync`/`local` como objetos.
// Validação rasa (mesmo nível de parseImportacaoFavoritos) — não valida campo a campo dentro de
// `sync`/`local`; a rede de segurança contra campos faltando é o merge com os DEFAULT_*_CONFIG
// feito por aplicarBackupRestaurado.
export function parseBackupCompleto(json: string): BackupCompleto | null

// Faz merge raso (nível 1: cada chave de topo de SyncConfig, cada uma das 3 chaves de local) do
// backup sobre DEFAULT_SYNC_CONFIG/campos correspondentes — qualquer chave de topo ausente no
// backup (ex.: backup antigo sem `dashboard`, adicionado depois) cai no default em vez de virar
// undefined. Não faz merge profundo dentro de cada sub-config: se `sync.controleProcessos` existir
// no backup, ele substitui o `controleProcessos` inteiro do default (não mescla campo a campo
// dentro dele) — comportamento aceitável porque só schemaVersion 1 existe até agora.
export function aplicarBackupRestaurado(backup: BackupCompleto): {
  sync: SyncConfig
  local: Pick<LocalConfig, 'historicoProcessosVisitados' | 'historicoEventos' | 'snapshotPrazosProcessos'>
}
```

## UI — aba "Backup"

Nova seção `#painel-backup` em `src/options/index.html`, ícone `lucide-static/icons/archive.svg`,
seguindo o markup padrão das outras abas (`<section class="painel">`, `<h2>`, `<button>`, `<span>`
de status):

```
[Backup e Restauração]

Fazer backup
Baixa um arquivo .json com todas as configurações atuais (dicionário do corretor, Kanban,
prazos, avisos de bloco, tema, IA, favoritos, tarefas, atalhos, ponto de controle, histórico) —
inclui as chaves de API salvas.

  [ Baixar backup ]

Restaurar backup
Substitui TODAS as configurações atuais pelas do arquivo escolhido. Essa ação não pode ser
desfeita.

  [ Escolher arquivo... ]
  [ Restaurar ]
  <span id="backup-status"></span>
```

Nome do arquivo baixado: `backup-seirmg-YYYY-MM-DD.json` (mesmo padrão de
`favoritos-seirmg.json`, usando `chrome.runtime.getManifest().version` dentro do conteúdo, não no
nome do arquivo).

## Fluxo de restauração

1. Usuário escolhe o arquivo → conteúdo lido via `FileReader`, passado a `parseBackupCompleto`.
   Se `null`: status de erro ("Arquivo inválido ou corrompido."), nada é alterado, fluxo para.
2. Se válido: `confirm()` nativo — "Isso vai substituir TODAS as configurações atuais pelas do
   backup de <exportadoEm formatado em pt-BR>. Essa ação não pode ser desfeita. Continuar?". Se
   cancelado, nada é alterado.
3. Se confirmado: `aplicarBackupRestaurado(backup)` → `createSyncConfigStore().set(resultado.sync)`
   + `createLocalConfigStore().get()` seguido de um `set` que sobrescreve *só* as 3 chaves
   restauradas, preservando os demais campos do `LocalConfig` atual (token do Planka, estado de
   sessão etc. não são tocados).
4. Status "Backup restaurado com sucesso." e re-chama todas as `carregarAbaX()` já existentes na
   página de Options, pra refletir os novos valores nos campos de cada aba sem precisar recarregar
   a página inteira.
5. Igual a qualquer mudança de configuração hoje no projeto: abas do SEI já abertas em outras janelas
   só pegam os novos valores depois de um F5 nelas — não é uma regra nova deste recurso.

## Tratamento de erros

- JSON malformado ou arquivo sem `sync`/`local` como objetos → rejeitado por `parseBackupCompleto`,
  mensagem de erro visível, nenhuma escrita no storage acontece.
- Falha ao ler o arquivo (`FileReader.onerror`) → mesma mensagem de erro genérica.
- Restauração cancelada no `confirm()` → nenhuma escrita, sem mensagem de erro (é um fluxo normal,
  não uma falha).

## Testes

`src/features/backup/backup.test.ts` (vitest), cobrindo:
- `montarBackupCompleto` monta o objeto esperado a partir de um `SyncConfig`/subset de
  `LocalConfig` de exemplo.
- `parseBackupCompleto` aceita um backup válido; rejeita (`null`) JSON malformado, `"null"`,
  array no lugar de objeto, objeto sem `sync`, objeto sem `local`.
- `aplicarBackupRestaurado` preenche com o default qualquer chave de topo ausente no `sync` do
  backup (simulando um backup "antigo" sem, por exemplo, `dashboard`); preserva os campos do
  `local` restaurado tal como vieram (sem misturar com nenhum valor "atual", já que o módulo é
  puro e não conhece o storage real).
