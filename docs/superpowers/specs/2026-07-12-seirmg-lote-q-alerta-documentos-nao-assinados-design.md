# Lote Q — Alerta de documentos não assinados ao enviar processo

## Contexto

O Sei Pro original tem uma funcionalidade reativa (`initCheckNaoAssinados`/`boxCheckNaoAssinados`, `sei-functions-pro.js:3394-3512`) que, ao carregar a árvore do processo, avisa se existem documentos nativos (`assinado==false`) não assinados na unidade atual, usando um objeto de dados (`listDocumentos`) obtido via `mergeAllAndamentosProcesso`/`jmespath`. O `ANALISE.md` (§3.3) já registrava essa função como complementar ao badge de bloco de assinatura do SEIRMG, mas ela nunca virou um lote formal no `ROADMAP-LOTES.md`.

Este lote reimplementa a ideia com escopo mais específico, definido em brainstorming com o usuário: em vez de um banner reativo ao navegar, o alerta dispara **no momento do envio do processo**, com bloqueio de confirmação — e a detecção usa leitura direta do DOM da árvore (confirmada com HTML real fornecido pelo usuário), não um objeto de dados intermediário como o Sei Pro original.

## Escopo

- **Gatilho:** só no momento em que o usuário tenta enviar o processo (não há verificação/banner ao simplesmente abrir ou navegar no processo).
- **Unidade:** só documentos da **unidade atual** (a unidade em que o usuário está logado/trabalhando).
- **Tipo de documento:** só documentos **internos** (gerados no SEI) — identificados pelo ícone `documento_interno.svg` na árvore. Documentos externos anexados nunca entram na verificação, porque nunca são assinados dentro do SEI.
- **Ação ao detectar pendência:** bloqueia o envio com confirmação explícita — diálogo lista os documentos pendentes e exige clique em "Enviar mesmo assim" pra prosseguir. Sem pendência, o fluxo nativo segue sem nenhuma interferência.
- **Configurável:** toggle liga/desliga na aba de Opções correspondente (ativado por padrão), seguindo o padrão já usado por outras features do projeto (bloco de assinatura, lembrete).
- **Falha segura:** se a extensão não conseguir ler a árvore/determinar pendências com segurança (erro, estrutura de DOM inesperada, versão de SEI diferente), ela loga o erro no console e deixa o envio nativo seguir sem bloquear — nunca trava o fluxo do usuário por um bug da extensão.

## Mecanismo de detecção

Confirmado com HTML real da árvore do processo (não é suposição):

- **Documento assinado:** tem um par `<a id="anchorA{id}" class="infraArvoreNoAcao">` / `<img id="iconA{id}" title="Assinado por: NOME\nCARGO\nUNIDADE">` na linha do documento.
- **Documento não assinado (interno):** não tem esse par — só o ícone de tipo do documento (`documento_interno.svg`, com popover de menu "cópia protocolo").
- **Documento pendente = documento interno (ícone `documento_interno.svg`) sem o par `anchorA{id}`/`iconA{id}` de assinatura, na unidade atual.**

O identificador `documento_interno.svg` já é usado no Sei Pro original (`var nameDocInterno = 'documento_interno.svg'`) pra distinguir documentos internos de externos — mesmo critério aqui.

**Correlação por id numérico (confirmada com HTML real da árvore):** cada documento tem um id numérico (ex.: `21013865`) compartilhado entre vários elementos:
- `<img id="icon{id}">` — ícone do tipo do documento (ex.: `documento_interno.svg`). Documentos assinados têm um segundo ícone `<img id="iconA{id}">` (prefixo `iconA`, distinto de `icon{id}`).
- `<a id="anchorA{id}">` — só existe se o documento estiver assinado (ver seção anterior).
- `<a id="anchorUG{id}">` — sempre presente em documento interno; contém um `<span>` com a sigla da unidade geradora (ex.: "HMMG-DIR ADM"), confirmado com HTML real. É essa a fonte de dado pra filtrar "unidade atual" — comparando com a sigla retornada por `obterUnidadeAtual()` (`src/features/procedimento-visualizar/painelLateral.ts`).
- `<a id="anchor{id}">` — (não confirmado com HTML real, mas usado pelo Sei Pro original pra abrir/rotular o documento) provável fonte do nome/rótulo do documento pra exibir no diálogo; se ausente, cai no fallback de mostrar só o id.

Documento pendente = existe `icon{id}` com src contendo `documento_interno`, `anchorUG{id}` cujo `<span>` bate com a unidade atual, e **não** existe `anchorA{id}` correspondente.

## Arquitetura técnica

- **Novo content script** para a URL `acao=procedimento_enviar` (etapa do SEI onde se escolhe a unidade de destino do envio) — nenhum content script cobre essa URL hoje.
- Ao carregar, o script lê a árvore do processo no frame irmão (`ifrArvore`, acessível via `window.parent` por serem mesma origem) e monta a lista de documentos internos pendentes na unidade atual, usando o mecanismo de detecção acima.
- Se a lista vier vazia, nada acontece — fluxo nativo segue normal.
- Se vier com pendências, o script intercepta o clique no botão de confirmar o envio nesse formulário (equivalente ao `frmAtividadeListar` do Sei Pro) e mostra o diálogo de confirmação. Só libera o `submit` real se o usuário clicar "Enviar mesmo assim".
- Qualquer chamada a API do DOM/leitura cross-frame é protegida por try/catch (`console.error('[SEIRMG] ...', error)`, sem bloquear o envio em caso de falha) — mesma política padrão já estabelecida no projeto pra código que mexe com `chrome.*`/DOM em contexto assíncrono.
- **Pendente de validação manual numa instância SEI real:** o seletor exato do botão/form de confirmação de envio, e a forma exata de acessar o frame `ifrArvore` a partir da página de envio, só serão confirmados testando ao vivo — mesmo tratamento de risco já aplicado aos Lotes F e K (não bloqueia a entrega, mas é sinalizado explicitamente no roadmap até ser validado).

## Interface do alerta

Diálogo modal (estilo aprovado em mockup — "B, com contexto"):

- Ícone de alerta circular (vermelho) + título "Documentos pendentes de assinatura".
- Subtítulo mostrando a unidade atual e o número do processo.
- Lista dos documentos pendentes em cartão separado, cada um mostrando nome do documento + número SEI.
- Dois botões: "Cancelar" (secundário, fecha o diálogo sem enviar) e "Enviar mesmo assim" (primário, vermelho, libera o envio nativo).
- Cor de destaque: vermelho de alerta, consistente com a semântica já usada no badge de bloco de assinatura pendente.
- Precisa funcionar nos temas claro/escuro/preto do motor de tema existente (Lote C) — sem estilos fixos que quebrem em `seirmg-theme-black`.

## Configuração

Novo toggle na aba **Processos** da página de Opções (mesma aba de prazos/cores/ponto de controle/rolagem infinita/favoritos), em seção própria "Alerta de documentos não assinados" — ativado por padrão, controla se a checagem/diálogo aparece no envio.

## Fora de escopo

- Nenhum banner/indicador reativo ao simplesmente navegar no processo (diferente do Sei Pro original).
- Documentos de outras unidades (histórico do processo) não entram na verificação.
- Documentos externos anexados não entram na verificação.
- Envio de processo em lote (Lote F não cobre essa ação; se um lote futuro adicionar "enviar em lote", a integração com esse alerta fica para quando isso existir).

## Testes

- Testes unitários para a função de detecção (parse de HTML de árvore com documentos assinados/não assinados/externos, mistura de unidades) — dado que já temos exemplos reais de HTML fornecidos pelo usuário como fixture.
- Teste do fluxo de interceptação do submit (mock de DOM), incluindo o caminho de fail-open quando a leitura da árvore falha.
- Validação manual numa instância SEI real antes de considerar o lote livre do aviso de risco (mesmo processo dos Lotes F/K).
