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

export function contemTermoNasAssinaturas(textoAssinaturas: string, termo: string): boolean {
  const assinaturas = normalizar(textoAssinaturas)
  if (assinaturas.length === 0) return false

  const termoNormalizado = normalizar(termo)
  return termoNormalizado !== '' && assinaturas.includes(termoNormalizado)
}

export function encontrarCargoAssinante(textoAssinaturas: string, cargos: string[]): string | null {
  return cargos.find((cargo) => contemTermoNasAssinaturas(textoAssinaturas, cargo)) ?? null
}

function contemAssinaturaDoUsuario(textoAssinaturas: string, usuario: string): boolean {
  return contemTermoNasAssinaturas(textoAssinaturas, usuario)
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

export const TITULO_CHECKBOX_JA_ASSINADO_USUARIO = 'Documento já assinado por você'
const CLASSE_CHECKBOX_JA_ASSINADO = 'seirmg-checkbox-ja-assinado'

export function tituloCheckboxJaAssinadoPorCargo(cargo: string): string {
  return `Documento já assinado por alguém do cargo "${cargo}"`
}

// O checkbox real do SEI fica visualmente oculto atrás de um <label class="infraCheckboxLabel">
// associado via "for" (não aninhado) — estilizar só o <input> não muda nada na tela, por isso
// o label associado (via checkbox.labels, que resolve a relação "for" nativamente) também recebe
// a mesma marcação.
export function marcarCheckboxComoJaAssinado(
  checkbox: HTMLInputElement,
  titulo: string = TITULO_CHECKBOX_JA_ASSINADO_USUARIO
): void {
  checkbox.disabled = true
  checkbox.title = titulo
  checkbox.classList.add(CLASSE_CHECKBOX_JA_ASSINADO)

  Array.from(checkbox.labels ?? []).forEach((label) => {
    label.title = titulo
    label.classList.add(CLASSE_CHECKBOX_JA_ASSINADO)
  })
}
