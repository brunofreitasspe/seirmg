export function passouIntervalo(
  desde: string | undefined,
  agoraIso: string,
  minMinutos: number
): boolean {
  if (!desde) return true
  const diffMs = new Date(agoraIso).getTime() - new Date(desde).getTime()
  return diffMs >= minMinutos * 60 * 1000
}
