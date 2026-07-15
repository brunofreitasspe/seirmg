# SEIRMG — Bloco de Assinatura: ocultar (não só desabilitar) documentos já assinados — Design

> Melhoria sobre a funcionalidade "Desabilitar checkbox de documentos já assinados no Bloco de Assinatura"
> (`docs/superpowers/specs/2026-07-12-seirmg-desabilitar-checkbox-assinados-design.md`, já entregue). Pedido
> direto do usuário: além de desabilitar o checkbox, poder ocultar a linha inteira desses documentos.

## Contexto

Hoje, `aplicarDesabilitacaoAssinados()` (`src/content-scripts/rel_bloco_protocolo_listar/index.ts`)
percorre as linhas da tabela do Bloco de Assinatura e desabilita o checkbox de qualquer documento já
assinado — pelo próprio usuário logado (`deveSelecionar('com-minha-assinatura', ...)`) ou por alguém de um
dos cargos configurados em `blocoAssinatura.cargosAdicionais` (`contemTermoNasAssinaturas`). O usuário quer
uma opção adicional: em vez de só desabilitar, ocultar a linha inteira desses documentos já assinados —
reduz ruído visual em blocos grandes.

## Decisões validadas com o usuário (2026-07-15)

- As duas opções (desabilitar checkbox / ocultar linha) são **independentes** — cada uma liga/desliga por
  conta própria, ambas podem estar ativas ao mesmo tempo (se "ocultar" estiver ligado pra uma linha, o
  desabilitar checkbox não faz diferença visível pra ela, mas nada impede as duas rodarem).
- "Ocultar" usa a **mesma lista de cargos adicionais** já configurada — mesma detecção usada hoje pelo
  desabilitar (assinatura do próprio usuário OU de algum cargo da lista), sem lista própria separada.
- Fora de escopo: qualquer contador/legenda nativa da tela que mostre "N documentos" — a linha só some
  visualmente (`display: none`), sem ajustar nenhum texto de totais (mesmo padrão já usado pelos filtros de
  Controle de Processos, que também só ocultam sem tocar em contadores).

## Arquitetura

### `features/bloco-assinatura/selecaoDocumentos.ts`

Nova função pura, extraída da lógica hoje só inline dentro de `aplicarDesabilitacaoAssinados`:

```ts
export function encontrarCargoAssinante(textoAssinaturas: string, cargos: string[]): string | null
```

- Retorna o primeiro cargo da lista cujo termo aparece no texto de assinaturas (via
  `contemTermoNasAssinaturas`, já existente), ou `null` se nenhum bater. Substitui o `cargos.find(...)`
  hoje escrito diretamente dentro de `aplicarDesabilitacaoAssinados` — mesmo comportamento, agora testável e
  reaproveitado pelas duas funcionalidades (desabilitar e ocultar).

### `content-scripts/rel_bloco_protocolo_listar/index.ts`

- `paraCadaLinhaDeDocumento` passa a entregar também a própria linha ao callback:
  ```ts
  function paraCadaLinhaDeDocumento(
    callback: (linha: Element, checkbox: HTMLInputElement, textoAssinaturas: string) => void
  ): void
  ```
  Os três chamadores existentes (`aplicarSelecao`, `aplicarDesabilitacaoAssinados`) são ajustados pra nova
  assinatura (recebendo e ignorando `linha` onde não for usada).
- `aplicarDesabilitacaoAssinados` passa a usar `encontrarCargoAssinante` no lugar do `cargos.find(...)`
  inline (mesmo resultado, só reaproveitando a nova função extraída).
- Nova função `aplicarOcultacaoAssinados()`, mesmo formato de guarda (`try/catch`, checa
  `featureFlags.ocultarDocumentosAssinados`, checa `estaNaTelaDoBloco()`, obtém usuário/cargos):
  ```ts
  async function aplicarOcultacaoAssinados(): Promise<void> {
    try {
      const syncConfig = await createSyncConfigStore().get()
      if (!syncConfig.featureFlags.ocultarDocumentosAssinados) return

      if (!estaNaTelaDoBloco()) return

      const usuario = obterNomeUsuarioLogado()
      const cargos = (syncConfig.blocoAssinatura.cargosAdicionais ?? []).filter((cargo) => cargo.trim() !== '')
      if (!usuario && cargos.length === 0) return

      paraCadaLinhaDeDocumento((linha, checkbox, textoAssinaturas) => {
        const linhaEl = linha as HTMLElement
        const assinadoPorMim = usuario ? deveSelecionar('com-minha-assinatura', textoAssinaturas, usuario) : false
        const cargoAssinante = encontrarCargoAssinante(textoAssinaturas, cargos)

        if (assinadoPorMim || cargoAssinante) {
          linhaEl.style.display = 'none'
        }
      })
    } catch (error) {
      console.error('[SEIRMG] Falha ao ocultar documentos já assinados:', error)
    }
  }
  ```
  (`checkbox` chega sem uso nesse callback específico — ok, mesmo padrão de parâmetro não usado já aceito em
  outras funções do arquivo.)
- Chamada no final do arquivo, ao lado da chamada existente:
  ```ts
  aplicarDesabilitacaoAssinados()
  aplicarOcultacaoAssinados()
  ```
- O `MutationObserver` já existente (reaplica `aplicarDesabilitacaoAssinados()` quando `#divInfraAreaTabela`
  muda via AJAX) passa a chamar `aplicarOcultacaoAssinados()` também.

### `lib/storage.ts`

```ts
export interface FeatureFlags {
  blocoAssinaturaNotificacoes: boolean
  selecaoEmMassaBlocoAssinatura: boolean
  desabilitarDocumentosAssinados: boolean
  ocultarDocumentosAssinados: boolean
}
```

Default: `ocultarDocumentosAssinados: false` (diferente do `desabilitarDocumentosAssinados`, que já é `true`
por padrão — ocultar é uma ação mais forte, começa desligada, o usuário liga conscientemente).

### `options/index.html` + `options/main.ts`

Aba "Geral", logo abaixo do checkbox "Desabilitar checkbox de documentos já assinados por mim no bloco de
assinatura": novo checkbox "Ocultar (não apenas desabilitar) documentos já assinados por mim no bloco de
assinatura" (`id="geral-ocultar-assinados-ativo"`). Reaproveita o mesmo campo de texto "cargos adicionais"
já existente — sem novo campo de configuração.

## Fora de escopo

- Qualquer contador/legenda nativa da tela do Bloco de Assinatura.
- Lista de cargos separada para "ocultar" — usa a mesma já configurada.
- Desfazer a ocultação sem recarregar a página (ex. botão "mostrar documentos ocultos") — não pedido.

## Testes

`selecaoDocumentos.test.ts`: novos casos para `encontrarCargoAssinante` (cargo encontrado, nenhum cargo
bate, lista vazia, case-insensitive/espaços — mesmo comportamento de `contemTermoNasAssinaturas`, já
testado, só a seleção do primeiro cargo que bate é nova). `storage.test.ts`: atualiza expectativa de default
de `featureFlags` incluindo `ocultarDocumentosAssinados: false`. Wiring em
`content-scripts/rel_bloco_protocolo_listar/index.ts` e `options/main.ts` seguem sem teste automatizado
(mesmo padrão já estabelecido no projeto — verificado via build/typecheck).
