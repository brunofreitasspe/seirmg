import type { ConfiguracaoCor } from '../../lib/storage'

export function extrairEspecificacaoParaCor(onmouseover: string): string {
  const inicio = onmouseover.indexOf("('") + 2
  const fim = onmouseover.indexOf(')') - 1
  return onmouseover.substring(inicio, fim).toLowerCase()
}

export function escolherCorProcesso(
  especificacao: string,
  configuracoes: ConfiguracaoCor[]
): string | null {
  return configuracoes.reduce<string | null>((corEscolhida, config) => {
    return !corEscolhida && config.valor && especificacao.includes(config.valor.toLowerCase())
      ? config.cor
      : corEscolhida
  }, null)
}
