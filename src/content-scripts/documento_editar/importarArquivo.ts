// Seletor de arquivo do "Importar Word/HTML": tudo é lido e convertido no navegador.
import { prepararHtmlParaSei, tipoArquivoImportavel } from '../../features/editor/importarHtml'

async function converterParaHtml(arquivo: File, tipo: 'docx' | 'html'): Promise<string> {
  if (tipo === 'html') return arquivo.text()
  const mammoth = await import('mammoth')
  const resultado = await mammoth.convertToHtml({ arrayBuffer: await arquivo.arrayBuffer() })
  return resultado.value
}

export function escolherEImportarArquivo(aoInserir: (html: string) => void, aoErro: (mensagem: string) => void): void {
  const seletor = document.createElement('input')
  seletor.type = 'file'
  seletor.accept = '.docx,.html,.htm'
  seletor.addEventListener('change', async () => {
    const arquivo = seletor.files?.[0]
    if (!arquivo) return
    const tipo = tipoArquivoImportavel(arquivo.name)
    if (!tipo) {
      aoErro('Formato não suportado. Use um arquivo .docx (Word 2007 ou mais novo) ou .html. Arquivos .doc antigos: abra no Word e salve como .docx.')
      return
    }
    try {
      const html = prepararHtmlParaSei(await converterParaHtml(arquivo, tipo))
      if (!html.replace(/<[^>]+>/g, '').trim() && !html.includes('<img')) {
        aoErro('O arquivo está vazio ou não tem conteúdo que possa ser inserido.')
        return
      }
      aoInserir(html)
    } catch (erro) {
      console.error('[SEIRMG] Falha ao importar arquivo:', erro)
      aoErro('Não foi possível ler o arquivo. Confira se ele abre normalmente no Word ou no navegador.')
    }
  })
  seletor.click()
}
