function ativarAba(abaAlvo: string): void {
  document.querySelectorAll('.tab-btn').forEach((botao) => {
    botao.classList.toggle('ativa', botao.getAttribute('data-tab') === abaAlvo)
  })
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('ativa', view.id === `view-${abaAlvo}`)
  })
}

document.querySelectorAll('.tab-btn').forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-tab')
    if (aba) ativarAba(aba)
  })
})
