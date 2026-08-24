export type AtualizacaoSnapshotsAoVivo = { ok: true; mudou: boolean } | { ok: false }

// Mesmo mecanismo de `features/bloco-assinatura/consultarAoVivo.ts` (chrome.tabs.query numa aba do SEI
// aberta + chrome.tabs.sendMessage), aplicado ao Controle de Processos: pede pro content script de uma
// aba do SEI já aberta buscar `procedimento_controlar` em segundo plano e atualizar os snapshots de
// Prazos/Alterados, sem depender de visita orgânica do usuário a essa tela.
export async function atualizarSnapshotsAoVivo(baseUrlSei: string | undefined): Promise<AtualizacaoSnapshotsAoVivo> {
  if (!baseUrlSei) return { ok: false }
  try {
    const [aba] = await chrome.tabs.query({ url: `${baseUrlSei}/*` })
    if (!aba?.id) return { ok: false }
    const resposta = await chrome.tabs.sendMessage(aba.id, {
      type: 'seirmg:atualizar-snapshots-controle',
    })
    if (!resposta?.ok || typeof resposta.mudou !== 'boolean') return { ok: false }
    return { ok: true, mudou: resposta.mudou }
  } catch (error) {
    // Mesmo raciocínio de `consultarBlocosAoVivo`: esperado quando a aba do SEI encontrada não tem o
    // content script ativo — quem chama já cai graciosamente no estado "sem atualização", não é um erro
    // de verdade, só um diagnóstico.
    console.warn('[SEIRMG] Não foi possível atualizar snapshots do Controle de Processos ao vivo:', error)
    return { ok: false }
  }
}
