# SEIRMG — Lote O (parte 2): Lado da extensão para consumo do Planka via n8n

> Spec resultante de brainstorming em 2026-07-09. Segundo dos dois sub-projetos do Lote O revisado (`docs/ROADMAP-LOTES.md`). O primeiro — schema SQL, funções de hash/JWT testadas e roteiro de montagem dos workflows n8n (`infra/planka-auth/`) — está implementado e mesclado em `main` (spec irmã: `2026-07-09-seirmg-lote-o-planka-auth-n8n-design.md`). Este documento cobre exclusivamente o lado da extensão Chrome: tela de configuração/login e exibição dos dados do Planka na tela do processo do SEI.

## Contexto

O backend (n8n) já expõe dois webhooks:
- `POST /webhook/seirmg-login` — `{ email, senha }` → `{ token }` (200) ou `{ error }` (401).
- `POST /webhook/seirmg-consultar-processo` — cabeçalho `Authorization: Bearer <token>`, corpo `{ processo: "<NUP>" }` → `{ tipoProcesso, nomeProcesso, localizacao, detalhe, ultimoComentario }` (200), `{ error }` (401 token inválido/expirado) ou `{ error }` (404 processo sem card no Planka).

Falta o lado da extensão: uma tela pra guardar a URL do n8n e logar, e a exibição desses dados na tela do processo, correlacionando pelo NUP (número do processo do SEI).

## Escopo

- Preencher a aba **"Integrações"** já existente em `src/options/index.html` (`data-aba="integracoes"`, hoje só um placeholder "Em breve: configuração da integração com o Planka.") — não é uma aba nova, o botão e o painel já existem, só o conteúdo falta.
- Novo painel na tela de visualização de processo (`procedimento_visualizar`) mostrando Tipo de Processo, Localização e Último Comentário do card correspondente, quando existir.
- **Fora de escopo** (herdado da spec do sub-projeto 1, não reaberto aqui): rate limiting, refresh token automático, painel administrativo além do link de cadastro, IDs de projeto/board configuráveis por instalação.

## Armazenamento

Novo campo opcional em `LocalConfig` (`src/lib/storage.ts`) — token é credencial de sessão, não deve sincronizar entre instalações via `chrome.storage.sync`:

```ts
export interface PlankaConfig {
  baseUrl?: string
  email?: string
  urlCadastro?: string
  token?: string
  tokenExp?: number // claim `exp` do JWT (segundos desde epoch)
}
```

adicionado como `planka?: PlankaConfig` em `LocalConfig`. Sem mudança em `DEFAULT_LOCAL_CONFIG` (campo opcional, ausente até o primeiro login — mesmo padrão de `baseUrlSei?`/`atalhoPublicacoesDisponivel?` já existentes).

## Permissão de host (CORS)

O n8n não retorna `Access-Control-Allow-Origin` por padrão, então a chamada da extensão pro webhook esbarraria em CORS. Solução: `manifest.config.ts` ganha `optional_host_permissions: ['*://*/*']`. Ao clicar em "Entrar" na aba Integrações (dentro do próprio gesto de clique), a extensão chama `chrome.permissions.request({ origins: [origemDaBaseUrl] })` — o Chrome mostra o diálogo nativo pedindo aprovação só pro domínio específico digitado, antes de qualquer chamada de rede.

## Quem faz a chamada de rede

Diferente do fetch ao SEI (que passa pelo `background` só por causa do session gate/circuit breaker — ver `src/background/sessionGate.ts`), aqui não há esse motivo: nem a Options nem o content script de `procedimento_visualizar` interagem com a sessão do SEI ao chamar o n8n. Login acontece direto na página de Options; a consulta acontece direto no content script, ambos com `fetch()` nativo — a permissão de host concedida cobre chamadas cross-origin tanto de páginas da extensão quanto de content scripts.

## Fluxo de login (Options → aba Integrações)

1. Usuário preenche URL base do n8n, e-mail, senha, clica "Entrar".
2. Extensão pede a permissão de host pra origem da URL (`chrome.permissions.request`).
3. `POST ${baseUrl}/webhook/seirmg-login` com `{ email, senha }`.
4. 200 → decodifica o payload do JWT recebido (**sem verificar assinatura no cliente** — só decodifica a parte do meio em base64url pra ler o claim `exp`; a verificação de assinatura é responsabilidade do n8n a cada chamada de consulta) via `decodificarPayloadJwtSemVerificar`. Grava `{ baseUrl, email, token, tokenExp }` em `LocalConfig.planka`. Mostra "Conectado como `<email>`".
5. 401 → mostra "Credenciais inválidas".
6. Erro de rede/permissão negada → mostra mensagem genérica de erro, loga no console.

Se já há um token salvo e válido (`tokenValido(tokenExp, agora)`) ao abrir a aba, mostra o estado "Conectado como `<email>`" com botão "Sair" (limpa `planka` do `LocalConfig`) em vez do formulário.

Campo separado **URL de cadastro**: link estático pro Form Trigger do Workflow 3 (n8n gera um caminho próprio por formulário, não é derivável de um padrão fixo). Um botão "Cadastrar novo usuário" abre essa URL numa nova aba — só aparece se o campo estiver preenchido.

## Fluxo de consulta (tela do processo)

`src/content-scripts/procedimento_visualizar/index.ts` ganha uma função `montarPainelPlanka()`, chamada **antes** de `montarPainelAnotacao()` no `bootstrap()` (o painel fica entre "Processos relacionados" e "Anotações", confirmado no mockup visual da sessão de brainstorming).

1. Espera o elemento do NUP (mesmo padrão `esperarElemento` + seletor `.infraArvore > a[target="ifrVisualizacao"]` já usado por `alterarTitulo.ts` — não duplicar a extração, só reutilizar/expor).
2. Lê `LocalConfig.planka`. Se não há `token` ou `tokenValido(tokenExp, agora)` é falso → não faz nenhuma chamada de rede, painel não aparece.
3. Caso contrário, `POST ${baseUrl}/webhook/seirmg-consultar-processo` com `Authorization: Bearer <token>` e `{ processo: nup }`.
4. 200 → renderiza o card (ver "Exibição" abaixo).
5. 404 → painel não aparece (processo sem card correspondente — comportamento normal, não é erro).
6. 401 → limpa `token`/`tokenExp` de `LocalConfig.planka` (fica inválido pras próximas visitas) e painel não aparece.
7. Qualquer outro erro (rede, 5xx, JSON inválido) → `console.error('[SEIRMG] ...')` e painel não aparece. Nunca aparece um widget quebrado na tela do processo.

## Exibição (o card)

Baseado no layout aprovado na sessão de brainstorming (opção "A" do companheiro visual, ajustada):

- Duas pills lado a lado: Tipo de Processo (ex. "📋 Recursos Humanos") e Localização (ex. "📍 Em Análise").
- Um bloco de citação abaixo com o Último Comentário (borda esquerda na cor de destaque `#017fff`, texto em itálico).
- **Sem** o campo Detalhe — é o próprio NUP do processo, já visível na página do SEI, mostrar de novo seria redundante.
- **Sem** o campo Nome do Processo — não solicitado para exibição.
- Estilo injetado uma vez via `<style id="seirmg-estilo-planka">` no `<head>`, guardado por checagem de existência — mesmo padrão já usado pelo indicador de configuração pendente em `src/content-scripts/core/index.ts` (`ESTILO_INDICADOR_CONFIGURACAO`). Não é um arquivo `.css` novo registrado no manifest.

## Testes

Segue o padrão do projeto: lógica pura em `src/features/`, testada via Vitest; manipulação de DOM/`chrome.*` nos content-scripts e em `options/main.ts`, sem teste automatizado direto, protegida por try/catch (mesma política já aplicada a `montarPainelAnotacao()`/`carregarAbaAssinatura()` hoje).

Novo módulo `src/features/planka/token.ts`:
- `decodificarPayloadJwtSemVerificar(token: string): Record<string, unknown> | null` — decodifica só a parte do meio (base64url) de um JWT, sem checar assinatura; retorna `null` se o token não tiver 3 partes ou o JSON for inválido.
- `tokenValido(tokenExp: number | undefined, agoraIso: string): boolean` — `true` só se `tokenExp` existir e for maior que `agora` em segundos.

Casos de teste esperados: payload válido decodifica corretamente; token malformado (menos/mais de 3 partes) retorna `null`; JSON inválido na parte do payload retorna `null`; `tokenValido` com `tokenExp` ausente é `false`; com `tokenExp` no passado é `false`; com `tokenExp` no futuro é `true`.

A extração do NUP reaproveita a lógica já existente em `alterarTitulo.ts` (mesmo seletor, mesmo padrão de espera) — sem duplicar.

## Segurança

- Senha nunca é persistida — só enviada no corpo da requisição de login; o que fica salvo é o token.
- Token/e-mail/URL vivem em `chrome.storage.local` (não `sync`) — não saem do dispositivo via conta Google.
- Nenhuma verificação de assinatura do JWT acontece no cliente — o decode client-side é só pra saber quando parar de tentar usar um token vencido (UX), nunca pra decidir autorização; a autorização real é sempre validada pelo n8n a cada chamada.
- `optional_host_permissions` limita a permissão de rede cross-origin ao domínio específico que o usuário digitou, pedida explicitamente via diálogo nativo do Chrome — não é uma permissão ampla concedida silenciosamente na instalação.
