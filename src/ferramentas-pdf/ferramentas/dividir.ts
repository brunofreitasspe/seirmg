import { dividirPdf } from '../../features/ferramentas-pdf/dividir'
import { interpretarIntervalos } from '../../features/ferramentas-pdf/intervalos'
import { criarPainelResultado } from '../ui/resultado'
import { contarPaginas } from '../ui/pdfInfo'
import {
  comCarregando,
  criarBarraAcoes,
  criarBotao,
  criarCampo,
  criarElemento,
  criarEtapa,
  criarMensagem,
  criarSegmentado,
  criarSeletorArquivos,
  lerBytes,
  montarEstruturaFerramenta,
  nomeBase,
  rotuloPaginas,
} from '../ui/kit'

type ModoDivisao = 'intervalos' | 'cada-pagina'

function rotuloIntervalo([inicio, fim]: [number, number]): string {
  return inicio === fim ? `página ${inicio + 1}` : `páginas ${inicio + 1}–${fim + 1}`
}

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'dividir')

  const etapa1 = criarEtapa(1, 'Escolha o PDF')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá',
  })
  const infoArquivo = criarMensagem()
  etapa1.corpo.append(seletor.elemento, infoArquivo.elemento)

  const etapa2 = criarEtapa(2, 'Como dividir')
  const modo = criarSegmentado<ModoDivisao>(
    'dividir-modo',
    [
      { valor: 'intervalos', rotulo: 'Por intervalos' },
      { valor: 'cada-pagina', rotulo: 'Uma página por arquivo' },
    ],
    'intervalos'
  )
  const campoIntervalos = criarElemento('input')
  campoIntervalos.type = 'text'
  campoIntervalos.placeholder = 'ex.: 1-3, 4, 5-8'
  const campo = criarCampo('Intervalos', campoIntervalos, 'Cada intervalo vira um arquivo. Separe com vírgulas.')
  campo.classList.add('campo-largo')
  const botao = criarBotao('Dividir PDF', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa2.corpo.append(modo.elemento, campo, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(3)
  corpo.append(etapa1.secao, etapa2.secao, resultado.elemento)

  let totalPaginas = 0

  modo.elemento.addEventListener('change', () => {
    campo.hidden = modo.valor() !== 'intervalos'
    mensagem.limpar()
  })

  seletor.aoMudar(async ([arquivo]) => {
    resultado.limpar()
    mensagem.limpar()
    totalPaginas = 0
    botao.disabled = true
    infoArquivo.limpar()
    if (!arquivo) return
    try {
      totalPaginas = await contarPaginas(await lerBytes(arquivo))
      infoArquivo.mostrar('info', `Este PDF tem ${rotuloPaginas(totalPaginas)}.`)
      botao.disabled = false
    } catch (error) {
      console.error('[SEIRMG] Falha ao ler PDF para dividir:', error)
      infoArquivo.mostrar('erro', 'Não foi possível ler o arquivo. Confira se é um PDF válido e sem senha.')
    }
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    const [arquivo] = seletor.obterArquivos()
    if (!arquivo) return

    let intervalos: Array<[number, number]>
    if (modo.valor() === 'cada-pagina') {
      intervalos = Array.from({ length: totalPaginas }, (_, i): [number, number] => [i, i])
    } else {
      const lido = interpretarIntervalos(campoIntervalos.value, totalPaginas)
      if (!lido.ok) {
        mensagem.mostrar('erro', lido.erro)
        campoIntervalos.focus()
        return
      }
      intervalos = lido.intervalos
    }

    await comCarregando(botao, 'Dividindo...', async () => {
      try {
        const partes = await dividirPdf(await lerBytes(arquivo), intervalos)
        const base = nomeBase(arquivo)
        resultado.mostrar(
          partes.map((bytes, indice) => ({
            nome: `${base}-parte-${indice + 1}.pdf`,
            bytes,
            detalhe: rotuloIntervalo(intervalos[indice]),
          }))
        )
      } catch (error) {
        console.error('[SEIRMG] Falha ao dividir PDF:', error)
        mensagem.mostrar('erro', 'Não foi possível dividir o PDF.')
      }
    })
  })
}
