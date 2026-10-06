import { juntarPdfs } from '../../features/ferramentas-pdf/juntar'
import { criarPainelResultado } from '../ui/resultado'
import { contarPaginas } from '../ui/pdfInfo'
import {
  comCarregando,
  criarBarraAcoes,
  criarBotao,
  criarEtapa,
  criarMensagem,
  criarSeletorArquivos,
  lerBytes,
  montarEstruturaFerramenta,
  nomeBase,
  rotuloPaginas,
} from '../ui/kit'

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'juntar')

  const etapa = criarEtapa(1, 'Escolha os PDFs, na ordem final')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    multiplo: true,
    ordenavel: true,
    titulo: 'Clique pra escolher os PDFs',
    dica: 'ou arraste os arquivos pra cá. Use as setas pra ajustar a ordem.',
  })
  const botao = criarBotao('Juntar PDFs', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa.corpo.append(seletor.elemento, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(2)
  corpo.append(etapa.secao, resultado.elemento)

  seletor.aoMudar((arquivos) => {
    botao.disabled = arquivos.length < 2
    resultado.limpar()
    if (arquivos.length === 1) mensagem.mostrar('info', 'Adicione pelo menos mais um PDF pra juntar.')
    else mensagem.limpar()
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    const arquivos = seletor.obterArquivos()
    await comCarregando(botao, 'Juntando...', async () => {
      try {
        const bytes = await juntarPdfs(await Promise.all(arquivos.map(lerBytes)))
        const paginas = await contarPaginas(bytes)
        resultado.mostrar([
          { nome: `${nomeBase(arquivos[0])}-unido.pdf`, bytes, detalhe: `${arquivos.length} arquivos · ${rotuloPaginas(paginas)}` },
        ])
      } catch (error) {
        console.error('[SEIRMG] Falha ao juntar PDFs:', error)
        mensagem.mostrar('erro', 'Não foi possível juntar os PDFs. Confira se todos são PDFs válidos e sem senha.')
      }
    })
  })
}
