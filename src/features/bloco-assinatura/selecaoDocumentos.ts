export type TipoSelecaoDocumentos =
  | 'todos'
  | 'nenhum'
  | 'sem-assinatura'
  | 'sem-minha-assinatura'
  | 'com-minha-assinatura'

export interface UsuarioEUnidade {
  usuario: string
  unidade: string
}

export function extrairNomeUsuario(tituloUsuario: string): string | null {
  const matchTraco = tituloUsuario.match(/(.+)\s-\s/)
  if (matchTraco) return matchTraco[1]

  const matchParenteses = tituloUsuario.match(/(.+)\s\(.*/)
  if (matchParenteses) return matchParenteses[1]

  return null
}

const INDICE_COLUNA_ASSINATURAS_PADRAO = 6

export function encontrarIndiceColunaAssinaturas(cabecalhos: string[]): number {
  const indice = cabecalhos.indexOf('Assinaturas')
  return indice === -1 ? INDICE_COLUNA_ASSINATURAS_PADRAO : indice
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ')
}

function contemAssinaturaDoUsuario(textoAssinaturas: string, usuario: string): boolean {
  const assinaturas = normalizar(textoAssinaturas)
  if (assinaturas.length === 0) return false

  const usuarioNormalizado = normalizar(usuario)
  return usuarioNormalizado !== '' && assinaturas.includes(usuarioNormalizado)
}

export function deveSelecionar(
  tipo: TipoSelecaoDocumentos,
  textoAssinaturas: string,
  usuario: string
): boolean {
  const assinaturas = textoAssinaturas.trim()

  switch (tipo) {
    case 'todos':
      return true
    case 'nenhum':
      return false
    case 'sem-assinatura':
      return assinaturas.length === 0
    case 'sem-minha-assinatura':
      return !contemAssinaturaDoUsuario(textoAssinaturas, usuario)
    case 'com-minha-assinatura':
      return contemAssinaturaDoUsuario(textoAssinaturas, usuario)
  }
}

export function documentoJaAssinadoPorMim(textoAssinaturas: string, credenciais: UsuarioEUnidade): boolean {
  const assinaturas = normalizar(textoAssinaturas)
  if (assinaturas.length === 0) return false

  const usuario = normalizar(credenciais.usuario)
  const unidade = normalizar(credenciais.unidade)

  return (usuario !== '' && assinaturas.includes(usuario)) || (unidade !== '' && assinaturas.includes(unidade))
}
