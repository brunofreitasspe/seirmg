import arrowLeft from 'lucide-static/icons/arrow-left.svg?raw'
import upload from 'lucide-static/icons/upload.svg?raw'
import check from 'lucide-static/icons/check.svg?raw'
import circleCheck from 'lucide-static/icons/circle-check.svg?raw'
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw'
import circleX from 'lucide-static/icons/circle-x.svg?raw'
import info from 'lucide-static/icons/info.svg?raw'
import x from 'lucide-static/icons/x.svg?raw'
import send from 'lucide-static/icons/send.svg?raw'
import download from 'lucide-static/icons/download.svg?raw'
import copy from 'lucide-static/icons/copy.svg?raw'
import chevronUp from 'lucide-static/icons/chevron-up.svg?raw'
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw'
import chevronLeft from 'lucide-static/icons/chevron-left.svg?raw'
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw'
import trash from 'lucide-static/icons/trash-2.svg?raw'
import fileText from 'lucide-static/icons/file-text.svg?raw'
import loader from 'lucide-static/icons/loader-circle.svg?raw'
import rotateCcw from 'lucide-static/icons/rotate-ccw.svg?raw'
import link from 'lucide-static/icons/link.svg?raw'
import triangleAlert from 'lucide-static/icons/triangle-alert.svg?raw'
import sparkles from 'lucide-static/icons/sparkles.svg?raw'

// Ícones de interface (lucide, mesma fonte do resto da extensão).
export const ICONES = {
  arrowLeft, upload, check, circleCheck, circleAlert, circleX, info, x, send, download, copy,
  chevronUp, chevronDown, chevronLeft, chevronRight, trash, fileText, loader, rotateCcw, link,
  triangleAlert, sparkles,
}

// Ícones próprios (traço simples, geométrico — círculos/retângulos/linhas) em vez de emoji,
// pra recolorir com --accent via `stroke="currentColor"` e casar com o resto da extensão.
export const ICONES_FERRAMENTA: Record<string, string> = {
  juntar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="7" width="11" height="14" rx="2"/>
    <rect x="10" y="3" width="11" height="14" rx="2"/>
  </svg>`,
  dividir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2.5 2.5"/>
  </svg>`,
  organizar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="11" height="4" rx="1"/>
    <rect x="3" y="10" width="11" height="4" rx="1"/>
    <rect x="3" y="16" width="11" height="4" rx="1"/>
    <line x1="19" y1="6" x2="19" y2="18"/>
    <path d="M16.5 9 L19 6 L21.5 9"/>
    <path d="M16.5 15 L19 18 L21.5 15"/>
  </svg>`,
  'numerar-paginas': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="3" width="14" height="18" rx="2"/>
    <line x1="8" y1="8" x2="15" y2="8"/>
    <line x1="8" y1="12" x2="15" y2="12"/>
    <circle cx="17" cy="18" r="3"/>
    <line x1="17" y1="16.8" x2="17" y2="19.2"/>
  </svg>`,
  'imagem-para-pdf': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <circle cx="9" cy="9" r="1.6"/>
    <path d="M5 17 L10 12 L13 15 L16 11 L20 16"/>
  </svg>`,
  comprimir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M14 10 L18 6 M18 6 L14 6 M18 6 L18 10"/>
    <path d="M10 14 L6 18 M6 18 L10 18 M6 18 L6 14"/>
  </svg>`,
  ocr: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="14" height="18" rx="2"/>
    <line x1="6" y1="8" x2="14" y2="8"/>
    <line x1="6" y1="12" x2="14" y2="12"/>
    <line x1="6" y1="16" x2="11" y2="16"/>
    <circle cx="17" cy="17" r="3.2"/>
    <line x1="19.3" y1="19.3" x2="22" y2="22"/>
  </svg>`,
  pdfa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <line x1="7" y1="8" x2="13" y2="8"/>
    <line x1="7" y1="12" x2="13" y2="12"/>
    <circle cx="16" cy="16" r="4"/>
    <path d="M14.3 16 L15.6 17.3 L18 14.7"/>
  </svg>`,
  tarjar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="2"/>
    <line x1="7" y1="8" x2="17" y2="8"/>
    <rect x="7" y="11" width="10" height="3" fill="currentColor" stroke="none"/>
    <line x1="7" y1="17" x2="14" y2="17"/>
  </svg>`,
}
