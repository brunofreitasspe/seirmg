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
    botoes.forEach((botao) => {
      // Captura (não bubble) pra garantir que barra a ação nativa mesmo se o SEI usar
      // onclick inline em vez de um submit de formulário puro.
      botao.addEventListener(
        'click',
        (evento) => {
          if (confirmado) return
          evento.preventDefault()
          evento.stopImmediatePropagation()
          abrirDialogoConfirmacao(pendencias, unidadeAtual, () => {
            confirmado = true
            botao.click()
          })
        },
        { capture: true }
      )
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

bootstrap()
