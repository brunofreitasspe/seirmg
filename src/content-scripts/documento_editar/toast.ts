import { escaparHtml, injetarEstiloSeAusente } from './dom'

const ID_ESTILO = 'seirmg-estilo-toast-referencia-link'
const ID_CONTAINER = 'seirmg-toast-referencia-link'
const DURACAO_SUCESSO_MS = 3000

const ESTILO_TOAST = `
  #${ID_CONTAINER} {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  #${ID_CONTAINER} .seirmg-toast-card {
    pointer-events: auto;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    color: #222;
    max-width: 360px;
  }
  #${ID_CONTAINER} .seirmg-toast-card.erro {
    border-left: 4px solid #dc3545;
  }
  #${ID_CONTAINER} .seirmg-toast-icone {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
  }
  #${ID_CONTAINER} .seirmg-toast-icone.sucesso {
    background: #017fff;
  }
  #${ID_CONTAINER} .seirmg-toast-icone.erro {
    background: #dc3545;
  }
  #${ID_CONTAINER} .seirmg-toast-texto {
    flex: 1;
  }
  #${ID_CONTAINER} .seirmg-toast-fechar {
    color: #999;
    font-weight: bold;
    cursor: pointer;
    margin-left: 4px;
  }
`

function removerToastAtual(): void {
  document.getElementById(ID_CONTAINER)?.remove()
}

function montarToast(html: string): HTMLElement {
  injetarEstiloSeAusente(document, ID_ESTILO, ESTILO_TOAST)
  removerToastAtual()
  const container = document.createElement('div')
  container.id = ID_CONTAINER
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

export function mostrarToastSucesso(mensagem: string): void {
  const container = montarToast(`
    <div class="seirmg-toast-card">
      <span class="seirmg-toast-icone sucesso">✓</span>
      <span class="seirmg-toast-texto">${escaparHtml(mensagem)}</span>
    </div>
  `)
  setTimeout(() => container.remove(), DURACAO_SUCESSO_MS)
}

export function mostrarToastErro(mensagem: string): void {
  const container = montarToast(`
    <div class="seirmg-toast-card erro">
      <span class="seirmg-toast-icone erro">⚠</span>
      <span class="seirmg-toast-texto">${escaparHtml(mensagem)}</span>
      <span class="seirmg-toast-fechar">✕</span>
    </div>
  `)
  container.querySelector('.seirmg-toast-fechar')?.addEventListener('click', () => container.remove())
}
