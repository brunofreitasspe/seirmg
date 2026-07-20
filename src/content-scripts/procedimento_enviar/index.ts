import { extrairDocumentosPendentes, type DocumentoPendente } from '../../features/procedimento-enviar/detectarPendencias'
import { unidadeDestinoSelecionada } from '../../features/procedimento-enviar/detectarSelecaoUnidade'
import { montarDialogoAviso } from '../../features/procedimento-enviar/montarDialogo'
import { obterUnidadeAtual } from '../../features/procedimento-visualizar/painelLateral'
import { createLocalConfigStore, createSyncConfigStore } from '../../lib/storage'

function obterIframeArvore(): HTMLIFrameElement | null {
  return window.parent.document.querySelector<HTMLIFrameElement>('#ifrArvore')
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
// Relê ifrArvore.contentDocument agora (não uma referência de Document capturada antes) -- se a
// árvore recarregou nesse meio tempo (fechamento da janela do editor após assinar, ver
// content-scripts/editor_montar/index.ts), essa leitura já enxerga o HTML novo automaticamente,
// sem precisar forçar outro reload aqui (que atrapalharia a interação de escolher a unidade de
// destino -- motivo pelo qual essa lógica saiu daqui na correção anterior).
function observarSelecaoUnidade(ifrArvore: HTMLIFrameElement, unidadeAtual: string): void {
  let avisoMostrado = false

  const verificar = (): void => {
    if (avisoMostrado) return
    if (!unidadeDestinoSelecionada(document)) return
    avisoMostrado = true

    const arvoreAtual = ifrArvore.contentDocument
    if (!arvoreAtual) return
    const pendenciasAtuais = extrairDocumentosPendentes(arvoreAtual, unidadeAtual)
    if (pendenciasAtuais.length === 0) return
    mostrarAviso(pendenciasAtuais, unidadeAtual)
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

    const ifrArvore = obterIframeArvore()
    if (!ifrArvore?.contentDocument) return

    const localConfig = await createLocalConfigStore().get()
    const unidadeAtual = obterUnidadeAtual(localConfig.seiVersionAtLeast4 ?? true, window.parent.document)
    if (!unidadeAtual) return

    // Só decide SE instala o observer -- assinar um documento move ele de "pendente" pra
    // "assinado", nunca o contrário, dentro da mesma sessão de carregamento; se já começou em
    // zero pendências, garantidamente continua em zero, não precisa observar nada. A lista em si
    // é recalculada de novo (com reload da árvore) dentro de observarSelecaoUnidade, no momento em
    // que o aviso apareceria.
    const pendenciasIniciais = extrairDocumentosPendentes(ifrArvore.contentDocument, unidadeAtual)
    if (pendenciasIniciais.length === 0) return

    observarSelecaoUnidade(ifrArvore, unidadeAtual)
  } catch (error) {
    console.error('[SEIRMG] Falha ao verificar documentos não assinados antes do envio:', error)
  }
}

bootstrap()
