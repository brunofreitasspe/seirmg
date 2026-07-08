# SEIRMG — Roteiro de Lotes de Implementação

> Decomposição das ~90 funcionalidades restantes de Sei++/Sei Pro (ver `ANALISE.md`, seções 1.2, 2.3, 3.1-3.3) em lotes coesos, sequenciados para minimizar retrabalho e dependências cruzadas. Cada lote vira seu próprio ciclo spec → plano → implementação (`docs/superpowers/specs/` + `docs/superpowers/plans/`) quando chega a vez dele. Este documento é o índice — atualizar o status de cada lote conforme avança.

## Já entregue

- **Scaffold + notificação de bloco de assinatura** (background: `chrome.alarms`/`chrome.notifications`) — `docs/superpowers/plans/2026-07-06-seirmg-scaffold-e-notificacao-assinatura.md` + correção — `docs/superpowers/plans/2026-07-06-seirmg-bloco-assinatura-correcao.md`
- **Lote A — Notificação de processos novos + popup** — `docs/superpowers/plans/2026-07-06-seirmg-lote-a-processos-novos.md`
- **Lote B — Bloco de Assinatura: seleção em massa** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-b-selecao-massa-bloco-assinatura-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-b-selecao-massa-bloco-assinatura.md`
- **Lote C — Motor de tema (dark mode) + aba Aparência** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-c-tema-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-c-tema.md`
- **Lote D — Controle de Processos: prazos, cor por especificação e especificação na listagem** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-d-controle-processos-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-d-controle-processos.md`
- **Lote D2 — Ponto de controle com cor customizável** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-d2-ponto-controle-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-d2-ponto-controle.md`
- **Lote E — Controle de Processos: núcleo de filtros e seleção** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-e-filtros-selecao-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-e-filtros-selecao.md`
- **Lote E2 — Filtro por atribuição e por bloco** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-e2-filtro-atribuicao-bloco-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-e2-filtro-atribuicao-bloco.md`
- **Lote F — Ações em lote sobre processos** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-f-acoes-lote-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-f-acoes-lote.md`. ⚠️ **Pendente de validação manual numa instância SEI real** — `controle_unidade_gerar` e `documento_receber` dependem de regex sobre `<script>` gerado dinamicamente pelo SEI, não verificável sem instância ao vivo (ver aviso de risco na spec).
- **Lote G — Visualização de processo: ajustes nativos, título e anotação** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-g-visualizacao-processo-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-g-visualizacao-processo.md`
- **Lote H — Autopreencher recebimento de documento externo** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-h-autopreencher-documento-externo-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-h-autopreencher-documento-externo.md`
- **Lote P — Menu e UX diversos** (ocultar menu automaticamente, mover ícone de menu, atalho de Publicações Eletrônicas, link neutro de Controle de Processos, indicador de configuração pendente) — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-p-menu-ux-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-p-menu-ux.md`
- **Lote E3 — Ordenar tabelas de Controle de Processos por clique no cabeçalho** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-e3-ordenar-tabela-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-e3-ordenar-tabela.md`. Escopo original do item E3 investigado a partir do código-fonte real (`C:\sei\seipro\dist\js\sei-pro.js`, legível); dividido em três por risco — este lote cobre só a ordenação (baixo risco). Rolagem infinita e agrupamento de lista viraram itens separados no roteiro abaixo (E3b e G2b).
- **Lote E3b — Controle de Processos: rolagem infinita na pesquisa** — spec `docs/superpowers/specs/2026-07-07-seirmg-lote-e3b-rolagem-infinita-design.md`, plano `docs/superpowers/plans/2026-07-07-seirmg-lote-e3b-rolagem-infinita.md`. Revisão final encontrou reabilitação indevida do checkbox de seleção nas linhas novas após reaplicação de filtros; corrigido (commit `b639555`) e re-revisado limpo.

## Roteiro (ordem sugerida)

| # | Lote | Escopo | Fonte |
|---|------|--------|-------|
| G2b | **Agrupar lista de processos por data/marcador/tipo/responsável (Sei Pro)** | Agrupamento da home por data de recebimento/envio/autuação/último acesso, marcadores, tipo, responsável, ponto de controle, unidade de envio, acompanhamento especial. ⚠️ Alto risco/complexidade — acoplado ao kanban próprio do Sei Pro, exportação CSV, biblioteca `chosen.js`, `jmespath`, e raspagem de histórico do processo via AJAX para inferir datas. Mesmo tratamento do Lote G2 (subsistema próprio, ~500+ linhas, muitas dependências internas). | Sei Pro §2.3, código-fonte lido em `sei-pro.js:465-680` |
| G2 | **Visualização de processo — recursos de alto risco** | Dados do processo/interessados na árvore (`consultarInteressado`/`consultarAtribuicao`, regex complexas); usar documento como modelo e dropzone → documento externo (`documentoModelo`/`dropzone.js`, este último reconstrói ~25 campos de formulário POST nativo); abrir documento em nova aba (depende de `objArvore`, API nativa não documentada); copiar link/número (exclusivas de SEI < 4). Mesmo tratamento de risco documentado do Lote F — nenhum destes tem estrutura estável o bastante pra verificar sem instância SEI real. | Sei++ §1.2 |
| G3 | **Visualização de processo — árvore (Sei Pro)** | Toolbar/menu rápido da árvore, numeração de documentos, redimensionar árvore, histórico de processos visitados. Sem código-fonte lido byte-a-byte (só documentação `pages/*.md`). | Sei Pro §2.3 [doc] |
| H2 | **Ações em lote de documentos (Sei Pro)** | Envio múltiplo de documentos externos (multi-arquivo); Ações em Lote (ciência/excluir/sigilo/assinar/cancelar); Documentos em Lote via CSV com campos dinâmicos. Sem código-fonte lido byte-a-byte. | Sei Pro §2.3 [doc] |
| I | **Editor de documentos — formatação e produtividade básica** | Hiperlinks, equações LaTeX, alinhar texto, fonte, copiar formatação, tabela rápida, quebra de página, parágrafos numerados, sumário, nota de rodapé, primeira letra maiúscula automática, salvamento automático, teclas de atalho configuráveis, título da página, URL amigável. | Sei Pro §2.3 [doc] |
| J | **Editor de documentos — recursos avançados** | QR Code, hashcode/verificação de integridade, link de documento público, link curto, link de legislação federal, Legística, referência interna/a documentos do processo, ~30 campos dinâmicos, valores padrão ao criar documento, marca d'água de minuta, sigilo/tarjas + certidão LAI, editor de imagens avançado, duplicar documento, comparador de documentos, escrita interativa (`#`/`@`), revisão de texto, ditado por voz. | Sei Pro §2.3 [doc] |
| K | **Editor de documentos — Ferramentas de IA** | Integração ChatGPT/Gemini com prompts predeterminados, chave de API do próprio usuário. Isolado dos demais por exigir tratamento próprio de permissão de host dinâmica e armazenamento de credenciais. | Sei Pro §2.3 [doc] |
| L | **Favoritos avançados** | Etiquetas coloridas, mapas (Leaflet), categorias, especificação, prazo com edição avançada, export/import (FileSystem API local). | Sei Pro §2.3 [doc] |
| M | **Prazos dedicados + reabertura programada** | Painel "Gerenciar Prazos" dedicado (mais robusto que os do Lote D), reabertura programada de processos com verificação periódica configurável, Prescrições (pequeno, acoplado a este painel). | Sei Pro §2.3 [doc] |
| N | **Home/Dashboard** | Kanban de processos na home (status), exportar CSV, marcar não visualizado/urgente, upload múltiplo na home. | Sei Pro §2.3 [código] |
| O | **Integração Planka** | Cliente HTTP configurável, permissão de host dinâmica via `chrome.permissions.request`, tela de status/teste de conexão. Mapeamento processo↔cartão fica fora (decisão já validada, §6.2). | Design arquitetura §"Integração Planka" |
| P2 | **Menu e UX diversos (Sei Pro)** | Menu suspenso, mover ícone de excluir para o final, reprodução de vídeo no visualizador. Sem código-fonte lido byte-a-byte. | Sei Pro §2.3 [doc] |

## Fora de escopo (permanente, decisões já validadas em `ANALISE.md` §6)

- Módulo **Atividades** do Sei Pro (dependência de servidor externo não documentado).
- Módulo **Projetos** via Google Sheets/OAuth pessoal (substituído pelo Lote O — Planka).
- **Font Awesome Pro** (substituído por Lucide, decisão §6.3).
- **Feature-gating por host / builds white-label** (`config_hosts.json`, branding por órgão) — mecanismo de distribuição multi-tenant do autor original do Sei Pro, não aplicável ao SEIRMG.

## Como este roteiro é usado

Cada lote passa pelo ciclo normal: brainstorming (spec em `docs/superpowers/specs/`) → `writing-plans` (plano em `docs/superpowers/plans/`) → `executing-plans`/TDD → commit. A ordem acima é a sequência padrão; pode ser reordenada a pedido do usuário a qualquer momento. Ao concluir um lote, marcar aqui em "Já entregue" com link para spec e plano.
