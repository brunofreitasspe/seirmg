import { loadModule } from 'hunspell-asm'
import affTexto from './dicionario/pt-br.aff?raw'
import dicTexto from './dicionario/pt-br.dic?raw'
import { tokenizar } from './tokenizador'

export interface ErroOrtografico {
  palavra: string
  inicio: number
  fim: number
  sugestoes: string[]
}

export interface Corretor {
  verificarTexto: (texto: string) => ErroOrtografico[]
  adicionarPalavra: (palavra: string) => void
}

export async function criarCorretor(palavrasIgnoradas: string[] = []): Promise<Corretor> {
  const fabrica = await loadModule()
  const codificador = new TextEncoder()
  const caminhoAff = fabrica.mountBuffer(codificador.encode(affTexto), 'pt-br.aff')
  const caminhoDic = fabrica.mountBuffer(codificador.encode(dicTexto), 'pt-br.dic')
  const hunspell = fabrica.create(caminhoAff, caminhoDic)

  palavrasIgnoradas.forEach((palavra) => hunspell.addWord(palavra))

  return {
    verificarTexto(texto: string): ErroOrtografico[] {
      return tokenizar(texto).flatMap((token) => {
        if (hunspell.spell(token.palavra)) return []
        return [
          {
            palavra: token.palavra,
            inicio: token.inicio,
            fim: token.fim,
            sugestoes: hunspell.suggest(token.palavra).slice(0, 5),
          },
        ]
      })
    },
    adicionarPalavra(palavra: string): void {
      hunspell.addWord(palavra)
    },
  }
}
