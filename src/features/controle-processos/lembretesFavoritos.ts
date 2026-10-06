import type { FavoritoProcesso, NotificadoState } from '../../lib/storage'

export interface FavoritoParaNotificar {
  numero: string
  lembreteNota?: string
}

export interface DiffLembretesFavoritosResultado {
  devidos: FavoritoParaNotificar[]
  estadoAtualizado: NotificadoState
}

function mesmoDia(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10)
}

// Lembrete vencido (data <= hoje) notifica uma vez por dia até o usuário removê-lo ou mudar a data.
export function diffLembretesFavoritos(
  favoritos: FavoritoProcesso[],
  jaNotificados: NotificadoState,
  hojeIso: string
): DiffLembretesFavoritosResultado {
  const hojeData = hojeIso.slice(0, 10)

  const devidos = favoritos
    .filter((favorito) => {
      if (!favorito.lembreteData || favorito.lembreteData > hojeData) return false
      const ultimaNotificacao = jaNotificados[favorito.numero]?.notificadoEm
      return !ultimaNotificacao || !mesmoDia(ultimaNotificacao, hojeIso)
    })
    .map((favorito) => ({ numero: favorito.numero, lembreteNota: favorito.lembreteNota }))

  const estadoAtualizado: NotificadoState = { ...jaNotificados }
  devidos.forEach((favorito) => {
    estadoAtualizado[favorito.numero] = { notificadoEm: hojeIso }
  })

  return { devidos, estadoAtualizado }
}
