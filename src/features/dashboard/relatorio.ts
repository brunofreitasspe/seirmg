import { montarLinhaCsv } from '../controle-processos/favoritosExportar'
import type { EventoHistorico } from '../../lib/storage'
import type { Intervalo } from './periodo'

const CABECALHO_CSV = ['Processo', 'Tipo de Evento', 'Tipo do Processo', 'Especificação', 'Data', 'Hora']

function dataHoraLocal(iso: string): { data: string; hora: string } {
  const dataObj = new Date(iso)
  return {
    data: dataObj.toLocaleDateString('pt-BR'),
    hora: dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

export function montarCsvHistorico(eventos: EventoHistorico[]): string {
  const linhas = [montarLinhaCsv(CABECALHO_CSV)]
  eventos.forEach((evento) => {
    const { data, hora } = dataHoraLocal(evento.ocorridoEm)
    linhas.push(
      montarLinhaCsv([evento.numero, evento.tipo, evento.tipoProcesso ?? '', evento.especificacao ?? '', data, hora])
    )
  })
  return linhas.join('\r\n')
}

function escaparHtml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function montarHtmlRelatorio(eventos: EventoHistorico[], intervalo: Intervalo): string {
  const linhas = eventos
    .map((evento) => {
      const { data, hora } = dataHoraLocal(evento.ocorridoEm)
      return `<tr><td>${escaparHtml(evento.numero)}</td><td>${escaparHtml(evento.tipo)}</td><td>${escaparHtml(evento.tipoProcesso ?? '—')}</td><td>${escaparHtml(evento.especificacao ?? '—')}</td><td>${data}</td><td>${hora}</td></tr>`
    })
    .join('')

  const corpo =
    eventos.length > 0
      ? linhas
      : '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Nenhum evento encontrado para o período selecionado.</td></tr>'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório SEIRMG — ${escaparHtml(intervalo.rotulo)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1d23; }
  h1 { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #e2e5ea; text-align: left; font-size: 13px; }
  th { background: #f5f6f8; }
</style>
</head>
<body>
  <h1>Relatório de Atividade — ${escaparHtml(intervalo.rotulo)}</h1>
  <p>${eventos.length} evento(s) no período.</p>
  <table>
    <thead><tr><th>Processo</th><th>Evento</th><th>Tipo do Processo</th><th>Especificação</th><th>Data</th><th>Hora</th></tr></thead>
    <tbody>${corpo}</tbody>
  </table>
</body>
</html>`
}
