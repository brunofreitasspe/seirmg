// Buscas a sites fora do SEI pedidas por content scripts (que não têm permissão de rede pra esses
// hosts). Só hosts desta lista, e só https -- a mensagem vem de páginas do SEI e não pode virar um
// proxy aberto. Os sub-lotes seguintes acrescentam os seus hosts aqui e em host_permissions.
export const HOSTS_EXTERNOS_PERMITIDOS = ['tinyurl.com']

export function hostExternoPermitido(url: string): boolean {
  try {
    const alvo = new URL(url)
    return alvo.protocol === 'https:' && HOSTS_EXTERNOS_PERMITIDOS.includes(alvo.hostname)
  } catch {
    return false
  }
}
