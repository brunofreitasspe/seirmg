# SEIRMG — Design de Arquitetura (Etapa 2)

> Spec resultante do processo de brainstorming feito em 2026-07-06, após a Etapa 1 (análise) documentada em `../../../ANALISE.md`. Cobre a arquitetura do projeto novo, mas não a implementação das features herdadas em si (isso vai para o plano de implementação, via `writing-plans`).

## Contexto

O SEIRMG unifica duas extensões existentes para o sistema SEI — **Sei++** (`C:\sei\seiplus`) e **Sei Pro** (`C:\sei\seipro`) — num projeto novo em `C:\sei\seirmg`, alvo exclusivo Google Chrome/Manifest V3. A Etapa 1 (análise completa dos dois projetos, comparação de features, conflitos e recomendação de stack) está em `ANALISE.md`, incluindo as decisões já validadas pelo usuário (seção 6 daquele documento). Este documento assume essas decisões como dadas e não as repete in extenso.

## Decisões de escopo herdadas da Etapa 1 (resumo)

- Módulo **Atividades** (Sei Pro) — fora de escopo (dependência de servidor externo não documentado).
- Módulo **Projetos** (Sei Pro) — não portar a versão Google Sheets; integrar com uma instância **Planka** já operada pela autarquia (rede interna), como stub configurável nesta primeira entrega (sem mapeamento processo↔cartão ainda).
- Ícones: **Lucide** (não Font Awesome Pro).
- Tema: motor do Sei Pro (cor customizável + `dark-mode` cross-iframe) como único mecanismo; temas fixos do Sei++ (`black`/`super-black`) viram presets dele.
- Indicador de pendência consolidado: badge fixo ao lado do logo (estilo Sei++), não o contador no favicon (estilo Sei Pro).
- Sem migração automática de dados dos projetos antigos (extensão nova = `chrome.storage` isolado por ID) — usuário reconfigura do zero.
- Stack: TypeScript + Vite + `@crxjs/vite-plugin` + Bun + Vitest; jQuery mantido como dependência de pacote (não vendorizado).
- Ícone da extensão: logo oficial do sistema **SEI!** fornecido pelo usuário (`C:\sei\seirmg\icones\icones.png`, mockup composto 16/32/48/128px a recortar). Cor primária: azul institucional.
- Opções: página **nativa** da extensão (não injetada no SEI), organizada em abas por categoria.

## Arquitetura

Extensão Manifest V3 em TypeScript, buildada com Vite + `@crxjs/vite-plugin`, gerenciada com Bun. Um único manifest gerado a partir de `manifest.config.ts` (não escrito à mão) — CRXJS resolve `content_scripts`/service worker/popup/options como grafo de módulos ES, com code-splitting e `web_accessible_resources` automáticos, eliminando o hack de injeção dinâmica via `$.getScript` que o Sei Pro usa hoje.

### Organização de módulos de content script

**Decisão**: um módulo de content script por tela/ação do SEI (evolução tipada do padrão que o Sei++ já usa), em vez do agrupamento largo por conjunto de telas do Sei Pro. Cada pasta em `src/content-scripts/<acao>/` mapeia para um bloco de `content_scripts` no manifest, com `matches` restrito à `acao=` correspondente. Motivo: mais fácil de testar/portar feature por feature sem quebrar outras, e o CRXJS já resolve o problema de organização/performance que motivava o padrão do Sei Pro (que existia só porque não havia build tool).

### Estrutura de pastas

```
seirmg/
├── manifest.config.ts
├── package.json / bun.lock / tsconfig.json / vite.config.ts / vitest.config.ts
├── src/
│   ├── background/                 # service worker: alarms, notifications, message bus, scraping via fetch
│   │   ├── index.ts
│   │   ├── alarms/                 # verificação periódica (processos novos, bloco de assinatura)
│   │   └── notifications/          # criação/clique de notificações nativas
│   ├── content-scripts/
│   │   ├── core/                   # bootstrap comum: versão do SEI, tema, opções, badge de pendência
│   │   ├── procedimento_visualizar/
│   │   ├── procedimento_controlar/
│   │   ├── rel_bloco_protocolo_listar/    # bloco de assinatura
│   │   ├── documento_receber/
│   │   ├── documento_gerar/ + documento_escolher_tipo/
│   │   ├── editor_montar/          # features de editor herdadas do Sei Pro
│   │   ├── anotacao_registrar/
│   │   ├── controle_unidade_gerar/
│   │   └── procedimento_atribuicao_cadastrar/
│   ├── features/                    # lógica pura testável: parsers de DOM, formatadores, regras
│   │   ├── bloco-assinatura/        # parser único: badge, notificação (Etapa 3) e seleção em massa reaproveitam este módulo
│   │   ├── prazos/
│   │   ├── marcadores-cores/
│   │   └── ...
│   ├── options/                     # página nativa de opções, abas por categoria
│   ├── lib/                         # storage tipado, theme engine, DOM helpers, wrapper jmespath, fetch-sei
│   ├── integrations/
│   │   └── planka/                  # cliente HTTP configurável (stub funcional nesta entrega)
│   └── assets/
│       ├── icons/                    # ícone SEI! recortado + ícones Lucide
│       └── themes/                    # presets: claro, black, super-black, custom
├── tests/ (ou *.test.ts colocalizados em features/)
├── docs/superpowers/specs/
├── README.md
├── CHANGELOG-UNIFICACAO.md
└── ANALISE.md
```

### Manifest unificado

- **Permissões**: `storage`, `notifications`, `alarms`.
- **`optional_host_permissions`**: usado para o host do Planka (ver seção de integração abaixo) — não fixado em build time, pedido dinamicamente via `chrome.permissions.request`.
- **Host permissions fixas**: cobrindo os padrões que os dois projetos de origem usam hoje (`*://*.br/*`, `*://*.org/*`, hosts explícitos adicionais como `sip-sei.ans.gov.br`), sem `<all_urls>` genérico.
- **`content_scripts`**: um bloco por módulo em `content-scripts/*`, `matches` restrito à `acao=` da tela correspondente.
- **`commands`**: nenhum (nenhum dos dois projetos de origem usa atalhos nativos hoje).
- **`action`**: popup próprio (mantém o popup do Sei++, ganha o indicador de pendência consolidado).
- **Options**: `options_ui`/`options_page` nativo, `open_in_tab: true`.

## Storage e configuração

Schema único versionado (campo `schemaVersion`, para migrações internas futuras), dividido em dois namespaces (`src/lib/storage.ts`):

- **`chrome.storage.sync`** — dados pequenos que devem seguir o usuário entre máquinas: feature flags (equivalente unificado e tipado do `CheckTypes`/`configGeral`), preset de tema escolhido, config da integração Planka (URL do host + nome do quadro — **nunca o token de API**).
- **`chrome.storage.local`** — dados maiores ou específicos da máquina: cache de listagem de processos, estado "já notificado" (Etapa 3, por ID estável de item), token de API do Planka.

Não há migração automática de dados dos projetos antigos (decisão do usuário) — o usuário reconfigura via a nova tela de opções.

## Motor de tema

Objeto único `{ preset: 'claro' | 'black' | 'super-black' | 'custom', customColor?: string }`, persistido em `storage.sync`, aplicado via classe (`dark-mode`/`theme-*`) no `<body>` de todos os iframes relevantes de uma vez (replica `setDarkModePro` do Sei Pro, centralizado em `lib/theme.ts`, tipado). `black` e `super-black` do Sei++ tornam-se presets pré-configurados desse motor (cores mapeadas a partir dos CSS originais), não folhas de estilo paralelas.

## Options UI (nativa, abas por categoria)

1. **Geral** — ligar/desligar cada feature herdada
2. **Aparência** — motor de tema
3. **Processos** — prazos, cores de marcadores/especificação, agrupamento
4. **Editor de Documentos** — features herdadas do Sei Pro
5. **Bloco de Assinatura e Notificações** — feature nova da Etapa 3: liga/desliga, intervalo de verificação, som
6. **Integrações** — Planka (URL, token, quadro/lista, status de conexão)
7. **Sobre** — versão, changelog, créditos aos projetos originais

## Esqueleto da notificação de bloco de assinatura (detalhamento pleno na Etapa 3)

- `features/bloco-assinatura/parser.ts` — parser único (baseado em `verificarBlocoAssinatura.js` do Sei++), retorna lista tipada de itens pendentes com **ID estável** por item (hash de processo+documento).
- Content script (`rel_bloco_protocolo_listar` + `core`) roda o parser ao carregar a página e observa a tabela via `MutationObserver`.
- Background (`chrome.alarms`, intervalo configurável) roda o mesmo parser via `fetch` direto, detectando novidade mesmo com o SEI fechado (mesma técnica do `notifyProcessos.js` do Sei++).
- Estado "já notificado" por ID em `storage.local`.
- `chrome.notifications.create` + `onClicked` foca/abre a aba do bloco de assinatura correspondente.
- Badge de pendência consolidado (estilo Sei++) alimentado pelo mesmo parser — unifica o que hoje são dois indicadores nos projetos de origem.

## Integração Planka (stub funcional)

- `integrations/planka/client.ts`: cliente HTTP tipado (autenticação por token, listar quadros/listas, criar cartão — este último implementado como TODO explícito, não funcional nesta entrega).
- **Permissão de host dinâmica**: a URL do Planka é definida pelo usuário em runtime (rede interna da autarquia, indisponível fora dela); portanto o host não é fixado no manifest. Ao salvar/testar a URL nas opções, a extensão chama `chrome.permissions.request({origins:[...]})` para pedir a permissão específica daquele host.
- **Timeout curto e falha graciosa**: toda chamada usa `AbortController` (~4s de timeout) — se a rede interna não estiver acessível (usuário fora da rede/VPN), falha rápido em vez de travar a UI.
- **Status visível, nunca erro solto**: aba Integrações mostra status ("Conectado"/"Planka indisponível — fora da rede interna?") com botão "Testar conexão". Qualquer ação futura dependente do Planka fica desabilitada com tooltip quando o status é "indisponível".
- **Isolamento**: chamadas ao Planka feitas a partir de um content script ficam sempre em `try/catch` isolado — uma falha de rede do Planka nunca pode interromper a execução do restante da página do SEI.

## Testes

Vitest cobrindo toda a lógica pura em `features/*` (parser de bloco de assinatura, cálculo de prazos, regras de cor/especificação) — testável sem DOM real do SEI. Sem E2E automatizado contra o SEI em CI (inviável); checklist de teste manual documentado no README.

## Tratamento de erros

Wrapper de `fetch` retorna resultado tipado (`{ok: true, data} | {ok: false, error}`) em vez de lançar exceção através de mensageria entre background/content-script. Falha de content-script nunca deve quebrar a página nativa do SEI — sempre `try/catch` no bootstrap de cada módulo, loga em console e segue.

## Fora de escopo desta entrega (registrar no CHANGELOG-UNIFICACAO.md)

- Módulo Atividades do Sei Pro (dependência de servidor externo não documentado).
- Mapeamento processo↔cartão da integração Planka (só o cliente/config ficam prontos).
- Migração automática de dados dos projetos antigos.
