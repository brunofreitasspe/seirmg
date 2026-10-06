import { describe, it, expect } from 'vitest'
import { encontrarSkillAtiva, ferramentasPermitidasParaSkill } from './skills'
import type { SkillAgenteIA } from '../../lib/storage'
import type { FerramentaAgenteDescricao } from './tools'

const skills: SkillAgenteIA[] = [
  { id: 'padrao', nome: 'Padrão', systemPrompt: 'p', ferramentasPermitidas: [] },
  { id: 'consulta', nome: 'Consulta', systemPrompt: 'c', ferramentasPermitidas: ['listar_processos_favoritos'] },
]
const ferramentas: FerramentaAgenteDescricao[] = [
  { id: 'listar_processos_favoritos', nome: 'X', descricao: '', escrita: false, inputSchema: {} },
  { id: 'adicionar_favorito', nome: 'Y', descricao: '', escrita: true, inputSchema: {} },
]

describe('encontrarSkillAtiva', () => {
  it('encontra pelo id', () => {
    expect(encontrarSkillAtiva(skills, 'consulta')).toBe(skills[1])
  })

  it('id inexistente cai pra primeira skill da lista', () => {
    expect(encontrarSkillAtiva(skills, 'nao-existe')).toBe(skills[0])
  })
})

describe('ferramentasPermitidasParaSkill', () => {
  it('filtra só as ferramentas liberadas pela skill', () => {
    expect(ferramentasPermitidasParaSkill(skills[1], ferramentas)).toEqual([ferramentas[0]])
  })

  it('skill sem ferramenta nenhuma devolve lista vazia (só conversa)', () => {
    expect(ferramentasPermitidasParaSkill(skills[0], ferramentas)).toEqual([])
  })

  it('id de ferramenta que não existe mais no catálogo é ignorado', () => {
    expect(ferramentasPermitidasParaSkill({ ...skills[0], ferramentasPermitidas: ['removida'] }, ferramentas)).toEqual([])
  })
})
