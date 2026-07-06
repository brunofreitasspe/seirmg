# Changelog da Unificação — SEIRMG

## O que foi unificado nesta entrega

- Infraestrutura de projeto criada do zero (TypeScript + Vite + `@crxjs/vite-plugin` + Bun + Vitest), substituindo os dois processos de build divergentes de Sei++ (sem bundler, ESM puro) e Sei Pro (sem bundler, scripts globais, injeção dinâmica via `$.getScript`).
- Storage consolidado num schema único tipado (`chrome.storage.sync`/`local`), resolvendo a colisão real de chaves `CheckTypes`/`InstallOrUpdate`/`version` que existiam com o mesmo nome (e formatos diferentes) em ambos os projetos originais.
- Motor de tema único (baseado no mecanismo do Sei Pro: classe CSS + variável de cor customizável), com os temas fixos `black`/`super-black` do Sei++ recriados como presets do novo motor — antes eram dois mecanismos de tema totalmente incompatíveis (`storage.theme` vs `localStorage.darkModePro`).
- Página de opções migrada de duas abordagens divergentes (injetada dentro do SEI no Sei++; `default_popup` apontando direto para `options.html` no Sei Pro) para uma única página de opções nativa da extensão (`options_ui`, `open_in_tab: true`), organizada em abas por categoria.
- **Nova funcionalidade**: notificação nativa de bloco de assinatura pendente, combinando o parser de DOM do bloco de assinatura (portado de `verificarBlocoAssinatura.js` do Sei++) com a infraestrutura de `chrome.alarms`/`chrome.notifications` (também originada no Sei++, antes usada só para "processos novos"). O Sei Pro tinha uma funcionalidade parecida mas mais limitada (`initCheckNaoAssinados`, reativa, sem notificação nativa, restrita a documentos não assinados na unidade atual) — não havia, em nenhum dos dois projetos, monitoramento em segundo plano do bloco de assinatura com notificação do sistema operacional.
- Indicador de pendência consolidado num único badge (estilo Sei++, ao lado do logo do SEI), eliminando a duplicidade com o contador no favicon da aba que o Sei Pro también tinha.
- Ícone da extensão: logo oficial do sistema SEI! fornecido pelo usuário, recortado nos 4 tamanhos padrão do Chrome.

## O que foi removido/não migrado nesta entrega, e por quê

- **Módulo "Atividades" do Sei Pro** (`sei-pro-atividades.js`, ~26.700 linhas): fora de escopo. Depende de um servidor externo próprio do autor original, não documentado publicamente e não disponível para a autarquia. Decisão validada com o usuário em 06/07/2026.
- **Módulo "Projetos" do Sei Pro** (Kanban/Gantt via Google Sheets + OAuth pessoal do usuário): a versão com Google Sheets não foi portada. Em seu lugar, esta entrega prepara (mas não conclui) uma integração com uma instância **Planka** já operada pela autarquia em rede interna — o cliente HTTP configurável e a tela de status de conexão ficam para um plano de implementação futuro; o mapeamento processo↔cartão não está incluído nesta entrega.
- **Font Awesome Pro**: o Sei Pro redistribuía a versão comercial (licenciada) da Font Awesome Pro dentro do próprio pacote da extensão. O SEIRMG usa **Lucide** (`lucide-static`, licença ISC/open source) para todos os ícones de UI daqui em diante — nenhum ícone dependente de licença comercial foi portado.
- **Migração automática de dados dos usuários** (configurações salvas em Sei++/Sei Pro): tecnicamente inviável (cada extensão tem `chrome.storage` isolado por ID) e descartada por decisão do usuário — quem já usa Sei++/Sei Pro reconfigura manualmente no SEIRMG.
- **~100 funcionalidades restantes de Sei++ e Sei Pro** (ver `ANALISE.md`, seções 3.1-3.3): ainda não portadas nesta entrega. Nenhuma foi descartada — a decisão foi sequenciar a migração em planos de implementação futuros, feature por feature ou em pequenos lotes coesos, em vez de tentar portar tudo de uma vez (risco de regressão e de um plano raso demais para revisar com qualidade).

## Conflitos resolvidos durante a unificação

Ver `ANALISE.md`, seção 3.4, para a lista completa de conflitos de nomenclatura/storage/seletores DOM identificados entre os dois projetos originais e como cada um foi endereçado na arquitetura do SEIRMG.
