export interface CampoListaEditavel {
  chave: string
  rotulo: string
  tipo: 'text' | 'color'
}

export interface ListaEditavelControle<T extends Record<string, string>> {
  obterItens: () => T[]
}

function criarLinha(campos: CampoListaEditavel[], valores: Record<string, string>): HTMLDivElement {
  const linha = document.createElement('div')
  linha.className = 'seirmg-lista-editavel-linha'

  campos.forEach((campo) => {
    const input = document.createElement('input')
    input.type = campo.tipo
    input.name = campo.chave
    input.placeholder = campo.rotulo
    input.value = valores[campo.chave] ?? (campo.tipo === 'color' ? '#017fff' : '')
    linha.appendChild(input)
  })

  const botaoRemover = document.createElement('button')
  botaoRemover.type = 'button'
  botaoRemover.textContent = 'Remover'
  botaoRemover.addEventListener('click', () => linha.remove())
  linha.appendChild(botaoRemover)

  return linha
}

export function montarListaEditavel<T extends Record<string, string>>(
  container: HTMLElement,
  campos: CampoListaEditavel[],
  itensIniciais: T[]
): ListaEditavelControle<T> {
  container.innerHTML = ''

  const linhas = document.createElement('div')
  linhas.className = 'seirmg-lista-editavel-linhas'
  container.appendChild(linhas)

  itensIniciais.forEach((item) => {
    linhas.appendChild(criarLinha(campos, item))
  })

  const botaoAdicionar = document.createElement('button')
  botaoAdicionar.type = 'button'
  botaoAdicionar.textContent = 'Adicionar'
  botaoAdicionar.addEventListener('click', () => {
    linhas.appendChild(criarLinha(campos, {}))
  })
  container.appendChild(botaoAdicionar)

  return {
    obterItens(): T[] {
      return Array.from(linhas.children).flatMap((linha) => {
        const item: Record<string, string> = {}
        let algumPreenchido = false

        campos.forEach((campo) => {
          const input = linha.querySelector<HTMLInputElement>(`input[name="${campo.chave}"]`)
          const valor = input?.value ?? ''
          item[campo.chave] = valor
          if (valor && campo.tipo === 'text') algumPreenchido = true
        })

        return algumPreenchido ? [item as T] : []
      })
    },
  }
}
