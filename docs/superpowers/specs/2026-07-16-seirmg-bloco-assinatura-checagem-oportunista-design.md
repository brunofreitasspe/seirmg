# SEIRMG — Checagem oportunista de Bloco de Assinatura (sem alarme autônomo) — Design

> Brainstorming em 2026-07-16, na sequência da sessão do marcador rápido. Pedido direto do usuário: usar
> o mesmo método de fetch+parse já usado pro marcador rápido pra "abastecer" as notificações de bloco
> de assinatura.

## Contexto e histórico (por que isso não é trivial)

A notificação proativa de bloco de assinatura já foi tentada **duas vezes** antes e **as duas vezes
causou deslogamento automático da sessão do SEI em produção**, confirmado por investigação sistemática:

1. **`fetch()` cru do service worker, alarme periódico** (Lote A original + primeira versão do bloco de
   assinatura) — removido em 2026-07-09 (ver `docs/superpowers/specs/2026-07-09-seirmg-session-gate-design.md`).
2. **Aba oculta (`chrome.tabs.create`, navegação real)** — desenhado em
   `docs/superpowers/specs/2026-07-09-seirmg-bloco-assinatura-aba-oculta-design.md` como solução pro item
   1 (a hipótese era que `fetch()` não carrega headers de navegação real como `Sec-Fetch-Mode: navigate`,
   e navegação de aba oculta resolveria isso). **Também causou deslogamento**, confirmado e documentado no
   commit `7263210` (11/07/2026): "qualquer chamada de rede -- não importa de qual parte da extensão saia
   -- carrega o mesmo risco já comprovado". Removido, substituído pelo lembrete atual.
3. **Lembrete puramente baseado em tempo, zero rede** (estado atual, commit `7263210`) —
   `chrome.alarms` só dispara `chrome.notifications.create()`, sem nenhuma chamada de rede. Funciona, mas
   não sabe se há algo de fato pendente — é só um "não esqueça de conferir" genérico.

`docs/ROADMAP-LOTES.md` ficou desatualizado nesse ponto (a entrada do Lote A ainda cita a aba oculta como
se fosse a solução aplicada, sem mencionar que ela também foi revertida) — corrigir isso faz parte deste
trabalho.

**Conclusão da investigação anterior:** o problema não é o *mecanismo* da chamada de rede (fetch vs
navegação), é o **timing autônomo** — em ambos os casos anteriores, o gatilho era um `chrome.alarms`
disparando em intervalo fixo, **sem nenhuma ação do usuário por perto** ("SEI parado, extensão sozinha, a
cada exato ciclo do alarme" — um padrão de tráfego que se parece com automação/bot). Em contraste, o
mecanismo de `fetchText`/`fetchTextComGate` já é usado extensivamente nesta mesma sessão (marcador rápido,
filtro por bloco em Controle de Processos) e na rolagem infinita (já validada há mais tempo) — sempre como
consequência **direta e imediata de uma ação real do usuário** (clique, seleção, scroll) — sem nenhum
relato de deslogamento.

**Decisão de escopo (usuário, 2026-07-16):** tentar uma terceira abordagem, ainda não testada: checagem
**oportunista**, amarrada a uma navegação real que o usuário já ia fazer de qualquer jeito (não um timer
novo), com o menor número possível de chamadas de rede por checagem.

## Desenho

### Por que "1 fetch na lista" em vez de abrir cada bloco

A tela "Blocos de Assinatura" (`acao=bloco_assinatura_listar`) já lista, pra cada bloco, uma coluna
**"Estado"** (Gerado/Disponibilizado/Recebido/Retornado/Concluído) — confirmado com HTML real (Ver
Código-Fonte) de uma instância SEI real. Um bloco passar a "Disponibilizado" (pra doações à área) já é
sinal suficiente de "precisa de atenção", sem precisar abrir o conteúdo de cada bloco individualmente pra
saber quais documentos específicos estão pendentes (isso exigiria 1 fetch a mais por bloco, N+1 chamadas
por checagem em vez de 1 — decisão explícita do usuário de aceitar essa perda de detalhe em troca de menos
chamadas de rede).

### Gatilho: navegação real existente, sem alarme novo

Nenhum `chrome.alarms` novo. A checagem roda dentro do `bootstrap()` já existente de
`content-scripts/procedimento_controlar/index.ts` (Controle de Processos — a tela mais visitada), com um
limite de frequência mínima configurável:

```ts
async function verificarBlocoAssinaturaOportunisticamente(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    const intervalo = syncConfig.blocoAssinatura.checagemOportunistaIntervaloMinutos
    if (intervalo <= 0) return

    const localConfig = await createLocalConfigStore().get()
    const ultimaChecagem = localConfig.blocoAssinaturaUltimaChecagemOportunista
    const agoraMs = Date.now()
    if (ultimaChecagem && agoraMs - new Date(ultimaChecagem).getTime() < intervalo * 60 * 1000) return

    const link = document.querySelector<HTMLAnchorElement>(
      'a[href^="controlador.php?acao=bloco_assinatura_listar"]'
    )
    if (!link) return

    const resultado = await fetchText(link.href) // .href já resolve absoluto (elemento vivo)
    if (!resultado.ok) {
      console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', resultado.error)
      return
    }

    const doc = new DOMParser().parseFromString(resultado.data, 'text/html')
    const blocosAtuais = parseListaBlocosAssinatura(doc)
    const transicoes = detectarTransicoesParaDisponibilizado(
      blocosAtuais,
      localConfig.blocoAssinaturaEstadosConhecidos
    )

    transicoes.forEach((bloco) => {
      chrome.runtime.sendMessage({ type: 'seirmg:bloco-disponibilizado', bloco }).catch(() => {})
    })

    await createLocalConfigStore().set({
      ...localConfig,
      blocoAssinaturaEstadosConhecidos: Object.fromEntries(
        blocosAtuais.map((bloco) => [bloco.numero, bloco.estado])
      ),
      blocoAssinaturaUltimaChecagemOportunista: new Date(agoraMs).toISOString(),
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', error)
  }
}
```

Chamada em `bootstrap()`, fire-and-forget (não bloqueia o resto):

```ts
verificarBlocoAssinaturaOportunisticamente().catch((error) => {
  console.error('[SEIRMG] Falha ao checar bloco de assinatura oportunisticamente:', error)
})
```

### Lógica pura nova (`features/bloco-assinatura/parser.ts`)

```ts
export interface BlocoListaItem {
  numero: string
  descricao: string
  href: string
  estado: EstadoBloco | undefined
}

export function parseListaBlocosAssinatura(root: ParentNode): BlocoListaItem[]

export function detectarTransicoesParaDisponibilizado(
  atuais: BlocoListaItem[],
  conhecidos: Record<string, EstadoBloco | undefined>
): BlocoListaItem[]
```

- `parseListaBlocosAssinatura`: lê `#tblBlocos` (linhas com classe `infraTrClara`/`infraTrEscura`/
  `trVermelha`, mesmo critério já usado em `filtroBloco.ts`). Índices de coluna fixos pra esta tela
  específica (confirmados com HTML real): `td[1]` = número (link), `td[4]` = texto do Estado, `td[6]` =
  texto de Disponibilização, `td[8]` = descrição. Reaproveita `classificarEstado` (já existe, já testada)
  passando esses dois textos.
- `detectarTransicoesParaDisponibilizado`: pura — retorna os itens de `atuais` cujo `estado` é
  `'disponibilizado_para_area'` **e** cujo estado anterior em `conhecidos` (por `numero`) não era esse
  (inclui o caso de nunca ter sido visto antes — bloco novo já disponibilizado conta como transição).

### Config (`lib/storage.ts`)

- `BlocoAssinaturaConfig.checagemOportunistaIntervaloMinutos: number` — novo campo, default **0**
  (desativado, opt-in).
- `SyncConfig` local (mesmo lugar de `blocoAssinaturaNotificado`): `blocoAssinaturaEstadosConhecidos:
  Record<string, EstadoBloco | undefined>` (default `{}`) e `blocoAssinaturaUltimaChecagemOportunista:
  string` (default `''`).

### Notificação (`background/notifications/notify.ts` + `background/index.ts`)

- Nova função `notificarBlocoDisponibilizado(bloco: { numero: string; descricao: string; href: string })`
  — `chrome.notifications.create` com id único por bloco (evita duplicar notificação do mesmo bloco antes
  do usuário interagir), mensagem com número + descrição do bloco.
- Novo listener de mensagem `seirmg:bloco-disponibilizado` em `background/index.ts` chamando a função
  acima.
- Clicar na notificação: reaproveita `abrirOuFocarAba` (já existe) navegando pro `bloco.href` (link direto
  pro bloco específico, já presente na lista).

### Options (`options/index.html` + `options/main.ts`)

- Novo campo numérico "Checar bloco de assinatura a cada N minutos (0 = desativado)" na aba onde já vive
  `lembreteIntervaloMinutos`, mesmo padrão de leitura/gravação.

## Fora de escopo

- Paginação da lista de blocos — `parseListaBlocosAssinatura` lê só a primeira página retornada por
  `bloco_assinatura_listar` (sem seguir "próxima página"). Se o usuário tiver blocos além da primeira
  página, esses não entram na checagem oportunista. Aceitável pra uma primeira iteração; melhoria futura
  se vier a ser um problema real.
- Abrir o conteúdo de cada bloco pra saber quais documentos específicos estão pendentes (decisão
  explícita: só o Estado do bloco, ver seção acima).
- Qualquer alarme/timer novo — a checagem só roda como efeito colateral de navegação real já existente.
- Detectar transição de/para qualquer OUTRO estado que não `disponibilizado_para_area` (ex. não notifica
  quando um bloco é "Recebido" ou "Retornado" — só quando fica disponível pra ação da unidade).
- Migrar/substituir o lembrete genérico existente (`lembreteBlocoAssinatura.ts`) — os dois convivem, o
  lembrete continua como fallback "não esqueça" independente desta checagem mais precisa.

## Riscos / verificação pendente

⚠️ **Risco mais alto do que qualquer melhoria feita nesta sessão** — é uma chamada de rede nova nesse
contexto específico (bloco de assinatura), ainda que reaproveitando um mecanismo (`fetchText`) já validado
em OUTROS contextos (marcador rápido, filtro de bloco, rolagem infinita). O histórico deste exato recurso
(2 tentativas anteriores, ambas com deslogamento real em produção) exige cautela redobrada:

- Default **desativado** (0 minutos) — opt-in explícito.
- **Validação manual obrigatória e cuidadosa** numa instância SEI real, observando especificamente por
  sinais de deslogamento nos primeiros dias de uso com a opção ativada — não é um risco teórico, é um
  padrão já confirmado neste projeto duas vezes.
- Fácil de desativar (voltar o campo pra 0 nas Opções) se qualquer sinal de problema aparecer.

## Testes

`parser.test.ts` (arquivo já existente, `features/bloco-assinatura/`): `parseListaBlocosAssinatura`
(fixture HTML real com 2 blocos, incluindo o caso do "Estado" na coluna certa) e
`detectarTransicoesParaDisponibilizado` (bloco novo, bloco que já era disponibilizado antes — não deve
notificar de novo, bloco que transicionou de outro estado — deve notificar). Wiring em
`procedimento_controlar/index.ts` e `background/index.ts` sem teste automatizado, mesmo padrão já
estabelecido no projeto.
