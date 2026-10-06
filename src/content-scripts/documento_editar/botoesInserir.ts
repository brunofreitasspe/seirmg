// Botões novos do editor (grupo Inserir e Referências e links). Cada task do plano acrescenta
// o seu ao mapa; a ordem na barra vem de features/editor/grupos.ts, não da ordem de inserção aqui.
import type { IdBotaoEditor } from '../../features/editor/grupos'
import type { EditorSEI } from './ponteEditor'

export function montarBotoesInserir(_editor: EditorSEI): Map<IdBotaoEditor, HTMLElement> {
  return new Map()
}
