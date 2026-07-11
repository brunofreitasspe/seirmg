export const ALARME_LEMBRETE_BLOCO_ASSINATURA = 'seirmg-lembrete-bloco-assinatura'

export function agendarLembreteBlocoAssinatura(minutos: number): void {
  if (minutos > 0) {
    chrome.alarms.create(ALARME_LEMBRETE_BLOCO_ASSINATURA, { periodInMinutes: minutos })
  } else {
    chrome.alarms.clear(ALARME_LEMBRETE_BLOCO_ASSINATURA)
  }
}
