import type { ThemeConfig, ThemePreset } from './storage'

const PRESET_CLASS: Record<ThemePreset, string> = {
  claro: '',
  black: 'seirmg-theme-black',
  'super-black': 'seirmg-theme-super-black',
  custom: 'seirmg-theme-custom',
}

const THEME_CLASSES = Object.values(PRESET_CLASS).filter(Boolean)

export function computeThemeClassName(theme: ThemeConfig): string {
  return PRESET_CLASS[theme.preset]
}

export function applyTheme(target: HTMLElement, theme: ThemeConfig): void {
  THEME_CLASSES.forEach((className) => target.classList.remove(className))
  const className = computeThemeClassName(theme)
  if (className) target.classList.add(className)

  if (theme.preset === 'custom' && theme.customColor) {
    target.style.setProperty('--seirmg-accent-color', theme.customColor)
  } else {
    target.style.removeProperty('--seirmg-accent-color')
  }
}
