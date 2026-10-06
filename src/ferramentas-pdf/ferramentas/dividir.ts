import { dividirPdf, dividirPorTamanho } from '../../features/ferramentas-pdf/dividir'
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
  formatarBytes,
  lerBytes,
  montarEstruturaFerramenta,
  nomeBase,
  rotuloPaginas,
} from '../ui/kit'

type ModoDivisao = 'intervalos' | 'cada-pagina' | 'tamanho'

const BYTES_POR_MB = 1024 * 1024
// Ponto de partida comum pro limite de upload do SEI; o usuário ajusta.
const TAMANHO_MAXIMO_PADRAO_MB = 10

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
      { valor: 'tamanho', rotulo: 'Por tamanho máximo' },
    ],
    'intervalos'
  )
  const campoIntervalos = criarElemento('input')
  campoIntervalos.type = 'text'
  campoIntervalos.placeholder = 'ex.: 1-3, 4, 5-8'
  const campo = criarCampo('Intervalos', campoIntervalos, 'Cada intervalo vira um arquivo. Separe com vírgulas.')
  campo.classList.add('campo-largo')
  const campoTamanho = criarElemento('input')
  campoTamanho.type = 'number'
  campoTamanho.min = '0.1'
  campoTamanho.step = '0.5'
  campoTamanho.value = String(TAMANHO_MAXIMO_PADRAO_MB)
  const campoTamanhoRotulo = criarCampo(
    'Tamanho máximo de cada arquivo (MB)',
    campoTamanho,
    'Junta páginas seguidas até chegar perto do limite. Útil pro limite de upload do SEI.'
  )
  campoTamanhoRotulo.hidden = true
  const botao = criarBotao('Dividir PDF', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa2.corpo.append(modo.elemento, campo, campoTamanhoRotulo, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(3)
  corpo.append(etapa1.secao, etapa2.secao, resultado.elemento)

  let totalPaginas = 0

  modo.elemento.addEventListener('change', () => {
    campo.hidden = modo.valor() !== 'intervalos'
    campoTamanhoRotulo.hidden = modo.valor() !== 'tamanho'
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
      infoArquivo.mostrar('info', `Este PDF tem ${rotuloPaginas(totalPaginas)} e ${formatarBytes(arquivo.size)}.`)
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

    if (modo.valor() === 'tamanho') {
      const limiteMb = Number(campoTamanho.value)
      if (!(limiteMb > 0)) {
        mensagem.mostrar('erro', 'Informe um tamanho máximo maior que zero.')
        campoTamanho.focus()
        return
      }
      await dividirPorTamanhoMaximo(arquivo, limiteMb)
      return
    }

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

  async function dividirPorTamanhoMaximo(arquivo: File, limiteMb: number): Promise<void> {
    await comCarregando(botao, 'Dividindo...', async () => {
      try {
        const partes = await dividirPorTamanho(await lerBytes(arquivo), limiteMb * BYTES_POR_MB)
        const base = nomeBase(arquivo)
        resultado.mostrar(
          partes.map((parte, indice) => ({
            nome: `${base}-parte-${indice + 1}.pdf`,
            bytes: parte.bytes,
            detalhe: rotuloIntervalo([parte.inicio, parte.fim]) + (parte.excedeLimite ? ' · acima do limite' : ''),
          }))
        )
        const grandes = partes.filter((parte) => parte.excedeLimite).map((parte) => parte.inicio + 1)
        if (grandes.length > 0) {
          const lista = grandes.join(', ')
          mensagem.mostrar(
            'aviso',
            grandes.length === 1
              ? `A página ${lista} sozinha já passa de ${limiteMb} MB e ficou num arquivo próprio, acima do limite.`
              : `As páginas ${lista} sozinhas já passam de ${limiteMb} MB e ficaram em arquivos próprios, acima do limite.`
          )
        } else if (partes.length === 1) {
          mensagem.mostrar('info', `O arquivo inteiro já cabe em ${limiteMb} MB, então não precisou ser dividido.`)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao dividir PDF por tamanho:', error)
        mensagem.mostrar('erro', 'Não foi possível dividir o PDF.')
      }
    })
  }
}
