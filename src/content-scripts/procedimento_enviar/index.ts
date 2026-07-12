import { extrairDocumentosPendentes, type DocumentoPendente } from '../../features/procedimento-enviar/detectarPendencias'
import { montarDialogoConfirmacao } from '../../features/procedimento-enviar/montarDialogo'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

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
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.controleProcessos.alertaNaoAssinados.ativo) return

    const botoes = obterBotoesEnviar()
    if (botoes.length === 0) return

    const arvore = obterArvoreDocumento()
    if (!arvore) return

    const localConfig = await createLocalConfigStore().get()
    const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
    if (!unidadeAtual) return

    const pendencias = extrairDocumentosPendentes(arvore, unidadeAtual)
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
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

bootstrap()
