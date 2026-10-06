import linkIconSvg from 'lucide-static/icons/link.svg?raw'
import xIconSvg from 'lucide-static/icons/x.svg?raw'
import checkIconSvg from 'lucide-static/icons/check.svg?raw'
import { interpretarRespostaTinyUrl, montarUrlTinyUrl, validarAlias, validarUrlHttp } from '../../features/editor/linkCurto'
import { fetchExterno } from '../../lib/fetchViaBackground'
import { criarBotaoDialogo, criarPainelFlutuante, fecharPainel } from './dialogoFlutuante'

export function abrirDialogoLinkCurto(urlInicial: string, aoInserir: (link: string) => void): void {
  document.querySelectorAll('.seirmg-painel-flutuante').forEach((elemento) => elemento.remove())
  const { painel, corpo } = criarPainelFlutuante('Link curto (TinyURL)', linkIconSvg)

  const url = document.createElement('input')
  url.type = 'url'
  url.placeholder = 'https://...'
  url.value = urlInicial
  const alias = document.createElement('input')
  alias.type = 'text'
  alias.placeholder = 'Nome personalizado (opcional)'
  const aviso = document.createElement('p')
  aviso.className = 'seirmg-painel-flutuante-aviso'
  aviso.textContent = 'O link será enviado ao serviço TinyURL para ser encurtado.'
  const mensagem = document.createElement('div')
  mensagem.className = 'seirmg-painel-flutuante-mensagem'

  const rodape = document.createElement('div')
  rodape.className = 'seirmg-painel-flutuante-rodape'
  const cancelar = criarBotaoDialogo('Cancelar', xIconSvg)
  const gerar = criarBotaoDialogo('Gerar e inserir', checkIconSvg, 'seirmg-btn-acao-primario')
  cancelar.addEventListener('click', () => fecharPainel(painel))
  gerar.addEventListener('click', async () => {
    const endereco = validarUrlHttp(url.value)
    if (!endereco.ok) {
      mensagem.textContent = 'Informe um link que comece com http:// ou https://.'
      return
    }
    const nome = alias.value.trim()
    if (nome && !validarAlias(nome)) {
      mensagem.textContent = 'O nome personalizado deve ter só letras, números e hífen.'
      return
    }
    gerar.disabled = true
    mensagem.textContent = ''
    const resposta = interpretarRespostaTinyUrl(await fetchExterno(montarUrlTinyUrl(endereco.url, nome || undefined)))
    gerar.disabled = false
    if (!resposta.ok) {
      mensagem.textContent = resposta.erro
      return
    }
    fecharPainel(painel)
    aoInserir(resposta.link)
  })
  rodape.append(cancelar, gerar)
  corpo.append(url, alias, aviso, mensagem, rodape)
  document.body.appendChild(painel)
  url.focus()
}
