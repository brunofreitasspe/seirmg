export type EstadoBloco =
  | 'disponibilizado_para_area'
  | 'disponibilizado_pela_area'
  | 'aberto'
  | 'retornado'

export interface BlocoAssinaturaItem {
  id: string
  numero: string
  link: string
  estado: EstadoBloco
}

export interface BlocoAssinaturaResumo {
  totalDisponibilizadoParaArea: number
  totalDisponibilizadoPelaArea: number
  totalAberto: number
  totalRetornado: number
}
