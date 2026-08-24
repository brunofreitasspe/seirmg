import type { LocalConfig, SyncConfig } from '../../lib/storage'
import { extrairFavoritoDaLinha } from '../controle-processos/favoritos'
import { obterControleDePrazoDaLinha } from '../controle-processos/prazos'
import { linhaTemDocumentoAlterado } from '../controle-processos/kanban'
import { atualizarSnapshotPrazos, type LinhaVisivelComPrazo } from './snapshotPrazos'
import { atualizarSnapshotAlterados, type LinhaVisivelComAlterado } from './snapshotAlterados'

// Mesmos 3 ids de `content-scripts/procedimento_controlar/index.ts`'s `IDS_TABELAS` — duplicado aqui de
// propósito (essa lista é só 3 strings, não lógica) porque este módulo precisa funcionar tanto contra o
// `document` ao vivo quanto contra um `Document` de uma página buscada em segundo plano (fetch), e
// content-scripts não são importáveis por `features/`.
const IDS_TABELAS_CONTROLE = ['#tblProcessosDetalhado', '#tblProcessosGerados', '#tblProcessosRecebidos']

export function extrairLinhasDeControle(raiz: ParentNode): Element[] {
  return IDS_TABELAS_CONTROLE.flatMap((idTabela) => {
    const tabela = raiz.querySelector(idTabela)
    if (!tabela) return []
    return Array.from(tabela.querySelectorAll('tbody > tr:not(.seirmg-cabecalho-grupo)'))
  })
}

export function calcularSnapshotsControleProcessos(
  linhas: Element[],
  config: SyncConfig,
  localConfig: Pick<LocalConfig, 'snapshotPrazosProcessos' | 'snapshotAlteradosProcessos'>,
  agoraIso: string
): { atualizacao: Partial<LocalConfig>; mudou: boolean } {
  const favoritos = linhas
    .map((linha) => ({ linha, favorito: extrairFavoritoDaLinha(linha, agoraIso) }))
    .filter(
      (item): item is { linha: Element; favorito: NonNullable<ReturnType<typeof extrairFavoritoDaLinha>> } =>
        item.favorito !== null
    )

  const atualizacao: Partial<LocalConfig> = {}
  let mudou = false

  if (config.controleProcessos.prazos.ativo) {
    const linhasVisiveis: LinhaVisivelComPrazo[] = favoritos.map(({ linha, favorito }) => ({
      numero: favorito.numero,
      prazoDataTexto: obterControleDePrazoDaLinha(linha)?.dataTexto ?? null,
      especificacao: favorito.especificacao,
      link: favorito.link,
    }))
    const resultado = atualizarSnapshotPrazos(localConfig.snapshotPrazosProcessos ?? [], linhasVisiveis, agoraIso)
    if (resultado.mudou) {
      atualizacao.snapshotPrazosProcessos = resultado.itens
      mudou = true
    }
  }

  const linhasVisiveisAlterados: LinhaVisivelComAlterado[] = favoritos.map(({ linha, favorito }) => ({
    numero: favorito.numero,
    alterado: linhaTemDocumentoAlterado(linha),
    especificacao: favorito.especificacao,
    link: favorito.link,
  }))
  const resultadoAlterados = atualizarSnapshotAlterados(
    localConfig.snapshotAlteradosProcessos ?? [],
    linhasVisiveisAlterados,
    agoraIso
  )
  if (resultadoAlterados.mudou) {
    atualizacao.snapshotAlteradosProcessos = resultadoAlterados.itens
    mudou = true
  }

  return { atualizacao, mudou }
}
