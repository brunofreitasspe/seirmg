export type TipoSelecaoDocumentos =
  | 'todos'
  | 'nenhum'
  | 'sem-assinatura'
  | 'sem-minha-assinatura'
  | 'com-minha-assinatura'

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

const TITULO_CHECKBOX_JA_ASSINADO = 'Documento já assinado por você'
const CLASSE_CHECKBOX_JA_ASSINADO = 'seirmg-checkbox-ja-assinado'

// O checkbox real do SEI fica visualmente oculto atrás de um <label class="infraCheckboxLabel">
// associado via "for" (não aninhado) — estilizar só o <input> não muda nada na tela, por isso
// o label associado (via checkbox.labels, que resolve a relação "for" nativamente) também recebe
// a mesma marcação.
export function marcarCheckboxComoJaAssinado(checkbox: HTMLInputElement): void {
  checkbox.disabled = true
  checkbox.title = TITULO_CHECKBOX_JA_ASSINADO
  checkbox.classList.add(CLASSE_CHECKBOX_JA_ASSINADO)

  Array.from(checkbox.labels ?? []).forEach((label) => {
    label.title = TITULO_CHECKBOX_JA_ASSINADO
    label.classList.add(CLASSE_CHECKBOX_JA_ASSINADO)
  })
}
