import menuIconSvg from 'lucide-static/icons/menu.svg?raw'
import { createLocalConfigStore } from '../../lib/storage'
import { detectarSeiVersaoMajor, detectarSeiVersionAtLeast4 } from '../../lib/seiVersion'
import { deveOcultarMenu } from '../../features/core/menu'
import { estaNaTelaDeConfiguracao } from '../../features/core/indicarConfiguracao'
import { renderBadge } from './badge'

function detectarUrlBaseSei(): string {
  return `${window.location.origin}${window.location.pathname.split('/controlador')[0]}`
}

function ocultarMenuAutomaticamente(): void {
  try {
    const menu = document.getElementById('divInfraAreaTelaE')
    if (!menu) return
    if (deveOcultarMenu(Array.from(menu.classList))) {
      const iconMenu = document.getElementById('lnkInfraMenuSistema') as HTMLElement | null
      iconMenu?.click()
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao ocultar menu automaticamente:', error)
  }
}

function moverLinkMenu(): void {
  try {
    const versaoMajor = detectarSeiVersaoMajor(document)
    if (versaoMajor !== null && versaoMajor >= 5) return

    const menu = document.getElementById('lnkInfraMenuSistema')
    if (!menu) return

    const menuContainerDestino = document.getElementById('divInfraBarraSistemaPadraoE')
    if (!menuContainerDestino) return

    menu.querySelector('span')?.remove()
    menu.insertAdjacentHTML('afterbegin', menuIconSvg)

    const div = document.createElement('div')
    div.className = 'align-self-center'
    menu.className = 'align-self-center'
    div.appendChild(menu)
    menuContainerDestino.prepend(div)

    document.querySelector('#divInfraBarraSistemaPadraoD #lnkInfraMenuSistema')?.remove()
  } catch (error) {
    console.error('[SEIRMG] Falha ao mover link do menu:', error)
  }
}

function montarAtalhoPublicacoes(baseUrlSei: string): void {
  try {
    const url = `${baseUrlSei}/publicacoes/controlador_publicacoes.php?acao=publicacao_pesquisar&id_orgao_publicacao=0`
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Página de publicações não existe')

        const a = document.createElement('a')
        a.href = url
        a.title = 'Publicações Eletrônicas'
        a.target = '_blank'
        a.textContent = 'Publicações Eletrônicas'

        const div = document.createElement('div')
        div.className = 'seirmg-atalho-publicacoes-eletronicas'
        div.appendChild(a)

        document.getElementById('divInfraBarraSistemaPadraoD')?.prepend(div)
      })
      .catch((error) => {
        console.error('[SEIRMG] Falha ao verificar/montar atalho de publicações eletrônicas:', error)
      })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar atalho de publicações eletrônicas:', error)
  }
}

async function sincronizarLinkNeutroControleProcessos(): Promise<void> {
  try {
    const form = document.getElementById('frmProcedimentoControlar')
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    const actionAtual = form?.getAttribute('action')

    if (actionAtual) {
      if (localConfig.linkNeutroControleProcessos !== actionAtual) {
        await localStore.set({ ...localConfig, linkNeutroControleProcessos: actionAtual })
      }
      return
    }

    if (localConfig.linkNeutroControleProcessos) {
      const linkCP = document.getElementById('lnkControleProcessos')
      linkCP?.setAttribute('href', localConfig.linkNeutroControleProcessos)
      linkCP?.removeAttribute('onclick')
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao sincronizar link neutro de Controle de Processos:', error)
  }
}

const ESTILO_INDICADOR_CONFIGURACAO = `
  @keyframes seirmg-pulso-configuracao {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .seirmg-indicador-configuracao {
    animation: seirmg-pulso-configuracao 1s infinite;
  }
`

async function indicarConfiguracao(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()
    if (!localConfig.mostrarIndicadorConfiguracao) return

    const icone = document.querySelector(
      '#lnkConfiguracaoSistema img, #lnkConfiguracaoSistema i, #lnkInfraConfiguracaoSistema img'
    )
    if (!icone) return

    if (!document.getElementById('seirmg-estilo-indicador-configuracao')) {
      const style = document.createElement('style')
      style.id = 'seirmg-estilo-indicador-configuracao'
      style.textContent = ESTILO_INDICADOR_CONFIGURACAO
      document.head.appendChild(style)
    }

    icone.classList.add('seirmg-indicador-configuracao')

    if (estaNaTelaDeConfiguracao(document.URL)) {
      await localStore.set({ ...localConfig, mostrarIndicadorConfiguracao: false })
      icone.classList.remove('seirmg-indicador-configuracao')
    }
  } catch (error) {
    console.error('[SEIRMG] Falha ao indicar configuração pendente:', error)
  }
}

async function bootstrap(): Promise<void> {
  try {
    const localStore = createLocalConfigStore()
    const localConfig = await localStore.get()

    const urlBase = detectarUrlBaseSei()
    const seiVersionAtLeast4 = detectarSeiVersionAtLeast4(document)
    if (localConfig.baseUrlSei !== urlBase || localConfig.seiVersionAtLeast4 !== seiVersionAtLeast4) {
      await localStore.set({ ...localConfig, baseUrlSei: urlBase, seiVersionAtLeast4 })
    }

    chrome.runtime.sendMessage({ type: 'seirmg:sei-detectado' }).catch((error) => {
      console.error('[SEIRMG] Falha ao notificar sessão do SEI detectada:', error)
    })

    await renderBadge()

    ocultarMenuAutomaticamente()
    moverLinkMenu()
    montarAtalhoPublicacoes(urlBase)
    await sincronizarLinkNeutroControleProcessos()
    await indicarConfiguracao()
  } catch (error) {
    console.error('[SEIRMG] Falha ao inicializar core:', error)
  }
}

bootstrap()
