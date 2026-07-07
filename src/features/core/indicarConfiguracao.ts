export function estaNaTelaDeConfiguracao(url: string): boolean {
  return url.includes('controlador.php?acao=infra_configurar')
}
