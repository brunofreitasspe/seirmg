// Skill = persona do agente: system prompt + quais ferramentas ela pode usar.
import type { SkillAgenteIA } from '../../lib/storage'
import type { FerramentaAgenteDescricao } from './tools'

export function encontrarSkillAtiva(skills: SkillAgenteIA[], skillAtivaId: string): SkillAgenteIA {
  return skills.find((skill) => skill.id === skillAtivaId) ?? skills[0]
}

export function ferramentasPermitidasParaSkill(
  skill: SkillAgenteIA,
  todasFerramentas: FerramentaAgenteDescricao[]
): FerramentaAgenteDescricao[] {
  return todasFerramentas.filter((ferramenta) => skill.ferramentasPermitidas.includes(ferramenta.id))
}
