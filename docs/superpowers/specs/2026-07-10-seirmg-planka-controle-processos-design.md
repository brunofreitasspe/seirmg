# SEIRMG — Planka na tela de Controle de Processos

> Spec resultante de brainstorming em 2026-07-10. Extensão da integração Planka já implementada (specs `2026-07-09-seirmg-lote-o-planka-auth-n8n-design.md` e `2026-07-09-seirmg-lote-o-planka-extensao-design.md`, ambas mescladas em `main`) — não reabre nenhuma decisão dessas, só adiciona um novo ponto de exibição.

## Contexto

A integração Planka hoje só mostra o card (Tipo de Processo/Localização/Último Comentário) na tela de um processo individual (`procedimento_visualizar`), buscado automaticamente ao abrir a página. O usuário quer o mesmo tipo de informação também na tela de **Controle de Processos** (`procedimento_controlar` — as tabelas de Recebidos/Gerados/Detalhado, onde cada linha lista um processo).

## Decisão de arquitetura: sob demanda, não automático

Essa listagem pode ter dezenas de linhas (a extensão já tem uma feature de rolagem infinita que remove a paginação nativa do SEI, podendo chegar a centenas). O backend n8n (`infra/planka-auth/`) só tem um endpoint que consulta **um** processo por vez — buscar automaticamente o card de todas as linhas ao carregar a página geraria dezenas/centenas de chamadas de rede simultâneas.

Decisão validada com o usuário: manter **sob demanda**. Cada linha ganha um link **"📋 Ver Planka"**, sempre visível (para quem está logado — ver seção "Visibilidade"), que só dispara a consulta (1 chamada) quando clicado. Não há busca em lote, não há mudança no backend n8n.

Consequência aceita: se o processo não tiver card correspondente no Planka, isso só é descoberto **depois** de clicar (não dá pra saber de antemão sem consultar) — nesse caso o popover mostra "Nenhum card encontrado no Planka" em vez de ficar em branco, já que é uma ação explícita do usuário, diferente do carregamento automático e silencioso da tela de processo único.

## Visibilidade do link

O link "Ver Planka" só aparece se houver um token válido (`tokenValido(planka?.tokenExp, agora)` — mesma função já usada no resto da integração) **e** `planka?.urlConsulta` configurado. Sem isso, nenhum link aparece em nenhuma linha — mesma filosofia "sem configuração, sem poluição visual" já aplicada em `procedimento_visualizar`.

## Layout do resultado: popover flutuante

Ao clicar no link de uma linha, aparece um popover posicionado perto do link clicado (não empurra as linhas da tabela, não afeta o layout ao redor). Conteúdo do popover, reaproveitando o mesmo estilo visual (pills + citação) já usado no card da tela de processo único:
- Duas pills: Tipo de Processo, Localização (omitidas individualmente se vierem `null`, mesma regra já usada em `procedimento_visualizar`).
- Bloco de citação com o Último Comentário (omitido se `null`).
- Se a consulta retornar 404 (processo sem card): popover mostra o texto "Nenhum card encontrado no Planka." em vez das pills/citação.
- Se qualquer outro erro (401, 5xx, rede): popover mostra "Erro ao consultar o Planka." e loga `console.error` (mesmo padrão de log já usado no resto da integração). No caso de 401 especificamente, o token salvo é limpo (mesmo comportamento já existente em `procedimento_visualizar`), e um novo clique em qualquer linha vai encontrar o link ausente na próxima carga de página (já que o token deixou de ser válido).

Só um popover fica aberto por vez — abrir um novo fecha o anterior. Clicar fora do popover também fecha.

## Extração do número do processo por linha

Reaproveita o elemento já usado por outras funcionalidades desta mesma página (`aplicarCorProcessoEmLinhas`, `aplicarEspecificacaoEmLinhas`, `extrairChaveDeAgrupamento` em `procedimento_controlar/index.ts`): `linha.querySelector('.processoVisualizado, .processoNaoVisualizado')`. O `textContent` desse elemento (trimado) é o número do processo (NUP) — mesmo dado usado hoje para as features de prazo/cor/especificação/agrupamento já existentes nessa tabela.

## Permissão de host

Nenhuma permissão nova — a origem do `urlConsulta` já foi concedida via `chrome.permissions.request()` no momento do login (aba Integrações), e essa concessão vale para toda a extensão, não só para a página onde foi pedida.

## Testes

Sem teste automatizado direto para a manipulação de DOM/clique/popover (mesma política já aplicada ao resto dos content-scripts deste projeto — só lógica pura em `src/features/` é testada via Vitest). A extração do número da linha reaproveita um seletor já em produção nesta mesma página, sem lógica nova a testar isoladamente.

## Fora de escopo

- Descobrir de antemão quais linhas têm card no Planka (exigiria endpoint em lote no backend n8n ou consulta automática por linha — ambos avaliados e descartados nesta rodada, ver seção "Decisão de arquitetura").
- Qualquer mudança no backend n8n (`infra/planka-auth/`) — este documento cobre só o lado da extensão.
