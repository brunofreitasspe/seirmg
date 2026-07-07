# SEIRMG — Roteiro de Lotes de Implementação

> Decomposição das ~90 funcionalidades restantes de Sei++/Sei Pro (ver `ANALISE.md`, seções 1.2, 2.3, 3.1-3.3) em lotes coesos, sequenciados para minimizar retrabalho e dependências cruzadas. Cada lote vira seu próprio ciclo spec → plano → implementação (`docs/superpowers/specs/` + `docs/superpowers/plans/`) quando chega a vez dele. Este documento é o índice — atualizar o status de cada lote conforme avança.

## Já entregue

- **Scaffold + notificação de bloco de assinatura** (background: `chrome.alarms`/`chrome.notifications`) — `docs/superpowers/plans/2026-07-06-seirmg-scaffold-e-notificacao-assinatura.md` + correção — `docs/superpowers/plans/2026-07-06-seirmg-bloco-assinatura-correcao.md`
- **Lote A — Notificação de processos novos + popup** — `docs/superpowers/plans/2026-07-06-seirmg-lote-a-processos-novos.md`

## Roteiro (ordem sugerida)

| # | Lote | Escopo | Fonte |
|---|------|--------|-------|
| B | **Bloco de Assinatura — seleção em massa** | Botões de seleção em massa na tela do bloco (`selecionarDocumentosAssinar.js`): Todos/Nenhum/Sem assinatura/Sem minha assinatura/Com minha assinatura. (O indicador visual — badge consolidado ao lado do logo — já foi entregue via `content-scripts/core/badge.ts`, decisão de arquitetura §"Indicador de pendência consolidado"; não há mais nada de `verificarBlocoAssinatura.js` a portar.) | Sei++ §1.2 |
| C | **Motor de tema (dark mode) + aba Aparência** | `lib/theme.ts`: presets claro/black/super-black + cor customizável, aplicado via classe cross-iframe. Habilita a aba "Aparência" da tela de opções (hoje placeholder). Pré-requisito de UX para vários lotes seguintes. | Sei Pro §2.3, decisão validada §6.4 |
| D | **Controle de Processos — prazos e cores** | Colunas de prazo/dias com threshold Alerta/Crítico (`incluirCalculoPrazos.js`); cor do processo por especificação (`marcarCorProcesso.js`); especificação na listagem (`mostrarEspecificacao`/`listaPorEspecificacao`); cor de ícone de ponto de controle via filtro CSS (`pontoControleCores`/`colorToFilter`). | Sei++ §1.2 |
| E | **Controle de Processos — filtros e seleção** | Filtro composto + busca "OU" (`filtra_processos`); filtro por atribuição/info de blocos; seleção múltipla via Shift+clique; confirmação antes de concluir em lote; correção de tabelas nativas (thead); agrupar lista de processos, rolagem infinita e ordenação por cabeçalho persistente (Sei Pro). | Sei++ §1.2, Sei Pro §2.3 |
| F | **Ações em lote sobre processos** | Retirar sobrestamento/reabrir em lote; controle de unidade em lote; forçar reabertura de processo fechado em todas unidades. | Sei++ §1.2 |
| G | **Visualização de processo (árvore e painel)** | Dados do processo/interessados na árvore; copiar link/número (SEI<4); usar documento como modelo; dropzone → documento externo; anotação estilo post-it (+ atualização na árvore); abrir documento em nova aba; título da aba; ajustes visuais nativos; toolbar/menu rápido da árvore, numeração de documentos, redimensionar árvore, histórico de processos visitados (Sei Pro). | Sei++ §1.2, Sei Pro §2.3 |
| H | **Documento externo + ações em lote de documentos** | Autopreencher recebimento de documento externo; envio múltiplo de documentos externos (Sei Pro, multi-arquivo); Ações em Lote (ciência/excluir/sigilo/assinar/cancelar); Documentos em Lote via CSV com campos dinâmicos. | Sei++ §1.2, Sei Pro §2.3 |
| I | **Editor de documentos — formatação e produtividade básica** | Hiperlinks, equações LaTeX, alinhar texto, fonte, copiar formatação, tabela rápida, quebra de página, parágrafos numerados, sumário, nota de rodapé, primeira letra maiúscula automática, salvamento automático, teclas de atalho configuráveis, título da página, URL amigável. | Sei Pro §2.3 [doc] |
| J | **Editor de documentos — recursos avançados** | QR Code, hashcode/verificação de integridade, link de documento público, link curto, link de legislação federal, Legística, referência interna/a documentos do processo, ~30 campos dinâmicos, valores padrão ao criar documento, marca d'água de minuta, sigilo/tarjas + certidão LAI, editor de imagens avançado, duplicar documento, comparador de documentos, escrita interativa (`#`/`@`), revisão de texto, ditado por voz. | Sei Pro §2.3 [doc] |
| K | **Editor de documentos — Ferramentas de IA** | Integração ChatGPT/Gemini com prompts predeterminados, chave de API do próprio usuário. Isolado dos demais por exigir tratamento próprio de permissão de host dinâmica e armazenamento de credenciais. | Sei Pro §2.3 [doc] |
| L | **Favoritos avançados** | Etiquetas coloridas, mapas (Leaflet), categorias, especificação, prazo com edição avançada, export/import (FileSystem API local). | Sei Pro §2.3 [doc] |
| M | **Prazos dedicados + reabertura programada** | Painel "Gerenciar Prazos" dedicado (mais robusto que os do Lote D), reabertura programada de processos com verificação periódica configurável, Prescrições (pequeno, acoplado a este painel). | Sei Pro §2.3 [doc] |
| N | **Home/Dashboard** | Kanban de processos na home (status), exportar CSV, marcar não visualizado/urgente, upload múltiplo na home. | Sei Pro §2.3 [código] |
| O | **Integração Planka** | Cliente HTTP configurável, permissão de host dinâmica via `chrome.permissions.request`, tela de status/teste de conexão. Mapeamento processo↔cartão fica fora (decisão já validada, §6.2). | Design arquitetura §"Integração Planka" |
| P | **Menu e UX diversos** | Ocultar automaticamente/mover menu lateral, atalho publicações, link neutro, onboarding pós-instalação, menu suspenso (Sei Pro), mover ícone de excluir para o final, reprodução de vídeo no visualizador. | Sei++ §1.2, Sei Pro §2.3 |

## Fora de escopo (permanente, decisões já validadas em `ANALISE.md` §6)

- Módulo **Atividades** do Sei Pro (dependência de servidor externo não documentado).
- Módulo **Projetos** via Google Sheets/OAuth pessoal (substituído pelo Lote O — Planka).
- **Font Awesome Pro** (substituído por Lucide, decisão §6.3).
- **Feature-gating por host / builds white-label** (`config_hosts.json`, branding por órgão) — mecanismo de distribuição multi-tenant do autor original do Sei Pro, não aplicável ao SEIRMG.

## Como este roteiro é usado

Cada lote passa pelo ciclo normal: brainstorming (spec em `docs/superpowers/specs/`) → `writing-plans` (plano em `docs/superpowers/plans/`) → `executing-plans`/TDD → commit. A ordem acima é a sequência padrão; pode ser reordenada a pedido do usuário a qualquer momento. Ao concluir um lote, marcar aqui em "Já entregue" com link para spec e plano.
