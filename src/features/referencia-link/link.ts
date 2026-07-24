export function extrairIdDoUrl(url: string, chave: 'id_procedimento' | 'id_documento'): string | null {
  try {
    const valor = new URL(url).searchParams.get(chave)
    return valor && /^\d+$/.test(valor) ? valor : null
  } catch {
    return null
  }
}

// Mesmo padrão "seguro" (sem infra_hash) já validado ao vivo pra processo em
// features/controle-processos/favoritos.ts (construirLinkSeguro) — infra_hash é válido só pro
// contexto (unidade/sessão) do momento em que foi gerado, então reconstruir o link só com o id
// evita reusar um hash desatualizado. id_documento é priorizado sobre id_procedimento porque é o
// dado mais específico quando os dois aparecem na mesma URL de resultado.
export function construirLinkResultado(
  urlFinal: string
): { href: string; tipo: 'processo' | 'documento' } | null {
  const idDocumento = extrairIdDoUrl(urlFinal, 'id_documento')
  if (idDocumento) {
    return { href: `controlador.php?acao=documento_visualizar&id_documento=${idDocumento}`, tipo: 'documento' }
  }

  const idProcedimento = extrairIdDoUrl(urlFinal, 'id_procedimento')
  if (idProcedimento) {
    return { href: `controlador.php?acao=procedimento_trabalhar&id_procedimento=${idProcedimento}`, tipo: 'processo' }
  }

  return null
}
