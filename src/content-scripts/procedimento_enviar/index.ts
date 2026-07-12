import { extrairDocumentosPendentes, type DocumentoPendente } from '../../features/procedimento-enviar/detectarPendencias'
import { unidadeDestinoSelecionada } from '../../features/procedimento-enviar/detectarSelecaoUnidade'
import { montarDialogoAviso } from '../../features/procedimento-enviar/montarDialogo'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

function obterArvoreDocumento(): Document | null {
  const ifrArvore = window.parent.document.querySelector<HTMLIFrameElement>('#ifrArvore')
  return ifrArvore?.contentDocument ?? null
}

function mostrarAviso(pendencias: DocumentoPendente[], unidadeAtual: string): void {
  const dialog = montarDialogoAviso(pendencias, unidadeAtual)
  document.body.appendChild(dialog)

  const fechar = (): void => {
    dialog.close()
    dialog.remove()
  }

  dialog.querySelector('.seirmg-alerta-nao-assinados-confirmar')?.addEventListener('click', fechar)
  dialog.addEventListener('cancel', fechar)

  dialog.showModal()
}

// A tela de "Enviar Processo" não navega pra uma URL própria — o SEI injeta o
// formulário (campo de unidade + #selUnidades) dentro do mesmo documento via AJAX
// e só atualiza window.location.href via History API. Por isso não dá pra confiar
// em interceptar o clique de um botão de confirmação (o momento em que o form
// aparece não corresponde a nenhum evento de carregamento de página); em vez
// disso, observamos o DOM esperando #selUnidades ganhar opções, o que indica que
// o usuário escolheu a unidade de destino.
function observarSelecaoUnidade(pendencias: DocumentoPendente[], unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true
    mostrarAviso(pendencias, unidadeAtual)
  }

  verificar()
  if (avisoMostrado) return

  const observer = new MutationObserver(() => {
    verificar()
    if (avisoMostrado) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

async function bootstrap(): Promise<void> {
  try {
    const syncConfig = await createSyncConfigStore().get()
    if (!syncConfig.controleProcessos.alertaNaoAssinados.ativo) return

    const arvore = obterArvoreDocumento()
    if (!arvore) return

    const localConfig = await createLocalConfigStore().get()
    const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
    if (!unidadeAtual) return

    const pendencias = extrairDocumentosPendentes(arvore, unidadeAtual)
    if (pendencias.length === 0) return

    observarSelecaoUnidade(pendencias, unidadeAtual)
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

bootstrap()
