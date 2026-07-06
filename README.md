# SEIRMG

Extensão unificada para o Sistema Eletrônico de Informações (SEI), consolidando as funcionalidades das extensões **Sei++** e **Sei Pro** em um único projeto, com Manifest V3, para Google Chrome.

## Status desta entrega

Esta primeira entrega cobre:
- Infraestrutura completa do projeto (TypeScript, Vite, `@crxjs/vite-plugin`, Bun, Vitest).
- Storage tipado (`chrome.storage.sync`/`local`), motor de tema (claro/black/super-black/custom) e página de opções nativa com 7 abas.
- **Funcionalidade nova**: notificação nativa do sistema operacional quando há bloco de assinatura pendente, combinando `MutationObserver` (tempo real, quando a tela do bloco está aberta) e `chrome.alarms` (verificação periódica em segundo plano, mesmo com o SEI fechado), com deduplicação de notificações já enviadas.

A migração completa das ~100 funcionalidades herdadas de Sei++ e Sei Pro (ver `ANALISE.md`) é trabalho de planos de implementação subsequentes — as demais abas de opções ("Geral", "Processos", "Editor de Documentos", "Integrações") estão como esqueleto ("Em breve") nesta entrega.

## Funcionalidades herdadas (mapeadas em `ANALISE.md`)

Consulte `ANALISE.md` para a lista completa de funcionalidades de cada projeto original e o status de cada uma. Resumo:
- **Sei++**: notificação de processos novos, badge de bloco de assinatura, seleção em massa de documentos para assinar, forçar reabertura de processo, filtros de tabela, temas dark, anotações, entre outras.
- **Sei Pro**: ~80 funcionalidades documentadas oficialmente (editor de texto avançado, ações em lote, favoritos, prazos, kanban de processos, etc.) — ver `CHANGELOG-UNIFICACAO.md` para o que fica fora do escopo inicial (módulo Atividades) e o que é adaptado (Projetos → integração com Planka).

## Instalação local (modo desenvolvedor)

1. Instale as dependências:
   ```bash
   bun install
   ```
2. Gere o build:
   ```bash
   bun run build
   ```
3. No Chrome, acesse `chrome://extensions`.
4. Ative o **Modo do desenvolvedor** (canto superior direito).
5. Clique em **Carregar sem compactação** e selecione a pasta `dist/` gerada no passo 2.
6. A extensão "SEIRMG" deve aparecer na lista, sem erros.

Para desenvolvimento com recarregamento automático:
```bash
bun run dev
```

## Testes

```bash
bun run test        # roda a suíte uma vez
bun run test:watch  # modo watch
bun run typecheck   # checagem de tipos sem emitir arquivos
bun run lint        # ESLint
```

## Estrutura do projeto

Ver `docs/superpowers/specs/2026-07-06-seirmg-arquitetura-design.md` para o design completo de arquitetura.

## Limitações da verificação desta entrega

A verificação de build/UI feita nesta entrega (smoke test) cobriu:
- Build limpo verificado (`bun run build` roda com sucesso e todos os arquivos referenciados no manifest estão presentes em `dist/`).
- A UI de opções (7 abas, troca de abas, ícone de sino Lucide na aba de assinatura) foi verificada servindo o `dist/` gerado via HTTP local e automatizando um navegador contra esse servidor — **não** dentro de um contexto real de extensão carregada no Chrome.

Ainda **não** verificado nesta sessão, e que requer confirmação manual do usuário:
- Carregar a extensão descompactada em um Chrome real (`chrome://extensions` → "Carregar sem compactação") — nenhuma ferramenta disponível neste ambiente consegue automatizar o seletor de arquivos nativo desse fluxo.
- O round-trip real de persistência via `chrome.storage.sync`/`chrome.storage.local` (salvar opções e confirmar que sobrevivem a um reload) — só foi verificado que falhas são tratadas de forma graciosa fora de um contexto real de extensão, não a persistência em si.
- Testes contra uma página real do SEI (detecção de URL base, renderização do badge, disparo de notificações) exigem acesso a um ambiente SEI ativo, que não está disponível nesta sessão de desenvolvimento — isso já era esperado pelo próprio plano (ver Passos 5-6 da Tarefa 18 do plano).
