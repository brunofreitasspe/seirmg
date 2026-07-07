function bootstrap(): void {
  try {
    const botao = document.querySelector('#divInfraBarraComandosSuperior > button')
    if (!botao) return

    botao.addEventListener('click', () => {
      try {
        const iframeArvore = parent.document.getElementById('ifrArvore') as HTMLIFrameElement | null
        iframeArvore?.contentWindow?.location.reload()
      } catch (error) {
        console.error('[SEIRMG] Falha ao atualizar anotação na árvore:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao montar atualização de anotação na árvore:', error)
  }
}

bootstrap()
