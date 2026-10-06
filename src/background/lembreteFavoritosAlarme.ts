export const ALARME_CHECAGEM_LEMBRETES_FAVORITOS = 'seirmg-checagem-lembretes-favoritos'

// Só lê chrome.storage local, nunca busca nada no SEI -- sem o risco de deslogamento que
// afasta alarme autônomo do resto do projeto (ver lib/storage.ts, comentário em
// BlocoAssinaturaConfig.checagemOportunistaIntervaloMinutos).
//
// De hora em hora (e 1 min depois de abrir o navegador), não 1x por dia: o alarme é recriado a
// cada abertura do Chrome, o que reinicia a contagem -- com período de 24h, quem fecha o navegador
// todo dia nunca seria notificado. A repetição no mesmo dia é barrada por diffLembretesFavoritos.
export function agendarChecagemLembretesFavoritos(ativo: boolean): void {
  if (ativo) {
    chrome.alarms.create(ALARME_CHECAGEM_LEMBRETES_FAVORITOS, { delayInMinutes: 1, periodInMinutes: 60 })
  } else {
    chrome.alarms.clear(ALARME_CHECAGEM_LEMBRETES_FAVORITOS)
  }
}
