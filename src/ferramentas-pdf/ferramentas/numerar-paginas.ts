import { numerarPaginas, type OpcoesNumeracao } from '../../features/ferramentas-pdf/numerarPaginas'
import { criarPainelResultado } from '../ui/resultado'
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
} from '../ui/kit'

type Posicao = NonNullable<OpcoesNumeracao['posicao']>

export function montar(container: HTMLElement): void {
  const corpo = montarEstruturaFerramenta(container, 'numerar-paginas')

  const etapa1 = criarEtapa(1, 'Escolha o PDF')
  const seletor = criarSeletorArquivos({
    aceitar: 'application/pdf,.pdf',
    titulo: 'Clique pra escolher o PDF',
    dica: 'ou arraste o arquivo pra cá',
  })
  etapa1.corpo.append(seletor.elemento)

  const etapa2 = criarEtapa(2, 'Opções da numeração')
  const inicio = criarElemento('input')
  inicio.type = 'number'
  inicio.min = '1'
  inicio.value = '1'
  const posicao = criarSegmentado<Posicao>(
    'numerar-posicao',
    [
      { valor: 'inferior-direito', rotulo: 'Canto inferior direito' },
      { valor: 'inferior-centro', rotulo: 'Centro do rodapé' },
    ],
    'inferior-direito'
  )
  const campos = criarElemento('div', 'campos')
  campos.append(
    criarCampo('Começar em', inicio, 'Útil pra continuar a numeração de outro volume.'),
    criarCampo('Posição', posicao.elemento)
  )
  const botao = criarBotao('Numerar páginas', { variante: 'primario' })
  botao.disabled = true
  const mensagem = criarMensagem()
  etapa2.corpo.append(campos, criarBarraAcoes(botao), mensagem.elemento)

  const resultado = criarPainelResultado(3)
  corpo.append(etapa1.secao, etapa2.secao, resultado.elemento)

  seletor.aoMudar((arquivos) => {
    botao.disabled = arquivos.length === 0
    resultado.limpar()
    mensagem.limpar()
  })

  botao.addEventListener('click', async () => {
    mensagem.limpar()
    const [arquivo] = seletor.obterArquivos()
    if (!arquivo) return
    const inicioEm = Math.max(1, Math.floor(Number(inicio.value)) || 1)
    await comCarregando(botao, 'Numerando...', async () => {
      try {
        const bytes = await numerarPaginas(await lerBytes(arquivo), { inicioEm, posicao: posicao.valor() })
        resultado.mostrar([{ nome: `${nomeBase(arquivo)}-numerado.pdf`, bytes, detalhe: `numeração a partir de ${inicioEm}` }])
      } catch (error) {
        console.error('[SEIRMG] Falha ao numerar páginas:', error)
        mensagem.mostrar('erro', 'Não foi possível numerar o PDF. Confira se é um PDF válido e sem senha.')
      }
    })
  })
}
