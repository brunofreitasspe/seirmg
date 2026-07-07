import { construirSeletorPontoControle } from '../../features/ponto-controle/seletor'
import { createSyncConfigStore } from '../../lib/storage'

async function bootstrap(): Promise<void> {
  try {
    const config = await createSyncConfigStore().get()
    if (!config.pontoControle.ativo) return

    const emProcedimentoVisualizar = document.location.search.indexOf('acao=procedimento_visualizar') > 0

    config.pontoControle.regras.forEach((regra) => {
      const seletor = construirSeletorPontoControle(regra.nome, emProcedimentoVisualizar)
      document.querySelectorAll<HTMLImageElement>(seletor).forEach((img) => {
        img.style.filter = regra.filter
      })
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao aplicar cores de ponto de controle:', error)
  }
}

bootstrap()
