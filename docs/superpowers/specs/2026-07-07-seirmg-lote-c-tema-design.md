# SEIRMG — Lote C: Motor de Tema (dark mode) + Aba Aparência (Design)

> Spec do Lote C do roteiro em `docs/ROADMAP-LOTES.md`. Completa o motor de tema já iniciado (`lib/theme.ts`, `ThemeConfig`/`ThemePreset` em `storage.ts`) com CSS real dos temas escuros, cobertura cross-iframe e a aba Aparência funcional nas opções.

## Contexto

O motor de tema básico já existe: `lib/theme.ts` (`applyTheme`/`computeThemeClassName`, já testado) mapeia um `ThemeConfig { preset: 'claro'|'black'|'super-black'|'custom', customColor? }` para uma classe CSS aplicada ao `<body>`. Dois problemas reais:

1. **CSS quase vazio**: `content-scripts/core/theme.css` hoje só tem 3 regras (cor de link para `custom`, fundo sólido para `black`/`super-black`) — nenhum dos dois temas escuros se parece de fato com um tema escuro da UI nativa do SEI (menu, tabelas, árvore de processos, inputs continuam claros).
2. **Sem cobertura de iframe**: o SEI compõe sua UI com iframes internos (menu lateral, árvore de processos, área de conteúdo) que também navegam para URLs `controlador.php?acao=...`. O content script `core` hoje roda só no frame principal (sem `all_frames`), então a classe de tema nunca chega a esses iframes — o body principal muda de cor, mas o menu/árvore continuam claros.

## Decisões já validadas nesta sessão

- **Fidelidade CSS**: portar quase verbatim `C:\sei\seiplus\cs_modules\themes\black.css` (338 linhas) e `super-black.css` (121 linhas) do Sei++, em vez de manter o CSS mínimo atual.
- **Cobertura de iframe**: content script novo e dedicado, só para aplicar a classe de tema, marcado `all_frames: true` — isolado do `core` (que continua rodando só no frame principal) para não duplicar badge/mensageria (`seirmg:sei-detectado`) em cada iframe do SEI.

## Arquitetura

### `content-scripts/core/theme.css` (expandido)

Cada seletor dos arquivos originais recebe o prefixo de escopo correspondente (descendente da classe aplicada ao `<body>`):

- `black.css`: todo seletor vira `.seirmg-theme-black <seletor original>` (ex.: `#main-menu` → `.seirmg-theme-black #main-menu`; `*` → `.seirmg-theme-black *`).
- `super-black.css`: mesmo princípio com `.seirmg-theme-super-black`.
- **Adaptação necessária**: a regra `html { background-color: black; }` do `black.css` original mira o elemento `<html>`, mas `applyTheme` aplica a classe no `<body>` (não no `<html>`) — essa regra vira `body.seirmg-theme-black { background-color: black; }` em vez de tentar (invalidamente) `.seirmg-theme-black html`.
- **Adaptação necessária**: `:root { --dark-gray: #363636; }` do `black.css` original (variável global) vira `.seirmg-theme-black { --dark-gray: #363636; }`, escopada à classe em vez de vazar para toda a página.
- O preset `custom` mantém o comportamento já implementado (cor de destaque via `--seirmg-accent-color`, sem fundo escuro) — não é afetado por esta expansão.

### `content-scripts/tema/index.ts` (novo)

Content script mínimo, só com uma responsabilidade: ler o tema do sync config e aplicar via `applyTheme` (função já existente, reaproveitada sem alterações):

```ts
async function aplicarTemaDaPagina(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    applyTheme(document.body, syncConfig.tema)
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar tema:', error)
  }
}

aplicarTemaDaPagina()
```

Sem `MutationObserver`, sem mensageria — cada frame (principal + iframes internos do SEI) roda essa função uma vez, de forma independente, no seu próprio `document.body`.

### `content-scripts/core/index.ts` (modificado)

Remove a chamada `applyTheme(document.body, syncConfig.tema)` (e o import de `applyTheme`) do bootstrap — essa responsabilidade migra inteiramente para o script dedicado acima. O resto do bootstrap (detecção de `baseUrlSei`/versão do SEI, mensagem `seirmg:sei-detectado`, `renderBadge`) fica exatamente como está — continua rodando só no frame principal.

### `manifest.config.ts` (modificado)

Novo bloco de `content_scripts`:

```ts
{
  matches: [
    '*://*.br/*controlador.php?acao=*',
    '*://*.org/*controlador.php?acao=*',
  ],
  js: ['src/content-scripts/tema/index.ts'],
  css: ['src/content-scripts/core/theme.css'],
  all_frames: true,
  run_at: 'document_idle',
}
```

O campo `css: ['src/content-scripts/core/theme.css']` sai do bloco `core` existente (que perde a responsabilidade de tema) e passa para este bloco novo — o arquivo CSS continua morando fisicamente em `content-scripts/core/theme.css` (não é movido de pasta), só a referência no manifest muda de bloco. Nenhuma permissão nova, nenhum host novo — `matches` idêntico ao já usado pelo `core`.

### Aba Aparência (`options/index.html` + `main.ts`)

Primeira implementação real (hoje é só texto placeholder). Um `<select>` com as 4 opções de `ThemePreset` (claro/black/super-black/custom) + um `<input type="color">` para `customColor` (relevante só quando o preset é `custom`, mas fica sempre visível e habilitado — sem lógica condicional de exibição, mantendo simples) + botão Salvar + span de status, mesmo padrão visual/de persistência das outras abas já implementadas.

## Testes

Nenhuma lógica pura nova — `applyTheme`/`computeThemeClassName` já são testados em `lib/theme.test.ts` e são reaproveitados sem alteração de assinatura. O CSS expandido e os dois content scripts (novo `tema/index.ts` e o `core/index.ts` modificado) não são cobertos por TDD — mesmo padrão já estabelecido para todo `content-scripts/`/`options/` do projeto (DOM-heavy, verificado via build + typecheck, não via Vitest).

## Tratamento de erros

`aplicarTemaDaPagina()` roda inteira dentro de `try/catch`, loga via `console.error('[SEIRMG] ...', error)` e nunca lança — mesmo padrão de todo content script já existente. Falha ao aplicar tema num frame específico não afeta os demais frames (cada um roda a função de forma independente).

## Fora de escopo

- Sem sincronização ao vivo do tema entre abas já abertas (mudar o tema nas opções aplica a partir do próximo carregamento de página do SEI — nenhum listener de `storage.onChanged` é adicionado nesta entrega).
- Sem combinação "dark mode + cor customizável simultâneos" — o schema atual (`preset` como enum mutuamente exclusivo) já foi decidido em etapa anterior e não é alterado aqui.
- Sem mudança de permissões no manifest — só um bloco novo de `content_scripts` usando os mesmos `matches` já existentes.
