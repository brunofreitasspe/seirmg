import { extrairDocumentosPendentes, type DocumentoPendente } from '../../features/procedimento-enviar/detectarPendencias'
import { montarDialogoConfirmacao } from '../../features/procedimento-enviar/montarDialogo'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

// DEBUG TEMPORÁRIO — remover depois de diagnosticar por que o alerta não aparece em produção.
function debugBanner(texto: string): void {
  try {
    const alvo = window.top?.document.body ?? document.body
    const banner = alvo.ownerDocument!.createElement('div')
    banner.textContent = `[SEIRMG DEBUG] ${texto}`
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ff0066;color:#fff;' +
      'font:bold 13px monospace;padding:6px 10px;white-space:pre-wrap;'
    alvo.prepend(banner)
  } catch (error) {
    console.error('[SEIRMG] debugBanner falhou:', error)
  }
}

function obterArvoreDocumento(): Document | null {
  const ifrArvore = window.parent.document.querySelector<HTMLIFrameElement>('#ifrArvore')
  return ifrArvore?.contentDocument ?? null
}

function obterBotoesEnviar(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '#divInfraBarraComandosSuperior > #btnSalvar, #divInfraBarraComandosInferior > #btnSalvar'
    )
  )
}

function abrirDialogoConfirmacao(
  pendencias: DocumentoPendente[],
  unidadeAtual: string,
  aoConfirmar: () => void
): void {
  const dialog = montarDialogoConfirmacao(pendencias, unidadeAtual)
  document.body.appendChild(dialog)

  const fechar = (): void => {
    dialog.close()
    dialog.remove()
  }

  dialog.querySelector('.seirmg-alerta-nao-assinados-cancelar')?.addEventListener('click', fechar)
  dialog.querySelector('.seirmg-alerta-nao-assinados-confirmar')?.addEventListener('click', () => {
    fechar()
    aoConfirmar()
  })
  dialog.addEventListener('cancel', fechar)

  dialog.showModal()
}

async function bootstrap(): Promise<void> {
  debugBanner(`script rodou em ${window.location.href}`)
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.controleProcessos.alertaNaoAssinados.ativo) {
      debugBanner('saiu: toggle alertaNaoAssinados desativado')
      return
    }

    const botoes = obterBotoesEnviar()
    if (botoes.length === 0) {
      debugBanner('saiu: nenhum #btnSalvar encontrado nesta página')
      return
    }
    debugBanner(`achou ${botoes.length} botão(ões) #btnSalvar`)

    const arvore = obterArvoreDocumento()
    if (!arvore) {
      debugBanner('saiu: #ifrArvore não encontrado via window.parent.document, ou sem contentDocument')
      return
    }
    debugBanner('achou a árvore do processo via window.parent/#ifrArvore')

    const localConfig = await createLocalConfigStore().get()
    const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
    if (!unidadeAtual) {
      debugBanner('saiu: obterUnidadeAtual retornou null')
      return
    }
    debugBanner(`unidade atual detectada: "${unidadeAtual}"`)

    const pendencias = extrairDocumentosPendentes(arvore, unidadeAtual)
    debugBanner(`pendências encontradas: ${pendencias.length} — ${pendencias.map((p) => p.nome).join(', ')}`)
    if (pendencias.length === 0) return

    let confirmado = false
    // Listener único em capture no document: a fase de capture termina completamente
    // antes de a fase AT_TARGET começar, então isso roda antes de qualquer handler
    // (inclusive onclick inline) registrado diretamente no próprio botão — diferente
    // de um listener com capture:true no próprio botão, que corre em ordem de
    // registro com os demais handlers do mesmo nó.
    document.addEventListener(
      'click',
      (evento) => {
        if (confirmado) return
        const alvo = evento.target
        if (!(alvo instanceof Element)) return
        const botao = alvo.closest<HTMLElement>('#btnSalvar')
        if (!botao) return
        evento.preventDefault()
        evento.stopImmediatePropagation()
        try {
          abrirDialogoConfirmacao(pendencias, unidadeAtual, () => {
            confirmado = true
            botao.click()
          })
        } catch (error) {
          console.error('[SEIRMG] Falha ao exibir confirmação de documentos não assinados:', error)
          confirmado = true
          botao.click()
        }
      },
      { capture: true }
    )
  } catch (error) {
    debugBanner(`ERRO: ${error instanceof Error ? error.message : String(error)}`)
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

debugBanner('arquivo procedimento_enviar/index.ts carregado')
bootstrap()
