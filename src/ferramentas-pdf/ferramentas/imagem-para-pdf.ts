import { imagensParaPdf, type ImagemEntrada } from '../../features/ferramentas-pdf/imagemParaPdf'
import { criarPainelResultado } from '../ui/resultado'
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
  const corpo = montarEstruturaFerramenta(container, 'imagem-para-pdf')

  const etapa = criarEtapa(1, 'Escolha as imagens, na ordem das páginas')
  const seletor = criarSeletorArquivos({
    aceitar: 'image/png,image/jpeg',
    multiplo: true,
    ordenavel: true,
    titulo: 'Clique pra escolher as imagens',
    dica: 'JPG ou PNG. Cada imagem vira uma página.',
  })
  const botao = criarBotao('Converter em PDF', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa.corpo.append(seletor.elemento, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(2)
  corpo.append(etapa.secao, resultado.elemento)

  seletor.aoMudar((arquivos) => {
    botao.disabled = arquivos.length === 0
    resultado.limpar()
    mensagem.limpar()
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    const arquivos = seletor.obterArquivos()
    await comCarregando(botao, 'Convertendo...', async () => {
      try {
        const imagens: ImagemEntrada[] = await Promise.all(
          arquivos.map(async (arquivo) => ({
            bytes: await lerBytes(arquivo),
            tipo: arquivo.type === 'image/png' ? ('png' as const) : ('jpg' as const),
          }))
        )
        const bytes = await imagensParaPdf(imagens)
        const nome = arquivos.length === 1 ? `${nomeBase(arquivos[0])}.pdf` : 'imagens-convertidas.pdf'
        resultado.mostrar([{ nome, bytes, detalhe: rotuloPaginas(arquivos.length) }])
      } catch (error) {
        console.error('[SEIRMG] Falha ao converter imagens:', error)
        mensagem.mostrar('erro', 'Não foi possível converter. Confira se as imagens são JPG ou PNG válidos.')
      }
    })
  })
}
