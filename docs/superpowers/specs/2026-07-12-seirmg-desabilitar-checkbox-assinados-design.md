# Desabilitar checkbox de documentos já assinados (Bloco de Assinatura)

## Nota pós-validação em produção (2026-07-12)

Testado ao vivo pelo usuário contra a instância real do SEI (Campinas). Duas descobertas mudaram o desenho original abaixo — o resto do documento descreve o design **original**, mantido como histórico:

1. **A correspondência por unidade foi removida.** A coluna "Assinaturas" dessa tela mostra só nome da pessoa + cargo (ex.: "BRUNO FREITAS DA SILVA PEREIRA / Diretor(a) Administrativo") — a sigla da unidade **nunca aparece** nesse texto (diferente da árvore do processo usada no Lote Q). A correspondência por unidade era, portanto, código morto nessa tela. `deveSelecionar()` voltou à assinatura original (usuário apenas, `string`, sem `UsuarioEUnidade`) — mantendo as melhorias de case-insensitive/espaços tolerantes. A função `documentoJaAssinadoPorMim` foi removida; a desabilitação agora chama `deveSelecionar('com-minha-assinatura', texto, usuario)` diretamente, igual à seleção em massa.
2. **Bug real corrigido: o SEI renderiza o checkbox clicável como um `<label class="infraCheckboxLabel" for="...">` separado, com o `<input>` real visualmente oculto atrás.** Desabilitar/estilizar só o `<input>` não produzia nenhuma mudança visível na tela. Nova função `marcarCheckboxComoJaAssinado()` (em `selecaoDocumentos.ts`) usa `checkbox.labels` (API nativa) pra aplicar a mesma marcação no `<label>` associado.

## Contexto

Na tela de Bloco de Assinatura (`acao=bloco_assinatura_listar`, content script `rel_bloco_protocolo_listar`), cada linha da tabela de documentos tem um checkbox de seleção pra assinatura em massa. Se um documento já foi assinado pelo usuário logado (ou pela unidade atual dele), tentar assiná-lo de novo é uma ação inútil/redundante — o checkbox deveria vir desabilitado, com feedback visual e textual claro.

Essa tela já tem funcionalidade relacionada, entregue no Lote B (`docs/superpowers/specs/2026-07-07-seirmg-lote-b-selecao-massa-bloco-assinatura-design.md`): os links "Todos/Nenhum/Sem nenhuma assinatura/Sem a minha assinatura/Com a minha assinatura" para seleção em massa, implementados em `src/features/bloco-assinatura/selecaoDocumentos.ts` (`deveSelecionar`) e `src/content-scripts/rel_bloco_protocolo_listar/index.ts`. `deveSelecionar('com-minha-assinatura', ...)` já verifica se a célula "Assinaturas" de uma linha contém o nome do usuário logado — o mesmo conceito desta funcionalidade nova, na mesma tela, mesma tabela. Por isso, em vez de criar uma segunda definição divergente de "documento já assinado por mim", esta funcionalidade **estende** a lógica existente.

## Escopo

- Verificar, por linha da tabela de documentos do Bloco de Assinatura, se a célula "Assinaturas" já contém o nome do usuário logado **ou** a sigla da unidade atual dele.
- Se sim: desabilitar o checkbox da linha (`disabled = true`), adicionar `title` explicativo ("Documento já assinado por você") e uma classe CSS que aplica opacidade reduzida.
- Reprocessar automaticamente quando a tabela mudar (paginação/AJAX do SEI), reaproveitando o `MutationObserver` já existente no content script — sem observer novo.
- Configurável: toggle liga/desliga na página de Opções, ativado por padrão.
- Fail-safe: se usuário/unidade não puderem ser extraídos, ou a tabela/coluna não existir, a funcionalidade não faz nada (nenhum checkbox é tocado) — nunca lança erro visível nem trava a tela.

## Unificação da lógica de correspondência

`deveSelecionar()` (`src/features/bloco-assinatura/selecaoDocumentos.ts`) passa a considerar **usuário OU unidade**, com comparação **case-insensitive** e **tolerante a espaços extras** (a célula "Assinaturas" é normalizada — minúsculas, espaços múltiplos colapsados — antes do `includes`). Não normaliza acentos (dado real observado até agora não mostrou inconsistência de acentuação entre os elementos de origem e a célula "Assinaturas").

Isso afeta os tipos `'sem-minha-assinatura'`/`'com-minha-assinatura'`, hoje usados pelos links de seleção em massa do Lote B — o comportamento existente fica **mais preciso** (passa a reconhecer também assinatura pela unidade, e ignora diferença de maiúsculas/minúsculas), não muda de sentido.

A unidade atual é obtida reaproveitando `obterUnidadeAtual(seiVersionAtLeast4, doc)`, já existente em `src/features/procedimento-visualizar/painelLateral.ts` (já trata a diferença entre SEI < 4 e >= 4, já lê exatamente o `#lnkInfraUnidade`/`select[name='selInfraUnidades']` que a tela de Bloco de Assinatura também tem).

## Arquitetura técnica

- `src/features/bloco-assinatura/selecaoDocumentos.ts`: assinatura de `deveSelecionar` passa a receber usuário e unidade (em vez de só usuário). A função de desabilitação usa `deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario, unidade)` diretamente — nenhuma lógica de correspondência nova é escrita, só reusada.
- `src/content-scripts/rel_bloco_protocolo_listar/index.ts`: nova função `aplicarDesabilitacaoAssinados()`, chamada:
  - No bootstrap inicial, junto com `processarPagina()`/`montarSelecaoDocumentos()`.
  - Dentro do callback do `MutationObserver` já existente (que observa `#divInfraAreaTabela` com `{ childList: true, subtree: true }`) — sem observer novo, sem risco de loop (a função só altera atributos de elementos já existentes — `disabled`, `title`, `className` — e o observer não está configurado com `attributes: true`, então essas mutações não retriggam o próprio observer).
  - Reaproveita a mesma extração de `usuario` (`extrairNomeUsuario` sobre `#lnkUsuarioSistema`) e a mesma detecção de coluna (`encontrarIndiceColunaAssinaturas`) já usadas por `montarSelecaoDocumentos`/`aplicarSelecao`.
  - Unidade obtida uma vez por execução via `obterUnidadeAtual`.
- Config: novo `SyncConfig.featureFlags.desabilitarDocumentosAssinados: boolean` (default `true`), mesmo padrão/local de `selecaoEmMassaBlocoAssinatura`. `aplicarDesabilitacaoAssinados()` sai cedo (fail-open) se a flag estiver desligada.
- CSS: `.seirmg-checkbox-ja-assinado { opacity: 0.5; cursor: not-allowed; }` em `src/content-scripts/core/theme.css`.
- Toggle na página de Opções: novo checkbox na mesma aba/seção onde já mora o toggle de "Ativar seleção em massa de documentos" (`src/options/index.html`/`main.ts`), ativado por padrão.

## Fora de escopo

- Não força desmarcar (`checked = false`) um checkbox que porventura já estivesse marcado antes de ser desabilitado — checkboxes desabilitados não são enviados em submits de formulário nativos do navegador, então não há risco funcional; só o `disabled` importa.
- Não altera o comportamento dos links de seleção em massa além da melhoria de precisão da correspondência (nome OU unidade, case-insensitive) — nenhum link novo, nenhuma UI nova nessa parte.
- Não normaliza acentuação nos textos comparados.

## Testes

- Testes unitários da nova assinatura de `deveSelecionar` (usuário, unidade, case-insensitive, espaços extras) em `selecaoDocumentos.test.ts` — estendendo os testes já existentes, cobrindo também correspondência só por unidade.
- Sem teste unitário dedicado para `aplicarDesabilitacaoAssinados()` (wiring de content script, mesmo padrão já estabelecido no projeto pra esse tipo de código — ver Lote Q).
